const path = require('path');
// FIX 1: Explicitly tell dotenv where to find the file
// Try finding .env in the 'server' folder. 
// If your .env is in the project root, change this to: path.join(__dirname, '..', '.env')
require('dotenv').config({ path: path.join(__dirname, '.env') });

const fs = require('fs');
const xlsx = require('xlsx');
const { Client } = require('pg');
const { spawn } = require('child_process');

// --- CONFIGURATION ---
const EXCEL_FILE_PATH = path.join(__dirname, 'uploads', 'dataset.xlsx'); 
const DATABASE_URL = process.env.DATABASE_URL; 

console.log("Debug: Checking Database Config...");
if (!DATABASE_URL) {
    console.error("ERROR: DATABASE_URL is missing! Check your .env file location.");
    process.exit(1);
} else {
    console.log("Debug: DATABASE_URL found (starts with):", DATABASE_URL.substring(0, 15) + "...");
}

// --- HELPER: CALL PYTHON CLASSIFIER ---
const getAIDifficulty = (questionText) => {
    return new Promise((resolve) => {
        const scriptPath = path.join(__dirname, 'ml', 'difficulty_classifier.py'); 
        const pythonPath = path.join(__dirname, '..', 'venv', 'Scripts', 'python');

        const pythonProcess = spawn(pythonPath, [scriptPath]);
        let dataString = '';

        pythonProcess.stdin.write(JSON.stringify({ question_text: questionText }));
        pythonProcess.stdin.end();

        pythonProcess.stdout.on('data', (data) => dataString += data.toString());
        
        pythonProcess.on('close', (code) => {
            if (code !== 0) return resolve("medium");
            try {
                const res = JSON.parse(dataString);
                resolve(res.difficulty || "medium");
            } catch (e) {
                resolve("medium");
            }
        });
        
        pythonProcess.on('error', (err) => {
            console.error("Python spawn error:", err);
            resolve("medium");
        });
    });
};

const mapDifficultyToLevel = (diff) => {
    if (diff === 'easy') return 1;
    if (diff === 'hard') return 5;
    return 3; 
};

// --- MAIN IMPORT FUNCTION ---
const importData = async () => {
    // FIX 2: Add SSL for Neon
    const client = new Client({ 
        connectionString: DATABASE_URL,
        ssl: {
            rejectUnauthorized: false // Required for Neon connections
        }
    });
    
    try {
        if (!fs.existsSync(EXCEL_FILE_PATH)) {
            console.error(`Error: File not found at ${EXCEL_FILE_PATH}`);
            return;
        }
        
        console.log("Reading Excel file...");
        const workbook = xlsx.readFile(EXCEL_FILE_PATH);
        const sheetName = workbook.SheetNames[0];
        const rawData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

        console.log("Connecting to Neon Database...");
        await client.connect();
        console.log("Connected! Processing rows...");

        let successCount = 0;

        for (const [index, row] of rawData.entries()) {
            
            // Skip empty rows
            if (!row['questions'] || row['questions'].toString().trim() === '') {
                continue; 
            }

            const qText = row['questions'].trim();
            const answer = row['answers']; 
            
            const options = [
                row['option A'], 
                row['option B'], 
                row['option C'], 
                row['option D']
            ].map(opt => (opt ? opt.toString().trim() : "")); 

            const aiTag = await getAIDifficulty(qText);
            const numLevel = mapDifficultyToLevel(aiTag);

            const query = `
                INSERT INTO questions 
                (question_text, options, correct_answer, ai_difficulty_tag, difficulty_level)
                VALUES ($1, $2, $3, $4, $5)
            `;
            
            const values = [qText, JSON.stringify(options), answer, aiTag, numLevel];
            
            await client.query(query, values);
            successCount++;
            
            if (successCount % 5 === 0) process.stdout.write(`.`);
        }

        console.log(`\n\nImport Complete! Successfully added ${successCount} questions.`);

    } catch (err) {
        console.error("\nImport Error:", err);
    } finally {
        await client.end();
    }
};

importData();