const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
    channel: {
        type: String,
        enum: ['EMAIL', 'SMS'],
        required: true
    },
    eventType: {
        type: String,
        required: true,
        maxlength: 100
    },
    recipient: {
        type: String,
        required: true,
        maxlength: 320
    },
    subject: {
        type: String,
        maxlength: 200
    },
    body: {
        type: String,
        required: true,
        maxlength: 5000
    },
    status: {
        type: String,
        enum: ['PENDING', 'PROCESSING', 'SENT', 'FAILED'],
        default: 'PENDING',
        required: true,
        index: true
    },
    attemptCount: {
        type: Number,
        default: 0,
        min: 0
    },
    nextAttemptAt: {
        type: Date,
        default: Date.now,
        index: true
    },
    lastError: {
        type: String,
        maxlength: 500
    },
    sentAt: Date
}, { timestamps: true });

notificationSchema.index({ status: 1, nextAttemptAt: 1 });
notificationSchema.index({ status: 1, updatedAt: 1 });

module.exports = mongoose.model('Notification', notificationSchema);
