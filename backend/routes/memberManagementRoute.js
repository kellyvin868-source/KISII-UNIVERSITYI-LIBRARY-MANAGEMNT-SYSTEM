const express = require('express');
const { authenticate } = require('../middlewares/authMiddleware');
const {
    registerMemberByStaff,
    listMembers,
    getMember,
    updateMember,
    deactivateMember,
    getBorrowingHistory
} = require('../controllers/memberManagementController');

const memberManagementRoute = express.Router();

memberManagementRoute.use(authenticate);
memberManagementRoute.post('/', registerMemberByStaff);
memberManagementRoute.get('/', listMembers);
memberManagementRoute.get('/:id', getMember);
memberManagementRoute.put('/:id', updateMember);
memberManagementRoute.patch('/:id/deactivate', deactivateMember);
memberManagementRoute.get('/:id/loans', getBorrowingHistory);

module.exports = memberManagementRoute;
