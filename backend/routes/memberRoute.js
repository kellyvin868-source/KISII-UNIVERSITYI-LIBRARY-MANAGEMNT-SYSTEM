const express = require('express');
const {
    registerMember,
    loginMember,
    logoutMember,
    getCurrentMember
} = require('../controllers/memberController');
const { authenticate } = require('../middlewares/authMiddleware');

const memberRoute = express.Router();

memberRoute.post('/register', registerMember);
memberRoute.post('/login', loginMember);
memberRoute.post('/logout', authenticate, logoutMember);
memberRoute.get('/me', authenticate, getCurrentMember);

module.exports = memberRoute;