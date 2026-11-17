const mongoose = require('mongoose');
const Book = require('../models/bookModel');
const BookCopy = require('../models/bookCopyModel');
const Fine = require('../models/fineModel');
const Loan = require('../models/loanModel');
const Member = require('../models/memberModel');
const Reservation = require('../models/reservationModel');
const serializeMongoRecord = require('../utils/serializeMongoRecord');
const { allocateNextHold, expireReadyReservations } = require('../services/reservationService');
const { notifyMember } = require('../services/notificationService');
const { upsertOverdueFine } = require('../services/loanService');

const LOAN_DAYS = 14;
const MAX_ACTIVE_LOANS = 5;

const canManage = (member) => ['LIBRARIAN', 'ADMIN'].includes(member.role);
const canAccessMember = (member, memberId) => canManage(member) || member._id.toString() === memberId;

const errorResponse = (res, error) => {
    if (error.code === 11000) return res.status(409).json({ success: false, message: 'A conflicting circulation record already exists.' });
    if (error.name === 'ValidationError' || error.name === 'CastError') {
        return res.status(400).json({ success: false, message: 'The circulation request is invalid.' });
    }
    console.error('Circulation request failed:', error);
    return res.status(500).json({ success: false, message: 'The circulation request could not be completed.' });
};

const assertRecordId = (id) => mongoose.isValidObjectId(id);

const listLoans = async (req, res) => {
    const filter = {};
    if (req.query.memberId !== undefined) {
        if (typeof req.query.memberId !== 'string' || !assertRecordId(req.query.memberId)) {
            return res.status(400).json({ success: false, message: 'memberId is invalid.' });
        }
        if (!canAccessMember(req.member, req.query.memberId)) {
            return res.status(403).json({ success: false, message: 'You cannot view another member’s loans.' });
        }
        filter.memberId = req.query.memberId;
    } else if (!canManage(req.member)) {
        filter.memberId = req.member._id;
    }
    if (req.query.status !== undefined) {
        if (!['ACTIVE', 'RETURNED', 'OVERDUE'].includes(req.query.status)) {
            return res.status(400).json({ success: false, message: 'status is invalid.' });
        }
        filter.status = req.query.status;
    }

    try {
        if (!canManage(req.member)) {
            await Loan.updateMany({ memberId: req.member._id, status: 'ACTIVE', dueDate: { $lt: new Date() } }, { $set: { status: 'OVERDUE' } });
        }
        const loans = await Loan.find(filter)
            .sort({ createdAt: -1 })
            .populate('bookId', 'title authorName')
            .populate('copyId', 'barcode')
            .populate('memberId', 'fname lname regNo')
            .lean();
        return res.status(200).json({ success: true, data: loans.map(serializeMongoRecord) });
    } catch (error) {
        return errorResponse(res, error);
    }
};

const getLoan = async (req, res) => {
    if (!assertRecordId(req.params.id)) {
        return res.status(400).json({ success: false, message: 'Loan ID is invalid.' });
    }
    try {
        const loan = await Loan.findById(req.params.id)
            .populate('bookId', 'title authorName')
            .populate('copyId', 'barcode')
            .populate('memberId', 'fname lname regNo')
            .lean();
        if (!loan) return res.status(404).json({ success: false, message: 'Loan not found.' });
        if (!canAccessMember(req.member, loan.memberId?._id?.toString() || loan.memberId?.toString())) {
            return res.status(403).json({ success: false, message: 'You cannot view another member’s loan.' });
        }
        return res.status(200).json({ success: true, data: serializeMongoRecord(loan) });
    } catch (error) {
        return errorResponse(res, error);
    }
};

const borrowBook = async (req, res) => {
    const { memberId, bookId } = req.body || {};
    if (
        typeof memberId !== 'string' || !assertRecordId(memberId) ||
        typeof bookId !== 'string' || !assertRecordId(bookId)
    ) {
        return res.status(400).json({ success: false, message: 'Valid memberId and bookId are required.' });
    }
    if (!canAccessMember(req.member, memberId)) {
        return res.status(403).json({ success: false, message: 'You cannot borrow on behalf of another member.' });
    }

    try {
        const member = await Member.findById(memberId).select('status enrollmentStatus memberType role');
        if (!member || member.status !== 'ACTIVE') {
            return res.status(403).json({ success: false, message: 'Member account is not active.' });
        }
        if (member.role === 'MEMBER' && member.memberType === 'STUDENT' && member.enrollmentStatus !== 'VERIFIED') {
            return res.status(403).json({ success: false, message: 'Verify active student enrollment before borrowing.' });
        }
        const [activeLoans, outstandingFines] = await Promise.all([
            Loan.countDocuments({ memberId, status: { $in: ['ACTIVE', 'OVERDUE'] } }),
            Fine.exists({ memberId, status: { $in: ['OUTSTANDING', 'PARTIALLY_PAID'] } })
        ]);
        if (activeLoans >= MAX_ACTIVE_LOANS) {
            return res.status(409).json({ success: false, message: `Borrowing limit of ${MAX_ACTIVE_LOANS} active books reached.` });
        }
        if (outstandingFines) {
            return res.status(409).json({ success: false, message: 'Outstanding fines must be resolved before borrowing.' });
        }

        await expireReadyReservations();
        const reservation = await Reservation.findOneAndUpdate(
            { memberId, bookId, status: 'READY', expiresAt: { $gt: new Date() } },
            { $set: { status: 'FULFILLED' }, $unset: { activeKey: 1 } },
            { new: true, sort: { createdAt: 1 } }
        );
        const bookFilter = { _id: bookId, status: 'ACTIVE', availableCopies: { $gt: 0 } };
        if (!reservation) {
            const waiting = await Reservation.exists({ bookId, status: { $in: ['WAITING', 'READY'] } });
            if (waiting) {
                return res.status(409).json({ success: false, message: 'This title is held for a reservation queue.' });
            }
        }

        const hasManagedCopies = await BookCopy.exists({ bookId });
        let copy;
        if (reservation?.copyId) {
            copy = await BookCopy.findOneAndUpdate(
                { _id: reservation.copyId, bookId, status: 'HELD' },
                { $set: { status: 'ON_LOAN' } },
                { new: true }
            );
        } else if (!reservation && hasManagedCopies) {
            copy = await BookCopy.findOneAndUpdate(
                { bookId, status: 'AVAILABLE' },
                { $set: { status: 'ON_LOAN' } },
                { new: true, sort: { barcode: 1 } }
            );
            if (copy) {
                const decremented = await Book.findOneAndUpdate(
                    bookFilter,
                    { $inc: { availableCopies: -1 } },
                    { new: true }
                );
                if (!decremented) {
                    await BookCopy.updateOne({ _id: copy._id, status: 'ON_LOAN' }, { $set: { status: 'AVAILABLE' } });
                    copy = null;
                }
            }
        }
        const book = reservation
            ? (reservation.copyId ? (copy ? { _id: bookId } : null) : await Book.findOne({ _id: bookId, status: 'ACTIVE' }).select('_id'))
            : (hasManagedCopies
                ? (copy ? { _id: bookId } : null)
                : await Book.findOneAndUpdate(bookFilter, { $inc: { availableCopies: -1 } }, { new: true }));
        if (!book) {
            if (copy && !reservation) {
                await BookCopy.updateOne({ _id: copy._id, status: 'ON_LOAN' }, { $set: { status: 'AVAILABLE' } });
                await Book.updateOne({ _id: bookId }, { $inc: { availableCopies: 1 } });
            }
            if (reservation) {
                await Reservation.updateOne({ _id: reservation._id, status: 'FULFILLED' }, {
                    $set: { status: 'READY', expiresAt: reservation.expiresAt }
                });
            }
            return res.status(409).json({ success: false, message: 'No copy is currently available.' });
        }

        try {
            const loan = await Loan.create({
                memberId,
                bookId,
                ...(copy ? { copyId: copy._id } : (reservation?.copyId ? { copyId: reservation.copyId } : {})),
                issuedDate: new Date(),
                dueDate: new Date(Date.now() + LOAN_DAYS * 24 * 60 * 60 * 1000)
            });
            try {
                const bookTitle = await Book.findById(bookId).select('title').lean();
                await notifyMember({
                    memberId,
                    eventType: 'LOAN_CHECKED_OUT',
                    subject: 'Library borrowing confirmation',
                    body: `Your loan for "${bookTitle?.title || 'the selected title'}" is due on ${loan.dueDate.toISOString().slice(0, 10)}.`
                });
            } catch (notificationError) {
                console.error('Loan was created, but its notification could not be queued:', notificationError);
            }
            return res.status(201).json({ success: true, data: serializeMongoRecord(loan) });
        } catch (error) {
            if (!reservation) {
                if (copy) {
                    await BookCopy.updateOne({ _id: copy._id, status: 'ON_LOAN' }, { $set: { status: 'AVAILABLE' } });
                    await Book.updateOne({ _id: bookId }, { $inc: { availableCopies: 1 } });
                } else {
                    await Book.updateOne({ _id: bookId }, { $inc: { availableCopies: 1 } });
                }
            }
            if (reservation?.copyId) {
                await BookCopy.updateOne({ _id: reservation.copyId, status: 'ON_LOAN' }, { $set: { status: 'HELD' } });
            }
            if (reservation) {
                await Reservation.updateOne({ _id: reservation._id }, { $set: { status: 'READY', expiresAt: reservation.expiresAt } });
            }
            throw error;
        }
    } catch (error) {
        return errorResponse(res, error);
    }
};

const returnLoan = async (req, res) => {
    if (!assertRecordId(req.params.id)) return res.status(400).json({ success: false, message: 'Loan ID is invalid.' });
    try {
        const loan = await Loan.findById(req.params.id);
        if (!loan) return res.status(404).json({ success: false, message: 'Loan not found.' });
        if (!canAccessMember(req.member, loan.memberId.toString())) {
            return res.status(403).json({ success: false, message: 'You cannot return another member’s loan.' });
        }

        const returnedDate = new Date();
        const updated = await Loan.findOneAndUpdate(
            { _id: loan._id, status: { $in: ['ACTIVE', 'OVERDUE'] } },
            { $set: { status: 'RETURNED', returnedDate } },
            { new: true }
        );
        if (!updated) return res.status(409).json({ success: false, message: 'Loan has already been returned.' });

        const book = await Book.findById(loan.bookId).select('status');
        if (loan.copyId) {
            const copyUpdate = await BookCopy.updateOne(
                { _id: loan.copyId, status: 'ON_LOAN' },
                { $set: { status: 'AVAILABLE' } }
            );
            if (copyUpdate.modifiedCount !== 1) {
                console.error('Returned loan copy was not marked available:', loan.copyId.toString());
                await Loan.updateOne(
                    { _id: loan._id, status: 'RETURNED', returnedDate },
                    { $set: { status: loan.status }, $unset: { returnedDate: 1 } }
                );
                return res.status(500).json({ success: false, message: 'Loan was returned, but its copy status could not be updated. Contact library staff.' });
            }
        }
        if (book?.status === 'ACTIVE') {
            await Book.updateOne({ _id: loan.bookId, status: 'ACTIVE' }, { $inc: { availableCopies: 1 } });
        }
        try {
            await upsertOverdueFine(loan, returnedDate);
        } catch (fineError) {
            console.error('Could not create overdue fine for returned loan:', fineError);
            return res.status(500).json({
                success: false,
                message: 'The loan was returned, but its overdue fine could not be recorded. Contact library staff.'
            });
        }
        await allocateNextHold(loan.bookId);
        try {
            await notifyMember({
                memberId: loan.memberId,
                eventType: 'LOAN_RETURNED',
                subject: 'Library return confirmation',
                body: 'Your library loan has been returned.'
            });
        } catch (notificationError) {
            console.error('Loan was returned, but its notification could not be queued:', notificationError);
        }
        return res.status(200).json({ success: true, data: serializeMongoRecord(updated) });
    } catch (error) {
        return errorResponse(res, error);
    }
};

const renewLoan = async (req, res) => {
    if (!assertRecordId(req.params.id)) return res.status(400).json({ success: false, message: 'Loan ID is invalid.' });
    try {
        const loan = await Loan.findById(req.params.id);
        if (!loan) return res.status(404).json({ success: false, message: 'Loan not found.' });
        if (!canAccessMember(req.member, loan.memberId.toString())) {
            return res.status(403).json({ success: false, message: 'You cannot renew another member’s loan.' });
        }
        if (loan.status !== 'ACTIVE' || loan.dueDate < new Date()) {
            return res.status(409).json({ success: false, message: 'Only active, not-yet-due loans can be renewed.' });
        }
        if (loan.renewedCount >= 1) {
            return res.status(409).json({ success: false, message: 'This loan has already been renewed.' });
        }
        if (await Reservation.exists({ bookId: loan.bookId, status: { $in: ['WAITING', 'READY'] } })) {
            return res.status(409).json({ success: false, message: 'This title has an active reservation queue.' });
        }
        const updated = await Loan.findOneAndUpdate(
            { _id: loan._id, status: 'ACTIVE', renewedCount: 0, dueDate: { $gt: new Date() } },
            { $inc: { renewedCount: 1 }, $set: { dueDate: new Date(loan.dueDate.getTime() + LOAN_DAYS * 24 * 60 * 60 * 1000) } },
            { new: true }
        );
        if (!updated) return res.status(409).json({ success: false, message: 'Loan could not be renewed.' });
        return res.status(200).json({ success: true, data: serializeMongoRecord(updated) });
    } catch (error) {
        return errorResponse(res, error);
    }
};

module.exports = { listLoans, getLoan, borrowBook, returnLoan, renewLoan };
