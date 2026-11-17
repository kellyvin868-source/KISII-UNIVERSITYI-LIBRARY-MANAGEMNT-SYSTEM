const express = require('express');
const { authenticate, authorizeRoles } = require('../middlewares/authMiddleware');
const Notification = require('../models/notificationModel');
const { enqueueNotification } = require('../services/notificationService');
const serializeMongoRecord = require('../utils/serializeMongoRecord');

const notificationRoute = express.Router();
const staffOnly = [authenticate, authorizeRoles('LIBRARIAN', 'ADMIN')];

const dispatch = (channel) => async (req, res) => {
    const { recipient, phoneNumber, subject, message, body } = req.body || {};
    const destination = channel === 'EMAIL' ? recipient : phoneNumber;
    const content = channel === 'EMAIL' ? body : message;
    if (typeof destination !== 'string' || !destination.trim() || typeof content !== 'string' || !content.trim()) {
        return res.status(400).json({
            success: false,
            message: channel === 'EMAIL'
                ? 'recipient and body are required.'
                : 'phoneNumber and message are required.'
        });
    }
    if (
        channel === 'EMAIL' &&
        (typeof subject !== 'string' || !subject.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(destination.trim()))
    ) {
        return res.status(400).json({ success: false, message: 'A valid recipient email and subject are required.' });
    }
    if (content.length > 5000) {
        return res.status(400).json({ success: false, message: 'Message must be 5000 characters or fewer.' });
    }
    if (channel === 'SMS' && !/^\+?[1-9]\d{7,14}$/.test(destination.replace(/[\s()-]/g, ''))) {
        return res.status(400).json({ success: false, message: 'phoneNumber must be a valid international phone number.' });
    }

    try {
        const notification = await enqueueNotification({
            channel,
            eventType: 'STAFF_DISPATCH',
            recipient: destination.trim(),
            subject: channel === 'EMAIL' ? subject.trim() : undefined,
            body: content.trim()
        });
        return res.status(202).json({
            success: true,
            data: serializeMongoRecord(notification)
        });
    } catch (error) {
        console.error('Could not queue notification:', error);
        return res.status(500).json({ success: false, message: 'Notification could not be queued.' });
    }
};

notificationRoute.get('/', ...staffOnly, async (req, res) => {
    try {
        const records = await Notification.find().sort({ createdAt: -1 }).limit(100).lean();
        return res.status(200).json({ success: true, data: records.map(serializeMongoRecord) });
    } catch (error) {
        console.error('Notification history lookup failed:', error);
        return res.status(500).json({ success: false, message: 'Notification history could not be retrieved.' });
    }
});
notificationRoute.post('/email', ...staffOnly, dispatch('EMAIL'));
notificationRoute.post('/sms', ...staffOnly, dispatch('SMS'));

module.exports = notificationRoute;