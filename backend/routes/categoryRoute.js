const express = require('express');
const { listCategories, getCategory, createCategory } = require('../controllers/bookController');
const { authenticate, authorizeRoles } = require('../middlewares/authMiddleware');

const categoryRoute = express.Router();

categoryRoute.get('/', listCategories);
categoryRoute.post('/', authenticate, authorizeRoles('LIBRARIAN', 'ADMIN'), createCategory);
categoryRoute.get('/:id', getCategory);

module.exports = categoryRoute;
