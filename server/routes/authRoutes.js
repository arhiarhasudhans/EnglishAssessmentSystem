const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

module.exports = (pool) => {
    router.post('/student/register', (req, res) => authController.registerStudent(req, res, pool));
    router.post('/student/login', (req, res) => authController.loginStudent(req, res, pool));
    router.post('/faculty/register', (req, res) => authController.registerFaculty(req, res, pool));
    router.post('/faculty/login', (req, res) => authController.loginFaculty(req, res, pool));
    router.post('/faculty/logout', (req, res) => authController.logoutFaculty(req, res));

    return router;
};
