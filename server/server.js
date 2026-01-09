// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const { Pool } = require('pg');
const fs = require('fs');
const bcrypt = require('bcryptjs'); // Needed for init seed
const { v4: uuidv4 } = require('uuid'); // Needed for init seed



// Import New Routes
const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes'); // Missing import
const studentRoutes = require('./routes/studentRoutes');
const facultyRoutes = require('./routes/facultyRoutes');
const assessmentRoutes = require('./routes/assessmentRoutes');
const questionRoutes = require('./routes/questionRoutes');
const testRoutes = require('./routes/testRoutes');


const app = express();
const PORT = process.env.PORT || 3000;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_4qtzMEKy2Brs@ep-divine-heart-adxr20ud-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require',
    ssl: { rejectUnauthorized: false }
});

pool.query('SELECT NOW()', (err, res) => {
    if (err) console.error('Error connecting to Neon database:', err);
    else console.log('Connected to Neon database at:', res.rows[0].now);
});

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '../public')));

// Ensure directories exist
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
const templatesDir = path.join(__dirname, '../templates');
if (!fs.existsSync(templatesDir)) fs.mkdirSync(templatesDir, { recursive: true });

// --- Database Initialization (Preserved from original to ensure consistency) ---
async function initializeDatabase() {
    try {
        await pool.query(`CREATE TABLE IF NOT EXISTS faculty (id UUID PRIMARY KEY, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL, full_name TEXT NOT NULL, department TEXT, email TEXT UNIQUE, faculty_id TEXT UNIQUE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
        await pool.query(`CREATE TABLE IF NOT EXISTS students (id UUID PRIMARY KEY, first_name TEXT NOT NULL, last_name TEXT NOT NULL, full_name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, student_id TEXT UNIQUE NOT NULL, password TEXT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
        await pool.query(`CREATE TABLE IF NOT EXISTS assessments (id UUID PRIMARY KEY, code TEXT UNIQUE NOT NULL, title TEXT NOT NULL, description TEXT, duration INTEGER NOT NULL, total_questions INTEGER NOT NULL, questions JSONB NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
        await pool.query(`ALTER TABLE assessments ADD COLUMN IF NOT EXISTS level TEXT`);
        await pool.query(`ALTER TABLE assessments ADD COLUMN IF NOT EXISTS pass_score INTEGER`);
        await pool.query(`ALTER TABLE assessments ADD COLUMN IF NOT EXISTS questions_to_attempt INTEGER`);
        await pool.query(`CREATE TABLE IF NOT EXISTS student_assessments (id UUID PRIMARY KEY, student_id UUID REFERENCES students(id), assessment_id UUID REFERENCES assessments(id), start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP, end_time TIMESTAMP, completed BOOLEAN DEFAULT FALSE, answers JSONB, score DECIMAL(5,2), time_spent INTEGER, asked_questions JSONB, UNIQUE(student_id, assessment_id))`);

        // Add created_by column for faculty data filtering
        await pool.query(`ALTER TABLE assessments ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES faculty(id) ON DELETE SET NULL`);

        await pool.query(`ALTER TABLE students ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active'`);
        await pool.query(`ALTER TABLE students ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);
        await pool.query(`ALTER TABLE faculty ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);
        await pool.query(`ALTER TABLE faculty ADD COLUMN IF NOT EXISTS email TEXT UNIQUE`);
        await pool.query(`ALTER TABLE faculty ADD COLUMN IF NOT EXISTS faculty_id TEXT UNIQUE`);

        // Seed default faculty
        const facultyResult = await pool.query('SELECT * FROM faculty LIMIT 1');
        if (facultyResult.rows.length === 0) {
            const hashedPassword = await bcrypt.hash('guru', 10);
            await pool.query('INSERT INTO faculty (id, username, password, full_name, department) VALUES ($1, $2, $3, $4, $5)', [uuidv4(), 'faculty', hashedPassword, 'Prof. Jane Smith', 'English Department']);
            console.log('Created default faculty user');
        }
        console.log('Database initialized successfully');
    } catch (error) {
        console.error('Error initializing database:', error);
    }
}
initializeDatabase();

// --- Routes Setup ---
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// Use New Routes
app.use('/api', authRoutes(pool)); // /api/student/login, etc.
app.use('/api', adminRoutes(pool)); // /api/admin/stats, /api/admin/faculty, etc.
app.use('/api', studentRoutes(pool)); // /api/admin/student, /api/results/save
app.use('/api', facultyRoutes(pool)); // /api/faculty
app.use('/api', assessmentRoutes(pool)); // /api/assessment
app.use('/api/questions', questionRoutes(pool)); // /api/questions/upload
app.use('/api', testRoutes(pool));

// Legacy/Admin Deactivate Routes - Refactored to adminRoutes

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});