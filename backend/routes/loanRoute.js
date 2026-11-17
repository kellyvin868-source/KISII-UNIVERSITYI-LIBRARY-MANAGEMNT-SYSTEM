const express = require('express');
const {
    listLoans,
    getLoan,
    borrowBook,
    returnLoan,
    renewLoan
} = require('../controllers/loanController');
const { authenticate } = require('../middlewares/authMiddleware');

const loanRoute = express.Router();

loanRoute.use(authenticate);
loanRoute.get('/', listLoans);
loanRoute.get('/:id', getLoan);
loanRoute.post('/', borrowBook);
loanRoute.post('/:id/return', returnLoan);
loanRoute.post('/:id/renew', renewLoan);

module.exports = loanRoute;