const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const questionController = require('../controllers/questionController');

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join(__dirname, '..', '..', 'uploads'); // Adjusted path relative to routes folder
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname));
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
    router.post('/upload', upload.single('file'), (req, res) => questionController.uploadQuestionSet(req, res, pool));
    router.get('/template/download', (req, res) => questionController.downloadTemplate(req, res));
    return router;
};
