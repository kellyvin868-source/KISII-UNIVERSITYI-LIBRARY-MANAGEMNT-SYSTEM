const mongoose = require('mongoose');
const Fine = require('../models/fineModel');
const Loan = require('../models/loanModel');
const serializeMongoRecord = require('../utils/serializeMongoRecord');
const { upsertOverdueFine } = require('../services/loanService');

const canManage = (member) => ['LIBRARIAN', 'ADMIN'].includes(member.role);
const respondError = (res, error) => {
    if (error.name === 'ValidationError' || error.name === 'CastError') {
        return res.status(400).json({ success: false, message: 'Fine data is invalid.' });
    }
    console.error('Fine request failed:', error);
    return res.status(500).json({ success: false, message: 'The fine request could not be completed.' });
};

const listFines = async (req, res) => {
    const filter = {};
    if (!canManage(req.member)) filter.memberId = req.member._id;
    if (req.query.memberId !== undefined) {
        if (typeof req.query.memberId !== 'string' || !mongoose.isValidObjectId(req.query.memberId)) {
            return res.status(400).json({ success: false, message: 'memberId is invalid.' });
        }
        if (!canManage(req.member) && req.member._id.toString() !== req.query.memberId) {
            return res.status(403).json({ success: false, message: 'You cannot view another member’s fines.' });
        }
        filter.memberId = req.query.memberId;
    }
    if (req.query.status !== undefined) {
        if (!['OUTSTANDING', 'PARTIALLY_PAID', 'PAID'].includes(req.query.status)) {
            return res.status(400).json({ success: false, message: 'status is invalid.' });
        }
        filter.status = req.query.status;
    }
    try {
        const fines = await Fine.find(filter).sort({ createdAt: -1 }).lean();
        return res.status(200).json({ success: true, data: fines.map(serializeMongoRecord) });
    } catch (error) {
        return respondError(res, error);
    }
};

const getFine = async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
        return res.status(400).json({ success: false, message: 'Fine ID is invalid.' });
    }
    try {
        const fine = await Fine.findById(req.params.id).lean();
        if (!fine) return res.status(404).json({ success: false, message: 'Fine not found.' });
        if (!canManage(req.member) && fine.memberId.toString() !== req.member._id.toString()) {
            return res.status(403).json({ success: false, message: 'You cannot view another member’s fine.' });
        }
        return res.status(200).json({ success: true, data: serializeMongoRecord(fine) });
    } catch (error) {
        return respondError(res, error);
    }
};

const calculateLoanFine = async (req, res) => {
    if (!canManage(req.member)) {
        return res.status(403).json({ success: false, message: 'Staff access is required to calculate fines.' });
    }
    const { loanId } = req.body || {};
    if (typeof loanId !== 'string' || !mongoose.isValidObjectId(loanId)) {
        return res.status(400).json({ success: false, message: 'A valid loanId is required.' });
    }
    try {
        const loan = await Loan.findById(loanId);
        if (!loan) return res.status(404).json({ success: false, message: 'Loan not found.' });
        const asOf = loan.returnedDate || new Date();
        const lateDays = Math.max(0, Math.ceil((asOf - loan.dueDate) / (24 * 60 * 60 * 1000)));
        const perDay = Number(process.env.OVERDUE_FINE_PER_DAY || 10);
        if (!Number.isFinite(perDay) || perDay < 0) {
            console.error('OVERDUE_FINE_PER_DAY is invalid.');
            return res.status(503).json({ success: false, message: 'Fine calculation is not configured correctly.' });
        }
        if (lateDays === 0) {
            return res.status(200).json({ success: true, data: { loanId, lateDays: 0, amount: 0 } });
        }

        const fine = await upsertOverdueFine(loan, asOf);
        return res.status(200).json({ success: true, data: serializeMongoRecord(fine) });
    } catch (error) {
        return respondError(res, error);
    }
};

module.exports = { listFines, getFine, calculateLoanFine };
