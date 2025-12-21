const express = require('express');
const router = express.Router();

// Deactivate routes factory function that accepts the database pool
function createDeactivateRoutes(pool) {
    
    // Route to deactivate a student by removing from Neon database
    router.put('/students/:id/deactivate', async (req, res) => {
        const studentId = req.params.id;
        
        try {
            // Validate student ID (UUID format)
            if (!studentId || typeof studentId !== 'string') {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid student ID provided'
                });
            }

            // Check if student exists before deletion
            const checkStudentQuery = 'SELECT id, full_name, email, student_id FROM students WHERE id = $1';
            const studentResult = await pool.query(checkStudentQuery, [studentId]);
            
            if (studentResult.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Student not found'
                });
            }

            const student = studentResult.rows[0];

            // First, delete any related student_assessments records
            await pool.query('DELETE FROM student_assessments WHERE student_id = $1', [studentId]);

            // Then delete the student record from database
            const deleteQuery = 'DELETE FROM students WHERE id = $1';
            await pool.query(deleteQuery, [studentId]);

            console.log(`Student ${student.full_name} (ID: ${studentId}) deactivated successfully`);

            // Return success response
            res.json({
                success: true,
                message: 'Student deactivated (removed) successfully',
                data: {
                    student_id: studentId,
                    student_name: student.full_name,
                    student_email: student.email,
                    student_number: student.student_id,
                    removed_at: new Date().toISOString()
                }
            });

        } catch (error) {
            console.error('Error deactivating student:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error occurred while deactivating student',
                error: error.message
            });
        }
    });

    // Route to deactivate a faculty member by removing from Neon database
    router.put('/faculty/:id/deactivate', async (req, res) => {
        const facultyId = req.params.id;
        
        try {
            // Validate faculty ID (UUID format)
            if (!facultyId || typeof facultyId !== 'string') {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid faculty ID provided'
                });
            }

            // Check if faculty exists before deletion
            const checkFacultyQuery = 'SELECT id, full_name, email, department, username FROM faculty WHERE id = $1';
            const facultyResult = await pool.query(checkFacultyQuery, [facultyId]);
            
            if (facultyResult.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Faculty member not found'
                });
            }

            const faculty = facultyResult.rows[0];

            // Delete the faculty record from database
            const deleteQuery = 'DELETE FROM faculty WHERE id = $1';
            await pool.query(deleteQuery, [facultyId]);

            console.log(`Faculty ${faculty.full_name} (ID: ${facultyId}) deactivated successfully`);

            // Return success response
            res.json({
                success: true,
                message: 'Faculty member deactivated (removed) successfully',
                data: {
                    faculty_id: facultyId,
                    faculty_name: faculty.full_name,
                    faculty_email: faculty.email,
                    faculty_username: faculty.username,
                    department: faculty.department,
                    removed_at: new Date().toISOString()
                }
            });

        } catch (error) {
            console.error('Error deactivating faculty:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error occurred while deactivating faculty',
                error: error.message
            });
        }
    });

    // Route to get deactivation statistics (optional)
    router.get('/stats', async (req, res) => {
        try {
            const studentCount = await pool.query('SELECT COUNT(*) as count FROM students');
            const facultyCount = await pool.query('SELECT COUNT(*) as count FROM faculty');
            const assessmentCount = await pool.query('SELECT COUNT(*) as count FROM assessments');
            
            res.json({
                success: true,
                stats: {
                    active_students: parseInt(studentCount.rows[0].count),
                    active_faculty: parseInt(facultyCount.rows[0].count),
                    total_assessments: parseInt(assessmentCount.rows[0].count)
                }
            });
        } catch (error) {
            console.error('Error fetching deactivation stats:', error);
            res.status(500).json({
                success: false,
                message: 'Error fetching statistics',
                error: error.message
            });
        }
    });

    return router;
}

module.exports = createDeactivateRoutes;