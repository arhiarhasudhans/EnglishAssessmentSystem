// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const { Pool } = require('pg');
const fs = require('fs');
const format = require('pg-format');
const createDeactivateRoutes = require('./deactivate');
const questionSetHandlerFactory = require('./questionSetHandler');
const { spawn } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3002;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_4qtzMEKy2Brs@ep-divine-heart-adxr20ud-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require',
    ssl: {
        rejectUnauthorized: false
    }
});

pool.query('SELECT NOW()', (err, res) => {
    if (err) {
        console.error('Error connecting to Neon database:', err);
    } else {
        console.log('Connected to Neon database at:', res.rows[0].now);
    }
});

app.use('/api', createDeactivateRoutes(pool));

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '../public')));

const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

const templatesDir = path.join(__dirname, '../templates');
if (!fs.existsSync(templatesDir)) {
    fs.mkdirSync(templatesDir, { recursive: true });
}

function getResultsTableName(assessmentCode) {
    if (!assessmentCode || typeof assessmentCode !== 'string') {
        throw new Error('Invalid assessment code for table name generation.');
    }
    const sanitized = assessmentCode.toLowerCase().replace(/[^a-z0-9]/g, '_');
    return `results_for_${sanitized}`;
}

async function createAssessmentResultsTable(assessmentCode) {
    const tableName = getResultsTableName(assessmentCode);
    const createTableQuery = format(`
        CREATE TABLE IF NOT EXISTS %I (
            id UUID PRIMARY KEY,
            student_uuid UUID REFERENCES students(id) ON DELETE SET NULL,
            student_identifier TEXT NOT NULL,
            student_name TEXT NOT NULL,
            assessment_id UUID NOT NULL,
            score_percentage DECIMAL(5, 2) NOT NULL,
            passed BOOLEAN NOT NULL,
            time_spent_seconds INTEGER NOT NULL,
            responses JSONB,
            submitted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
    `, tableName);

    try {
        await pool.query(createTableQuery);
        console.log(`Ensured dedicated results table '${tableName}' exists.`);
    } catch (err) {
        console.error(`Error creating results table '${tableName}':`, err);
        throw err;
    }
}

async function initializeDatabase() {
    try {
        await pool.query(`
        CREATE TABLE IF NOT EXISTS faculty (
          id UUID PRIMARY KEY, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL, full_name TEXT NOT NULL, department TEXT, email TEXT UNIQUE, faculty_id TEXT UNIQUE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
        await pool.query(`
      CREATE TABLE IF NOT EXISTS students (
        id UUID PRIMARY KEY, first_name TEXT NOT NULL, last_name TEXT NOT NULL, full_name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, student_id TEXT UNIQUE NOT NULL, password TEXT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
        await pool.query(`
      CREATE TABLE IF NOT EXISTS assessments (
        id UUID PRIMARY KEY, code TEXT UNIQUE NOT NULL, title TEXT NOT NULL, description TEXT, duration INTEGER NOT NULL, total_questions INTEGER NOT NULL, questions JSONB NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
        await pool.query(`ALTER TABLE assessments ADD COLUMN IF NOT EXISTS level TEXT`);
        await pool.query(`ALTER TABLE assessments ADD COLUMN IF NOT EXISTS pass_score INTEGER`);
        await pool.query(`ALTER TABLE assessments ADD COLUMN IF NOT EXISTS questions_to_attempt INTEGER`);
        await pool.query(`
      CREATE TABLE IF NOT EXISTS student_assessments (
        id UUID PRIMARY KEY, student_id UUID REFERENCES students(id), assessment_id UUID REFERENCES assessments(id), start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP, end_time TIMESTAMP, completed BOOLEAN DEFAULT FALSE, answers JSONB, score DECIMAL(5,2), time_spent INTEGER, UNIQUE(student_id, assessment_id)
      )
    `);
        const facultyResult = await pool.query('SELECT * FROM faculty LIMIT 1');
        if (facultyResult.rows.length === 0) {
            const hashedPassword = await bcrypt.hash('guru', 10);
            await pool.query('INSERT INTO faculty (id, username, password, full_name, department) VALUES ($1, $2, $3, $4, $5)', [uuidv4(), 'faculty', hashedPassword, 'Prof. Jane Smith', 'English Department']);
            console.log('Created default faculty user');
        }
        const assessmentResult = await pool.query('SELECT * FROM assessments LIMIT 1');
        if (assessmentResult.rows.length === 0) {
            const sampleQuestions = [
                { id: 1, number: 101, type: 'multiple-choice', text: 'What is the correct use of "their" in a sentence?', options: ['They\'re going to the store.', 'The store is over there.', 'The students submitted their assignments.', 'The store is their.'], correctAnswer: 2 },
                { id: 2, number: 102, type: 'multiple-choice', text: 'Choose the correctly spelled word:', options: ['Accomodate', 'Accommodate', 'Acommodate', 'Acomodate'], correctAnswer: 1 },
                { id: 3, number: 101, type: 'multiple-choice', text: 'Which sentence is grammatically correct?', options: ['Me and him went to the park.', 'He and I went to the park.', 'Him and I went to the park.', 'Me and he went to the park.'], correctAnswer: 1 }
            ];
            const sampleAssessment = {
                id: uuidv4(), code: 'TEST123', title: 'Sample English Proficiency Assessment', description: 'A basic assessment to evaluate English language skills', duration: 60, totalQuestions: sampleQuestions.length, questions: sampleQuestions, level: 'intermediate', pass_score: 70, questions_to_attempt: 2
            };
            await pool.query('INSERT INTO assessments (id, code, title, description, duration, total_questions, questions, level, pass_score, questions_to_attempt) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)', [sampleAssessment.id, sampleAssessment.code, sampleAssessment.title, sampleAssessment.description, sampleAssessment.duration, sampleAssessment.totalQuestions, JSON.stringify(sampleAssessment.questions), sampleAssessment.level, sampleAssessment.pass_score, sampleAssessment.questions_to_attempt]);
            console.log('Created sample assessment');
            await createAssessmentResultsTable(sampleAssessment.code);
        }
        console.log('Database initialized successfully');
    } catch (error) {
        console.error('Error initializing database:', error);
    }
}

initializeDatabase();

async function classifyQuestionsBatch(questions) {
    return new Promise((resolve, reject) => {
        // Use path.join to create a reliable path to the script
        const scriptPath = path.join(__dirname, 'transformer_classifier.py');

        // Define the path to the Python executable within the virtual environment
        const pythonExecutable = process.platform === 'win32'
            ? path.join(__dirname, '..', 'venv', 'Scripts', 'python.exe') // For Windows
            : path.join(__dirname, '..', 'venv', 'bin', 'python');        // For macOS/Linux

        // Check if venv exists, else fallback to system python
        const pythonCmd = fs.existsSync(pythonExecutable) ? pythonExecutable : 'python';

        // Spawn the process
        const pythonProcess = spawn(pythonCmd, [scriptPath]);
        let output = '';
        let errorOutput = '';

        pythonProcess.stdout.on('data', (data) => {
            output += data.toString();
        });
        pythonProcess.stderr.on('data', (data) => {
            errorOutput += data.toString();
        });
        pythonProcess.on('close', (code) => {
            if (code !== 0) {
                console.warn(`AI Classifier exited with code ${code}. Error: ${errorOutput}. Using defaults.`);
                // Return defaults matching input length
                return resolve(questions.map(() => ({ topic: 'General Grammar', difficulty: 3 })));
            }
            try {
                const results = JSON.parse(output);
                resolve(results);
            } catch (e) {
                console.error(`Invalid JSON from AI: "${output}". Error: ${e}`);
                // Return defaults
                resolve(questions.map(() => ({ topic: 'General Grammar', difficulty: 3 })));
            }
        });

        pythonProcess.on('error', (err) => {
            console.error('Failed to spawn python:', err);
            resolve(questions.map(() => ({ topic: 'General Grammar', difficulty: 3 })));
        });

        // Prepare input data for the batch script
        // The script expects specific keys like 'question' (or 'text') and 'options'
        const inputData = {
            questions: questions.map(q => ({
                question: q.text,
                options: q.options || [] // Ensure options exist
            }))
        };

        pythonProcess.stdin.write(JSON.stringify(inputData));
        pythonProcess.stdin.end();
    });
}

app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    if (req.body && Object.keys(req.body).length > 0) {
        console.log('Request Body:', JSON.stringify(req.body, null, 2));
    }
    next();
});

const questionSetHandler = questionSetHandlerFactory(pool);
app.use('/api/questions', questionSetHandler);
const deactivateRoutes = createDeactivateRoutes(pool);
app.use('/api/admin/deactivate', deactivateRoutes);

// All other routes... (omitted for brevity but they are preserved)
app.post('/api/student/register', async (req, res) => {
    try {
        console.log('Processing student registration request...', req.body);
        const { firstName, lastName, email, studentId, password } = req.body;

        // Validate required fields
        if (!firstName || !lastName || !email || !studentId || !password) {
            console.log('Missing required fields:', { firstName, lastName, email, studentId, password });
            return res.status(400).json({ message: 'All fields are required' });
        }

        // Check if student ID already exists
        const existingStudentResult = await pool.query(
            'SELECT * FROM students WHERE student_id = $1',
            [studentId]
        );

        if (existingStudentResult.rows.length > 0) {
            console.log('Student ID already exists:', studentId);
            return res.status(400).json({ message: 'Student ID already exists' });
        }

        // Check if email already exists
        const existingEmailResult = await pool.query(
            'SELECT * FROM students WHERE email = $1',
            [email]
        );

        if (existingEmailResult.rows.length > 0) {
            console.log('Email already exists:', email);
            return res.status(400).json({ message: 'Email already registered' });
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Create new student
        const newStudentId = uuidv4();
        const fullName = `${firstName} ${lastName}`;

        console.log('Inserting new student with ID:', newStudentId);

        const result = await pool.query(
            'INSERT INTO students (id, first_name, last_name, full_name, email, student_id, password, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP) RETURNING *',
            [newStudentId, firstName, lastName, fullName, email, studentId, hashedPassword]
        );

        const newStudent = result.rows[0];
        console.log('Student created successfully:', newStudent);

        // Send welcome email
        try {
            console.log('Attempting to send welcome email to:', email);
            const pythonScript = path.join(__dirname, 'email_service_student.py');
            const pythonProcess = spawn('python', [pythonScript, email, fullName]);

            let emailResult = '';

            pythonProcess.stdout.on('data', (data) => {
                emailResult += data.toString();
            });

            pythonProcess.on('close', (code) => {
                try {
                    const emailResponse = JSON.parse(emailResult);

                    if (emailResponse.success) {
                        console.log('Welcome email sent successfully');
                        // Return success response with email confirmation
                        res.status(201).json({
                            success: true,
                            message: 'Student registered successfully and welcome email sent',
                            student: {
                                id: newStudent.id,
                                firstName: newStudent.first_name,
                                lastName: newStudent.last_name,
                                fullName: newStudent.full_name,
                                email: newStudent.email,
                                studentId: newStudent.student_id,
                                createdAt: newStudent.created_at
                            }
                        });
                    } else {
                        console.log('Email sending failed:', emailResponse.message);
                        // Registration successful but email failed
                        res.status(201).json({
                            success: true,
                            message: 'Student registered successfully, but welcome email failed to send',
                            student: {
                                id: newStudent.id,
                                firstName: newStudent.first_name,
                                lastName: newStudent.last_name,
                                fullName: newStudent.full_name,
                                email: newStudent.email,
                                studentId: newStudent.student_id,
                                createdAt: newStudent.created_at
                            }
                        });
                    }
                } catch (error) {
                    console.log('Error parsing email response:', error);
                    res.status(201).json({
                        success: true,
                        message: 'Student registered successfully, but welcome email failed to send',
                        student: {
                            id: newStudent.id,
                            firstName: newStudent.first_name,
                            lastName: newStudent.last_name,
                            fullName: newStudent.full_name,
                            email: newStudent.email,
                            studentId: newStudent.student_id,
                            createdAt: newStudent.created_at
                        }
                    });
                }
            });

            pythonProcess.on('error', (error) => {
                console.log('Python process error:', error);
                // Registration successful but email failed
                res.status(201).json({
                    success: true,
                    message: 'Student registered successfully, but welcome email failed to send',
                    student: {
                        id: newStudent.id,
                        firstName: newStudent.first_name,
                        lastName: newStudent.last_name,
                        fullName: newStudent.full_name,
                        email: newStudent.email,
                        studentId: newStudent.student_id,
                        createdAt: newStudent.created_at
                    }
                });
            });

        } catch (emailError) {
            console.log('Error setting up email service:', emailError);
            // Return success without email
            res.status(201).json({
                success: true,
                message: 'Student registered successfully, but welcome email failed to send',
                student: {
                    id: newStudent.id,
                    firstName: newStudent.first_name,
                    lastName: newStudent.last_name,
                    fullName: newStudent.full_name,
                    email: newStudent.email,
                    studentId: newStudent.student_id,
                    createdAt: newStudent.created_at
                }
            });
        }

    } catch (error) {
        console.error('Student registration error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error during registration',
            error: error.message
        });
    }
});
app.post('/api/student/login', async (req, res) => {
    try {
        const { studentId, password, assessmentCode } = req.body;

        // Validate required fields
        if (!studentId || !password || !assessmentCode) {
            return res.status(400).json({ message: 'All fields are required' });
        }

        // Find student
        const studentResult = await pool.query(
            'SELECT * FROM students WHERE student_id = $1',
            [studentId]
        );

        if (studentResult.rows.length === 0) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        const student = studentResult.rows[0];

        // Verify password
        const isPasswordValid = await bcrypt.compare(password, student.password);
        if (!isPasswordValid) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        // Find assessment
        const assessmentResult = await pool.query(
            'SELECT * FROM assessments WHERE code = $1',
            [assessmentCode]
        );

        if (assessmentResult.rows.length === 0) {
            return res.status(404).json({ message: 'Assessment not found' });
        }

        const assessment = assessmentResult.rows[0];

        // Check if student has already completed this assessment
        const existingAttemptResult = await pool.query(
            'SELECT * FROM student_assessments WHERE student_id = $1 AND assessment_id = $2 AND completed = true',
            [student.id, assessment.id]
        );

        if (existingAttemptResult.rows.length > 0) {
            return res.status(400).json({ message: 'You have already completed this assessment' });
        }

        // Create or update student assessment entry
        const studentAssessmentResult = await pool.query(
            'SELECT * FROM student_assessments WHERE student_id = $1 AND assessment_id = $2 AND completed = false',
            [student.id, assessment.id]
        );

        if (studentAssessmentResult.rows.length === 0) {
            // Create new assessment attempt
            await pool.query(
                'INSERT INTO student_assessments (id, student_id, assessment_id, start_time, completed) VALUES ($1, $2, $3, CURRENT_TIMESTAMP, false)',
                [uuidv4(), student.id, assessment.id]
            );
        }

        // *** MODIFICATION: Return the correct number of questions (either subset or total) ***
        const assessmentData = {
            id: assessment.id,
            title: assessment.title,
            duration: assessment.duration,
            // If questions_to_attempt is set and valid, use it. Otherwise, use total_questions.
            totalQuestions: (assessment.questions_to_attempt > 0 && assessment.questions_to_attempt < assessment.total_questions)
                ? assessment.questions_to_attempt
                : assessment.total_questions,
            passScore: assessment.pass_score, // This will be used on the results page
            level: assessment.level
        };

        res.json({
            message: 'Login successful',
            student: {
                id: student.id,
                firstName: student.first_name,
                lastName: student.last_name,
                fullName: student.full_name,
                email: student.email,
                studentId: student.student_id
            },
            assessment: assessmentData
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Server error during login' });
    }
});
app.get('/api/admin/student/:id', async (req, res) => {
    try {
        const { id } = req.params;
        console.log('Fetching student with ID:', id);

        // Validate student ID
        if (!id) {
            return res.status(400).json({ message: 'Student ID is required' });
        }

        // Query student from database
        const result = await pool.query(
            'SELECT id, first_name, last_name, full_name, email, student_id, created_at, updated_at, status FROM students WHERE id = $1',
            [id]
        );

        if (result.rows.length === 0) {
            console.log('Student not found with ID:', id);
            return res.status(404).json({ message: 'Student not found' });
        }

        const student = result.rows[0];
        console.log('Student found:', student);

        // Return student data (excluding password)
        res.status(200).json({
            success: true,
            student: {
                id: student.id,
                firstName: student.first_name,
                lastName: student.last_name,
                fullName: student.full_name,
                email: student.email,
                studentId: student.student_id,
                createdAt: student.created_at,
                updatedAt: student.updated_at,
                status: student.status || 'active'
            }
        });

    } catch (error) {
        console.error('Error fetching student:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching student',
            error: error.message
        });
    }
});
app.put('/api/admin/student/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { firstName, lastName, email, status, password } = req.body;

        console.log('Updating student with ID:', id, 'Data:', req.body);

        // Validate required fields
        if (!firstName || !lastName || !email) {
            return res.status(400).json({ message: 'First name, last name, and email are required' });
        }

        // Check if student exists
        const existingStudent = await pool.query(
            'SELECT * FROM students WHERE id = $1',
            [id]
        );

        if (existingStudent.rows.length === 0) {
            return res.status(404).json({ message: 'Student not found' });
        }

        // Check if email is already taken by another student
        const emailCheck = await pool.query(
            'SELECT * FROM students WHERE email = $1 AND id != $2',
            [email, id]
        );

        if (emailCheck.rows.length > 0) {
            return res.status(400).json({ message: 'Email already registered' });
        }

        const fullName = `${firstName} ${lastName}`;
        const studentStatus = status || 'active';
        let updateQuery;
        let queryParams;

        // Update with or without password
        if (password) {
            // Validate password
            if (password.length < 6) {
                return res.status(400).json({ message: 'Password must be at least 6 characters long' });
            }

            // Hash new password
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(password, salt);

            updateQuery = `
                UPDATE students 
                SET first_name = $1, last_name = $2, full_name = $3, email = $4, status = $5, password = $6, updated_at = CURRENT_TIMESTAMP
                WHERE id = $7 
                RETURNING id, first_name, last_name, full_name, email, student_id, created_at, updated_at, status
            `;
            queryParams = [firstName, lastName, fullName, email, studentStatus, hashedPassword, id];
        } else {
            updateQuery = `
                UPDATE students 
                SET first_name = $1, last_name = $2, full_name = $3, email = $4, status = $5, updated_at = CURRENT_TIMESTAMP
                WHERE id = $6 
                RETURNING id, first_name, last_name, full_name, email, student_id, created_at, updated_at, status
            `;
            queryParams = [firstName, lastName, fullName, email, studentStatus, id];
        }

        console.log('Executing update query:', updateQuery);
        const result = await pool.query(updateQuery, queryParams);

        const updatedStudent = result.rows[0];
        console.log('Student updated successfully:', updatedStudent);

        // Return updated student data
        res.status(200).json({
            success: true,
            message: 'Student updated successfully',
            student: {
                id: updatedStudent.id,
                firstName: updatedStudent.first_name,
                lastName: updatedStudent.last_name,
                fullName: updatedStudent.full_name,
                email: updatedStudent.email,
                studentId: updatedStudent.student_id,
                createdAt: updatedStudent.created_at,
                updatedAt: updatedStudent.updated_at,
                status: updatedStudent.status
            }
        });

    } catch (error) {
        console.error('Error updating student:', error);
        res.status(500).json({
            success: false,
            message: 'Server error during update',
            error: error.message
        });
    }
});
async function ensureStudentStatusColumn() {
    try {
        const checkColumn = await pool.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name='students' AND column_name='status'
        `);

        if (checkColumn.rows.length === 0) {
            console.log('Adding status column to students table');
            await pool.query("ALTER TABLE students ADD COLUMN status VARCHAR(20) DEFAULT 'active'");
        }
    } catch (error) {
        console.log('Error checking or adding status column to students table:', error.message);
    }
}
async function ensureStudentUpdatedAtColumn() {
    try {
        const checkColumn = await pool.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name='students' AND column_name='updated_at'
        `);

        if (checkColumn.rows.length === 0) {
            console.log('Adding updated_at column to students table');
            await pool.query('ALTER TABLE students ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP');
        }
    } catch (error) {
        console.log('Error checking or adding updated_at column to students table:', error.message);
    }
}
ensureStudentStatusColumn();
ensureStudentUpdatedAtColumn();
app.post('/api/faculty/register', async (req, res) => {
    try {
        console.log('Processing faculty registration request...', req.body);
        const { username, fullName, email, facultyId, department, password } = req.body;

        // Validate required fields
        if (!username || !fullName || !department || !password) {
            console.log('Missing required fields:', { username, fullName, department, password });
            return res.status(400).json({ message: 'All fields are required' });
        }

        // Database operations (existing code)
        try {
            // Check if email column exists
            const checkEmailColumn = await pool.query(`
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name='faculty' AND column_name='email'
            `);

            if (checkEmailColumn.rows.length === 0) {
                console.log('Adding email column to faculty table');
                await pool.query('ALTER TABLE faculty ADD COLUMN email TEXT UNIQUE');
            }

            // Check if faculty_id column exists
            const checkFacultyIdColumn = await pool.query(`
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name='faculty' AND column_name='faculty_id'
            `);

            if (checkFacultyIdColumn.rows.length === 0) {
                console.log('Adding faculty_id column to faculty table');
                await pool.query('ALTER TABLE faculty ADD COLUMN faculty_id TEXT UNIQUE');
            }
        } catch (error) {
            console.log('Error checking or adding columns:', error.message);
        }

        // Check if username already exists
        const existingUsernameResult = await pool.query(
            'SELECT * FROM faculty WHERE username = $1',
            [username]
        );

        if (existingUsernameResult.rows.length > 0) {
            console.log('Username already exists:', username);
            return res.status(400).json({ message: 'Username already exists' });
        }

        // Check if email already exists (if provided)
        if (email) {
            const existingEmailResult = await pool.query(
                'SELECT * FROM faculty WHERE email = $1',
                [email]
            );

            if (existingEmailResult.rows.length > 0) {
                console.log('Email already exists:', email);
                return res.status(400).json({ message: 'Email already registered' });
            }
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Create new faculty
        const newFacultyId = uuidv4();

        console.log('Inserting new faculty with ID:', newFacultyId);

        // Create SQL query based on what columns exist
        let insertQuery;
        let queryParams;

        if (email && facultyId) {
            insertQuery = `
                INSERT INTO faculty 
                (id, username, password, full_name, department, email, faculty_id, created_at) 
                VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP) 
                RETURNING *
            `;
            queryParams = [newFacultyId, username, hashedPassword, fullName, department, email, facultyId];
        } else if (email) {
            insertQuery = `
                INSERT INTO faculty 
                (id, username, password, full_name, department, email, created_at) 
                VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP) 
                RETURNING *
            `;
            queryParams = [newFacultyId, username, hashedPassword, fullName, department, email];
        } else {
            insertQuery = `
                INSERT INTO faculty 
                (id, username, password, full_name, department, created_at) 
                VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP) 
                RETURNING *
            `;
            queryParams = [newFacultyId, username, hashedPassword, fullName, department];
        }

        console.log('Executing query:', insertQuery);
        const result = await pool.query(insertQuery, queryParams);

        const newFaculty = result.rows[0];
        console.log('Faculty created successfully:', newFaculty);

        // Send welcome email if email is provided
        if (email) {
            try {
                console.log('Attempting to send welcome email to:', email);
                const pythonScript = path.join(__dirname, 'email_service.py');
                const pythonProcess = spawn('python', [pythonScript, email, fullName]);

                let emailResult = '';

                pythonProcess.stdout.on('data', (data) => {
                    emailResult += data.toString();
                });

                pythonProcess.on('close', (code) => {
                    try {
                        const emailResponse = JSON.parse(emailResult);

                        if (emailResponse.success) {
                            console.log('Welcome email sent successfully');
                            // Return success response with email confirmation
                            res.status(201).json({
                                success: true,
                                message: 'Faculty registered successfully and welcome email sent',
                                faculty: {
                                    id: newFaculty.id,
                                    username: newFaculty.username,
                                    fullName: newFaculty.full_name,
                                    department: newFaculty.department,
                                    email: newFaculty.email,
                                    facultyId: newFaculty.faculty_id,
                                    createdAt: newFaculty.created_at
                                }
                            });
                        } else {
                            console.log('Email sending failed:', emailResponse.message);
                            // Registration successful but email failed
                            res.status(201).json({
                                success: true,
                                message: 'Faculty registered successfully, but welcome email failed to send',
                                faculty: {
                                    id: newFaculty.id,
                                    username: newFaculty.username,
                                    fullName: newFaculty.full_name,
                                    department: newFaculty.department,
                                    email: newFaculty.email,
                                    facultyId: newFaculty.faculty_id,
                                    createdAt: newFaculty.created_at
                                }
                            });
                        }
                    } catch (error) {
                        console.log('Error parsing email response:', error);
                        res.status(201).json({
                            success: true,
                            message: 'Faculty registered successfully, but welcome email failed to send',
                            faculty: {
                                id: newFaculty.id,
                                username: newFaculty.username,
                                fullName: newFaculty.full_name,
                                department: newFaculty.department,
                                email: newFaculty.email,
                                facultyId: newFaculty.faculty_id,
                                createdAt: newFaculty.created_at
                            }
                        });
                    }
                });

                pythonProcess.on('error', (error) => {
                    console.log('Python process error:', error);
                    // Registration successful but email failed
                    res.status(201).json({
                        success: true,
                        message: 'Student registered successfully, but welcome email failed to send',
                        student: {
                            id: newFaculty.id,
                            username: newFaculty.username,
                            fullName: newFaculty.full_name,
                            department: newFaculty.department,
                            email: newFaculty.email,
                            facultyId: newFaculty.faculty_id,
                            createdAt: newFaculty.created_at
                        }
                    });
                });

            } catch (emailError) {
                console.log('Error setting up email service:', emailError);
                // Return success without email
                res.status(201).json({
                    success: true,
                    message: 'Faculty registered successfully, but welcome email failed to send',
                    faculty: {
                        id: newFaculty.id,
                        username: newFaculty.username,
                        fullName: newFaculty.full_name,
                        department: newFaculty.department,
                        email: newFaculty.email,
                        facultyId: newFaculty.faculty_id,
                        createdAt: newFaculty.created_at
                    }
                });
            }
        } else {
            // No email provided, return success
            res.status(201).json({
                success: true,
                message: 'Faculty registered successfully',
                faculty: {
                    id: newFaculty.id,
                    username: newFaculty.username,
                    fullName: newFaculty.full_name,
                    department: newFaculty.department,
                    email: newFaculty.email,
                    facultyId: newFaculty.faculty_id,
                    createdAt: newFaculty.created_at
                }
            });
        }

    } catch (error) {
        console.error('Faculty registration error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error during registration',
            error: error.message
        });
    }
});
app.get('/api/faculty/:id', async (req, res) => {
    try {
        const { id } = req.params;
        console.log('Fetching faculty with ID:', id);

        // Validate faculty ID
        if (!id) {
            return res.status(400).json({ message: 'Faculty ID is required' });
        }

        // Query faculty from database
        const result = await pool.query(
            'SELECT id, username, full_name, email, faculty_id, department, created_at FROM faculty WHERE id = $1',
            [id]
        );

        if (result.rows.length === 0) {
            console.log('Faculty not found with ID:', id);
            return res.status(404).json({ message: 'Faculty not found' });
        }

        const faculty = result.rows[0];
        console.log('Faculty found:', faculty);

        // Return faculty data (excluding password)
        res.status(200).json({
            id: faculty.id,
            username: faculty.username,
            fullName: faculty.full_name,
            email: faculty.email,
            facultyId: faculty.faculty_id,
            department: faculty.department,
            createdAt: faculty.created_at
        });

    } catch (error) {
        console.error('Error fetching faculty:', error);
        res.status(500).json({
            message: 'Server error while fetching faculty',
            error: error.message
        });
    }
});
app.put('/api/faculty/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { username, fullName, email, department, password } = req.body;

        console.log('Updating faculty with ID:', id, 'Data:', req.body);

        // Validate required fields
        if (!username || !fullName || !department) {
            return res.status(400).json({ message: 'Username, full name, and department are required' });
        }

        // Check if faculty exists
        const existingFaculty = await pool.query(
            'SELECT * FROM faculty WHERE id = $1',
            [id]
        );

        if (existingFaculty.rows.length === 0) {
            return res.status(404).json({ message: 'Faculty not found' });
        }

        // Check if username is already taken by another faculty
        const usernameCheck = await pool.query(
            'SELECT * FROM faculty WHERE username = $1 AND id != $2',
            [username, id]
        );

        if (usernameCheck.rows.length > 0) {
            return res.status(400).json({ message: 'Username already exists' });
        }

        // Check if email is already taken by another faculty (if email is provided)
        if (email) {
            const emailCheck = await pool.query(
                'SELECT * FROM faculty WHERE email = $1 AND id != $2',
                [email, id]
            );

            if (emailCheck.rows.length > 0) {
                return res.status(400).json({ message: 'Email already registered' });
            }
        }

        let updateQuery;
        let queryParams;

        // Update with or without password
        if (password) {
            // Validate password
            if (password.length < 6) {
                return res.status(400).json({ message: 'Password must be at least 6 characters long' });
            }

            // Hash new password
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(password, salt);

            updateQuery = `
                UPDATE faculty 
                SET username = $1, full_name = $2, email = $3, department = $4, password = $5, updated_at = CURRENT_TIMESTAMP
                WHERE id = $6 
                RETURNING id, username, full_name, email, faculty_id, department, created_at, updated_at
            `;
            queryParams = [username, fullName, email, department, hashedPassword, id];
        } else {
            updateQuery = `
                UPDATE faculty 
                SET username = $1, full_name = $2, email = $3, department = $4, updated_at = CURRENT_TIMESTAMP
                WHERE id = $5 
                RETURNING id, username, full_name, email, faculty_id, department, created_at, updated_at
            `;
            queryParams = [username, fullName, email, department, id];
        }

        console.log('Executing update query:', updateQuery);
        const result = await pool.query(updateQuery, queryParams);

        const updatedFaculty = result.rows[0];
        console.log('Faculty updated successfully:', updatedFaculty);

        // Return updated faculty data
        res.status(200).json({
            success: true,
            message: 'Faculty updated successfully',
            faculty: {
                id: updatedFaculty.id,
                username: updatedFaculty.username,
                fullName: updatedFaculty.full_name,
                email: updatedFaculty.email,
                facultyId: updatedFaculty.faculty_id,
                department: updatedFaculty.department,
                createdAt: updatedFaculty.created_at,
                updatedAt: updatedFaculty.updated_at
            }
        });

    } catch (error) {
        console.error('Error updating faculty:', error);
        res.status(500).json({
            success: false,
            message: 'Server error during update',
            error: error.message
        });
    }
});
app.get('/api/faculty', async (req, res) => {
    try {
        console.log('Fetching all faculty members...');

        const result = await pool.query(
            'SELECT id, username, full_name, email, faculty_id, department, created_at FROM faculty ORDER BY created_at DESC'
        );

        console.log(`Found ${result.rows.length} faculty members`);

        const facultyList = result.rows.map(faculty => ({
            id: faculty.id,
            username: faculty.username,
            fullName: faculty.full_name,
            email: faculty.email,
            facultyId: faculty.faculty_id,
            department: faculty.department,
            createdAt: faculty.created_at
        }));

        res.status(200).json({
            success: true,
            faculty: facultyList,
            count: facultyList.length
        });

    } catch (error) {
        console.error('Error fetching faculty list:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching faculty list',
            error: error.message
        });
    }
});
app.delete('/api/faculty/:id', async (req, res) => {
    try {
        const { id } = req.params;
        console.log('Deleting faculty with ID:', id);

        // Check if faculty exists
        const existingFaculty = await pool.query(
            'SELECT * FROM faculty WHERE id = $1',
            [id]
        );

        if (existingFaculty.rows.length === 0) {
            return res.status(404).json({ message: 'Faculty not found' });
        }

        // Delete faculty
        await pool.query('DELETE FROM faculty WHERE id = $1', [id]);

        console.log('Faculty deleted successfully');

        res.status(200).json({
            success: true,
            message: 'Faculty deleted successfully'
        });

    } catch (error) {
        console.error('Error deleting faculty:', error);
        res.status(500).json({
            success: false,
            message: 'Server error during deletion',
            error: error.message
        });
    }
});
async function ensureUpdatedAtColumn() {
    try {
        const checkColumn = await pool.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name='faculty' AND column_name='updated_at'
        `);

        if (checkColumn.rows.length === 0) {
            console.log('Adding updated_at column to faculty table');
            await pool.query('ALTER TABLE faculty ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP');
        }
    } catch (error) {
        console.log('Error checking or adding updated_at column:', error.message);
    }
}
ensureUpdatedAtColumn();
app.get('/api/assessment/:assessmentId/questions', async (req, res) => {
    try {
        const { assessmentId } = req.params;
        const { studentId } = req.query;

        if (!assessmentId || !studentId) {
            return res.status(400).json({ message: 'Assessment ID and Student ID are required' });
        }

        const studentResult = await pool.query('SELECT * FROM students WHERE student_id = $1', [studentId]);
        if (studentResult.rows.length === 0) return res.status(404).json({ message: 'Student not found' });

        const student = studentResult.rows[0];

        const assessmentResult = await pool.query('SELECT * FROM assessments WHERE id = $1', [assessmentId]);
        if (assessmentResult.rows.length === 0) return res.status(404).json({ message: 'Assessment not found' });

        const assessment = assessmentResult.rows[0];

        const studentAssessmentResult = await pool.query('SELECT * FROM student_assessments WHERE student_id = $1 AND assessment_id = $2 AND completed = false', [student.id, assessment.id]);
        if (studentAssessmentResult.rows.length === 0) return res.status(400).json({ message: 'No active assessment found for this student.' });

        let allQuestions = assessment.questions || [];
        const numToAttempt = assessment.questions_to_attempt;

        let finalQuestions = allQuestions;

        // *** MODIFICATION: If a specific number of questions should be attempted, randomly select them ***
        if (numToAttempt > 0 && numToAttempt < allQuestions.length) {
            // Fisher-Yates shuffle algorithm to randomize the array in-place
            for (let i = allQuestions.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [allQuestions[i], allQuestions[j]] = [allQuestions[j], allQuestions[i]];
            }
            // Take the first `numToAttempt` questions from the shuffled array
            finalQuestions = allQuestions.slice(0, numToAttempt);
        }

        // Always sort the final set of questions for a consistent order during the quiz
        finalQuestions.sort((a, b) => {
            const numA = a.number || Infinity;
            const numB = b.number || Infinity;
            if (numA === numB) return (a.id || 0) - (b.id || 0);
            return numA - numB;
        });

        // Return questions without correct answers but WITH AI metadata
        const questionsWithoutAnswers = finalQuestions.map(q => {
            const { correctAnswer, ...questionData } = q;
            // Ensure difficulty and topic are top-level if possible, or preserve existing structure
            // If they are in ai_tags, we can flatten or pass them through
            return {
                ...questionData,
                difficulty: q.difficulty || (q.ai_tags ? q.ai_tags.difficulty_predicted : 3),
                topic: q.topic || (q.ai_tags ? q.ai_tags.topic : 'General')
            };
        });

        res.json({
            assessmentTitle: assessment.title,
            duration: assessment.duration,
            questions: questionsWithoutAnswers,
            passScore: assessment.pass_score,
            assessmentLevel: assessment.level
        });

    } catch (error) {
        console.error('Error fetching questions:', error);
        res.status(500).json({ message: 'Server error while fetching questions' });
    }
});
app.post('/api/assessment/submit', async (req, res) => {
    try {
        const { studentId, assessmentId, answers, timeSpent } = req.body;

        // Validate required fields
        if (!studentId || !assessmentId || !answers || !Array.isArray(answers)) {
            return res.status(400).json({ message: 'Invalid submission data' });
        }

        // Find student
        const studentResult = await pool.query(
            'SELECT * FROM students WHERE id = $1', // Assuming UUID is passed here
            [studentId]
        );

        if (studentResult.rows.length === 0) {
            return res.status(404).json({ message: 'Student not found' });
        }

        // ... (rest of the logic remains)

        res.json({
            message: 'This endpoint is for reference. Results are now saved via /api/results/save.'
        });

    } catch (error) {
        console.error('Error submitting assessment:', error);
        res.status(500).json({ message: 'Server error during submission' });
    }
});
app.post('/api/results/save', async (req, res) => {
    try {
        // Destructure all the rich data sent from the results.html page
        const {
            studentId: studentIdentifier, // e.g., "2410148"
            assessmentId, // UUID
            studentName,
            responses,
            percentage,
            passed,
            timeUsed, // in seconds
        } = req.body;

        // Validation
        if (!studentIdentifier || !assessmentId || !studentName || !responses || percentage === undefined || passed === undefined || timeUsed === undefined) {
            return res.status(400).json({ success: false, message: 'Missing required result data.' });
        }

        // Step 1: Find student's UUID from their identifier
        const studentResult = await pool.query('SELECT id FROM students WHERE student_id = $1', [studentIdentifier]);
        if (studentResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: `Student with identifier ${studentIdentifier} not found.` });
        }
        const studentUUID = studentResult.rows[0].id;

        // Step 2: Get assessment code to determine the dynamic table name
        const assessmentResult = await pool.query('SELECT code FROM assessments WHERE id = $1', [assessmentId]);
        if (assessmentResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Assessment not found.' });
        }
        const assessmentCode = assessmentResult.rows[0].code;

        // Step 3: Get the dynamic, sanitized table name
        const resultsTableName = getResultsTableName(assessmentCode);

        // *** THIS IS THE NEW LINE TO ADD ***
        // Step 4: Ensure the dedicated results table exists before trying to insert into it.
        await createAssessmentResultsTable(assessmentCode);
        // *** END OF NEW LINE ***

        // Step 5: Insert detailed results into the specific assessment's table using pg-format
        const insertQuery = format(
            'INSERT INTO %I (id, student_uuid, student_identifier, student_name, assessment_id, score_percentage, passed, time_spent_seconds, responses) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
            resultsTableName // %I is replaced by this safe, quoted table name
        );
        const queryParams = [
            uuidv4(), // Generate a new UUID for this result entry
            studentUUID,
            studentIdentifier,
            studentName,
            assessmentId,
            percentage,
            passed,
            timeUsed,
            JSON.stringify(responses) // Store detailed responses as JSON
        ];

        await pool.query(insertQuery, queryParams);
        console.log(`Results saved to dedicated table '${resultsTableName}' for student ${studentIdentifier}`);

        // Step 5: (As per "don't remove" instruction) Update the central student_assessments log
        // This marks the original attempt record as complete and stores a summary.
        await pool.query(
            `UPDATE student_assessments
             SET
                end_time = CURRENT_TIMESTAMP,
                completed = true,
                answers = $1,
                score = $2,
                time_spent = $3
             WHERE student_id = $4 AND assessment_id = $5 AND completed = false`,
            [
                JSON.stringify(responses), // Storing responses here too for redundancy/central log
                percentage,
                timeUsed,
                studentUUID,
                assessmentId
            ]
        );
        console.log(`Updated central student_assessments log for student ${studentUUID}`);

        res.status(200).json({ success: true, message: 'Results saved successfully.' });

    } catch (error) {
        console.error('Error saving assessment results:', error);
        res.status(500).json({ success: false, message: 'Server error while saving results.', error: error.message });
    }
});
app.get('/api/student/:studentId/results', async (req, res) => {
    try {
        const { studentId } = req.params;

        // Find student
        const studentResult = await pool.query(
            'SELECT * FROM students WHERE student_id = $1',
            [studentId]
        );

        if (studentResult.rows.length === 0) {
            return res.status(404).json({ message: 'Student not found' });
        }

        const student = studentResult.rows[0];

        // Get completed assessments for this student from the central log
        const completedAssessmentsResult = await pool.query(
            'SELECT sa.*, a.title FROM student_assessments sa JOIN assessments a ON sa.assessment_id = a.id WHERE sa.student_id = $1 AND sa.completed = true',
            [student.id]
        );

        if (completedAssessmentsResult.rows.length === 0) {
            return res.status(404).json({ message: 'No completed assessments found' });
        }

        // Format results
        const results = completedAssessmentsResult.rows.map(sa => {
            return {
                assessmentId: sa.assessment_id,
                assessmentTitle: sa.title,
                completedDate: sa.end_time,
                score: sa.score,
                timeSpent: sa.time_spent || 'Not recorded'
            };
        });

        res.json({
            studentName: student.full_name,
            results
        });

    } catch (error) {
        console.error('Error fetching results:', error);
        res.status(500).json({ message: 'Server error while fetching results' });
    }
});
app.post('/api/faculty/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        // Validate required fields
        if (!username || !password) {
            return res.status(400).json({ message: 'All fields are required' });
        }

        // Find faculty
        const facultyResult = await pool.query(
            'SELECT * FROM faculty WHERE username = $1',
            [username]
        );

        if (facultyResult.rows.length === 0) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        const facultyMember = facultyResult.rows[0];

        // Verify password
        const isPasswordValid = await bcrypt.compare(password, facultyMember.password);
        if (!isPasswordValid) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        // Return faculty data (without password)
        const { password: _, ...facultyData } = facultyMember;

        res.json({
            message: 'Login successful',
            faculty: {
                id: facultyMember.id,
                username: facultyMember.username,
                fullName: facultyMember.full_name,
                department: facultyMember.department
            }
        });

    } catch (error) {
        console.error('Faculty login error:', error);
        res.status(500).json({ message: 'Server error during login' });
    }
});
app.post('/api/faculty/logout', (req, res) => {
    // For a stateless token-based auth system, the client is responsible for deleting the token.
    // This endpoint just acknowledges the request for a clean logout flow.
    console.log('Faculty logout request received.');
    res.status(200).json({ success: true, message: 'Logout successful.' });
});
app.post('/api/assessment/create', async (req, res) => {
    try {
        const { title, description, duration, questions, code, level, passScore, questionsToAttempt } = req.body;

        if (!title || !duration || !questions || !Array.isArray(questions) || !code || !level || passScore === undefined) {
            return res.status(400).json({ message: 'Invalid assessment data. All required fields must be provided.' });
        }

        const questionsInBank = questions.length;
        const numToAttempt = questionsToAttempt ? parseInt(questionsToAttempt, 10) : null;

        if (numToAttempt && (numToAttempt < 1 || numToAttempt > questionsInBank)) {
            return res.status(400).json({ message: `Questions to attempt must be between 1 and the total number of questions in the file (${questionsInBank}).` });
        }

        const existingAssessmentResult = await pool.query('SELECT * FROM assessments WHERE code = $1', [code]);
        if (existingAssessmentResult.rows.length > 0) {
            return res.status(400).json({ message: 'Assessment code already exists' });
        }

        const assessmentId = uuidv4();

        // *** NEW LOGIC: Classify each question ***
        // *** NEW LOGIC: Classify all questions in batch ***
        console.log(`Starting batch AI classification for ${questions.length} questions...`);
        let classifiedQuestions = [];

        try {
            // Batch process
            const aiResults = await classifyQuestionsBatch(questions);

            // Merge results
            classifiedQuestions = questions.map((q, index) => {
                const predictions = aiResults[index] || { topic: 'General Grammar', difficulty: 3 };

                // Ensure difficulty is an integer
                let diff = predictions.difficulty;
                if (typeof diff === 'string') {
                    if (diff.toLowerCase() === 'easy') diff = 1;
                    else if (diff.toLowerCase() === 'medium') diff = 3;
                    else if (diff.toLowerCase() === 'hard') diff = 5;
                    else diff = 3;
                }

                return {
                    ...q,
                    topic: predictions.topic || 'General Grammar',
                    difficulty: diff || 3,
                    ai_tags: {
                        topic: predictions.topic,
                        difficulty_predicted: diff,
                        mock: predictions.mock || false
                    }
                };
            });
            console.log('AI Classification complete.');
        } catch (err) {
            console.error('Unexpected error during batch classification:', err);
            // Fallback
            classifiedQuestions = questions.map(q => ({
                ...q,
                topic: 'General Grammar',
                difficulty: 3
            }));
        }
        // *** END NEW LOGIC ***

        await pool.query(
            'INSERT INTO assessments (id, code, title, description, duration, total_questions, questions, level, pass_score, questions_to_attempt) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)',
            [
                assessmentId, code, title, description || '', duration,
                questionsInBank, JSON.stringify(classifiedQuestions), // Store classified questions
                level, passScore, numToAttempt
            ]
        );

        await createAssessmentResultsTable(code);

        res.status(201).json({
            message: 'Assessment created successfully and questions classified.',
            assessmentId: assessmentId
        });

    } catch (error) {
        console.error('Error creating assessment:', error);
        res.status(500).json({ message: 'Server error while creating assessment', error: error.message });
    }
});
app.get('/api/assessment/all', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, code, title, description, duration, total_questions, created_at, level, pass_score, questions_to_attempt FROM assessments ORDER BY created_at DESC'
        );

        const assessments = result.rows.map(row => ({
            id: row.id,
            code: row.code,
            title: row.title,
            description: row.description,
            duration: row.duration,
            questionsCount: row.questions_to_attempt || row.total_questions, // Show attemptable count if set
            totalInBank: row.total_questions, // Also show total in bank for clarity
            createdAt: row.created_at,
            level: row.level,
            passScore: row.pass_score
        }));

        res.json(assessments);
    } catch (error) {
        console.error('Error fetching assessments:', error);
        res.status(500).json({ message: 'Server error while fetching assessments' });
    }
});
app.get('/api/assessment/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const result = await pool.query(
            'SELECT * FROM assessments WHERE id = $1',
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Assessment not found' });
        }

        const assessment = result.rows[0];

        // For admin/faculty viewing, include everything
        res.json({
            id: assessment.id,
            code: assessment.code,
            title: assessment.title,
            description: assessment.description,
            duration: assessment.duration,
            totalQuestions: assessment.total_questions,
            questions: assessment.questions,
            createdAt: assessment.created_at,
            level: assessment.level,
            passScore: assessment.pass_score,
            questionsToAttempt: assessment.questions_to_attempt
        });
    } catch (error) {
        console.error('Error fetching assessment:', error);
        res.status(500).json({ message: 'Server error while fetching assessment' });
    }
});
app.delete('/api/assessment/:id', async (req, res) => {
    const { id } = req.params;
    const client = await pool.connect();

    try {
        // Check if assessment exists
        const assessmentResult = await client.query('SELECT code FROM assessments WHERE id = $1', [id]);
        if (assessmentResult.rows.length === 0) {
            return res.status(404).json({ message: 'Assessment not found' });
        }
        const assessmentCode = assessmentResult.rows[0].code;

        await client.query('BEGIN');

        // Delete related student assessments first to maintain integrity
        await client.query('DELETE FROM student_assessments WHERE assessment_id = $1', [id]);

        // Then, delete the assessment itself
        await client.query('DELETE FROM assessments WHERE id = $1', [id]);

        // NOTE: We are NOT deleting the dedicated results table (e.g., results_for_test123)
        // to prevent accidental loss of historical data. This can be done manually by an admin if needed.
        console.log(`Kept dedicated results table for assessment code ${assessmentCode} for archival purposes.`);

        await client.query('COMMIT');

        res.json({ message: 'Assessment and all related attempts deleted successfully' });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error deleting assessment:', error);
        res.status(500).json({ message: 'Server error while deleting assessment' });
    } finally {
        client.release();
    }
});
app.get('/api/dashboard/stats', async (req, res) => {
    try {
        const totalAssessmentsPromise = pool.query('SELECT COUNT(*) FROM assessments');
        const totalStudentsPromise = pool.query('SELECT COUNT(*) FROM students');
        const avgScorePromise = pool.query(
            'SELECT AVG(score) as average_score FROM student_assessments WHERE completed = true AND score IS NOT NULL'
        );

        const [assessmentsResult, studentsResult, avgScoreResult] = await Promise.all([
            totalAssessmentsPromise,
            totalStudentsPromise,
            avgScorePromise
        ]);

        const stats = {
            totalAssessments: parseInt(assessmentsResult.rows[0].count, 10),
            totalStudents: parseInt(studentsResult.rows[0].count, 10),
            activeAssessments: parseInt(assessmentsResult.rows[0].count, 10), // Assuming all assessments are active for this stat
            avgScore: avgScoreResult.rows[0].average_score ? parseFloat(avgScoreResult.rows[0].average_score).toFixed(0) : 0
        };

        res.json({ success: true, stats });

    } catch (error) {
        console.error('Error fetching dashboard stats:', error);
        res.status(500).json({ success: false, message: 'Server error fetching stats.' });
    }
});
app.get('/api/results/recent', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT
                sa.id,
                s.full_name as student_name,
                a.title as assessment_title,
                sa.end_time as completion_date,
                sa.score
            FROM
                student_assessments sa
            JOIN
                students s ON sa.student_id = s.id
            JOIN
                assessments a ON sa.assessment_id = a.id
            WHERE
                sa.completed = true
            ORDER BY
                sa.end_time DESC
            LIMIT 5`
        );
        res.json({ success: true, activities: result.rows });
    } catch (error) {
        console.error('Error fetching recent activities:', error);
        res.status(500).json({ success: false, message: 'Server error fetching recent activities.' });
    }
});
app.get('/api/assessment/results/summary', async (req, res) => {
    try {
        const query = `
            SELECT
                a.id,
                a.code,
                a.title,
                a.created_at,
                a.total_questions,
                (SELECT COUNT(*) FROM student_assessments sa WHERE sa.assessment_id = a.id AND sa.completed = true) as attempt_count
            FROM
                assessments a
            ORDER BY
                a.created_at DESC
        `;
        const result = await pool.query(query);
        res.json({ success: true, assessments: result.rows });
    } catch (error) {
        console.error('Error fetching assessment summary:', error);
        res.status(500).json({ success: false, message: 'Server error fetching assessment summary.' });
    }
});
app.get('/api/assessment/:id/results', async (req, res) => {
    const { id } = req.params;
    try {
        const query = `
            SELECT
                s.full_name,
                s.student_id,
                sa.score,
                sa.end_time
            FROM
                student_assessments sa
            JOIN
                students s ON sa.student_id = s.id
            WHERE
                sa.assessment_id = $1 AND sa.completed = true
            ORDER BY
                sa.score DESC
        `;
        const result = await pool.query(query, [id]);
        res.json({ success: true, results: result.rows });
    } catch (error) {
        console.error(`Error fetching results for assessment ${id}:`, error);
        res.status(500).json({ success: false, message: 'Server error fetching results.' });
    }
});
app.get('/api/students/all', async (req, res) => {
    try {
        // This query joins students with a subquery that counts their completed assessments
        const query = `
            SELECT
                s.id,
                s.full_name as "fullName",
                s.email,
                (SELECT COUNT(*)
                 FROM student_assessments sa
                 WHERE sa.student_id = s.id AND sa.completed = true) as "assessmentsTakenCount"
            FROM
                students s
            ORDER BY
                s.full_name ASC;
        `;
        const result = await pool.query(query);
        res.json({ success: true, students: result.rows });
    } catch (error) {
        console.error('Error fetching all students for reports:', error);
        res.status(500).json({ success: false, message: 'Server error fetching student list.' });
    }
});
app.get('/api/student/report/:studentId', async (req, res) => {
    const { studentId } = req.params;
    try {
        // This query gets all completed assessments for a student.
        // It calculates the raw score (number of correct answers) from the stored percentage,
        // which is what the frontend expects.
        const query = `
            SELECT
                ROUND((sa.score / 100) * a.total_questions) as score,
                a.total_questions as "totalQuestions",
                sa.end_time as "dateTaken",
                a.title as "assessmentTitle"
            FROM
                student_assessments sa
            JOIN
                assessments a ON sa.assessment_id = a.id
            WHERE
                sa.student_id = $1 AND sa.completed = true
            ORDER BY
                sa.end_time DESC;
        `;
        const result = await pool.query(query, [studentId]);
        res.json({ success: true, report: result.rows });
    } catch (error) {
        console.error(`Error fetching report for student ${studentId}:`, error);
        res.status(500).json({ success: false, message: 'Server error fetching student report.' });
    }
});
app.post('/api/admin/logout', (req, res) => {
    // For a stateless token-based authentication system, the client is responsible for deleting the token.
    // This server endpoint simply acknowledges the logout request for a clean and complete logout flow.
    // In more complex systems, this could be used to invalidate a refresh token or add a JWT to a denylist.
    console.log('Admin logout request received.');
    res.status(200).json({ success: true, message: 'Admin logout successful.' });
});
app.get('/api/test', async (req, res) => {
    try {
        const dbResult = await pool.query('SELECT NOW() as time');
        res.json({
            message: 'API is working correctly',
            timestamp: new Date().toISOString(),
            database: 'Connected to Neon',
            databaseTime: dbResult.rows[0].time
        });
    } catch (error) {
        res.status(500).json({
            message: 'API is working but database connection failed',
            error: error.message
        });
    }
});
app.get('/api/admin/students', async (req, res) => {
    try {
        // This would typically require admin authentication in production
        const result = await pool.query(
            'SELECT id, first_name, last_name, full_name, email, student_id, created_at FROM students ORDER BY created_at DESC'
        );

        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching students:', error);
        res.status(500).json({ message: 'Server error while fetching students' });
    }
});
app.get('/api/admin/faculty', async (req, res) => {
    try {
        // This would typically require admin authentication in production
        const result = await pool.query(
            'SELECT id, username, full_name, department, email, faculty_id, created_at FROM faculty ORDER BY created_at DESC'
        );

        // For each faculty member, count how many assessments they've created
        // This is a placeholder - in a real app, you'd have a relationship between faculty and assessments
        const facultyWithAssessmentCount = await Promise.all(result.rows.map(async (faculty) => {
            // This is just a placeholder since we don't have a direct relationship in the schema
            // In a real app, you'd query based on the faculty ID that created each assessment
            return {
                ...faculty,
                assessment_count: Math.floor(Math.random() * 10) // Random placeholder value
            };
        }));

        res.json(facultyWithAssessmentCount);
    } catch (error) {
        console.error('Error fetching faculty:', error);
        res.status(500).json({ message: 'Server error while fetching faculty' });
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`API available at http://localhost:${PORT}/api`);
    console.log('Test your connection at: http://localhost:' + PORT + '/api/test');
});