const bcrypt = require('bcryptjs');

exports.getFacultyById = async (req, res, pool) => {
    try {
        const { id } = req.params;
        if (!id) return res.status(400).json({ message: 'Faculty ID is required' });

        const result = await pool.query(
            'SELECT id, username, full_name, email, faculty_id, department, created_at FROM faculty WHERE id = $1',
            [id]
        );

        if (result.rows.length === 0) return res.status(404).json({ message: 'Faculty not found' });

        const faculty = result.rows[0];
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
        res.status(500).json({ message: 'Server error while fetching faculty', error: error.message });
    }
};

exports.updateFaculty = async (req, res, pool) => {
    try {
        const { id } = req.params;
        const { username, fullName, email, department, password } = req.body;

        if (!username || !fullName || !department) {
            return res.status(400).json({ message: 'Username, full name, and department are required' });
        }

        const existingFaculty = await pool.query('SELECT * FROM faculty WHERE id = $1', [id]);
        if (existingFaculty.rows.length === 0) return res.status(404).json({ message: 'Faculty not found' });

        const usernameCheck = await pool.query('SELECT * FROM faculty WHERE username = $1 AND id != $2', [username, id]);
        if (usernameCheck.rows.length > 0) return res.status(400).json({ message: 'Username already exists' });

        if (email) {
            const emailCheck = await pool.query('SELECT * FROM faculty WHERE email = $1 AND id != $2', [email, id]);
            if (emailCheck.rows.length > 0) return res.status(400).json({ message: 'Email already registered' });
        }

        let updateQuery, queryParams;
        if (password) {
            if (password.length < 6) return res.status(400).json({ message: 'Password must be at least 6 characters long' });
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

        const result = await pool.query(updateQuery, queryParams);
        const updatedFaculty = result.rows[0];

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
        res.status(500).json({ success: false, message: 'Server error during update', error: error.message });
    }
};

exports.getAllFaculty = async (req, res, pool) => {
    try {
        const result = await pool.query(
            'SELECT id, username, full_name, email, faculty_id, department, created_at FROM faculty ORDER BY created_at DESC'
        );
        const facultyList = result.rows.map(faculty => ({
            id: faculty.id,
            username: faculty.username,
            fullName: faculty.full_name,
            email: faculty.email,
            facultyId: faculty.faculty_id,
            department: faculty.department,
            createdAt: faculty.created_at
        }));

        res.status(200).json({ success: true, faculty: facultyList, count: facultyList.length });

    } catch (error) {
        console.error('Error fetching faculty list:', error);
        res.status(500).json({ success: false, message: 'Server error while fetching faculty list', error: error.message });
    }
};

exports.deleteFaculty = async (req, res, pool) => {
    try {
        const { id } = req.params;
        const existingFaculty = await pool.query('SELECT * FROM faculty WHERE id = $1', [id]);
        if (existingFaculty.rows.length === 0) return res.status(404).json({ message: 'Faculty not found' });

        await pool.query('DELETE FROM faculty WHERE id = $1', [id]);
        res.status(200).json({ success: true, message: 'Faculty deleted successfully' });
    } catch (error) {
        console.error('Error deleting faculty:', error);
        res.status(500).json({ success: false, message: 'Server error during deletion', error: error.message });
    }
};

exports.getDashboardStats = async (req, res, pool) => {
    try {
        const { facultyId } = req.query; // Expect facultyId for filtering

        let totalAssessmentsQuery = 'SELECT COUNT(*) FROM assessments';
        let avgScoreQuery = 'SELECT AVG(score) as average_score FROM student_assessments sa JOIN assessments a ON sa.assessment_id = a.id WHERE completed = true AND score IS NOT NULL';
        let recentActivityQuery = `
            SELECT sa.end_time as timestamp, s.full_name, a.title, sa.score 
            FROM student_assessments sa 
            JOIN students s ON sa.student_id = s.id 
            JOIN assessments a ON sa.assessment_id = a.id 
            WHERE sa.completed = true 
        `;
        let queryParams = [];

        if (facultyId) {
            totalAssessmentsQuery += ' WHERE created_by = $1';
            avgScoreQuery += ' AND a.created_by = $1';
            recentActivityQuery += ' AND a.created_by = $1';
            queryParams.push(facultyId);
        }

        recentActivityQuery += ' ORDER BY sa.end_time DESC LIMIT 5';

        const totalAssessments = await pool.query(totalAssessmentsQuery, queryParams);
        const avgScore = await pool.query(avgScoreQuery, queryParams);
        const recentActivity = await pool.query(recentActivityQuery, queryParams);

        // For total students, arguably we should count students who took THIS faculty's tests? 
        // Or just all students? Usually "My Students" implies those who took my tests.
        let totalStudentsQuery = 'SELECT COUNT(*) FROM students';
        // Refined: Count students who have taken at least one assessment created by this faculty
        if (facultyId) {
            totalStudentsQuery = `
                SELECT COUNT(DISTINCT sa.student_id) 
                FROM student_assessments sa 
                JOIN assessments a ON sa.assessment_id = a.id 
                WHERE a.created_by = $1
            `;
            // Re-use queryParams ($1 is facultyId)
        }
        const totalStudents = await pool.query(totalStudentsQuery, facultyId ? queryParams : []);

        res.json({
            totalAssessments: parseInt(totalAssessments.rows[0].count),
            totalStudents: parseInt(totalStudents.rows[0].count),
            averageScore: parseFloat(avgScore.rows[0].average_score || 0).toFixed(1),
            recentActivity: recentActivity.rows.map(row => ({
                description: `${row.full_name} completed ${row.title} - Score: ${row.score}%`,
                timestamp: row.timestamp
            }))
        });
    } catch (error) {
        console.error('Error fetching dashboard stats:', error);
        res.status(500).json({ message: 'Server error while fetching stats' });
    }
};

exports.getFacultyResults = async (req, res, pool) => {
    try {
        const { facultyId } = req.query;
        // Start with base query that joins relevant tables
        let query = `
            SELECT sa.id, s.full_name as student_name, s.email, a.title as assessment_title, sa.score, sa.end_time as submitted_at
            FROM student_assessments sa
            JOIN students s ON sa.student_id = s.id
            JOIN assessments a ON sa.assessment_id = a.id
            WHERE sa.completed = true
        `;
        let queryParams = [];

        // Append filter if facultyId is provided
        if (facultyId) {
            query += ' AND a.created_by = $1';
            queryParams.push(facultyId);
        }

        query += ' ORDER BY sa.end_time DESC';


        const result = await pool.query(query, queryParams);
        res.json({ success: true, results: result.rows });
    } catch (error) {
        console.error('Error fetching faculty results:', error);
        res.status(500).json({ success: false, message: 'Server error fetching results', results: [] });
    }
};

exports.getDashboardAssessmentSummary = async (req, res, pool) => {
    try {
        const { facultyId } = req.query;
        let query = `
            SELECT a.id, a.title, a.code, COUNT(sa.id) as attempt_count
            FROM assessments a
            LEFT JOIN student_assessments sa ON a.id = sa.assessment_id AND sa.completed = true
            `;
        const params = [];

        if (facultyId) {
            query += ' WHERE a.created_by = $1';
            params.push(facultyId);
        }

        query += ' GROUP BY a.id, a.title, a.code ORDER BY attempt_count DESC';


        const result = await pool.query(query, params);
        res.json({ success: true, assessments: result.rows });
    } catch (error) {
        console.error('Error fetching assessment summary:', error);
        res.status(500).json({ success: false, message: 'Server error', assessments: [] });
    }
};

exports.getFacultyStudents = async (req, res, pool) => {
    try {
        const { facultyId } = req.query;
        let query = `
            SELECT DISTINCT s.id, s.full_name, s.email,
            (SELECT COUNT(*) FROM student_assessments sa2 WHERE sa2.student_id = s.id) as assessments_taken_count
            FROM students s
            JOIN student_assessments sa ON s.id = sa.student_id
            JOIN assessments a ON sa.assessment_id = a.id
            WHERE a.created_by = $1
        `;
        if (!facultyId) return res.json({ success: true, students: [] });

        const result = await pool.query(query, [facultyId]);
        res.json({
            success: true, students: result.rows.map(row => ({
                id: row.id,
                fullName: row.full_name,
                email: row.email,
                assessmentsTakenCount: row.assessments_taken_count
            }))
        });
    } catch (error) {
        console.error('Error fetching faculty students:', error);
        res.status(500).json({ success: false, message: 'Server error', students: [] });
    }
};

exports.getStudentReportForFaculty = async (req, res, pool) => {
    try {
        const { studentId } = req.params;
        const { facultyId } = req.query;

        if (!studentId || !facultyId) return res.status(400).json({ success: false, message: 'Missing parameters' });

        const query = `
            SELECT a.title, sa.score, a.total_questions, sa.end_time as date_taken
            FROM student_assessments sa
            JOIN assessments a ON sa.assessment_id = a.id
            WHERE sa.student_id = $1 AND a.created_by = $2 AND sa.completed = true
            ORDER BY sa.end_time DESC
        `;

        const result = await pool.query(query, [studentId, facultyId]);
        res.json({
            success: true,
            report: result.rows.map(row => ({
                assessmentTitle: row.title,
                score: row.score,
                totalQuestions: row.total_questions,
                dateTaken: row.date_taken
            }))
        });
    } catch (error) {
        console.error('Error fetching student report:', error);
        res.status(500).json({ success: false, message: 'Server error', report: [] });
    }
};
