const express = require('express');
const router = express.Router();
const assessmentController = require('../controllers/assessmentController');

module.exports = (pool) => {
    router.post('/assessment/create', (req, res) => assessmentController.createAssessment(req, res, pool));
    router.get('/assessment/all', (req, res) => assessmentController.getAllAssessments(req, res, pool));
    router.get('/assessment/:id', (req, res) => assessmentController.getAssessmentById(req, res, pool));
    router.delete('/assessment/:id', (req, res) => assessmentController.deleteAssessment(req, res, pool));
    router.get('/assessment/:assessmentId/questions', (req, res) => assessmentController.getAssessmentQuestions(req, res, pool));
    router.post('/assessment/submit', (req, res) => assessmentController.submitAssessmentLegacy(req, res)); // Legacy/Reference
    router.get('/assessment/:id/results', (req, res) => assessmentController.getAssessmentResults(req, res, pool));

    router.get('/verify/:code', (req, res) => assessmentController.verifyAssessmentCode(req, res, pool));

    return router;
};
