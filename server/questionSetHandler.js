// questionSetHandler.js - Handler for uploading Excel question sets to Neon database
const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { spawn } = require('child_process');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel'
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only Excel files (.xlsx, .xls) are allowed'), false);
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// Factory function to create the router with database pool
function createQuestionSetHandler(pool) {
  const router = express.Router();

  // Upload question set endpoint
  router.post('/upload', upload.single('file'), async (req, res) => {
    try {
      console.log('Question set upload request received');
      console.log('File:', req.file);
      console.log('Body:', req.body);

      if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
      }

      const { assessmentName, level, duration, passScore, assessmentCode } = req.body;

      // Validate required fields
      if (!assessmentName || !level || !duration || !passScore || !assessmentCode) {
        // Clean up uploaded file
        fs.unlinkSync(req.file.path);
        return res.status(400).json({
          message: 'All fields are required: assessmentName, level, duration, passScore, assessmentCode'
        });
      }

      // Check if assessment code already exists
      const existingAssessment = await pool.query(
        'SELECT id FROM assessments WHERE code = $1',
        [assessmentCode]
      );

      if (existingAssessment.rows.length > 0) {
        // Clean up uploaded file
        fs.unlinkSync(req.file.path);
        return res.status(400).json({
          message: 'Assessment code already exists. Please use a different code.'
        });
      }

      // Read and parse Excel file
      const workbook = XLSX.readFile(req.file.path);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];

      // Convert to JSON
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

      if (jsonData.length < 2) {
        // Clean up uploaded file
        fs.unlinkSync(req.file.path);
        return res.status(400).json({
          message: 'Excel file must contain at least a header row and one question row'
        });
      }

      // Extract headers and validate expected columns
      const headers = jsonData[0].map(header => header ? header.toString().trim().toLowerCase() : '');
      const expectedHeaders = ['question', 'a', 'b', 'c', 'd', 'answer'];

      // Check if minimal required headers exist (fuzzy check)
      const missingHeaders = [];
      if (!headers.some(h => h.includes('question'))) missingHeaders.push('Question');
      if (!headers.some(h => h.includes('a') || h.includes('option'))) missingHeaders.push('Option A');
      if (!headers.some(h => h.includes('b') || h.includes('option'))) missingHeaders.push('Option B');
      // Options C and D are now optional

      if (!headers.some(h => h.includes('correct') || h.includes('answer'))) missingHeaders.push('Correct Answer');

      if (missingHeaders.length > 0) {
        // Clean up uploaded file
        fs.unlinkSync(req.file.path);
        return res.status(400).json({
          message: `Missing required columns: ${missingHeaders.join(', ')}. Please check your Excel headers.`
        });
      }

      // Find column indices - using robust regex
      const findColIndex = (patterns) => headers.findIndex(h => patterns.some(p => p.test(h)));

      const questionIdx = findColIndex([/question/i, /^q$/i, /statement/i]);
      // Regex for options: "Option A", "A", "A)", "(A)", "Option-A", "Choice A"
      const optionAIdx = findColIndex([/option\s*a/i, /^a$/i, /^a\)/i, /^\(a\)/i, /choice\s*a/i, /opt\s*a/i]);
      const optionBIdx = findColIndex([/option\s*b/i, /^b$/i, /^b\)/i, /^\(b\)/i, /choice\s*b/i, /opt\s*b/i]);
      const optionCIdx = findColIndex([/option\s*c/i, /^c$/i, /^c\)/i, /^\(c\)/i, /choice\s*c/i, /opt\s*c/i]);
      const optionDIdx = findColIndex([/option\s*d/i, /^d$/i, /^d\)/i, /^\(d\)/i, /choice\s*d/i, /opt\s*d/i]);
      const correctAnswerIdx = findColIndex([/correct/i, /answer/i, /^ans$/i]);

      console.log('Detected Headers:', headers);
      console.log('Indices:', { questionIdx, optionAIdx, optionBIdx, correctAnswerIdx });

      // Parse questions from Excel data
      const questions = [];
      let questionId = 1;

      for (let i = 1; i < jsonData.length; i++) {
        const row = jsonData[i];

        // Skip empty rows
        if (!row || row.every(cell => !cell || cell.toString().trim() === '')) {
          continue;
        }

        const questionText = row[questionIdx] ? row[questionIdx].toString().trim() : '';
        const optionA = row[optionAIdx] ? row[optionAIdx].toString().trim() : '';
        const optionB = row[optionBIdx] ? row[optionBIdx].toString().trim() : '';
        const optionC = (optionCIdx !== -1 && row[optionCIdx]) ? row[optionCIdx].toString().trim() : '';
        const optionD = (optionDIdx !== -1 && row[optionDIdx]) ? row[optionDIdx].toString().trim() : '';
        let rawAnswer = row[correctAnswerIdx] ? row[correctAnswerIdx].toString().trim() : '';

        // Validate basic question data (A and B are minimum required)
        if (!questionText || !optionA || !optionB || !rawAnswer) {
          // Clean up uploaded file
          fs.unlinkSync(req.file.path);
          return res.status(400).json({
            message: `Row ${i + 1}: Question, Option A, Option B, and Answer are required.`
          });
        }

        // Logic to Determine Correct Answer Index
        let correctAnswerIndex = -1;
        const potentialOptions = [optionA, optionB, optionC, optionD].filter(o => o !== ''); // Valid options

        // 1. Check if it's a single letter (A, B, C, D)
        if (/^[a-dA-D]$/.test(rawAnswer)) {
          correctAnswerIndex = rawAnswer.toUpperCase().charCodeAt(0) - 'A'.charCodeAt(0);
        }
        // 2. Check if the answer matches one of the option texts (case-insensitive)
        else {
          const lowerAnswer = rawAnswer.toLowerCase();
          correctAnswerIndex = potentialOptions.findIndex(opt => opt.toLowerCase() === lowerAnswer);
        }

        // Validate found index
        if (correctAnswerIndex === -1 || correctAnswerIndex >= potentialOptions.length) {
          // Fallback: If we couldn't match, maybe it's 1-indexed number?
          if (/^[1-4]$/.test(rawAnswer)) {
            correctAnswerIndex = parseInt(rawAnswer) - 1;
          }
        }

        if (correctAnswerIndex === -1 || correctAnswerIndex >= potentialOptions.length) {
          fs.unlinkSync(req.file.path);
          return res.status(400).json({
            message: `Row ${i + 1}: Answer "${rawAnswer}" does not match any option (A-D) or option text.`
          });
        }

        questions.push({
          id: questionId++,
          type: 'multiple-choice',
          text: questionText,
          options: potentialOptions, // Only store non-empty options
          correctAnswer: correctAnswerIndex
        });
      }

      if (questions.length === 0) {
        // Clean up uploaded file
        fs.unlinkSync(req.file.path);
        return res.status(400).json({
          message: 'No valid questions found in the Excel file'
        });
      }

      // --- AI CLASSIFICATION INTEGRATION ---
      try {
        console.log(`Starting AI classification for ${questions.length} questions...`);

        const pythonScriptPath = path.join(__dirname, 'transformer_classifier.py');
        // Use the venv python if available, otherwise default to system python
        const pythonExecutable = process.platform === 'win32'
          ? path.join(__dirname, '..', 'venv', 'Scripts', 'python.exe')
          : path.join(__dirname, '..', 'venv', 'bin', 'python');

        // check if venv python exists, else fallback
        const pythonCmd = fs.existsSync(pythonExecutable) ? pythonExecutable : 'python';

        const runClassification = () => {
          return new Promise((resolve, reject) => {
            const process = spawn(pythonCmd, [pythonScriptPath]);
            let output = '';
            let errorOutput = '';

            process.stdout.on('data', (data) => output += data.toString());
            process.stderr.on('data', (data) => errorOutput += data.toString());

            process.on('close', (code) => {
              if (code !== 0) {
                console.error('AI Classifier Failed:', errorOutput);
                // We resolve with null to allow fallback instead of failing the whole upload
                resolve(null);
              } else {
                try {
                  const results = JSON.parse(output);
                  resolve(results);
                } catch (e) {
                  console.error('Invalid JSON from AI:', output);
                  resolve(null);
                }
              }
            });

            process.on('error', (err) => {
              console.error('Failed to spawn python:', err);
              resolve(null);
            });

            // Send questions to python script
            const inputData = { questions: questions };
            process.stdin.write(JSON.stringify(inputData));
            process.stdin.end();
          });
        };

        const aiResults = await runClassification();

        if (aiResults && Array.isArray(aiResults) && aiResults.length === questions.length) {
          // Merge results
          questions.forEach((q, index) => {
            const prediction = aiResults[index];
            // Explicitly set these fields at the top level for saving
            q.topic = (prediction && prediction.topic) ? prediction.topic : 'General Grammar';
            q.difficulty = (prediction && prediction.difficulty) ? prediction.difficulty : 3;

            // Retain for debug/tagging
            q.ai_tags = {
              topic: q.topic,
              difficulty_predicted: q.difficulty,
              mock: prediction ? prediction.mock : false
            };
          });
          console.log('AI Classification successful. Added topics and difficulty levels.');
        } else {
          console.warn('AI Classification skipped or failed (length mismatch or null). Using defaults.');
          questions.forEach(q => {
            q.topic = 'General Grammar';
            q.difficulty = 3;
            q.ai_tags = { topic: 'General Grammar', difficulty_predicted: 3, error: 'AI_FAILED' };
          });
        }

      } catch (aiError) {
        console.error('Error during AI integration block:', aiError);
        // Fallback defaults
        questions.forEach(q => {
          q.topic = 'Uncategorized';
          q.difficulty = 3;
        });
      }
      // -------------------------------------

      // Save assessment to database
      const assessmentId = uuidv4();

      await pool.query(
        `INSERT INTO assessments (id, code, title, description, duration, total_questions, questions, created_at) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)`,
        [
          assessmentId,
          assessmentCode,
          assessmentName,
          `Level: ${level}, Pass Score: ${passScore}%`,
          parseInt(duration),
          questions.length,
          JSON.stringify(questions)
        ]
      );

      // Clean up uploaded file
      fs.unlinkSync(req.file.path);

      console.log(`Assessment "${assessmentName}" created successfully with ${questions.length} questions`);

      res.status(201).json({
        message: 'Question set uploaded successfully',
        assessmentId: assessmentId,
        assessmentName: assessmentName,
        assessmentCode: assessmentCode,
        questionsCount: questions.length,
        level: level,
        duration: parseInt(duration),
        passScore: parseInt(passScore)
      });

    } catch (error) {
      console.error('Error uploading question set:', error);

      // Clean up uploaded file if it exists
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }

      if (error.code === '23505') { // PostgreSQL unique violation
        return res.status(400).json({
          message: 'Assessment code already exists. Please use a different code.'
        });
      }

      res.status(500).json({
        message: 'Error processing question set upload',
        error: error.message
      });
    }
  });

  // Download Excel template endpoint
  router.get('/template/download', (req, res) => {
    try {
      // Create sample data for the template
      const templateData = [
        ['Question', 'Option_A', 'Option_B', 'Option_C', 'Option_D', 'Correct_Answer'],
        [
          'What is the capital of India?',
          'Mumbai',
          'New Delhi',
          'Kolkata',
          'Chennai',
          'B'
        ],
        [
          'Which of the following is a programming language?',
          'HTML',
          'JavaScript',
          'CSS',
          'All of the above',
          'B'
        ],
        [
          'What does CPU stand for?',
          'Central Processing Unit',
          'Computer Personal Unit',
          'Central Program Unit',
          'Computer Processing Unit',
          'A'
        ]
      ];

      // Create workbook
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(templateData);

      // Style the header row
      const headerStyle = {
        font: { bold: true },
        fill: { fgColor: { rgb: "CCCCCC" } }
      };

      // Apply styles to header row
      for (let col = 0; col < templateData[0].length; col++) {
        const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col });
        if (!ws[cellAddress]) ws[cellAddress] = {};
        ws[cellAddress].s = headerStyle;
      }

      // Set column widths
      ws['!cols'] = [
        { width: 50 }, // Question
        { width: 20 }, // Option A
        { width: 20 }, // Option B
        { width: 20 }, // Option C
        { width: 20 }, // Option D
        { width: 15 }  // Correct Answer
      ];

      XLSX.utils.book_append_sheet(wb, ws, 'Questions');

      // Generate buffer
      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

      // Set response headers
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="question_set_template.xlsx"');
      res.setHeader('Content-Length', buffer.length);

      // Send file
      res.send(buffer);

    } catch (error) {
      console.error('Error generating template:', error);
      res.status(500).json({
        message: 'Error generating template file',
        error: error.message
      });
    }
  });

  // Get all question sets (for faculty dashboard)
  router.get('/all', async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT id, code, title, description, duration, total_questions, created_at 
         FROM assessments 
         ORDER BY created_at DESC`
      );

      const questionSets = result.rows.map(row => ({
        id: row.id,
        code: row.code,
        title: row.title,
        description: row.description,
        duration: row.duration,
        questionsCount: row.total_questions,
        createdAt: row.created_at
      }));

      res.json(questionSets);
    } catch (error) {
      console.error('Error fetching question sets:', error);
      res.status(500).json({
        message: 'Error fetching question sets',
        error: error.message
      });
    }
  });

  // Get specific question set details
  router.get('/:id', async (req, res) => {
    try {
      const { id } = req.params;

      const result = await pool.query(
        'SELECT * FROM assessments WHERE id = $1',
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ message: 'Question set not found' });
      }

      const assessment = result.rows[0];

      res.json({
        id: assessment.id,
        code: assessment.code,
        title: assessment.title,
        description: assessment.description,
        duration: assessment.duration,
        totalQuestions: assessment.total_questions,
        questions: assessment.questions,
        createdAt: assessment.created_at
      });
    } catch (error) {
      console.error('Error fetching question set:', error);
      res.status(500).json({
        message: 'Error fetching question set',
        error: error.message
      });
    }
  });

  // Delete question set
  router.delete('/:id', async (req, res) => {
    try {
      const { id } = req.params;

      // Check if assessment exists and has any student attempts
      const assessmentCheck = await pool.query(
        'SELECT id FROM assessments WHERE id = $1',
        [id]
      );

      if (assessmentCheck.rows.length === 0) {
        return res.status(404).json({ message: 'Question set not found' });
      }

      // Check for student attempts
      const attemptCheck = await pool.query(
        'SELECT id FROM student_assessments WHERE assessment_id = $1',
        [id]
      );

      if (attemptCheck.rows.length > 0) {
        return res.status(400).json({
          message: 'Cannot delete question set. Students have already attempted this assessment.'
        });
      }

      // Delete the assessment
      await pool.query('DELETE FROM assessments WHERE id = $1', [id]);

      res.json({ message: 'Question set deleted successfully' });
    } catch (error) {
      console.error('Error deleting question set:', error);
      res.status(500).json({
        message: 'Error deleting question set',
        error: error.message
      });
    }
  });

  return router;
}

module.exports = createQuestionSetHandler;