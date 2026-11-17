const jwt = require('jsonwebtoken');
const Member = require('../models/memberModel');

const authenticate = async (req, res, next) => {
    const authorization = req.get('authorization');
    const token = authorization
        ? (authorization.startsWith('Bearer ') ? authorization.slice(7) : null)
        : req.cookies?.token;

    if (!token) {
        return res.status(401).json({
            success: false,
            message: 'Authentication is required.'
        });
    }
    if (!process.env.JWT_SECRET_KEY) {
        return res.status(503).json({
            success: false,
            message: 'Authentication is not configured.'
        });
    }

    let payload;
    try {
        payload = jwt.verify(token, process.env.JWT_SECRET_KEY);
    } catch {
        return res.status(401).json({
            success: false,
            message: 'Authentication token is invalid or expired.'
        });
    }

    if (!payload || typeof payload.memberID !== 'string') {
        return res.status(401).json({
            success: false,
            message: 'Authentication token is invalid.'
        });
    }

    try {
        const member = await Member.findById(payload.memberID)
            .select('fname lname email phone regNo memberType enrollmentStatus role status tokenVersion');
        if (!member) {
            return res.status(401).json({
                success: false,
                message: 'The account for this token no longer exists.'
            });
        }
        if (member.status !== 'ACTIVE') {
            return res.status(403).json({
                success: false,
                message: 'This account is not active.'
            });
        }
        if (!Number.isInteger(payload.tokenVersion) || payload.tokenVersion !== member.tokenVersion) {
            return res.status(401).json({
                success: false,
                message: 'Authentication token has been revoked.'
            });
        }

        req.member = member;
        return next();
    } catch (error) {
        console.error('Authentication lookup failed:', error);
        return res.status(500).json({
            success: false,
            message: 'Authentication could not be completed.'
        });
    }
};

const authorizeRoles = (...roles) => (req, res, next) => {
    if (!req.member || !roles.includes(req.member.role)) {
        return res.status(403).json({
            success: false,
            message: 'You do not have permission to perform this action.'
        });
    }
    return next();
};

module.exports = {
    authenticate,
    authorizeRoles
};