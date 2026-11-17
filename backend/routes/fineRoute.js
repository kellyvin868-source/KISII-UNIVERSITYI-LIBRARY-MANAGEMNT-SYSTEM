const express = require('express');
const { listFines, getFine, calculateLoanFine } = require('../controllers/fineController');
const { authenticate } = require('../middlewares/authMiddleware');

const fineRoute = express.Router();

fineRoute.use(authenticate);
fineRoute.get('/', listFines);
fineRoute.get('/:id', getFine);
fineRoute.post('/', calculateLoanFine);

module.exports = fineRoute;