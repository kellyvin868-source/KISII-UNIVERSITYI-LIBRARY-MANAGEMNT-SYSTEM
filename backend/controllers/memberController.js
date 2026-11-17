const Member = require('../models/memberModel');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const TOKEN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const cookieOptions = () => ({
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/'
});

const issueToken = (member) => {
    if (!process.env.JWT_SECRET_KEY) {
        const error = new Error('Authentication is not configured.');
        error.statusCode = 503;
        throw error;
    }

    return jwt.sign({
        memberID: member._id.toString(),
        tokenVersion: member.tokenVersion
    }, process.env.JWT_SECRET_KEY, { expiresIn: '7d' });
};

const handleError = (res, error) => {
    if (error.code === 11000) {
        return res.status(409).json({
            success: false,
            message: 'An account with this email already exists.'
        });
    }
    if (error.name === 'ValidationError') {
        return res.status(400).json({
            success: false,
            message: 'Member details are invalid.'
        });
    }
    if (error.statusCode) {
        return res.status(error.statusCode).json({
            success: false,
            message: error.message
        });
    }

    console.error('Member authentication request failed:', error);
    return res.status(500).json({
        success: false,
        message: 'The authentication request could not be completed.'
    });
};

const registerMember = async (req, res) => {
    try {
        const { fname, lname, email, password, phone, regNo } = req.body || {};
        if (
            typeof fname !== 'string' || !fname.trim() ||
            typeof lname !== 'string' || !lname.trim() ||
            typeof email !== 'string' || !email.trim() ||
            typeof password !== 'string' || !password
        ) {
            return res.status(400).json({
                success: false,
                message: 'First name, last name, email, and password are required.'
            });
        }

        const normalizedEmail = email.trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
            return res.status(400).json({
                success: false,
                message: 'Enter a valid email address.'
            });
        }
        if (password.length < 8 || Buffer.byteLength(password, 'utf8') > 72) {
            return res.status(400).json({
                success: false,
                message: 'Password must be at least 8 characters and no more than 72 bytes.'
            });
        }
        if (phone !== undefined && phone !== null && typeof phone !== 'string') {
            return res.status(400).json({
                success: false,
                message: 'Phone number must be a string.'
            });
        }
        if (regNo !== undefined && (
            typeof regNo !== 'string' ||
            !/^[A-Z0-9/-]{3,30}$/i.test(regNo.trim())
        )) {
            return res.status(400).json({
                success: false,
                message: 'Registration number must be 3 to 30 letters, numbers, slashes, or hyphens.'
            });
        }
        if (!process.env.JWT_SECRET_KEY) {
            return res.status(503).json({
                success: false,
                message: 'Authentication is not configured.'
            });
        }

        const existingMember = await Member.findOne({ email: normalizedEmail }).select('_id');
        if (existingMember) {
            return res.status(409).json({
                success: false,
                message: 'An account with this email already exists.'
            });
        }

        const member = await Member.create({
            fname: fname.trim(),
            lname: lname.trim(),
            email: normalizedEmail,
            password: await bcrypt.hash(password, 10),
            phone: typeof phone === 'string' && phone.trim() ? phone.trim() : undefined,
            regNo: typeof regNo === 'string' && regNo.trim() ? regNo.trim().toUpperCase() : undefined
        });

        const token = issueToken(member);
        res.cookie('token', token, {
            ...cookieOptions(),
            maxAge: TOKEN_MAX_AGE_MS
        });

        return res.status(201).json({
            success: true,
            message: 'Member registered successfully.'
        });
    } catch (error) {
        return handleError(res, error);
    }
};

const loginMember = async (req, res) => {
    try {
        const { email, password } = req.body || {};
        if (typeof email !== 'string' || !email.trim() || typeof password !== 'string' || !password) {
            return res.status(400).json({
                success: false,
                message: 'Email and password are required.'
            });
        }

        if (!process.env.JWT_SECRET_KEY) {
            return res.status(503).json({
                success: false,
                message: 'Authentication is not configured.'
            });
        }

        const member = await Member.findOne({ email: email.trim().toLowerCase() })
            .select('+password');
        const isMatch = member ? await bcrypt.compare(password, member.password) : false;
        if (!member || !isMatch) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password.'
            });
        }
        if (member.status !== 'ACTIVE') {
            return res.status(403).json({
                success: false,
                message: 'This account is not active.'
            });
        }

        const token = issueToken(member);
        res.cookie('token', token, {
            ...cookieOptions(),
            maxAge: TOKEN_MAX_AGE_MS
        });

        return res.status(200).json({
            success: true,
            message: 'Login successful.'
        });
    } catch (error) {
        return handleError(res, error);
    }
};

const logoutMember = async (req, res) => {
    try {
        await Member.updateOne({ _id: req.member._id }, { $inc: { tokenVersion: 1 } });
        res.clearCookie('token', cookieOptions());
        return res.status(200).json({
            success: true,
            message: 'Logout successful.'
        });
    } catch (error) {
        return handleError(res, error);
    }
};

const getCurrentMember = (req, res) => res.status(200).json({
    success: true,
    data: {
        id: req.member._id,
        fname: req.member.fname,
        lname: req.member.lname,
        email: req.member.email,
        phone: req.member.phone,
        role: req.member.role,
        regNo: req.member.regNo,
        memberType: req.member.memberType,
        enrollmentStatus: req.member.enrollmentStatus
    }
});

module.exports = {
    registerMember,
    loginMember,
    logoutMember,
    getCurrentMember
};
