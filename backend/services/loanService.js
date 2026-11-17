const Fine = require('../models/fineModel');
const Loan = require('../models/loanModel');

const DAY_MS = 24 * 60 * 60 * 1000;
const BATCH_SIZE = 500;

const upsertOverdueFine = async (loan, asOf = new Date()) => {
    const lateDays = Math.max(0, Math.ceil((asOf - loan.dueDate) / DAY_MS));
    if (lateDays === 0) return null;

    const finePerDay = Number(process.env.OVERDUE_FINE_PER_DAY || 10);
    if (!Number.isFinite(finePerDay) || finePerDay < 0) {
        throw new Error('OVERDUE_FINE_PER_DAY must be a non-negative number.');
    }

    const fine = await Fine.findOneAndUpdate(
        { loanId: loan._id, reason: 'OVERDUE' },
        {
            $setOnInsert: { memberId: loan.memberId, reason: 'OVERDUE', paidAmount: 0 },
            $set: { amount: lateDays * finePerDay, description: `${lateDays} overdue day(s)` }
        },
        { new: true, upsert: true, runValidators: true }
    );
    fine.status = fine.paidAmount >= fine.amount
        ? 'PAID'
        : (fine.paidAmount > 0 ? 'PARTIALLY_PAID' : 'OUTSTANDING');
    await fine.save();
    return fine;
};

const processOverdueLoans = async () => {
    const now = new Date();
    const finePerDay = Number(process.env.OVERDUE_FINE_PER_DAY || 10);
    if (!Number.isFinite(finePerDay) || finePerDay < 0) {
        throw new Error('OVERDUE_FINE_PER_DAY must be a non-negative number.');
    }

    await Loan.updateMany(
        { status: 'ACTIVE', dueDate: { $lt: now } },
        { $set: { status: 'OVERDUE' } }
    );

    let lastId;
    let processed = 0;
    while (true) {
        const filter = { status: 'OVERDUE', dueDate: { $lt: now } };
        if (lastId) filter._id = { $gt: lastId };
        const loans = await Loan.find(filter)
            .select('_id memberId dueDate')
            .sort({ _id: 1 })
            .limit(BATCH_SIZE)
            .lean();
        if (loans.length === 0) break;

        for (const loan of loans) {
            await upsertOverdueFine(loan, now);
            processed += 1;
        }
        lastId = loans[loans.length - 1]._id;
        if (loans.length < BATCH_SIZE) break;
    }

    return processed;
};

module.exports = { processOverdueLoans, upsertOverdueFine };
