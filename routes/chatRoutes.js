const express = require('express');
const router = express.Router();
const {
    getChatHistory,
    sendMessage,
    editMessage,
    deleteMessage,
    updateMessageStatus
} = require('../controllers/chatControllers');

// Get chat history for a project
router.get('/project/:projectId', getChatHistory);

// Send a new message
router.post('/send', sendMessage);

// Edit a message
router.put('/edit/:messageId', editMessage);

// Delete a message
router.delete('/delete/:messageId', deleteMessage);

// Update message status
router.put('/status/:messageId', updateMessageStatus);

module.exports = router;
