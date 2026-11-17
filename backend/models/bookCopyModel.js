const mongoose = require('mongoose');

const bookCopySchema = new mongoose.Schema({
    bookId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Book',
        required: true,
        index: true
    },
    barcode: {
        type: String,
        trim: true
    },
    status: {
        type: String,
        enum: ['AVAILABLE', 'HELD', 'ON_LOAN', 'DAMAGED', 'LOST', 'WITHDRAWN'],
        default: 'AVAILABLE',
        required: true,
        index: true
    },
    conditionNote: {
        type: String,
        maxlength: 500,
        trim: true
    }
}, { timestamps: true });

bookCopySchema.index({ bookId: 1, status: 1 });
bookCopySchema.index(
    { barcode: 1 },
    { unique: true, partialFilterExpression: { barcode: { $type: 'string' } } }
);

module.exports = mongoose.model('BookCopy', bookCopySchema);
