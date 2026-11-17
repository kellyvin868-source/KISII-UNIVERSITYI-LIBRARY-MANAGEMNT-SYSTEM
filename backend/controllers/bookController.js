const mongoose = require('mongoose');
const Book = require('../models/bookModel');
const BookCopy = require('../models/bookCopyModel');
const Author = require('../models/authorModel');
const Category = require('../models/categoryModel');
const serializeMongoRecord = require('../utils/serializeMongoRecord');

const sendError = (res, error) => {
    if (error.code === 11000) {
        return res.status(409).json({
            success: false,
            message: 'A record with that ISBN or name already exists.'
        });
    }
    if (error.name === 'ValidationError' || error.name === 'CastError') {
        return res.status(400).json({
            success: false,
            message: 'The supplied catalog data is invalid.'
        });
    }

    console.error('Catalog request failed:', error);
    return res.status(500).json({
        success: false,
        message: 'The catalog request could not be completed.'
    });
};

const validateBookInput = (body) => {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return 'A JSON book object is required.';
    }
    if (typeof body.title !== 'string' || !body.title.trim() || body.title.length > 300) {
        return 'Title is required and must be 300 characters or fewer.';
    }
    if (
        typeof body.authorId !== 'string' ||
        !mongoose.isValidObjectId(body.authorId)
    ) {
        return 'A valid authorId is required.';
    }
    if (
        typeof body.categoryId !== 'string' ||
        !mongoose.isValidObjectId(body.categoryId)
    ) {
        return 'A valid categoryId is required.';
    }
    if (typeof body.isbn !== 'string' || !body.isbn.trim() || body.isbn.length > 20) {
        return 'ISBN is required and must be 20 characters or fewer.';
    }
    if (!Number.isInteger(body.totalCopies) || body.totalCopies < 0) {
        return 'totalCopies must be a non-negative integer.';
    }
    if (
        body.description !== undefined &&
        (typeof body.description !== 'string' || body.description.length > 5000)
    ) {
        return 'Description must be a string of 5000 characters or fewer.';
    }
    return null;
};

const resolveAuthorAndCategory = async (authorId, categoryId) => {
    const [author, category] = await Promise.all([
        Author.findById(authorId).select('name'),
        Category.findById(categoryId).select('name')
    ]);
    return { author, category };
};

const listBooks = async (req, res) => {
    const query = typeof req.query.query === 'string' ? req.query.query.trim() : '';
    const page = req.query.page === undefined ? 1 : Number(req.query.page);
    const limit = req.query.limit === undefined ? 20 : Number(req.query.limit);

    if (query.length > 200) {
        return res.status(400).json({ success: false, message: 'query must be 200 characters or fewer.' });
    }
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
        return res.status(400).json({
            success: false,
            message: 'page must be positive and limit must be between 1 and 100.'
        });
    }

    const filter = { status: 'ACTIVE' };
    if (req.query.categoryId !== undefined) {
        if (
            typeof req.query.categoryId !== 'string' ||
            !mongoose.isValidObjectId(req.query.categoryId)
        ) {
            return res.status(400).json({ success: false, message: 'categoryId must be a valid ID.' });
        }
        filter.categoryId = req.query.categoryId;
    }
    if (query) filter.$text = { $search: query };
    if (req.query.authorId !== undefined) {
        if (typeof req.query.authorId !== 'string' || !mongoose.isValidObjectId(req.query.authorId)) {
            return res.status(400).json({ success: false, message: 'authorId must be a valid ID.' });
        }
        filter.authorId = req.query.authorId;
    }
    if (req.query.isbn !== undefined) {
        if (typeof req.query.isbn !== 'string' || req.query.isbn.length > 20) {
            return res.status(400).json({ success: false, message: 'isbn must be a string of 20 characters or fewer.' });
        }
        filter.isbn = req.query.isbn.trim();
    }
    if (req.query.available !== undefined) {
        if (!['true', 'false'].includes(req.query.available)) {
            return res.status(400).json({ success: false, message: 'available must be true or false.' });
        }
        filter.availableCopies = req.query.available === 'true' ? { $gt: 0 } : 0;
    }

    try {
        let bookQuery = Book.find(filter);
        if (req.query.sort === 'title') bookQuery = bookQuery.sort({ title: 1 });
        else if (req.query.sort === 'title_desc') bookQuery = bookQuery.sort({ title: -1 });
        else if (req.query.sort === 'created_asc') bookQuery = bookQuery.sort({ createdAt: 1 });
        else bookQuery = bookQuery.sort(query ? { score: { $meta: 'textScore' } } : { createdAt: -1 });
        const [total, books] = await Promise.all([
            Book.countDocuments(filter),
            bookQuery.skip((page - 1) * limit).limit(limit).lean()
        ]);
        return res.status(200).json({
            total,
            page,
            limit,
            data: books.map(serializeMongoRecord)
        });
    } catch (error) {
        return sendError(res, error);
    }
};

const getBook = async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
        return res.status(400).json({ success: false, message: 'Book ID is invalid.' });
    }

    try {
        const book = await Book.findOne({ _id: req.params.id, status: 'ACTIVE' }).lean();
        if (!book) return res.status(404).json({ success: false, message: 'Book not found.' });
        return res.status(200).json(serializeMongoRecord(book));
    } catch (error) {
        return sendError(res, error);
    }
};

const createBook = async (req, res) => {
    const validationError = validateBookInput(req.body);
    if (validationError) return res.status(400).json({ success: false, message: validationError });

    try {
        const { author, category } = await resolveAuthorAndCategory(req.body.authorId, req.body.categoryId);
        if (!author || !category) {
            return res.status(400).json({
                success: false,
                message: 'authorId and categoryId must reference existing records.'
            });
        }

        const suppliedBarcodes = req.body.copyBarcodes;
        const copyBarcodes = typeof suppliedBarcodes === 'string' && !suppliedBarcodes.trim()
            ? undefined
            : suppliedBarcodes;
        if (copyBarcodes !== undefined && (
            !Array.isArray(copyBarcodes) ||
            copyBarcodes.length !== req.body.totalCopies ||
            copyBarcodes.some((barcode) => typeof barcode !== 'string' || !barcode.trim()) ||
            new Set(copyBarcodes.map((barcode) => barcode.trim())).size !== copyBarcodes.length
        )) {
            return res.status(400).json({
                success: false,
                message: 'copyBarcodes must contain one unique non-empty barcode per copy.'
            });
        }

        const book = await Book.create({
            title: req.body.title.trim(),
            authorId: author._id,
            authorName: author.name,
            categoryId: category._id,
            categoryName: category.name,
            isbn: req.body.isbn.trim(),
            description: req.body.description?.trim() || '',
            totalCopies: req.body.totalCopies,
            availableCopies: req.body.totalCopies
        });
        if (copyBarcodes?.length) {
            try {
                await BookCopy.insertMany(copyBarcodes.map((barcode) => ({
                    bookId: book._id,
                    barcode: barcode.trim()
                })), { ordered: true });
            } catch (error) {
                await BookCopy.deleteMany({ bookId: book._id });
                await Book.deleteOne({ _id: book._id });
                throw error;
            }
        }
        return res.status(201).json(serializeMongoRecord(book));
    } catch (error) {
        return sendError(res, error);
    }
};

const listBookCopies = async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
        return res.status(400).json({ success: false, message: 'Book ID is invalid.' });
    }
    try {
        const book = await Book.findOne({ _id: req.params.id, status: 'ACTIVE' }).select('_id');
        if (!book) return res.status(404).json({ success: false, message: 'Book not found.' });
        const copies = await BookCopy.find({ bookId: book._id }).sort({ barcode: 1 }).lean();
        return res.status(200).json({ success: true, data: copies.map(serializeMongoRecord) });
    } catch (error) {
        return sendError(res, error);
    }
};

const createBookCopy = async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
        return res.status(400).json({ success: false, message: 'Book ID is invalid.' });
    }
    const barcode = req.body?.barcode;
    if (
        barcode !== undefined &&
        (typeof barcode !== 'string' || barcode.trim().length > 100)
    ) {
        return res.status(400).json({ success: false, message: 'Barcode must be a string of at most 100 characters.' });
    }
    try {
        const book = await Book.findOneAndUpdate(
            { _id: req.params.id, status: 'ACTIVE' },
            { $inc: { totalCopies: 1, availableCopies: 1 } },
            { new: true }
        );
        if (!book) return res.status(404).json({ success: false, message: 'Book not found.' });
        try {
            const copyData = { bookId: book._id };
            if (barcode?.trim()) copyData.barcode = barcode.trim();
            const copy = await BookCopy.create(copyData);
            return res.status(201).json(serializeMongoRecord(copy));
        } catch (error) {
            await Book.updateOne({ _id: book._id }, { $inc: { totalCopies: -1, availableCopies: -1 } });
            throw error;
        }
    } catch (error) {
        return sendError(res, error);
    }
};

const updateBookCopy = async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.copyId)) {
        return res.status(400).json({ success: false, message: 'Copy ID is invalid.' });
    }
    const { status, conditionNote } = req.body || {};
    if (status !== undefined && !['AVAILABLE', 'DAMAGED', 'LOST', 'WITHDRAWN'].includes(status)) {
        return res.status(400).json({ success: false, message: 'Copy status is invalid.' });
    }
    if (conditionNote !== undefined && (typeof conditionNote !== 'string' || conditionNote.length > 500)) {
        return res.status(400).json({ success: false, message: 'conditionNote must be 500 characters or fewer.' });
    }
    try {
        const copy = await BookCopy.findById(req.params.copyId);
        if (!copy) return res.status(404).json({ success: false, message: 'Book copy not found.' });
        if (copy.status === 'ON_LOAN') {
            return res.status(409).json({ success: false, message: 'A loaned copy can only be updated during its return.' });
        }
        const oldStatus = copy.status;
        const newStatus = status ?? oldStatus;
        const oldAvailable = oldStatus === 'AVAILABLE' ? 1 : 0;
        const newAvailable = newStatus === 'AVAILABLE' ? 1 : 0;
        const oldCounted = oldStatus !== 'WITHDRAWN' ? 1 : 0;
        const newCounted = newStatus !== 'WITHDRAWN' ? 1 : 0;
        const updates = { status: newStatus };
        if (conditionNote !== undefined) updates.conditionNote = conditionNote.trim();
        const updated = await BookCopy.findOneAndUpdate(
            { _id: copy._id, status: oldStatus },
            { $set: updates },
            { new: true, runValidators: true }
        );
        if (!updated) return res.status(409).json({ success: false, message: 'Book copy changed while being updated; retry the request.' });
        if (oldAvailable !== newAvailable || oldCounted !== newCounted) {
            const bookUpdate = await Book.updateOne(
                { _id: copy.bookId },
                { $inc: {
                    availableCopies: newAvailable - oldAvailable,
                    totalCopies: newCounted - oldCounted
                } }
            );
            if (bookUpdate.modifiedCount !== 1) {
                console.error('Book copy status changed, but its title availability count could not be adjusted:', copy.bookId.toString());
                await BookCopy.updateOne(
                    { _id: updated._id, status: newStatus },
                    { $set: { status: oldStatus } }
                );
                return res.status(500).json({ success: false, message: 'Copy status changed, but the title availability count could not be updated. Contact library staff.' });
            }
        }
        return res.status(200).json(serializeMongoRecord(updated));
    } catch (error) {
        return sendError(res, error);
    }
};

const updateBook = async (req, res) => {
    const validationError = validateBookInput(req.body);
    if (validationError) return res.status(400).json({ success: false, message: validationError });
    if (!mongoose.isValidObjectId(req.params.id)) {
        return res.status(400).json({ success: false, message: 'Book ID is invalid.' });
    }

    try {
        const book = await Book.findOne({ _id: req.params.id, status: 'ACTIVE' });
        if (!book) return res.status(404).json({ success: false, message: 'Book not found.' });
        if (req.body.totalCopies < book.totalCopies) {
            return res.status(400).json({
                success: false,
                message: 'Reducing totalCopies is not supported; archive the title or manage copies individually.'
            });
        }

        const { author, category } = await resolveAuthorAndCategory(req.body.authorId, req.body.categoryId);
        if (!author || !category) {
            return res.status(400).json({
                success: false,
                message: 'authorId and categoryId must reference existing records.'
            });
        }

        book.set({
            title: req.body.title.trim(),
            authorId: author._id,
            authorName: author.name,
            categoryId: category._id,
            categoryName: category.name,
            isbn: req.body.isbn.trim(),
            description: req.body.description?.trim() || '',
            totalCopies: req.body.totalCopies,
            availableCopies: book.availableCopies + (req.body.totalCopies - book.totalCopies)
        });
        await book.save();
        return res.status(200).json(serializeMongoRecord(book));
    } catch (error) {
        return sendError(res, error);
    }
};

const archiveBook = async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
        return res.status(400).json({ success: false, message: 'Book ID is invalid.' });
    }

    try {
        const book = await Book.findOneAndUpdate(
            { _id: req.params.id, status: 'ACTIVE' },
            { $set: { status: 'ARCHIVED' } }
        );
        if (!book) return res.status(404).json({ success: false, message: 'Book not found.' });
        return res.status(204).end();
    } catch (error) {
        return sendError(res, error);
    }
};

const listAuthors = async (req, res) => {
    try {
        const authors = await Author.find().sort({ name: 1 }).lean();
        return res.status(200).json(authors.map(serializeMongoRecord));
    } catch (error) {
        return sendError(res, error);
    }
};

const getAuthor = async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
        return res.status(400).json({ success: false, message: 'Author ID is invalid.' });
    }
    try {
        const author = await Author.findById(req.params.id).lean();
        if (!author) return res.status(404).json({ success: false, message: 'Author not found.' });
        return res.status(200).json(serializeMongoRecord(author));
    } catch (error) {
        return sendError(res, error);
    }
};

const createAuthor = async (req, res) => {
    const name = req.body?.name;
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 120) {
        return res.status(400).json({ success: false, message: 'Author name is required and must be 120 characters or fewer.' });
    }
    try {
        const author = await Author.create({ name: name.trim() });
        return res.status(201).json(serializeMongoRecord(author));
    } catch (error) {
        return sendError(res, error);
    }
};

const listCategories = async (req, res) => {
    try {
        const categories = await Category.find().sort({ name: 1 }).lean();
        return res.status(200).json(categories.map(serializeMongoRecord));
    } catch (error) {
        return sendError(res, error);
    }
};

const getCategory = async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
        return res.status(400).json({ success: false, message: 'Category ID is invalid.' });
    }
    try {
        const category = await Category.findById(req.params.id).lean();
        if (!category) return res.status(404).json({ success: false, message: 'Category not found.' });
        return res.status(200).json(serializeMongoRecord(category));
    } catch (error) {
        return sendError(res, error);
    }
};

const createCategory = async (req, res) => {
    const name = req.body?.name;
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 80) {
        return res.status(400).json({ success: false, message: 'Category name is required and must be 80 characters or fewer.' });
    }
    try {
        const category = await Category.create({ name: name.trim() });
        return res.status(201).json(serializeMongoRecord(category));
    } catch (error) {
        return sendError(res, error);
    }
};

module.exports = {
    listBooks,
    getBook,
    createBook,
    updateBook,
    archiveBook,
    listBookCopies,
    createBookCopy,
    updateBookCopy,
    listAuthors,
    getAuthor,
    createAuthor,
    listCategories,
    getCategory,
    createCategory
};
