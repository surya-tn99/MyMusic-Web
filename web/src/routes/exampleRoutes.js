const express = require('express');
const exampleController = require('../controllers/exampleController');

const router = express.Router();

router.get('/', exampleController.getExample);
router.post('/', exampleController.createExample);

module.exports = router;
