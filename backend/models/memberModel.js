const mongoose = require('mongoose');

const memberSchema = new mongoose.Schema({
    fname: {
        type: String,
        required: true,
        trim: true
    },
    lname: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        lowercase: true,
        trim: true,
        unique: true
    },
    password: {
        type: String,
        required: true,
        select: false
    },
    phone: {
        type: String,
        trim: true
    },
    regNo: {
        type: String,
        trim: true,
        uppercase: true,
        sparse: true,
        unique: true
    },
    memberType: {
        type: String,
        enum: ['STUDENT', 'STAFF'],
        default: 'STUDENT',
        required: true
    },
    enrollmentStatus: {
        type: String,
        enum: ['UNVERIFIED', 'VERIFIED', 'INACTIVE'],
        default: 'UNVERIFIED',
        required: true
    },
    verifiedAt: {
        type: Date
    },
    role: {
        type: String,
        enum: ['MEMBER', 'LIBRARIAN', 'ADMIN'],
        default: 'MEMBER',
        required: true
    },
    status: {
        type: String,
        enum: ['ACTIVE', 'DEACTIVATED'],
        default: 'ACTIVE',
        required: true
    },
    tokenVersion: {
        type: Number,
        default: 0,
        min: 0
    }
}, { timestamps: true });

module.exports = mongoose.model('Member', memberSchema);