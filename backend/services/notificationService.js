const nodemailer = require('nodemailer');
const Notification = require('../models/notificationModel');
const Member = require('../models/memberModel');

const REQUEST_TIMEOUT_MS = 10000;

const sendEmail = async ({ recipient, subject, body }) => {
    const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM } = process.env;
    if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASSWORD || !SMTP_FROM) {
        const error = new Error('Email service is not configured.');
        error.statusCode = 503;
        throw error;
    }

    const transporter = nodemailer.createTransport({
        host: SMTP_HOST,
        port: Number(SMTP_PORT),
        secure: process.env.SMTP_SECURE === 'true',
        auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
        connectionTimeout: REQUEST_TIMEOUT_MS,
        greetingTimeout: REQUEST_TIMEOUT_MS,
        socketTimeout: REQUEST_TIMEOUT_MS
    });

    try {
        return await transporter.sendMail({ from: SMTP_FROM, to: recipient, subject, text: body });
    } catch {
        const error = new Error('Email provider could not deliver the message.');
        error.statusCode = 502;
        throw error;
    }
};

const sendSms = async ({ phoneNumber, message }) => {
    const { AFRICASTALKING_USERNAME: username, AFRICASTALKING_API_KEY: apiKey, AFRICASTALKING_SENDER_ID: senderId } = process.env;
    if (!username || !apiKey) {
        const error = new Error('SMS service is not configured.');
        error.statusCode = 503;
        throw error;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
        const form = new URLSearchParams({
            username,
            to: phoneNumber,
            message,
            ...(senderId ? { from: senderId } : {})
        });
        const response = await fetch('https://api.africastalking.com/version1/messaging', {
            method: 'POST',
            headers: {
                apiKey,
                Accept: 'application/json',
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: form.toString(),
            signal: controller.signal
        });
        if (!response.ok) {
            const error = new Error(`SMS provider returned HTTP ${response.status}.`);
            error.statusCode = 502;
            throw error;
        }
        return await response.json();
    } catch (error) {
        if (error.statusCode) throw error;
        const providerError = new Error(error.name === 'AbortError' ? 'SMS provider request timed out.' : 'Unable to reach SMS provider.');
        providerError.statusCode = error.name === 'AbortError' ? 504 : 502;
        throw providerError;
    } finally {
        clearTimeout(timeout);
    }
};

const enqueueNotification = async ({ channel, eventType, recipient, subject, body }) => {
    const notification = await Notification.create({
        channel,
        eventType,
        recipient,
        subject,
        body
    });
    await processNotification(notification._id);
    return Notification.findById(notification._id).lean();
};

const notifyMember = async ({ memberId, eventType, subject, body }) => {
    const member = await Member.findById(memberId).select('email phone').lean();
    if (!member) throw new Error('Notification recipient member was not found.');
    const notifications = [];
    if (member.email) {
        notifications.push(enqueueNotification({
            channel: 'EMAIL',
            eventType,
            recipient: member.email,
            subject,
            body
        }));
    }
    if (member.phone) {
        const digits = member.phone.replace(/\D/g, '');
        const phoneNumber = digits.startsWith('0') ? `+254${digits.slice(1)}` : `+${digits}`;
        if (/^\+254[17]\d{8}$/.test(phoneNumber)) {
            notifications.push(enqueueNotification({
                channel: 'SMS',
                eventType,
                recipient: phoneNumber,
                body
            }));
        }
    }
    return Promise.all(notifications);
};

const processNotification = async (notificationId) => {
    const notification = await Notification.findOneAndUpdate(
        {
            _id: notificationId,
            status: 'PENDING',
            nextAttemptAt: { $lte: new Date() }
        },
        { $set: { status: 'PROCESSING' }, $inc: { attemptCount: 1 } },
        { new: true }
    );
    if (!notification) return null;

    try {
        if (notification.channel === 'EMAIL') {
            await sendEmail({
                recipient: notification.recipient,
                subject: notification.subject,
                body: notification.body
            });
        } else {
            await sendSms({
                phoneNumber: notification.recipient,
                message: notification.body
            });
        }
        notification.status = 'SENT';
        notification.sentAt = new Date();
        notification.lastError = undefined;
    } catch (error) {
        notification.lastError = error.message.slice(0, 500);
        if (notification.attemptCount >= 5) {
            notification.status = 'FAILED';
        } else {
            notification.status = 'PENDING';
            notification.nextAttemptAt = new Date(Date.now() + Math.min(60 * 1000 * (2 ** (notification.attemptCount - 1)), 60 * 60 * 1000));
        }
    }

    await notification.save();
    return notification;
};

const processPendingNotifications = async () => {
    const staleProcessingBefore = new Date(Date.now() - 5 * 60 * 1000);
    await Notification.updateMany(
        { status: 'PROCESSING', updatedAt: { $lt: staleProcessingBefore } },
        { $set: { status: 'PENDING', nextAttemptAt: new Date() } }
    );
    const due = await Notification.find({ status: 'PENDING', nextAttemptAt: { $lte: new Date() } })
        .select('_id')
        .limit(25)
        .lean();
    for (const notification of due) {
        await processNotification(notification._id);
    }
};

module.exports = {
    sendEmail,
    sendSms,
    enqueueNotification,
    notifyMember,
    processPendingNotifications
};