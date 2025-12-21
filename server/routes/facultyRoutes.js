const express = require('express');
const router = express.Router();
const facultyController = require('../controllers/facultyController');

module.exports = (pool) => {
    router.get('/faculty', (req, res) => facultyController.getAllFaculty(req, res, pool));
    router.get('/dashboard/stats', (req, res) => facultyController.getDashboardStats(req, res, pool));
    router.get('/faculty/results', (req, res) => facultyController.getFacultyResults(req, res, pool)); // Filtered results
    router.get('/faculty/summary', (req, res) => facultyController.getDashboardAssessmentSummary(req, res, pool));

    // Faculty Student Reports
    router.get('/faculty/students', (req, res) => facultyController.getFacultyStudents(req, res, pool));
    router.get('/faculty/student/:studentId/report', (req, res) => facultyController.getStudentReportForFaculty(req, res, pool));

    // Dynamic routes with :id must come LAST
    const validateUUID = (req, res, next) => {
        const id = req.params.id;
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(id)) return next('route'); // Skip if not UUID, though here we might just error or let it pass if strictly ordered
        next();
    };

    router.get('/faculty/:id', validateUUID, (req, res) => facultyController.getFacultyById(req, res, pool));
    router.put('/faculty/:id', validateUUID, (req, res) => facultyController.updateFaculty(req, res, pool));
    router.delete('/faculty/:id', validateUUID, (req, res) => facultyController.deleteFaculty(req, res, pool));

    return router;
};
