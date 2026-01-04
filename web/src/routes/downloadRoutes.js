const express = require('express');
const downloadController = require('../controllers/downloadController');

const router = express.Router();



router.post('/info', downloadController.getVideoInfo);
router.post('/', downloadController.startDownload);
router.get('/progress/:id', downloadController.streamProgress);
router.get('/history', downloadController.getDownloadHistory);

module.exports = router;
