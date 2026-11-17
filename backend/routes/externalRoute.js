const express = require('express');
const { authenticate } = require('../middlewares/authMiddleware');
const { verifyStudent, lookupIsbn } = require('../controllers/externalController');

const externalRoute = express.Router();

externalRoute.get('/students/:regNo/verify', authenticate, verifyStudent);
externalRoute.get('/isbn/:isbn', lookupIsbn);

module.exports = externalRoute;