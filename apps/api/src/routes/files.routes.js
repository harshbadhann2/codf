'use strict';

const express = require('express');
const { downloadFileController } = require('../controllers/conversion.controller');

const router = express.Router();

router.get('/:fileName', downloadFileController);

module.exports = { filesRouter: router };
