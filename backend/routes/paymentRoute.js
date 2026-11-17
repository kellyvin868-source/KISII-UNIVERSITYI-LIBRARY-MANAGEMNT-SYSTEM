const express = require('express');
const { authenticate } = require('../middlewares/authMiddleware');
const {
    initiatePayment,
    applyCallback,
    listPayments
} = require('../controllers/paymentController');

const paymentRoute = express.Router();

paymentRoute.get('/', authenticate, listPayments);
paymentRoute.post('/mpesa/initiate', authenticate, initiatePayment);
paymentRoute.post('/mpesa/callback', applyCallback);

module.exports = paymentRoute;
