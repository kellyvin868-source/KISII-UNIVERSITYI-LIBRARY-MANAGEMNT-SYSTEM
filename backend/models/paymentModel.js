const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
    memberId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Member',
        required: true,
        index: true
    },
    fineId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Fine',
        required: true,
        index: true
    },
    provider: {
        type: String,
        enum: ['MPESA'],
        default: 'MPESA',
        required: true
    },
    idempotencyKey: {
        type: String,
        unique: true,
        sparse: true
    },
    providerRequestId: {
        type: String,
        unique: true,
        sparse: true
    },
    providerReceipt: {
        type: String,
        unique: true,
        sparse: true
    },
    amount: {
        type: Number,
        required: true,
        min: 1
    },
    phoneNumber: {
        type: String,
        required: true
    },
    status: {
        type: String,
        enum: ['PENDING', 'SUCCEEDED', 'FAILED'],
        default: 'PENDING',
        required: true,
        index: true
    },
    failureReason: {
        type: String,
        maxlength: 300
    },
    completedAt: Date
}, { timestamps: true });

module.exports = mongoose.model('Payment', paymentSchema);
