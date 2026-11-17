const mongoose = require('mongoose');
const Member = require('../models/memberModel');
const Loan = require('../models/loanModel');
const serializeMongoRecord = require('../utils/serializeMongoRecord');
const bcrypt = require('bcryptjs');

const isStaff = (member) => ['LIBRARIAN', 'ADMIN'].includes(member.role);
const isSelfOrAdmin = (member, id) => member._id.toString() === id || isStaff(member);

const handleError = (res, error) => {
    if (error.code === 11000) {
        return res.status(409).json({ success: false, message: 'Email or registration number already exists.' });
    }
    if (error.name === 'ValidationError' || error.name === 'CastError') {
        return res.status(400).json({ success: false, message: 'Member data is invalid.' });
    }
    console.error('Member management request failed:', error);
    return res.status(500).json({ success: false, message: 'The member request could not be completed.' });
};

const registerMemberByStaff = async (req, res) => {
    if (!isStaff(req.member)) {
        return res.status(403).json({ success: false, message: 'Staff access is required.' });
    }
    const { fname, lname, email, password, phone, regNo } = req.body || {};
    if (
        typeof fname !== 'string' || !fname.trim() ||
        typeof lname !== 'string' || !lname.trim() ||
        typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
        typeof password !== 'string' || password.length < 8 || Buffer.byteLength(password, 'utf8') > 72 ||
        (phone !== undefined && typeof phone !== 'string') ||
        (regNo !== undefined && (typeof regNo !== 'string' || !/^[A-Z0-9/-]{3,30}$/i.test(regNo.trim())))
    ) {
        return res.status(400).json({ success: false, message: 'Provide valid names, email, password, registration number, and phone details.' });
    }
    try {
        const member = await Member.create({
            fname: fname.trim(),
            lname: lname.trim(),
            email: email.trim().toLowerCase(),
            password: await bcrypt.hash(password, 10),
            ...(phone?.trim() ? { phone: phone.trim() } : {}),
            ...(regNo?.trim() ? { regNo: regNo.trim().toUpperCase() } : {})
        });
        const safeMember = member.toObject();
        delete safeMember.password;
        return res.status(201).json({ success: true, data: serializeMongoRecord(safeMember) });
    } catch (error) {
        return handleError(res, error);
    }
};

const listMembers = async (req, res) => {
    if (!isStaff(req.member)) {
        return res.status(403).json({ success: false, message: 'Staff access is required.' });
    }
    const page = req.query.page === undefined ? 1 : Number(req.query.page);
    const limit = req.query.limit === undefined ? 20 : Number(req.query.limit);
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
        return res.status(400).json({ success: false, message: 'page must be positive and limit must be between 1 and 100.' });
    }
    try {
        const [total, members] = await Promise.all([
            Member.countDocuments(),
            Member.find().select('-password').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean()
        ]);
        return res.status(200).json({ success: true, data: members.map(serializeMongoRecord), meta: { total, page, limit } });
    } catch (error) {
        return handleError(res, error);
    }
};

const getMember = async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
        return res.status(400).json({ success: false, message: 'Member ID is invalid.' });
    }
    if (!isSelfOrAdmin(req.member, req.params.id)) {
        return res.status(403).json({ success: false, message: 'You cannot access another member’s profile.' });
    }
    try {
        const member = await Member.findById(req.params.id).select('-password').lean();
        if (!member) return res.status(404).json({ success: false, message: 'Member not found.' });
        return res.status(200).json({ success: true, data: serializeMongoRecord(member) });
    } catch (error) {
        return handleError(res, error);
    }
};

const updateMember = async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
        return res.status(400).json({ success: false, message: 'Member ID is invalid.' });
    }
    if (!isSelfOrAdmin(req.member, req.params.id)) {
        return res.status(403).json({ success: false, message: 'You cannot update another member’s profile.' });
    }

    const { fname, lname, email, phone, regNo, memberType, role, status } = req.body || {};
    if (role !== undefined || status !== undefined || memberType !== undefined) {
        if (req.member.role !== 'ADMIN') {
            return res.status(403).json({ success: false, message: 'Only administrators may change roles or member status.' });
        }
    }
    if (email !== undefined && (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))) {
        return res.status(400).json({ success: false, message: 'Enter a valid email address.' });
    }
    for (const [field, value] of Object.entries({ fname, lname, email, phone, regNo, memberType, role, status })) {
        if (value !== undefined && (typeof value !== 'string' || !value.trim())) {
            return res.status(400).json({ success: false, message: `${field} must be a non-empty string.` });
        }
    }
    if (role !== undefined && !['MEMBER', 'LIBRARIAN', 'ADMIN'].includes(role)) {
        return res.status(400).json({ success: false, message: 'role is invalid.' });
    }
    if (status !== undefined && !['ACTIVE', 'DEACTIVATED'].includes(status)) {
        return res.status(400).json({ success: false, message: 'status is invalid.' });
    }
    if (memberType !== undefined && !['STUDENT', 'STAFF'].includes(memberType)) {
        return res.status(400).json({ success: false, message: 'memberType is invalid.' });
    }

    const updates = {};
    for (const field of ['fname', 'lname', 'phone', 'regNo', 'role', 'status', 'memberType']) {
        if (req.body[field] !== undefined) updates[field] = req.body[field].trim();
    }
    if (email !== undefined) updates.email = email.trim().toLowerCase();

    try {
        const member = await Member.findByIdAndUpdate(req.params.id, { $set: updates }, {
            new: true,
            runValidators: true
        }).select('-password').lean();
        if (!member) return res.status(404).json({ success: false, message: 'Member not found.' });
        return res.status(200).json({ success: true, data: serializeMongoRecord(member) });
    } catch (error) {
        return handleError(res, error);
    }
};

const deactivateMember = async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
        return res.status(400).json({ success: false, message: 'Member ID is invalid.' });
    }
    if (req.member.role !== 'ADMIN' && req.member._id.toString() !== req.params.id) {
        return res.status(403).json({ success: false, message: 'You cannot deactivate this account.' });
    }
    try {
        const member = await Member.findByIdAndUpdate(req.params.id, {
            $set: { status: 'DEACTIVATED' },
            $inc: { tokenVersion: 1 }
        }, { new: true }).select('-password').lean();
        if (!member) return res.status(404).json({ success: false, message: 'Member not found.' });
        return res.status(200).json({ success: true, data: serializeMongoRecord(member) });
    } catch (error) {
        return handleError(res, error);
    }
};

const getBorrowingHistory = async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
        return res.status(400).json({ success: false, message: 'Member ID is invalid.' });
    }
    if (!isSelfOrAdmin(req.member, req.params.id)) {
        return res.status(403).json({ success: false, message: 'You cannot access another member’s borrowing history.' });
    }
    try {
        const loans = await Loan.find({ memberId: req.params.id })
            .sort({ createdAt: -1 })
            .populate('bookId', 'title authorName')
            .lean();
        return res.status(200).json({ success: true, data: loans.map(serializeMongoRecord) });
    } catch (error) {
        return handleError(res, error);
    }
};

module.exports = {
    registerMemberByStaff,
    listMembers,
    getMember,
    updateMember,
    deactivateMember,
    getBorrowingHistory
};
