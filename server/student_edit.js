// Get Student by ID Endpoint (Admin version)
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

// Update Student Endpoint (Admin version)
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

// Add status column to students table if it doesn't exist
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

// Add updated_at column to students table if it doesn't exist
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

// Call these functions when your server starts
ensureStudentStatusColumn();
ensureStudentUpdatedAtColumn();