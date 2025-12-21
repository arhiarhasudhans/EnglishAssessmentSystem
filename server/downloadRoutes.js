// downloadRoutes.js - Complete backend file for Excel download functionality

const express = require('express');
const router = express.Router();
const ExcelJS = require('exceljs');
const mysql = require('mysql2/promise');

// Database configuration - Update with your database credentials
const dbConfig = {
    host: 'localhost',
    user: 'your_db_user',
    password: 'your_db_password',
    database: 'your_database_name',
    charset: 'utf8mb4'
};

// Create database connection pool
const pool = mysql.createPool({
    ...dbConfig,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Middleware to verify admin authentication
const verifyAdminAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ 
                success: false, 
                message: 'No token provided' 
            });
        }

        const token = authHeader.substring(7);
        
        // Here you would typically verify the JWT token
        // For now, we'll assume token verification is handled elsewhere
        // You should implement proper JWT verification based on your auth system
        
        req.adminId = 'admin'; // This should come from your JWT verification
        next();
    } catch (error) {
        console.error('Auth verification error:', error);
        return res.status(401).json({ 
            success: false, 
            message: 'Invalid token' 
        });
    }
};

// Route to download faculty details as Excel
router.get('/download/faculty', verifyAdminAuth, async (req, res) => {
    let connection;
    
    try {
        // Get database connection
        connection = await pool.getConnection();
        
        // Query to fetch faculty data
        const [facultyRows] = await connection.execute(`
            SELECT 
                id,
                full_name,
                email,
                department,
                phone,
                employee_id,
                DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') as registration_date,
                status
            FROM faculty 
            ORDER BY full_name ASC
        `);

        // Create Excel workbook
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Faculty Details');

        // Set worksheet properties
        worksheet.properties.defaultRowHeight = 20;

        // Define columns
        worksheet.columns = [
            { header: 'ID', key: 'id', width: 10 },
            { header: 'Full Name', key: 'full_name', width: 25 },
            { header: 'Email', key: 'email', width: 30 },
            { header: 'Department', key: 'department', width: 20 },
            { header: 'Phone', key: 'phone', width: 15 },
            { header: 'Employee ID', key: 'employee_id', width: 15 },
            { header: 'Registration Date', key: 'registration_date', width: 20 },
            { header: 'Status', key: 'status', width: 12 }
        ];

        // Style the header row
        const headerRow = worksheet.getRow(1);
        headerRow.font = { bold: true, color: { argb: 'FFFFFF' } };
        headerRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: '274482' }
        };
        headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
        headerRow.height = 25;

        // Add data rows
        facultyRows.forEach((faculty, index) => {
            const row = worksheet.addRow({
                id: faculty.id,
                full_name: faculty.full_name,
                email: faculty.email,
                department: faculty.department,
                phone: faculty.phone || 'N/A',
                employee_id: faculty.employee_id || 'N/A',
                registration_date: faculty.registration_date,
                status: faculty.status || 'Active'
            });

            // Alternate row coloring
            if (index % 2 === 1) {
                row.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'F8F9FA' }
                };
            }
        });

        // Add borders to all cells
        worksheet.eachRow((row, rowNumber) => {
            row.eachCell((cell) => {
                cell.border = {
                    top: { style: 'thin' },
                    left: { style: 'thin' },
                    bottom: { style: 'thin' },
                    right: { style: 'thin' }
                };
            });
        });

        // Add summary information
        const summaryRow = worksheet.addRow([]);
        summaryRow.getCell(1).value = `Total Faculty: ${facultyRows.length}`;
        summaryRow.getCell(1).font = { bold: true };
        summaryRow.getCell(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'E3F2FD' }
        };

        // Set response headers for Excel download
        res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        res.setHeader(
            'Content-Disposition',
            `attachment; filename="faculty_details_${new Date().toISOString().split('T')[0]}.xlsx"`
        );

        // Write workbook to response
        await workbook.xlsx.write(res);
        res.end();

        console.log(`Faculty Excel export completed: ${facultyRows.length} records`);

    } catch (error) {
        console.error('Error generating faculty Excel:', error);
        
        if (!res.headersSent) {
            res.status(500).json({
                success: false,
                message: 'Error generating Excel file',
                error: error.message
            });
        }
    } finally {
        if (connection) {
            connection.release();
        }
    }
});

// Route to download student details as Excel
router.get('/download/students', verifyAdminAuth, async (req, res) => {
    let connection;
    
    try {
        // Get database connection
        connection = await pool.getConnection();
        
        // Query to fetch student data
        const [studentRows] = await connection.execute(`
            SELECT 
                id,
                full_name,
                email,
                student_id,
                phone,
                course,
                year_of_study,
                DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') as registration_date,
                status
            FROM students 
            ORDER BY full_name ASC
        `);

        // Create Excel workbook
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Student Details');

        // Set worksheet properties
        worksheet.properties.defaultRowHeight = 20;

        // Define columns
        worksheet.columns = [
            { header: 'ID', key: 'id', width: 10 },
            { header: 'Full Name', key: 'full_name', width: 25 },
            { header: 'Email', key: 'email', width: 30 },
            { header: 'Student ID', key: 'student_id', width: 15 },
            { header: 'Phone', key: 'phone', width: 15 },
            { header: 'Course', key: 'course', width: 20 },
            { header: 'Year of Study', key: 'year_of_study', width: 15 },
            { header: 'Registration Date', key: 'registration_date', width: 20 },
            { header: 'Status', key: 'status', width: 12 }
        ];

        // Style the header row
        const headerRow = worksheet.getRow(1);
        headerRow.font = { bold: true, color: { argb: 'FFFFFF' } };
        headerRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: '274482' }
        };
        headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
        headerRow.height = 25;

        // Add data rows
        studentRows.forEach((student, index) => {
            const row = worksheet.addRow({
                id: student.id,
                full_name: student.full_name,
                email: student.email,
                student_id: student.student_id,
                phone: student.phone || 'N/A',
                course: student.course || 'N/A',
                year_of_study: student.year_of_study || 'N/A',
                registration_date: student.registration_date,
                status: student.status || 'Active'
            });

            // Alternate row coloring
            if (index % 2 === 1) {
                row.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'F8F9FA' }
                };
            }
        });

        // Add borders to all cells
        worksheet.eachRow((row, rowNumber) => {
            row.eachCell((cell) => {
                cell.border = {
                    top: { style: 'thin' },
                    left: { style: 'thin' },
                    bottom: { style: 'thin' },
                    right: { style: 'thin' }
                };
            });
        });

        // Add summary information
        const summaryRow = worksheet.addRow([]);
        summaryRow.getCell(1).value = `Total Students: ${studentRows.length}`;
        summaryRow.getCell(1).font = { bold: true };
        summaryRow.getCell(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'E3F2FD' }
        };

        // Set response headers for Excel download
        res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        res.setHeader(
            'Content-Disposition',
            `attachment; filename="student_details_${new Date().toISOString().split('T')[0]}.xlsx"`
        );

        // Write workbook to response
        await workbook.xlsx.write(res);
        res.end();

        console.log(`Student Excel export completed: ${studentRows.length} records`);

    } catch (error) {
        console.error('Error generating student Excel:', error);
        
        if (!res.headersSent) {
            res.status(500).json({
                success: false,
                message: 'Error generating Excel file',
                error: error.message
            });
        }
    } finally {
        if (connection) {
            connection.release();
        }
    }
});

// Health check route
router.get('/health', (req, res) => {
    res.json({ 
        success: true, 
        message: 'Download service is running',
        timestamp: new Date().toISOString()
    });
});

module.exports = router;

