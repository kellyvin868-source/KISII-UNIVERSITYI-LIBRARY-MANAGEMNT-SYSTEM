require('dotenv').config();

const mongoose = require('mongoose');
const Author = require('../models/authorModel');
const Book = require('../models/bookModel');
const BookCopy = require('../models/bookCopyModel');
const Category = require('../models/categoryModel');

const seedBooks = [
    {
        title: 'Introduction to Algorithms',
        authorName: 'Thomas H. Cormen',
        categoryName: 'Computer Science',
        isbn: '9780262046305',
        description: 'A reference introduction to the design and analysis of computer algorithms.',
        barcodes: ['DEMO-ALGO-001', 'DEMO-ALGO-002']
    },
    {
        title: 'Clean Code',
        authorName: 'Robert C. Martin',
        categoryName: 'Software Engineering',
        isbn: '9780132350884',
        description: 'A practical guide to readable and maintainable software.',
        barcodes: ['DEMO-CLEAN-001', 'DEMO-CLEAN-002']
    },
    {
        title: 'Things Fall Apart',
        authorName: 'Chinua Achebe',
        categoryName: 'African Literature',
        isbn: '9780385474542',
        description: 'A novel exploring community, change, and colonial encounter in Nigeria.',
        barcodes: ['DEMO-AFRLIT-001']
    }
];

const findOrCreateByName = async (Model, name) => Model.findOneAndUpdate(
    { name },
    { $setOnInsert: { name } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
);

const seed = async () => {
    if (!process.env.MONGO_URI) {
        throw new Error('MONGO_URI must be set before seeding the database.');
    }
    await mongoose.connect(process.env.MONGO_URI);

    for (const item of seedBooks) {
        const [author, category] = await Promise.all([
            findOrCreateByName(Author, item.authorName),
            findOrCreateByName(Category, item.categoryName)
        ]);
        const book = await Book.findOneAndUpdate(
            { isbn: item.isbn },
            {
                $setOnInsert: {
                    title: item.title,
                    authorId: author._id,
                    authorName: author.name,
                    categoryId: category._id,
                    categoryName: category.name,
                    isbn: item.isbn,
                    description: item.description,
                    totalCopies: item.barcodes.length,
                    availableCopies: item.barcodes.length,
                    status: 'ACTIVE'
                }
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        await Promise.all(item.barcodes.map((barcode) => BookCopy.updateOne(
            { barcode },
            { $setOnInsert: { bookId: book._id, barcode, status: 'AVAILABLE' } },
            { upsert: true }
        )));
        console.log(`Seeded catalog record: ${item.title}`);
    }
};

seed()
    .catch((error) => {
        console.error('Database seed failed:', error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await mongoose.disconnect();
    });
