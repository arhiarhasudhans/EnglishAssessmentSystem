const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');

const multer = require('multer');
const path = require('path');
const fs = require('fs');

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join(__dirname, '..', '..', 'uploads');
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        cb(null, 'bulk-' + Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    fileFilter: (req, file, cb) => {
        if (file.mimetype.includes('sheet') || file.mimetype.includes('excel')) cb(null, true);
        else cb(new Error('Only Excel files are allowed'), false);
    }
});

module.exports = (pool) => {
    // Admin / Deactivate Routes
    // Maps to existing API usage e.g. /api/students/:id/deactivate (or /api/admin/...)
    // Original `deactivate.js` mounted at /api and /api/admin/deactivate in server.js, 
    // creating routes like /api/students/:id/deactivate OR /api/admin/deactivate/students/:id/deactivate
    // Let's standardise to /api/admin/... or keep flat if client expects it. 
    // `server.js` used: app.use('/api', createDeactivateRoutes(pool));
    // So the route was /api/students/:id/deactivate.

    router.put('/students/:id/deactivate', (req, res) => adminController.deactivateStudent(req, res, pool));
    router.put('/faculty/:id/deactivate', (req, res) => adminController.deactivateFaculty(req, res, pool));
    router.get('/admin/stats', (req, res) => adminController.getStats(req, res, pool)); // Was /stats mapped under /api/admin/deactivate likely? No, usually directly under /api.

    // Check original server.js mapping:
    // app.use('/api', createDeactivateRoutes(pool)); 
    // -> /api/stats
    // -> /api/students/:id/deactivate

    // So we keep these relative paths.
    router.get('/stats', (req, res) => adminController.getStats(req, res, pool));

    // Student Management (Admin)
    router.get('/admin/student/:id', (req, res) => adminController.getStudent(req, res, pool));
    router.put('/admin/student/:id', (req, res) => adminController.updateStudent(req, res, pool));

    // Excel Downloads
    router.get('/download/students', (req, res) => adminController.downloadStudents(req, res, pool));
    router.get('/download/faculty', (req, res) => adminController.downloadFaculty(req, res, pool));

    // Bulk Upload
    router.post('/admin/upload/users', upload.single('file'), (req, res) => adminController.bulkUploadUsers(req, res, pool));

    // List Views
    router.get('/admin/students', (req, res) => adminController.getAllStudents(req, res, pool));
    router.get('/admin/faculty', (req, res) => adminController.getAllFaculty(req, res, pool));

    return router;
};
