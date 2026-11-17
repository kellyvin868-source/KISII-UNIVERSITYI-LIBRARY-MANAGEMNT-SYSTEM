const mongoose = require('mongoose');

const loanSchema = new mongoose.Schema({
    memberId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Member',
        required: true,
        index: true
    },
    bookId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Book',
        required: true,
        index: true
    },
    copyId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'BookCopy',
        index: true
    },
    issuedDate: {
        type: Date,
        required: true,
        default: Date.now
    },
    dueDate: {
        type: Date,
        required: true
    },
    returnedDate: {
        type: Date
    },
    renewedCount: {
        type: Number,
        min: 0,
        default: 0
    },
    status: {
        type: String,
        enum: ['ACTIVE', 'RETURNED', 'OVERDUE'],
        default: 'ACTIVE',
        required: true,
        index: true
    }
}, { timestamps: true });

loanSchema.index({ memberId: 1, status: 1 });
loanSchema.index({ bookId: 1, status: 1 });
loanSchema.index({ dueDate: 1, status: 1 });

module.exports = mongoose.model('Loan', loanSchema);