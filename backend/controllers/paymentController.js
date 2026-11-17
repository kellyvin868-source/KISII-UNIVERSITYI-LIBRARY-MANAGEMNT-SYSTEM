const crypto = require('node:crypto');
const mongoose = require('mongoose');
const Fine = require('../models/fineModel');
const Member = require('../models/memberModel');
const Payment = require('../models/paymentModel');
const serializeMongoRecord = require('../utils/serializeMongoRecord');
const { initiateStkPush, validateCallbackSecret } = require('../services/mpesaService');

const canManage = (member) => ['LIBRARIAN', 'ADMIN'].includes(member.role);
const canPayFine = (member, memberId) => canManage(member) || member._id.toString() === memberId;

const normalizePhone = (phone) => {
    const digits = phone.replace(/\D/g, '');
    if (/^0[17]\d{8}$/.test(digits)) return `254${digits.slice(1)}`;
    if (/^254[17]\d{8}$/.test(digits)) return digits;
    if (/^[17]\d{8}$/.test(digits)) return `254${digits}`;
    return null;
};

const initiatePayment = async (req, res) => {
    const { fineId, phoneNumber, amount } = req.body || {};
    if (typeof fineId !== 'string' || !mongoose.isValidObjectId(fineId)) {
        return res.status(400).json({ success: false, message: 'A valid fineId is required.' });
    }
    if (typeof phoneNumber !== 'string' || !normalizePhone(phoneNumber)) {
        return res.status(400).json({ success: false, message: 'Enter a valid Kenyan mobile number.' });
    }
    if (!Number.isSafeInteger(amount) || amount < 1) {
        return res.status(400).json({ success: false, message: 'amount must be a positive whole number of Kenyan shillings.' });
    }
    const idempotencyHeader = req.get('Idempotency-Key');
    if (idempotencyHeader !== undefined && (idempotencyHeader.length < 8 || idempotencyHeader.length > 128)) {
        return res.status(400).json({ success: false, message: 'Idempotency-Key must be between 8 and 128 characters.' });
    }

    try {
        const fine = await Fine.findById(fineId);
        if (!fine) return res.status(404).json({ success: false, message: 'Fine not found.' });
        if (!canPayFine(req.member, fine.memberId.toString())) {
            return res.status(403).json({ success: false, message: 'You cannot pay another member’s fine.' });
        }
        const idempotencyKey = idempotencyHeader || crypto.randomUUID();
        if (idempotencyHeader) {
            const existing = await Payment.findOne({ idempotencyKey });
            if (existing) {
                if (
                    existing.fineId.toString() !== fineId ||
                    existing.amount !== amount ||
                    existing.phoneNumber !== normalizePhone(phoneNumber)
                ) {
                    return res.status(409).json({ success: false, message: 'Idempotency-Key was already used for a different payment request.' });
                }
                return res.status(200).json({ success: true, data: serializeMongoRecord(existing) });
            }
        }
        const pending = await Payment.aggregate([
            { $match: { fineId: fine._id, status: 'PENDING' } },
            { $group: { _id: null, amount: { $sum: '$amount' } } }
        ]);
        const remaining = fine.amount - fine.paidAmount - (pending[0]?.amount || 0);
        if (amount > remaining || remaining <= 0) {
            return res.status(409).json({ success: false, message: 'Payment amount exceeds the outstanding fine balance.' });
        }

        let payment;
        try {
            payment = await Payment.create({
                memberId: fine.memberId,
                fineId: fine._id,
                idempotencyKey,
                amount,
                phoneNumber: normalizePhone(phoneNumber)
            });
        } catch (error) {
            if (error.code === 11000) {
                const existing = await Payment.findOne({ idempotencyKey });
                if (existing) return res.status(200).json({ success: true, data: serializeMongoRecord(existing) });
            }
            throw error;
        }

        try {
            const providerResult = await initiateStkPush({
                phoneNumber: payment.phoneNumber,
                amount: payment.amount,
                accountReference: payment._id.toString()
            });
            payment.providerRequestId = providerResult.CheckoutRequestID;
            await payment.save();
            return res.status(202).json({
                success: true,
                message: providerResult.CustomerMessage || 'Payment request sent to the phone.',
                data: serializeMongoRecord(payment)
            });
        } catch (error) {
            payment.status = 'FAILED';
            payment.failureReason = error.message.slice(0, 300);
            await payment.save();
            console.error('M-Pesa initiation failed:', error.message);
            return res.status(502).json({ success: false, message: 'M-Pesa payment request could not be initiated.' });
        }
    } catch (error) {
        if (error.name === 'ValidationError' || error.name === 'CastError') {
            return res.status(400).json({ success: false, message: 'Payment data is invalid.' });
        }
        console.error('Payment initiation failed:', error);
        return res.status(500).json({ success: false, message: 'The payment request could not be completed.' });
    }
};

const applyCallback = async (req, res) => {
    if (!validateCallbackSecret(req.query.token)) {
        return res.status(401).json({ success: false, message: 'Invalid payment callback credentials.' });
    }

    const callback = req.body?.Body?.stkCallback;
    if (!callback || typeof callback.CheckoutRequestID !== 'string' || !Number.isInteger(callback.ResultCode)) {
        return res.status(400).json({ success: false, message: 'Invalid M-Pesa callback payload.' });
    }

    try {
        const payment = await Payment.findOne({ providerRequestId: callback.CheckoutRequestID });
        if (!payment) {
            return res.status(404).json({ success: false, message: 'Payment request was not found.' });
        }
        if (payment.status !== 'PENDING') {
            return res.status(200).json({ success: true, message: 'Callback already processed.' });
        }
        if (callback.ResultCode !== 0) {
            payment.status = 'FAILED';
            payment.failureReason = String(callback.ResultDesc || 'Payment failed').slice(0, 300);
            await payment.save();
            return res.status(200).json({ success: true, message: 'Payment failure recorded.' });
        }

        const items = callback.CallbackMetadata?.Item;
        if (!Array.isArray(items)) {
            return res.status(400).json({ success: false, message: 'Successful payment callback is missing transaction details.' });
        }
        const receipt = items.find((item) => item.Name === 'MpesaReceiptNumber')?.Value;
        const paidAmount = items.find((item) => item.Name === 'Amount')?.Value;
        if (typeof receipt !== 'string' || !receipt || Number(paidAmount) !== payment.amount) {
            return res.status(400).json({ success: false, message: 'Payment callback amount or receipt is invalid.' });
        }

        const applied = await Fine.findOneAndUpdate(
            {
                _id: payment.fineId,
                appliedPaymentIds: { $ne: payment._id },
                $expr: {
                    $lte: [
                        { $add: [{ $ifNull: ['$paidAmount', 0] }, payment.amount] },
                        '$amount'
                    ]
                }
            },
            { $inc: { paidAmount: payment.amount }, $addToSet: { appliedPaymentIds: payment._id } },
            { new: true }
        );
        if (!applied && !(await Fine.exists({ _id: payment.fineId, appliedPaymentIds: payment._id }))) {
            return res.status(409).json({ success: false, message: 'Payment could not be allocated to the outstanding fine balance.' });
        }
        if (applied) {
            applied.status = applied.paidAmount >= applied.amount ? 'PAID' : 'PARTIALLY_PAID';
            await applied.save();
        }

        payment.status = 'SUCCEEDED';
        payment.providerReceipt = receipt;
        payment.completedAt = new Date();
        await payment.save();
        return res.status(200).json({ success: true, message: 'Payment recorded successfully.' });
    } catch (error) {
        console.error('M-Pesa callback processing failed:', error);
        return res.status(500).json({ success: false, message: 'Payment callback processing failed.' });
    }
};

const listPayments = async (req, res) => {
    try {
        const filter = canManage(req.member) ? {} : { memberId: req.member._id };
        const payments = await Payment.find(filter).sort({ createdAt: -1 }).lean();
        return res.status(200).json({ success: true, data: payments.map(serializeMongoRecord) });
    } catch (error) {
        console.error('Payment history lookup failed:', error);
        return res.status(500).json({ success: false, message: 'Payment history could not be retrieved.' });
    }
};

module.exports = { initiatePayment, applyCallback, listPayments };
