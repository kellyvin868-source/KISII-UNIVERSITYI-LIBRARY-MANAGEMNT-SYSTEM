const mongoose = require('mongoose');
const Book = require('../models/bookModel');
const Member = require('../models/memberModel');
const Reservation = require('../models/reservationModel');
const serializeMongoRecord = require('../utils/serializeMongoRecord');
const { allocateNextHold, expireReadyReservations } = require('../services/reservationService');
const { notifyMember } = require('../services/notificationService');

const canManage = (member) => ['LIBRARIAN', 'ADMIN'].includes(member.role);
const canAccessMember = (member, memberId) => canManage(member) || member._id.toString() === memberId;

const sendError = (res, error) => {
    if (error.code === 11000) return res.status(409).json({ success: false, message: 'An active reservation already exists.' });
    if (error.name === 'ValidationError' || error.name === 'CastError') {
        return res.status(400).json({ success: false, message: 'The reservation request is invalid.' });
    }
    console.error('Reservation request failed:', error);
    return res.status(500).json({ success: false, message: 'The reservation request could not be completed.' });
};

const listReservations = async (req, res) => {
    try {
        await expireReadyReservations();
        const filter = {};
        if (req.query.memberId !== undefined) {
            if (typeof req.query.memberId !== 'string' || !mongoose.isValidObjectId(req.query.memberId)) {
                return res.status(400).json({ success: false, message: 'memberId is invalid.' });
            }
            if (!canAccessMember(req.member, req.query.memberId)) {
                return res.status(403).json({ success: false, message: 'You cannot view another member’s reservations.' });
            }
            filter.memberId = req.query.memberId;
        } else if (!canManage(req.member)) {
            filter.memberId = req.member._id;
        }
        const reservations = await Reservation.find(filter)
            .sort({ createdAt: -1 })
            .populate('bookId', 'title authorName')
            .populate('memberId', 'fname lname regNo')
            .lean();
        return res.status(200).json({ success: true, data: reservations.map(serializeMongoRecord) });
    } catch (error) {
        return sendError(res, error);
    }
};

const getReservation = async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
        return res.status(400).json({ success: false, message: 'Reservation ID is invalid.' });
    }
    try {
        await expireReadyReservations();
        const reservation = await Reservation.findById(req.params.id)
            .populate('bookId', 'title authorName')
            .populate('memberId', 'fname lname regNo')
            .lean();
        if (!reservation) return res.status(404).json({ success: false, message: 'Reservation not found.' });
        const memberId = reservation.memberId?._id?.toString() || reservation.memberId?.toString();
        if (!canAccessMember(req.member, memberId)) {
            return res.status(403).json({ success: false, message: 'You cannot view another member’s reservation.' });
        }
        return res.status(200).json({ success: true, data: serializeMongoRecord(reservation) });
    } catch (error) {
        return sendError(res, error);
    }
};

const createReservation = async (req, res) => {
    const { memberId, bookId } = req.body || {};
    if (
        typeof memberId !== 'string' || !mongoose.isValidObjectId(memberId) ||
        typeof bookId !== 'string' || !mongoose.isValidObjectId(bookId)
    ) {
        return res.status(400).json({ success: false, message: 'Valid memberId and bookId are required.' });
    }
    if (!canAccessMember(req.member, memberId)) {
        return res.status(403).json({ success: false, message: 'You cannot reserve a title for another member.' });
    }

    try {
        await expireReadyReservations();
        const [member, book] = await Promise.all([
            Member.findById(memberId).select('status'),
            Book.findOne({ _id: bookId, status: 'ACTIVE' }).select('availableCopies')
        ]);
        if (!member || member.status !== 'ACTIVE') {
            return res.status(403).json({ success: false, message: 'Member account is not active.' });
        }
        if (!book) return res.status(404).json({ success: false, message: 'Book not found.' });
        if (book.availableCopies > 0) {
            return res.status(409).json({ success: false, message: 'This title is available to borrow; reservations are for unavailable titles.' });
        }
        const activeReservation = await Reservation.exists({
            memberId,
            bookId,
            status: { $in: ['WAITING', 'READY'] }
        });
        if (activeReservation) {
            return res.status(409).json({ success: false, message: 'You already have an active reservation for this title.' });
        }

        const queuePosition = await Reservation.countDocuments({ bookId, status: 'WAITING' }) + 1;
        const reservation = await Reservation.create({
            memberId,
            bookId,
            queuePosition,
            activeKey: `${memberId}:${bookId}`
        });
        try {
            const bookTitle = await Book.findById(bookId).select('title').lean();
            await notifyMember({
                memberId,
                eventType: 'RESERVATION_CREATED',
                subject: 'Library reservation confirmation',
                body: `Your reservation for "${bookTitle?.title || 'the selected title'}" is number ${queuePosition} in the queue.`
            });
        } catch (notificationError) {
            console.error('Reservation was created, but its notification could not be queued:', notificationError);
        }
        return res.status(201).json({ success: true, data: serializeMongoRecord(reservation) });
    } catch (error) {
        return sendError(res, error);
    }
};

const cancelReservation = async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
        return res.status(400).json({ success: false, message: 'Reservation ID is invalid.' });
    }
    try {
        const reservation = await Reservation.findById(req.params.id);
        if (!reservation) return res.status(404).json({ success: false, message: 'Reservation not found.' });
        if (!canAccessMember(req.member, reservation.memberId.toString())) {
            return res.status(403).json({ success: false, message: 'You cannot cancel another member’s reservation.' });
        }
        if (!['WAITING', 'READY'].includes(reservation.status)) {
            return res.status(409).json({ success: false, message: 'This reservation is no longer active.' });
        }

        const cancelled = await Reservation.findOneAndUpdate(
            { _id: reservation._id, status: reservation.status },
            { $set: { status: 'CANCELLED' }, $unset: { expiresAt: 1, queuePosition: 1, activeKey: 1, copyId: 1 } },
            { new: true }
        );
        if (!cancelled) return res.status(409).json({ success: false, message: 'Reservation could not be cancelled.' });
        if (reservation.status === 'READY') {
            if (reservation.copyId) {
                const BookCopy = require('../models/bookCopyModel');
                await BookCopy.updateOne(
                    { _id: reservation.copyId, status: 'HELD' },
                    { $set: { status: 'AVAILABLE' } }
                );
            }
            await Book.updateOne(
                { _id: reservation.bookId, status: 'ACTIVE' },
                { $inc: { availableCopies: 1 } }
            );
            await allocateNextHold(reservation.bookId);
        }
        return res.status(200).json({ success: true, data: serializeMongoRecord(cancelled) });
    } catch (error) {
        return sendError(res, error);
    }
};

module.exports = { listReservations, getReservation, createReservation, cancelReservation };
