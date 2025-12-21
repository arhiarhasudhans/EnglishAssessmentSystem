const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { spawn } = require('child_process');

function classifyQuestionsBatch(questions) {
    return new Promise((resolve, reject) => {
        const scriptPath = path.join(__dirname, '..', 'transformer_classifier.py');
        const pythonExecutable = process.platform === 'win32'
            ? path.join(__dirname, '..', '..', 'venv', 'Scripts', 'python.exe')
            : path.join(__dirname, '..', '..', 'venv', 'bin', 'python');

        const pythonCmd = fs.existsSync(pythonExecutable) ? pythonExecutable : 'python';
        const pythonProcess = spawn(pythonCmd, [scriptPath]);

        let output = '';
        let errorOutput = '';

        pythonProcess.stdout.on('data', (data) => output += data.toString());
        pythonProcess.stderr.on('data', (data) => errorOutput += data.toString());

        pythonProcess.on('close', (code) => {
            if (code !== 0) {
                console.warn(`AI Classifier exited with code ${code}. Error: ${errorOutput}. Using defaults.`);
                return resolve(questions.map(() => ({ topic: 'General Grammar', difficulty: 3 })));
            }
            try {
                const results = JSON.parse(output);
                resolve(results);
            } catch (e) {
                console.error(`Invalid JSON from AI: "${output}".`);
                resolve(questions.map(() => ({ topic: 'General Grammar', difficulty: 3 })));
            }
        });

        pythonProcess.on('error', (err) => {
            console.error('Failed to spawn python:', err);
            resolve(questions.map(() => ({ topic: 'General Grammar', difficulty: 3 })));
        });

        const inputData = { questions: questions.map(q => ({ question: q.text, options: q.options || [] })) };
        pythonProcess.stdin.write(JSON.stringify(inputData));
        pythonProcess.stdin.end();
    });
}

exports.uploadQuestionSet = async (req, res, pool) => {
    try {
        console.log('Question set upload request received');
        if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

        const { assessmentName, level, duration, passScore, assessmentCode } = req.body;
        if (!assessmentName || !level || !duration || !passScore || !assessmentCode) {
            fs.unlinkSync(req.file.path);
            return res.status(400).json({ message: 'All fields are required.' });
        }

        const existingAssessment = await pool.query('SELECT id FROM assessments WHERE code = $1', [assessmentCode]);
        if (existingAssessment.rows.length > 0) {
            fs.unlinkSync(req.file.path);
            return res.status(400).json({ message: 'Assessment code already exists.' });
        }

        const workbook = XLSX.readFile(req.file.path);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        if (jsonData.length < 2) {
            fs.unlinkSync(req.file.path);
            return res.status(400).json({ message: 'Excel file empty or missing rows.' });
        }

        const headers = jsonData[0].map(h => h ? h.toString().trim().toLowerCase() : '');
        const findColIndex = (patterns) => headers.findIndex(h => patterns.some(p => p.test(h)));

        const questionIdx = findColIndex([/question/i, /^q$/i, /statement/i]);
        const optionAIdx = findColIndex([/option\s*a/i, /^a$/i]);
        const optionBIdx = findColIndex([/option\s*b/i, /^b$/i]);
        const optionCIdx = findColIndex([/option\s*c/i, /^c$/i]);
        const optionDIdx = findColIndex([/option\s*d/i, /^d$/i]);
        const correctAnswerIdx = findColIndex([/correct/i, /answer/i, /^ans$/i]);

        if (questionIdx === -1 || optionAIdx === -1 || optionBIdx === -1 || correctAnswerIdx === -1) {
            fs.unlinkSync(req.file.path);
            return res.status(400).json({ message: 'Missing required columns in Excel.' });
        }

        const questions = [];
        let questionId = 1;

        for (let i = 1; i < jsonData.length; i++) {
            const row = jsonData[i];
            if (!row || row.every(c => !c)) continue;

            const qText = row[questionIdx] ? row[questionIdx].toString().trim() : '';
            const optA = row[optionAIdx] ? row[optionAIdx].toString().trim() : '';
            const optB = row[optionBIdx] ? row[optionBIdx].toString().trim() : '';
            const optC = (optionCIdx !== -1 && row[optionCIdx]) ? row[optionCIdx].toString().trim() : '';
            const optD = (optionDIdx !== -1 && row[optionDIdx]) ? row[optionDIdx].toString().trim() : '';
            let ans = row[correctAnswerIdx] ? row[correctAnswerIdx].toString().trim() : '';

            if (!qText || !optA || !optB || !ans) {
                fs.unlinkSync(req.file.path);
                return res.status(400).json({ message: `Row ${i + 1}: Missing data.` });
            }

            const options = [optA, optB, optC, optD].filter(o => o !== '');
            let ansIndex = -1;

            if (/^[a-dA-D]$/.test(ans)) {
                ansIndex = ans.toUpperCase().charCodeAt(0) - 'A'.charCodeAt(0);
            } else {
                ansIndex = options.findIndex(o => o.toLowerCase() === ans.toLowerCase());
            }

            if (ansIndex === -1 && /^[1-4]$/.test(ans)) ansIndex = parseInt(ans) - 1;

            if (ansIndex === -1 || ansIndex >= options.length) {
                fs.unlinkSync(req.file.path);
                return res.status(400).json({ message: `Row ${i + 1}: Invalid answer index.` });
            }

            questions.push({ id: questionId++, type: 'multiple-choice', text: qText, options: options, correctAnswer: ansIndex });
        }

        console.log(`Starting AI classification for ${questions.length} questions...`);
        try {
            const aiResults = await classifyQuestionsBatch(questions);
            questions.forEach((q, idx) => {
                const pred = aiResults[idx] || { topic: 'General', difficulty: 3 };
                let diff = pred.difficulty;
                if (typeof diff === 'string') {
                    if (diff.toLowerCase() === 'easy') diff = 1;
                    else if (diff.toLowerCase() === 'medium') diff = 3;
                    else if (diff.toLowerCase() === 'hard') diff = 5;
                    else diff = 3;
                }
                q.topic = pred.topic || 'General Grammar';
                q.difficulty = parseInt(diff) || 3;
                q.ai_tags = { topic: q.topic, difficulty_predicted: diff, mock: pred.mock || false };
            });
            console.log('Classified questions.');
        } catch (e) {
            console.log('AI failed, using defaults.');
            questions.forEach(q => { q.topic = 'General'; q.difficulty = 3; });
        }

        const assessmentId = uuidv4();
        // Get facultyId from body (sent by frontend)
        const { facultyId } = req.body;

        // Include facultyId (created_by) to link assessment to the faculty member
        // This enables "My Assessments" filtering in the dashboard
        await pool.query(
            'INSERT INTO assessments (id, code, title, description, duration, total_questions, questions, level, pass_score, questions_to_attempt, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)',
            [assessmentId, assessmentCode, assessmentName, `Level: ${level}, Pass Score: ${passScore}%`, parseInt(duration), questions.length, JSON.stringify(questions), level, passScore, questions.length, facultyId || null]
        );

        fs.unlinkSync(req.file.path);
        res.status(201).json({
            message: 'Question set uploaded successfully',
            assessmentId: assessmentId,
            questionsCount: questions.length
        });

    } catch (error) {
        console.error('Error uploading question set:', error);
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        res.status(500).json({ message: 'Error processing upload', error: error.message });
    }
};

exports.downloadTemplate = (req, res) => {
    try {
        const templateData = [
            ['Question', 'Option_A', 'Option_B', 'Option_C', 'Option_D', 'Correct_Answer'],
            ['Sample Question?', 'Answer A', 'Answer B', 'Answer C', 'Answer D', 'B']
        ];
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(templateData);
        XLSX.utils.book_append_sheet(wb, ws, 'Questions');
        const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="template.xlsx"');
        res.send(buffer);
    } catch (error) {
        res.status(500).json({ message: 'Error generating template' });
    }
};
