const express = require('express');
const { listAuthors, getAuthor, createAuthor } = require('../controllers/bookController');
const { authenticate, authorizeRoles } = require('../middlewares/authMiddleware');

const authorRoute = express.Router();

authorRoute.get('/', listAuthors);
authorRoute.post('/', authenticate, authorizeRoles('LIBRARIAN', 'ADMIN'), createAuthor);
authorRoute.get('/:id', getAuthor);

module.exports = authorRoute;
