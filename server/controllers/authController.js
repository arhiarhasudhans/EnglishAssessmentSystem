const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const { spawn } = require('child_process');

const emailService = require('../services/emailService');

/* 
  Replaced Python spawn with Node.js Email Service
*/

exports.registerStudent = async (req, res, pool) => {
    try {
        console.log('Processing student registration request...', req.body);
        const { firstName, lastName, email, studentId, password } = req.body;

        if (!firstName || !lastName || !email || !studentId || !password) {
            return res.status(400).json({ message: 'All fields are required' });
        }

        const existingStudentResult = await pool.query('SELECT * FROM students WHERE student_id = $1', [studentId]);
        if (existingStudentResult.rows.length > 0) return res.status(400).json({ message: 'Student ID already exists' });

        const existingEmailResult = await pool.query('SELECT * FROM students WHERE email = $1', [email]);
        if (existingEmailResult.rows.length > 0) return res.status(400).json({ message: 'Email already registered' });

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newStudentId = uuidv4();
        const fullName = `${firstName} ${lastName}`;

        const result = await pool.query(
            'INSERT INTO students (id, first_name, last_name, full_name, email, student_id, password, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP) RETURNING *',
            [newStudentId, firstName, lastName, fullName, email, studentId, hashedPassword]
        );

        const newStudent = result.rows[0];
        console.log('Student created successfully:', newStudent);

        // Use Node.js Email Service
        const emailResponse = await emailService.sendWelcomeEmail(email, fullName, 'Student');

        res.status(201).json({
            success: true,
            message: emailResponse.success ? 'Student registered successfully and welcome email sent' : 'Student registered successfully, but welcome email failed to send',
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

    } catch (error) {
        console.error('Student registration error:', error);
        res.status(500).json({ success: false, message: 'Server error during registration', error: error.message });
    }
};

exports.loginStudent = async (req, res, pool) => {
    try {
        const { studentId, password, assessmentCode } = req.body;

        if (!studentId || !password) {
            return res.status(400).json({ message: 'Student ID and Password are required' });
        }

        const studentResult = await pool.query('SELECT * FROM students WHERE student_id = $1', [studentId]);
        if (studentResult.rows.length === 0) return res.status(401).json({ message: 'Invalid credentials' });

        const student = studentResult.rows[0];
        const isPasswordValid = await bcrypt.compare(password, student.password);
        if (!isPasswordValid) return res.status(401).json({ message: 'Invalid credentials' });

        // Optional Assessment Code Validation
        let assessmentData = null;
        if (assessmentCode) {
            const assessmentResult = await pool.query('SELECT * FROM assessments WHERE code = $1', [assessmentCode]);
            if (assessmentResult.rows.length === 0) return res.status(404).json({ message: 'Assessment not found' });

            const assessment = assessmentResult.rows[0];

            // Check existing attempt logic if code provided
            const existingAttemptResult = await pool.query(
                'SELECT * FROM student_assessments WHERE student_id = $1 AND assessment_id = $2 AND completed = true',
                [student.id, assessment.id]
            );
            if (existingAttemptResult.rows.length > 0) return res.status(400).json({ message: 'You have already completed this assessment' });

            // Create attempt if not exists
            const studentAssessmentResult = await pool.query(
                'SELECT * FROM student_assessments WHERE student_id = $1 AND assessment_id = $2 AND completed = false',
                [student.id, assessment.id]
            );
            if (studentAssessmentResult.rows.length === 0) {
                await pool.query(
                    'INSERT INTO student_assessments (id, student_id, assessment_id, start_time, completed) VALUES ($1, $2, $3, CURRENT_TIMESTAMP, false)',
                    [uuidv4(), student.id, assessment.id]
                );
            }

            assessmentData = {
                id: assessment.id,
                title: assessment.title,
                duration: assessment.duration,
                totalQuestions: (assessment.questions_to_attempt > 0 && assessment.questions_to_attempt < assessment.total_questions)
                    ? assessment.questions_to_attempt
                    : assessment.total_questions,
                passScore: assessment.pass_score,
                level: assessment.level
            };
        }

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
};

exports.registerFaculty = async (req, res, pool) => {
    try {
        console.log('Processing faculty registration request...', req.body);
        const { username, fullName, email, facultyId, department, password } = req.body;

        if (!username || !fullName || !department || !password) {
            return res.status(400).json({ message: 'All fields are required' });
        }

        // Logic to add columns dynamically is omitted here for brevity/performance; 
        // assumed to be handled by `server.js` startup or migration scripts ideally.
        // But for parity with original `server.js` logic which did inline checks, 
        // we'll assume the DB is ready or rely on the `server.js` initialization that runs at startup.

        const existingUsernameResult = await pool.query('SELECT * FROM faculty WHERE username = $1', [username]);
        if (existingUsernameResult.rows.length > 0) return res.status(400).json({ message: 'Username already exists' });

        if (email) {
            const existingEmailResult = await pool.query('SELECT * FROM faculty WHERE email = $1', [email]);
            if (existingEmailResult.rows.length > 0) return res.status(400).json({ message: 'Email already registered' });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        const newFacultyId = uuidv4();

        let insertQuery, queryParams;
        if (email && facultyId) {
            insertQuery = 'INSERT INTO faculty (id, username, password, full_name, department, email, faculty_id, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP) RETURNING *';
            queryParams = [newFacultyId, username, hashedPassword, fullName, department, email, facultyId];
        } else if (email) {
            insertQuery = 'INSERT INTO faculty (id, username, password, full_name, department, email, created_at) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP) RETURNING *';
            queryParams = [newFacultyId, username, hashedPassword, fullName, department, email];
        } else {
            insertQuery = 'INSERT INTO faculty (id, username, password, full_name, department, created_at) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP) RETURNING *';
            queryParams = [newFacultyId, username, hashedPassword, fullName, department];
        }

        const result = await pool.query(insertQuery, queryParams);
        const newFaculty = result.rows[0];
        console.log('Faculty created successfully:', newFaculty);

        let emailMsg = 'Faculty registered successfully';
        if (email) {
            const emailResponse = await emailService.sendWelcomeEmail(email, fullName, 'Faculty Member');
            emailMsg = emailResponse.success ? 'Faculty registered successfully and welcome email sent' : 'Faculty registered successfully, but welcome email failed to send';
        }

        res.status(201).json({
            success: true,
            message: emailMsg,
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

    } catch (error) {
        console.error('Faculty registration error:', error);
        res.status(500).json({ success: false, message: 'Server error during registration', error: error.message });
    }
};

exports.loginFaculty = async (req, res, pool) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ message: 'All fields are required' });

        const facultyResult = await pool.query('SELECT * FROM faculty WHERE username = $1', [username]);
        if (facultyResult.rows.length === 0) return res.status(401).json({ message: 'Invalid credentials' });

        const facultyMember = facultyResult.rows[0];
        const isPasswordValid = await bcrypt.compare(password, facultyMember.password);
        if (!isPasswordValid) return res.status(401).json({ message: 'Invalid credentials' });

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
};

exports.logoutFaculty = (req, res) => {
    console.log('Faculty logout request received.');
    res.status(200).json({ success: true, message: 'Logout successful.' });
};
