const mongoose = require('mongoose');

const fineSchema = new mongoose.Schema({
    memberId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Member',
        required: true,
        index: true
    },
    loanId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Loan',
        index: true
    },
    amount: {
        type: Number,
        required: true,
        min: 0
    },
    paidAmount: {
        type: Number,
        min: 0,
        default: 0
    },
    appliedPaymentIds: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Payment'
    }],
    reason: {
        type: String,
        enum: ['OVERDUE', 'DAMAGE', 'OTHER'],
        required: true
    },
    status: {
        type: String,
        enum: ['OUTSTANDING', 'PARTIALLY_PAID', 'PAID'],
        default: 'OUTSTANDING',
        required: true,
        index: true
    },
    description: {
        type: String,
        trim: true,
        maxlength: 500
    },
    damage: {
        type: Boolean,
        default: false
    }
}, { timestamps: true });

fineSchema.index({ memberId: 1, status: 1 });
fineSchema.index({ loanId: 1, reason: 1 }, { unique: true, partialFilterExpression: { reason: 'OVERDUE' } });

module.exports = mongoose.model('Fine', fineSchema);