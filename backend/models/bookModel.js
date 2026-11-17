const mongoose = require('mongoose');

const bookSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true
    },
    authorId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Author',
        required: true,
        index: true
    },
    authorName: {
        type: String,
        trim: true,
        default: ''
    },
    categoryId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Category',
        required: true,
        index: true
    },
    categoryName: {
        type: String,
        trim: true,
        default: ''
    },
    isbn: {
        type: String,
        required: true,
        trim: true,
        unique: true
    },
    description: {
        type: String,
        trim: true,
        default: ''
    },
    availableCopies: {
        type: Number,
        min: 0,
        default: 0
    },
    totalCopies: {
        type: Number,
        required: true,
        min: 0
    },
    status: {
        type: String,
        enum: ['ACTIVE', 'ARCHIVED'],
        default: 'ACTIVE',
        required: true
    }
}, { timestamps: true });

bookSchema.index({
    title: 'text',
    authorName: 'text',
    categoryName: 'text',
    isbn: 'text',
    description: 'text'
});

module.exports = mongoose.model('Book', bookSchema);