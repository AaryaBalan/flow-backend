const express = require('express');
const router = express.Router();
const { createUser, getUserByEmail, updateSetup, updateProfile, getUserById, toggleUserStatus, getUserActivity, resetDailyWorkTime } = require('../controllers/userControllers');

// Route to create a new user
router.post('/create', createUser);
router.get('/email/:email', getUserByEmail);
router.get('/:id', getUserById);
router.post('/updateSetup', updateSetup);
router.put('/profile/:id', updateProfile);

// Activity tracking routes
router.post('/:id/status', toggleUserStatus);
router.get('/:id/activity', getUserActivity);
router.post('/reset-daily-work', resetDailyWorkTime);

module.exports = router;