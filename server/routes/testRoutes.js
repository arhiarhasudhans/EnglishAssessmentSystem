const express = require("express");
const router = express.Router();

const testController = require("../controllers/testController");
const answerController = require("../controllers/answerController");

module.exports = (pool) => {

    router.use((req, res, next) => {
        req.pool = pool;
        next();
    });

    router.get("/test/next-question", testController.getNextQuestion);
    router.post("/test/submit-answer", answerController.submitAnswer);
    router.post("/test/complete-assessment", testController.completeAssessment);

    return router;
};
