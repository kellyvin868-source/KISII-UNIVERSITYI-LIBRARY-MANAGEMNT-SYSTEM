const mongoose = require('mongoose');

const reservationSchema = new mongoose.Schema({
    memberId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Member',
        required: true,
        index: true
    },
    bookId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Book',
        required: true,
        index: true
    },
    copyId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'BookCopy'
    },
    activeKey: {
        type: String,
        unique: true,
        sparse: true
    },
    status: {
        type: String,
        enum: ['WAITING', 'READY', 'FULFILLED', 'CANCELLED', 'EXPIRED'],
        default: 'WAITING',
        required: true,
        index: true
    },
    queuePosition: {
        type: Number,
        min: 1
    },
    readyAt: Date,
    expiresAt: Date
}, { timestamps: true });

reservationSchema.index({ bookId: 1, status: 1, createdAt: 1 });
reservationSchema.index({ memberId: 1, bookId: 1, status: 1 });

module.exports = mongoose.model('Reservation', reservationSchema);
