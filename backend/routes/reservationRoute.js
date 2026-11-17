const express = require('express');
const {
    listReservations,
    getReservation,
    createReservation,
    cancelReservation
} = require('../controllers/reservationController');
const { authenticate } = require('../middlewares/authMiddleware');

const reservationRoute = express.Router();

reservationRoute.use(authenticate);
reservationRoute.get('/', listReservations);
reservationRoute.get('/:id', getReservation);
reservationRoute.post('/', createReservation);
reservationRoute.post('/:id/cancel', cancelReservation);

module.exports = reservationRoute;