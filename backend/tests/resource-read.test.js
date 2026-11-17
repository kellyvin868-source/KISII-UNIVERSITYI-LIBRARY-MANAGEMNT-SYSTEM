const assert = require('node:assert/strict');
const test = require('node:test');
const Author = require('../models/authorModel');
const Category = require('../models/categoryModel');
const Fine = require('../models/fineModel');
const Loan = require('../models/loanModel');
const Reservation = require('../models/reservationModel');
const reservationService = require('../services/reservationService');

reservationService.expireReadyReservations = async () => {};

const {
    getAuthor,
    getCategory
} = require('../controllers/bookController');
const { getLoan } = require('../controllers/loanController');
const { getReservation } = require('../controllers/reservationController');
const { getFine } = require('../controllers/fineController');

const response = () => ({
    statusCode: 200,
    body: null,
    status(code) {
        this.statusCode = code;
        return this;
    },
    json(body) {
        this.body = body;
        return this;
    }
});

const populatedQuery = (record) => ({
    populate() { return this; },
    lean: async () => record
});

test('individual resource reads exist and enforce member ownership', async (t) => {
    const originals = {
        authorFindById: Author.findById,
        categoryFindById: Category.findById,
        loanFindById: Loan.findById,
        reservationFindById: Reservation.findById,
        fineFindById: Fine.findById
    };
    t.after(() => {
        Author.findById = originals.authorFindById;
        Category.findById = originals.categoryFindById;
        Loan.findById = originals.loanFindById;
        Reservation.findById = originals.reservationFindById;
        Fine.findById = originals.fineFindById;
    });

    const memberId = '507f1f77bcf86cd799439011';
    const otherMemberId = '507f1f77bcf86cd799439012';
    const resourceId = '507f1f77bcf86cd799439013';
    const member = { _id: memberId, role: 'MEMBER' };

    Author.findById = () => ({ lean: async () => ({ _id: resourceId, name: 'Author' }) });
    Category.findById = () => ({ lean: async () => ({ _id: resourceId, name: 'Category' }) });
    let res = response();
    await getAuthor({ params: { id: resourceId } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.name, 'Author');
    res = response();
    await getCategory({ params: { id: resourceId } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.name, 'Category');

    Loan.findById = () => populatedQuery({
        _id: resourceId,
        memberId: { _id: memberId },
        bookId: { _id: '507f1f77bcf86cd799439014' }
    });
    res = response();
    await getLoan({ params: { id: resourceId }, member }, res);
    assert.equal(res.statusCode, 200);
    Loan.findById = () => populatedQuery({ _id: resourceId, memberId: { _id: otherMemberId } });
    res = response();
    await getLoan({ params: { id: resourceId }, member }, res);
    assert.equal(res.statusCode, 403);

    Reservation.findById = () => populatedQuery({ _id: resourceId, memberId: { _id: memberId } });
    res = response();
    await getReservation({ params: { id: resourceId }, member }, res);
    assert.equal(res.statusCode, 200);
    Reservation.findById = () => populatedQuery({ _id: resourceId, memberId: { _id: otherMemberId } });
    res = response();
    await getReservation({ params: { id: resourceId }, member }, res);
    assert.equal(res.statusCode, 403);

    Fine.findById = () => ({ lean: async () => ({ _id: resourceId, memberId }) });
    res = response();
    await getFine({ params: { id: resourceId }, member }, res);
    assert.equal(res.statusCode, 200);
    Fine.findById = () => ({ lean: async () => ({ _id: resourceId, memberId: otherMemberId }) });
    res = response();
    await getFine({ params: { id: resourceId }, member }, res);
    assert.equal(res.statusCode, 403);
});
