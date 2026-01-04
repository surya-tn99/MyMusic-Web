const express = require('express');
const exampleRoutes = require('./exampleRoutes');
const downloadRoutes = require('./downloadRoutes');

const router = express.Router();

router.use('/example', exampleRoutes);
router.use('/downloads', downloadRoutes);

module.exports = router;
