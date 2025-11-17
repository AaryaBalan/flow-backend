const express = require('express');
const router = express.Router();
const {
    getProjectChatMessages,
    saveChatMessage,
    deleteProjectChatMessages
} = require('../controllers/aiChatControllers');

// Get all chat messages for a project
router.get('/project/:projectId', getProjectChatMessages);

// Save a new chat message
router.post('/message', saveChatMessage);

// Delete all chat messages for a project (admin only)
router.delete('/project/:projectId', deleteProjectChatMessages);

module.exports = router;
