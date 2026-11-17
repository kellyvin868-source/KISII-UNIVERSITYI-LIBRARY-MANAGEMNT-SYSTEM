const assert = require('node:assert/strict');
const http = require('node:http');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const test = require('node:test');
const express = require('express');
const Author = require('../models/authorModel');
const Book = require('../models/bookModel');
const BookCopy = require('../models/bookCopyModel');
const Category = require('../models/categoryModel');
const Member = require('../models/memberModel');
const bookRoute = require('../routes/bookRoute');
const authorRoute = require('../routes/authorRoute');
const categoryRoute = require('../routes/categoryRoute');

const request = (server, { method = 'GET', path, body, token }) => new Promise((resolve, reject) => {
    const headers = {};
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (token) headers.authorization = `Bearer ${token}`;

    const req = http.request({
        host: '127.0.0.1',
        port: server.address().port,
        path,
        method,
        headers
    }, (res) => {
        let responseBody = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { responseBody += chunk; });
        res.on('end', () => resolve({
            status: res.statusCode,
            body: responseBody ? JSON.parse(responseBody) : null
        }));
    });
    req.on('error', reject);
    req.end(body === undefined ? undefined : JSON.stringify(body));
});

const queryFor = (value) => ({
    select() { return this; },
    then(resolve, reject) {
        return Promise.resolve(value).then(resolve, reject);
    }
});

test('catalog endpoints enforce roles and manage searchable book records', async () => {
    const originals = {
        bookFind: Book.find,
        bookCount: Book.countDocuments,
        bookCreate: Book.create,
        bookFindOneAndUpdate: Book.findOneAndUpdate,
        bookCopyCreate: BookCopy.create,
        authorFind: Author.find,
        authorFindById: Author.findById,
        authorCreate: Author.create,
        categoryFind: Category.find,
        categoryFindById: Category.findById,
        categoryCreate: Category.create,
        memberFindById: Member.findById,
        secret: process.env.JWT_SECRET_KEY
    };
    const authorId = new mongoose.Types.ObjectId().toString();
    const categoryId = new mongoose.Types.ObjectId().toString();
    const bookId = new mongoose.Types.ObjectId().toString();
    let createdBook;

    const app = express();
    app.use(express.json());
    app.use('/v1/books', bookRoute);
    app.use('/v1/authors', authorRoute);
    app.use('/v1/categories', categoryRoute);
    const server = app.listen(0, '127.0.0.1');

    try {
        process.env.JWT_SECRET_KEY = 'catalog-test-secret-not-for-production';
        Member.findById = () => queryFor({
            _id: 'admin-id',
            role: 'ADMIN',
            status: 'ACTIVE',
            tokenVersion: 0
        });
        Author.findById = (id) => queryFor(id === authorId ? { _id: authorId, name: 'A. Author' } : null);
        Category.findById = (id) => queryFor(id === categoryId ? { _id: categoryId, name: 'History' } : null);
        Book.countDocuments = async (filter) => {
            assert.deepEqual(filter, { status: 'ACTIVE', $text: { $search: 'African history' } });
            return 1;
        };
        Book.find = (filter) => ({
            sort() { return this; },
            skip(value) { assert.equal(value, 0); return this; },
            limit(value) { assert.equal(value, 20); return this; },
            lean: async () => [{ _id: bookId, title: 'African History' }]
        });
        Book.create = async (input) => {
            createdBook = { _id: bookId, ...input };
            return createdBook;
        };
        Book.findOneAndUpdate = async (filter, update) => {
            assert.deepEqual(filter, { _id: bookId, status: 'ACTIVE' });
            if (update.$inc) {
                assert.deepEqual(update, { $inc: { totalCopies: 1, availableCopies: 1 } });
                return createdBook;
            }
            assert.deepEqual(update, { $set: { status: 'ARCHIVED' } });
            return createdBook;
        };
        BookCopy.create = async (input) => ({ _id: 'copy-id', ...input });
        Author.find = () => ({ sort() { return this; }, lean: async () => [] });
        Author.create = async (input) => ({ _id: authorId, ...input });
        Category.find = () => ({ sort() { return this; }, lean: async () => [] });
        Category.create = async (input) => ({ _id: categoryId, ...input });

        await new Promise((resolve) => server.once('listening', resolve));

        const search = await request(server, {
            path: '/v1/books?query=African%20history'
        });
        assert.equal(search.status, 200);
        assert.equal(search.body.total, 1);
        assert.equal(search.body.data[0].title, 'African History');

        const anonymousWrite = await request(server, {
            method: 'POST',
            path: '/v1/books',
            body: {}
        });
        assert.equal(anonymousWrite.status, 401);

        const memberToken = jwt.sign({
            memberID: 'member-id',
            tokenVersion: 0
        }, process.env.JWT_SECRET_KEY);
        Member.findById = () => queryFor({
            _id: 'member-id',
            role: 'MEMBER',
            status: 'ACTIVE',
            tokenVersion: 0
        });
        const memberWrite = await request(server, {
            method: 'POST',
            path: '/v1/books',
            token: memberToken,
            body: {}
        });
        assert.equal(memberWrite.status, 403);

        const librarianToken = jwt.sign({
            memberID: 'admin-id',
            tokenVersion: 0
        }, process.env.JWT_SECRET_KEY);
        Member.findById = () => queryFor({
            _id: 'admin-id',
            role: 'ADMIN',
            status: 'ACTIVE',
            tokenVersion: 0
        });
        const create = await request(server, {
            method: 'POST',
            path: '/v1/books',
            token: librarianToken,
            body: {
                title: '  African History  ',
                authorId,
                categoryId,
                isbn: '9781234567890',
                totalCopies: 3,
                copyBarcodes: ''
            }
        });
        assert.equal(create.status, 201);
        assert.equal(createdBook.title, 'African History');
        assert.equal(createdBook.authorName, 'A. Author');
        assert.equal(createdBook.categoryName, 'History');
        assert.equal(createdBook.availableCopies, 3);

        const copy = await request(server, {
            method: 'POST',
            path: `/v1/books/${bookId}/copies`,
            token: librarianToken,
            body: {}
        });
        assert.equal(copy.status, 201);
        assert.equal(copy.body.barcode, undefined);
        assert.notEqual(BookCopy.schema.path('barcode').isRequired, true);
        assert.deepEqual(
            BookCopy.schema.indexes().find(([keys, options]) => keys.barcode === 1 && options.unique)?.[1]
                .partialFilterExpression,
            { barcode: { $type: 'string' } }
        );

        const archive = await request(server, {
            method: 'DELETE',
            path: `/v1/books/${bookId}`,
            token: librarianToken
        });
        assert.equal(archive.status, 204);
        assert.equal(archive.body, null);
    } finally {
        Book.find = originals.bookFind;
        Book.countDocuments = originals.bookCount;
        Book.create = originals.bookCreate;
        Book.findOneAndUpdate = originals.bookFindOneAndUpdate;
        BookCopy.create = originals.bookCopyCreate;
        Author.find = originals.authorFind;
        Author.findById = originals.authorFindById;
        Author.create = originals.authorCreate;
        Category.find = originals.categoryFind;
        Category.findById = originals.categoryFindById;
        Category.create = originals.categoryCreate;
        Member.findById = originals.memberFindById;
        if (originals.secret === undefined) delete process.env.JWT_SECRET_KEY;
        else process.env.JWT_SECRET_KEY = originals.secret;
        server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
    }
});
