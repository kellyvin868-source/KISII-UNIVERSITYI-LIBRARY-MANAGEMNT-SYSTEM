const Member = require('../models/memberModel');
const { verifyStudentRegistration } = require('../services/registryService');

const verifyStudent = async (req, res) => {
    const regNo = req.params.regNo.trim().toUpperCase();
    if (!/^[A-Z0-9/-]{3,30}$/.test(regNo)) {
        return res.status(400).json({ success: false, message: 'Registration number format is invalid.' });
    }

    try {
        const member = await Member.findOne({ regNo }).select('_id role');
        if (!member) return res.status(404).json({ success: false, message: 'No library account is linked to this registration number.' });
        if (!['ADMIN', 'LIBRARIAN'].includes(req.member.role) && req.member._id.toString() !== member._id.toString()) {
            return res.status(403).json({ success: false, message: 'You cannot verify another member’s enrollment.' });
        }

        const result = await verifyStudentRegistration(regNo);
        const updated = await Member.findByIdAndUpdate(member._id, {
            $set: {
                enrollmentStatus: result.verified ? 'VERIFIED' : 'INACTIVE',
                ...(result.verified ? { verifiedAt: new Date() } : {})
            }
        }, { new: true }).select('_id regNo enrollmentStatus verifiedAt').lean();

        return res.status(200).json({
            success: true,
            data: {
                regNo: updated.regNo,
                verified: result.verified,
                enrollmentStatus: updated.enrollmentStatus,
                verifiedAt: updated.verifiedAt
            }
        });
    } catch (error) {
        if (error.statusCode) {
            return res.status(error.statusCode).json({ success: false, message: error.message });
        }
        console.error('Student registry verification failed:', error);
        return res.status(500).json({ success: false, message: 'Student enrollment could not be verified.' });
    }
};

const lookupIsbn = async (req, res) => {
    const isbn = req.params.isbn.replace(/[-\s]/g, '');
    if (!/^(?:\d{10}|\d{13})$/.test(isbn)) {
        return res.status(400).json({ success: false, message: 'ISBN must contain 10 or 13 digits.' });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
        const response = await fetch(
            `https://www.googleapis.com/books/v1/volumes?q=isbn:${encodeURIComponent(isbn)}`,
            { signal: controller.signal }
        );
        if (!response.ok) {
            return res.status(502).json({ success: false, message: `ISBN provider returned HTTP ${response.status}.` });
        }
        const result = await response.json();
        const info = result.items?.[0]?.volumeInfo;
        if (!info) return res.status(404).json({ success: false, message: 'No book metadata was found for this ISBN.' });

        return res.status(200).json({
            success: true,
            data: {
                title: info.title || '',
                authors: Array.isArray(info.authors) ? info.authors : [],
                publisher: info.publisher || '',
                publishedDate: info.publishedDate || '',
                description: info.description || '',
                isbn
            }
        });
    } catch (error) {
        const statusCode = error.name === 'AbortError' ? 504 : 502;
        return res.status(statusCode).json({
            success: false,
            message: error.name === 'AbortError' ? 'ISBN provider request timed out.' : 'Unable to reach the ISBN provider.'
        });
    } finally {
        clearTimeout(timeout);
    }
};

module.exports = { verifyStudent, lookupIsbn };
