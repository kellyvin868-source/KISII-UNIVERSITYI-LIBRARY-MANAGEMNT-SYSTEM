const express = require('express');
const mongoose = require('mongoose');
const Book = require('../models/bookModel');
const Category = require('../models/categoryModel');
const Loan = require('../models/loanModel');
const { authenticate, authorizeRoles } = require('../middlewares/authMiddleware');
const serializeMongoRecord = require('../utils/serializeMongoRecord');
const {
    AiServiceError,
    extractCatalogSearchTerms,
    generateLibraryAssistantResponse,
    generateRecommendations,
    suggestCategories
} = require('../services/aiService');

const aiRoute = express.Router();

aiRoute.get('/recommendations/:memberId', authenticate, async (req, res) => {
    const { memberId } = req.params;
    if (!mongoose.isValidObjectId(memberId)) {
        return res.status(400).json({ success: false, message: 'memberId is invalid.' });
    }
    if (!['LIBRARIAN', 'ADMIN'].includes(req.member.role) && req.member._id.toString() !== memberId) {
        return res.status(403).json({ success: false, message: 'You cannot view another member’s recommendations.' });
    }
    try {
        const history = await Loan.find({ memberId, status: { $in: ['ACTIVE', 'RETURNED', 'OVERDUE'] } })
            .sort({ issuedDate: -1 })
            .limit(20)
            .populate('bookId', 'title authorName categoryName')
            .lean();
        const borrowedBooks = history.filter((loan) => loan.bookId).map((loan) => ({
            title: loan.bookId.title,
            author: loan.bookId.authorName,
            category: loan.bookId.categoryName
        }));
        const excludedIds = history.map((loan) => loan.bookId?._id).filter(Boolean);
        const candidates = await Book.find({
            status: 'ACTIVE',
            availableCopies: { $gt: 0 },
            _id: { $nin: excludedIds }
        }).select('title authorName categoryName isbn description availableCopies').limit(40).lean();
        if (candidates.length === 0) {
            return res.status(200).json({ success: true, data: { recommendations: [], model: null } });
        }

        const modelCandidates = candidates.map((book) => ({
            id: book._id.toString(),
            title: book.title,
            author: book.authorName,
            category: book.categoryName,
            description: book.description
        }));
        const result = await generateRecommendations(borrowedBooks, modelCandidates);
        const ordered = result.bookIds.map((id) => candidates.find((book) => book._id.toString() === id)).filter(Boolean);
        return res.status(200).json({
            success: true,
            data: {
                recommendations: ordered.map(serializeMongoRecord),
                model: result.model
            }
        });
    } catch (error) {
        if (error instanceof AiServiceError) {
            return res.status(error.statusCode).json({ success: false, message: error.message });
        }
        console.error('Book recommendations failed:', error);
        return res.status(500).json({ success: false, message: 'Recommendations could not be generated.' });
    }
});

aiRoute.get('/search', async (req, res) => {
    const { q } = req.query;
    if (typeof q !== 'string' || !q.trim()) {
        return res.status(400).json({
            success: false,
            message: 'A non-empty q search parameter is required.'
        });
    }
    if (q.length > 500) {
        return res.status(400).json({
            success: false,
            message: 'Search query must be 500 characters or fewer.'
        });
    }

    try {
        const { terms, model } = await extractCatalogSearchTerms(q.trim());
        const books = await Book.find({
            status: 'ACTIVE',
            $text: { $search: terms.join(' ') }
        })
            .select('title authorId authorName categoryId categoryName isbn description availableCopies totalCopies')
            .sort({ score: { $meta: 'textScore' } })
            .limit(10)
            .lean();

        return res.status(200).json({
            success: true,
            data: {
                query: q.trim(),
                searchTerms: terms,
                model,
                books: books.map(serializeMongoRecord)
            }
        });
    } catch (error) {
        if (error instanceof AiServiceError) {
            return res.status(error.statusCode).json({
                success: false,
                message: error.message
            });
        }

        console.error('AI catalog search failed:', error);
        return res.status(500).json({
            success: false,
            message: 'AI catalog search failed.'
        });
    }
});

aiRoute.get('/forecast/demand', authenticate, authorizeRoles('LIBRARIAN', 'ADMIN'), async (req, res) => {
    try {
        const from = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);
        const counts = await Loan.aggregate([
            { $match: { issuedDate: { $gte: from } } },
            { $group: { _id: '$bookId', borrowCount: { $sum: 1 } } },
            { $sort: { borrowCount: -1 } },
            { $limit: 10 }
        ]);
        const books = await Book.find({
            _id: { $in: counts.map((item) => item._id) },
            status: 'ACTIVE'
        }).lean();
        const byId = new Map(books.map((book) => [book._id.toString(), book]));
        const forecasts = counts.map((item) => {
            const book = byId.get(item._id.toString());
            if (!book) return null;
            return {
                ...serializeMongoRecord(book),
                borrowingCountLast180Days: item.borrowCount,
                averageBorrowingsPerMonth: Math.round((item.borrowCount / 6) * 100) / 100
            };
        }).filter(Boolean);
        return res.status(200).json({
            success: true,
            data: {
                method: 'historical-borrowing-frequency',
                periodDays: 180,
                forecasts
            }
        });
    } catch (error) {
        console.error('Demand forecast failed:', error);
        return res.status(500).json({ success: false, message: 'Demand forecast could not be generated.' });
    }
});

aiRoute.post('/categorize', authenticate, authorizeRoles('LIBRARIAN', 'ADMIN'), async (req, res) => {
    const { title, summary, description } = req.body || {};
    const bookTitle = typeof title === 'string' ? title.trim() : '';
    const bookDescription = typeof description === 'string'
        ? description.trim()
        : (typeof summary === 'string' ? summary.trim() : '');
    if (!bookTitle || !bookDescription || bookTitle.length > 300 || bookDescription.length > 5000) {
        return res.status(400).json({
            success: false,
            message: 'title and description (or summary) are required within their length limits.'
        });
    }
    try {
        const categories = await Category.find().select('name').sort({ name: 1 }).lean();
        if (categories.length === 0) {
            return res.status(409).json({ success: false, message: 'Create catalog categories before requesting suggestions.' });
        }
        const categoryOptions = categories.map((category) => ({
            id: category._id.toString(),
            name: category.name
        }));
        const result = await suggestCategories(bookTitle, bookDescription, categoryOptions);
        const suggestions = result.categoryIds.map((id) => categories.find((category) => category._id.toString() === id))
            .filter(Boolean)
            .map(serializeMongoRecord);
        return res.status(200).json({
            success: true,
            data: { suggestions, model: result.model }
        });
    } catch (error) {
        if (error instanceof AiServiceError) {
            return res.status(error.statusCode).json({ success: false, message: error.message });
        }
        console.error('Book categorization failed:', error);
        return res.status(500).json({ success: false, message: 'Category suggestions could not be generated.' });
    }
});

aiRoute.post('/chat', async (req, res) => {
    const { message, sessionId } = req.body || {};

    if (typeof message !== 'string' || !message.trim()) {
        return res.status(400).json({
            success: false,
            message: 'A non-empty message is required.'
        });
    }
    if (message.length > 4000) {
        return res.status(400).json({
            success: false,
            message: 'Message must be 4000 characters or fewer.'
        });
    }
    if (sessionId !== undefined && (typeof sessionId !== 'string' || sessionId.length > 128)) {
        return res.status(400).json({
            success: false,
            message: 'sessionId must be a string of 128 characters or fewer.'
        });
    }

    try {
        const data = await generateLibraryAssistantResponse(message.trim());
        if (sessionId !== undefined) {
            data.sessionId = sessionId;
        }
        return res.status(200).json({ success: true, data });
    } catch (error) {
        if (error instanceof AiServiceError) {
            return res.status(error.statusCode).json({
                success: false,
                message: error.message
            });
        }

        console.error('AI chat request failed:', error);
        return res.status(500).json({
            success: false,
            message: 'AI chat request failed.'
        });
    }
});

module.exports = aiRoute;