const express = require('express');
const {
    listBooks,
    getBook,
    createBook,
    updateBook,
    archiveBook,
    listBookCopies,
    createBookCopy,
    updateBookCopy
} = require('../controllers/bookController');
const { authenticate, authorizeRoles } = require('../middlewares/authMiddleware');

const bookRoute = express.Router();
const catalogManagers = [authenticate, authorizeRoles('LIBRARIAN', 'ADMIN')];

bookRoute.get('/', listBooks);
bookRoute.post('/', ...catalogManagers, createBook);
bookRoute.get('/:id/copies', listBookCopies);
bookRoute.post('/:id/copies', ...catalogManagers, createBookCopy);
bookRoute.patch('/copies/:copyId', ...catalogManagers, updateBookCopy);
bookRoute.get('/:id', getBook);
bookRoute.put('/:id', ...catalogManagers, updateBook);
bookRoute.delete('/:id', ...catalogManagers, archiveBook);

module.exports = bookRoute;