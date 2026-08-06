'use strict';

const express = require('express');
const { healthController, pingController } = require('../controllers/health.controller');

const router = express.Router();

router.get('/', healthController);
router.get('/ping', pingController);

module.exports = { healthRouter: router };
