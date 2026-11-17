const Book = require('../models/bookModel');
const BookCopy = require('../models/bookCopyModel');
const Member = require('../models/memberModel');
const Reservation = require('../models/reservationModel');
const { notifyMember } = require('./notificationService');

const HOLD_DURATION_MS = 2 * 24 * 60 * 60 * 1000;

const allocateNextHold = async (bookId) => {
    const book = await Book.findOneAndUpdate(
        { _id: bookId, status: 'ACTIVE', availableCopies: { $gt: 0 } },
        { $inc: { availableCopies: -1 } },
        { new: true }
    );
    if (!book) return null;

    const hasManagedCopies = await BookCopy.exists({ bookId });
    let copy;
    if (hasManagedCopies) {
        copy = await BookCopy.findOneAndUpdate(
            { bookId, status: 'AVAILABLE' },
            { $set: { status: 'HELD' } },
            { new: true, sort: { barcode: 1 } }
        );
        if (!copy) {
            await Book.updateOne({ _id: bookId }, { $inc: { availableCopies: 1 } });
            return null;
        }
    }

    const reservation = await Reservation.findOneAndUpdate(
        { bookId, status: 'WAITING' },
        {
            $set: {
                status: 'READY',
                readyAt: new Date(),
                expiresAt: new Date(Date.now() + HOLD_DURATION_MS),
                ...(copy ? { copyId: copy._id } : {})
            },
            $unset: { queuePosition: 1 }
        },
        { new: true, sort: { createdAt: 1 } }
    );
    if (reservation) {
        try {
            const [member, heldBook] = await Promise.all([
                Member.findById(reservation.memberId).select('fname').lean(),
                Book.findById(bookId).select('title').lean()
            ]);
            await notifyMember({
                memberId: reservation.memberId,
                eventType: 'RESERVATION_READY',
                subject: 'Your library reservation is ready',
                body: `Hello ${member?.fname || 'member'}, a copy of "${heldBook?.title || 'your reserved book'}" is ready for collection. Please collect it within 2 days.`
            });
        } catch (error) {
            console.error('Reservation became ready, but its notification could not be queued:', error);
        }
        return reservation;
    }

    if (copy) {
        await BookCopy.updateOne({ _id: copy._id, status: 'HELD' }, { $set: { status: 'AVAILABLE' } });
    }
    await Book.updateOne({ _id: bookId }, { $inc: { availableCopies: 1 } });
    return null;
};

const expireReadyReservations = async () => {
    const expired = await Reservation.find({
        status: 'READY',
        expiresAt: { $lte: new Date() }
    }).select('_id bookId copyId').lean();

    for (const reservation of expired) {
        const result = await Reservation.updateOne(
            { _id: reservation._id, status: 'READY', expiresAt: { $lte: new Date() } },
            { $set: { status: 'EXPIRED' }, $unset: { expiresAt: 1, activeKey: 1, copyId: 1 } }
        );
        if (result.modifiedCount === 1) {
            if (reservation.copyId) {
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
    }

    return expired.length;
};

module.exports = { allocateNextHold, expireReadyReservations };
