require('dotenv').config();

const mongoose = require('mongoose');
const Author = require('../models/authorModel');
const Book = require('../models/bookModel');
const BookCopy = require('../models/bookCopyModel');
const Category = require('../models/categoryModel');
const Fine = require('../models/fineModel');
const Loan = require('../models/loanModel');
const Member = require('../models/memberModel');
const Notification = require('../models/notificationModel');
const Payment = require('../models/paymentModel');
const Reservation = require('../models/reservationModel');

const models = [
    Author,
    Book,
    BookCopy,
    Category,
    Fine,
    Loan,
    Member,
    Notification,
    Payment,
    Reservation
];

const migrate = async () => {
    if (!process.env.MONGO_URI) {
        throw new Error('MONGO_URI must be set before running database migrations.');
    }

    await mongoose.connect(process.env.MONGO_URI);

    const copyCollectionExists = await mongoose.connection.db
        .listCollections({ name: BookCopy.collection.collectionName }, { nameOnly: true })
        .hasNext();
    const existingIndexes = copyCollectionExists
        ? await BookCopy.collection.indexes()
        : [];
    const legacyBarcodeIndex = existingIndexes.find((index) =>
        index.key?.barcode === 1 &&
        index.unique === true &&
        !index.partialFilterExpression
    );
    if (legacyBarcodeIndex) {
        await BookCopy.collection.dropIndex(legacyBarcodeIndex.name);
        console.log(`Removed legacy unique barcode index: ${legacyBarcodeIndex.name}`);
    }

    for (const Model of models) {
        await Model.createIndexes();
        console.log(`Ensured indexes for ${Model.modelName}.`);
    }
};

migrate()
    .catch((error) => {
        console.error('Database migration failed:', error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await mongoose.disconnect();
    });
