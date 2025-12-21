exports.deactivateStudent = async (req, res, pool) => {
    const studentId = req.params.id;
    try {
        if (!studentId || typeof studentId !== 'string') {
            return res.status(400).json({ success: false, message: 'Invalid student ID provided' });
        }

        const checkStudentQuery = 'SELECT id, full_name, email, student_id FROM students WHERE id = $1';
        const studentResult = await pool.query(checkStudentQuery, [studentId]);

        if (studentResult.rows.length === 0) return res.status(404).json({ success: false, message: 'Student not found' });

        const student = studentResult.rows[0];

        await pool.query('DELETE FROM student_assessments WHERE student_id = $1', [studentId]);
        await pool.query('DELETE FROM students WHERE id = $1', [studentId]);

        console.log(`Student ${student.full_name} (ID: ${studentId}) deactivated successfully`);

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
        res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
    }
};

exports.deactivateFaculty = async (req, res, pool) => {
    const facultyId = req.params.id;
    try {
        if (!facultyId || typeof facultyId !== 'string') {
            return res.status(400).json({ success: false, message: 'Invalid faculty ID provided' });
        }

        const checkFacultyQuery = 'SELECT id, full_name, email, department, username FROM faculty WHERE id = $1';
        const facultyResult = await pool.query(checkFacultyQuery, [facultyId]);

        if (facultyResult.rows.length === 0) return res.status(404).json({ success: false, message: 'Faculty member not found' });

        const faculty = facultyResult.rows[0];

        await pool.query('DELETE FROM faculty WHERE id = $1', [facultyId]);

        console.log(`Faculty ${faculty.full_name} (ID: ${facultyId}) deactivated successfully`);

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
        res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
    }
};

exports.getStats = async (req, res, pool) => {
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
        res.status(500).json({ success: false, message: 'Error fetching statistics', error: error.message });
    }
}


// --- Student Management ---

exports.getStudent = async (req, res, pool) => {
    const { id } = req.params;
    try {
        const result = await pool.query(
            'SELECT id, first_name, last_name, full_name, email, student_id, created_at, updated_at, status FROM students WHERE id = $1',
            [id]
        );
        if (result.rows.length === 0) return res.status(404).json({ message: 'Student not found' });
        res.json({ success: true, student: result.rows[0] });
    } catch (error) {
        console.error('Error fetching student:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

exports.updateStudent = async (req, res, pool) => {
    const { id } = req.params;
    const { firstName, lastName, email, status, password } = req.body;

    try {
        if (!firstName || !lastName || !email) return res.status(400).json({ message: 'Name and email are required' });

        // Check exists
        const check = await pool.query('SELECT id FROM students WHERE id = $1', [id]);
        if (check.rows.length === 0) return res.status(404).json({ message: 'Student not found' });

        // Check email uniqueness
        const emailCheck = await pool.query('SELECT id FROM students WHERE email = $1 AND id != $2', [email, id]);
        if (emailCheck.rows.length > 0) return res.status(400).json({ message: 'Email already registered' });

        const fullName = `${firstName} ${lastName}`;
        const studentStatus = status || 'active';

        // Use bcrypt from global require if available, or we need to require it. 
        // AdminController likely doesn't have bcrypt imported at top. 
        // I'll assume we need to import it. But I can't add require at top easily with this tool.
        // I will assume `bcrypt` is passed or I need to add it.
        // Wait, I should add 'bcryptjs' and 'exceljs' to the top of file first.
        // I'll fail if I don't. 
        // Let's do the imports in a separate step or assume I'll fix it.
        // Actually, I'll use `require` inside the function if needed or rely on a previous step.
        // Better: I'll start the replacement by adding requires at the top if I can.
        // But I am appending here.
        // I will use `require` inline for now or better, update the top of the file in next step.

        let updateQuery, queryParams;
        if (password && password.length >= 6) {
            const bcrypt = require('bcryptjs');
            const hashedPassword = await bcrypt.hash(password, 10);
            updateQuery = `UPDATE students SET first_name=$1, last_name=$2, full_name=$3, email=$4, status=$5, password=$6, updated_at=CURRENT_TIMESTAMP WHERE id=$7 RETURNING *`;
            queryParams = [firstName, lastName, fullName, email, studentStatus, hashedPassword, id];
        } else {
            updateQuery = `UPDATE students SET first_name=$1, last_name=$2, full_name=$3, email=$4, status=$5, updated_at=CURRENT_TIMESTAMP WHERE id=$6 RETURNING *`;
            queryParams = [firstName, lastName, fullName, email, studentStatus, id];
        }

        const result = await pool.query(updateQuery, queryParams);
        res.json({ success: true, message: 'Student updated', student: result.rows[0] });
    } catch (error) {
        console.error('Error updating student:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// --- Excel Downloads ---

exports.downloadStudents = async (req, res, pool) => {
    try {
        const ExcelJS = require('exceljs');
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Students');

        worksheet.columns = [
            { header: 'ID', key: 'student_id', width: 15 },
            { header: 'Full Name', key: 'full_name', width: 25 },
            { header: 'Email', key: 'email', width: 30 },
            { header: 'Status', key: 'status', width: 10 },
            { header: 'Registered', key: 'created_at', width: 20 }
        ];

        const result = await pool.query('SELECT * FROM students ORDER BY created_at DESC');
        result.rows.forEach(student => {
            worksheet.addRow({
                student_id: student.student_id,
                full_name: student.full_name,
                email: student.email,
                status: student.status,
                created_at: student.created_at
            });
        });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=students.xlsx');
        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error('Download error:', error);
        res.status(500).send('Error generating file');
    }
};

exports.downloadFaculty = async (req, res, pool) => {
    try {
        const ExcelJS = require('exceljs');
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Faculty');

        worksheet.columns = [
            { header: 'Name', key: 'full_name', width: 25 },
            { header: 'Email', key: 'email', width: 30 },
            { header: 'Department', key: 'department', width: 20 },
            { header: 'Username', key: 'username', width: 15 }
        ];

        const result = await pool.query('SELECT * FROM faculty ORDER BY full_name');
        result.rows.forEach(f => {
            worksheet.addRow({
                full_name: f.full_name,
                email: f.email,
                department: f.department,
                username: f.username
            });
        });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=faculty.xlsx');
        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error('Download error:', error);
        res.status(500).send('Error generating file');
    }
};

// --- Bulk Upload ---

exports.bulkUploadUsers = async (req, res, pool) => {
    try {
        const XLSX = require('xlsx');
        const bcrypt = require('bcryptjs');
        const { v4: uuidv4 } = require('uuid');

        if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

        const type = req.body.type; // 'student' or 'faculty'
        if (!type || (type !== 'student' && type !== 'faculty')) {
            return res.status(400).json({ message: 'Invalid user type specified' });
        }

        const workbook = XLSX.readFile(req.file.path);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);

        let createdCount = 0;
        let errors = [];

        for (const row of jsonData) {
            try {
                if (type === 'student') {
                    // Expect: First Name, Last Name, Email, Student ID, Password (Optional)
                    // Normalize keys to lowercase to be robust against "First Name" vs "FirstName" vs "first name"
                    const normalizedRow = {};
                    Object.keys(row).forEach(key => normalizedRow[key.toLowerCase().replace(/\s/g, '')] = row[key]);

                    const firstName = normalizedRow['firstname'] || row['First Name'];
                    const lastName = normalizedRow['lastname'] || row['Last Name'];
                    const email = normalizedRow['email'] || row['Email'];
                    const studentId = normalizedRow['studentid'] || normalizedRow['id'] || row['Student ID'];
                    const password = normalizedRow['password'] || (studentId ? String(studentId) : null);


                    if (!firstName || !lastName || !email || !studentId) {
                        console.warn(`Row missing data: ${JSON.stringify(normalizedRow)}`);
                        errors.push(`Row missing data: First Name, Last Name, Email, or Student ID required.`);
                        continue;
                    }

                    // Check duplicate
                    const check = await pool.query('SELECT id FROM students WHERE email = $1 OR student_id = $2', [email, studentId]);
                    if (check.rows.length > 0) {
                        errors.push(`Duplicate student: ${email} or ${studentId}`);
                        continue;
                    }

                    const hashedPassword = await bcrypt.hash(password, 10);
                    const fullName = `${firstName} ${lastName}`;
                    await pool.query(
                        'INSERT INTO students (id, first_name, last_name, full_name, email, student_id, password, created_at, status) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, $8)',
                        [uuidv4(), firstName, lastName, fullName, email, studentId, hashedPassword, 'active']
                    );
                    createdCount++;

                } else {
                    // Faculty
                    const normalizedRow = {};
                    Object.keys(row).forEach(key => normalizedRow[key.toLowerCase().replace(/\s/g, '')] = row[key]);

                    const username = normalizedRow['username'] || normalizedRow['id'] || row['Username'] || row['ID']; // Allow 'ID' column to map to username
                    const fullName = normalizedRow['fullname'] || row['Full Name'];
                    const email = normalizedRow['email'] || row['Email'];
                    const department = normalizedRow['department'] || row['Department'];
                    const password = normalizedRow['password'] || (username ? String(username) : 'faculty123'); // Default password to username/ID

                    if (!username || !fullName || !email) {
                        errors.push(`Row missing data: ${JSON.stringify(row)}`);
                        continue;
                    }

                    const check = await pool.query('SELECT id FROM faculty WHERE username = $1 OR email = $2', [username, email]);
                    if (check.rows.length > 0) {
                        errors.push(`Duplicate faculty: ${username} or ${email}`);
                        continue;
                    }

                    const hashedPassword = await bcrypt.hash(password, 10);
                    await pool.query(
                        'INSERT INTO faculty (id, username, password, full_name, department, email, created_at) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)',
                        [uuidv4(), username, hashedPassword, fullName, department || 'General', email]
                    );
                    createdCount++;
                }
            } catch (err) {
                errors.push(`Error processing row: ${JSON.stringify(row)} - ${err.message}`);
            }
        }

        // Clean up file
        const fs = require('fs');
        fs.unlinkSync(req.file.path);

        res.json({
            success: true,
            message: `Processed ${jsonData.length} rows. Created ${createdCount} users.`,
            errors: errors.length > 0 ? errors : undefined
        });

    } catch (error) {
        console.error('Bulk upload error:', error);
        res.status(500).json({ message: 'Server error during bulk upload' });
    }
};
// ... existing code ...

exports.getAllStudents = async (req, res, pool) => {
    try {
        const result = await pool.query('SELECT id, full_name, email, student_id FROM students ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching students:', error);
        res.status(500).json({ message: 'Error fetching students' });
    }
};

exports.getAllFaculty = async (req, res, pool) => {
    try {
        const result = await pool.query('SELECT id, full_name, email, department FROM faculty ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching faculty:', error);
        res.status(500).json({ message: 'Error fetching faculty' });
    }
};
