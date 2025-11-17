const db = require('../database/initDb');

// Helper function to check if user is a project member
const isProjectMember = async (projectId, userId) => {
    return new Promise((resolve, reject) => {
        db.get(
            `SELECT pm.*, p.authorId 
             FROM ProjectMembers pm
             JOIN Projects p ON p.id = pm.projectId
             WHERE pm.projectId = ? AND pm.userId = ? AND pm.invitationStatus = 'approved'`,
            [projectId, userId],
            (err, row) => {
                if (err) reject(err);
                else resolve(row);
            }
        );
    });
};

// Get chat history for a project
const getChatHistory = async (req, res) => {
    const { projectId } = req.params;
    const { userId, page = 1, limit = 50 } = req.query;

    if (!userId) {
        return res.status(400).json({
            success: false,
            message: 'User ID is required'
        });
    }

    try {
        // Check if user is a project member
        const membership = await isProjectMember(projectId, userId);
        if (!membership) {
            return res.status(403).json({
                success: false,
                message: 'You must be a project member to view chat'
            });
        }

        const offset = (page - 1) * limit;

        // Get total count
        db.get(
            `SELECT COUNT(*) as total FROM ChatMessages WHERE projectId = ? AND isDeleted = 0`,
            [projectId],
            (err, countResult) => {
                if (err) {
                    console.error('Error counting messages:', err);
                    return res.status(500).json({
                        success: false,
                        message: 'Failed to count messages'
                    });
                }

                const total = countResult.total;
                const totalPages = Math.ceil(total / limit);

                // Get messages
                db.all(
                    `SELECT * FROM ChatMessages 
                     WHERE projectId = ? AND isDeleted = 0
                     ORDER BY createdAt ASC
                     LIMIT ? OFFSET ?`,
                    [projectId, limit, offset],
                    (err, messages) => {
                        if (err) {
                            console.error('Error fetching messages:', err);
                            return res.status(500).json({
                                success: false,
                                message: 'Failed to fetch messages'
                            });
                        }

                        res.json({
                            success: true,
                            messages: messages,
                            pagination: {
                                page: parseInt(page),
                                limit: parseInt(limit),
                                total: total,
                                totalPages: totalPages
                            }
                        });
                    }
                );
            }
        );
    } catch (error) {
        console.error('Error in getChatHistory:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};

// Send a new message
const sendMessage = async (req, res) => {
    const { projectId, senderId, senderName, messageContent, replyToMessageId, replyToUserId } = req.body;

    if (!projectId || !senderId || !senderName || !messageContent) {
        return res.status(400).json({
            success: false,
            message: 'Project ID, sender ID, sender name, and message content are required'
        });
    }

    // Validate message is not empty or whitespace only
    if (!messageContent.trim()) {
        return res.status(400).json({
            success: false,
            message: 'Message cannot be empty'
        });
    }

    try {
        // Check if user is a project member
        const membership = await isProjectMember(projectId, senderId);
        if (!membership) {
            return res.status(403).json({
                success: false,
                message: 'You must be a project member to send messages'
            });
        }

        // If replying to a message, get the original message details
        let replyToUserName = null;
        let replyToMessageContent = null;

        if (replyToMessageId) {
            const replyToMessage = await new Promise((resolve, reject) => {
                db.get(
                    'SELECT senderName, messageContent FROM ChatMessages WHERE id = ? AND isDeleted = 0',
                    [replyToMessageId],
                    (err, row) => {
                        if (err) reject(err);
                        else resolve(row);
                    }
                );
            });

            if (replyToMessage) {
                replyToUserName = replyToMessage.senderName;
                replyToMessageContent = replyToMessage.messageContent;
            }
        }

        // Insert message
        db.run(
            `INSERT INTO ChatMessages (projectId, senderId, senderName, messageContent, replyToMessageId, replyToUserId, replyToUserName, replyToMessageContent)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [projectId, senderId, senderName, messageContent, replyToMessageId || null, replyToUserId || null, replyToUserName, replyToMessageContent],
            function (err) {
                if (err) {
                    console.error('Error sending message:', err);
                    return res.status(500).json({
                        success: false,
                        message: 'Failed to send message'
                    });
                }

                // Fetch the created message
                db.get(
                    'SELECT * FROM ChatMessages WHERE id = ?',
                    [this.lastID],
                    (err, message) => {
                        if (err) {
                            console.error('Error fetching created message:', err);
                            return res.status(500).json({
                                success: false,
                                message: 'Message sent but failed to fetch'
                            });
                        }

                        res.status(201).json({
                            success: true,
                            message: 'Message sent successfully',
                            data: message
                        });
                    }
                );
            }
        );
    } catch (error) {
        console.error('Error in sendMessage:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};

// Edit a message
const editMessage = async (req, res) => {
    const { messageId } = req.params;
    const { userId, messageContent } = req.body;

    if (!userId || !messageContent) {
        return res.status(400).json({
            success: false,
            message: 'User ID and message content are required'
        });
    }

    // Validate message is not empty or whitespace only
    if (!messageContent.trim()) {
        return res.status(400).json({
            success: false,
            message: 'Message cannot be empty'
        });
    }

    try {
        // Check if message exists and belongs to user
        const message = await new Promise((resolve, reject) => {
            db.get(
                'SELECT * FROM ChatMessages WHERE id = ? AND isDeleted = 0',
                [messageId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        if (!message) {
            return res.status(404).json({
                success: false,
                message: 'Message not found'
            });
        }

        if (message.senderId != userId) {
            return res.status(403).json({
                success: false,
                message: 'You can only edit your own messages'
            });
        }

        // Update message
        db.run(
            `UPDATE ChatMessages 
             SET messageContent = ?, editedAt = CURRENT_TIMESTAMP, updatedAt = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [messageContent, messageId],
            function (err) {
                if (err) {
                    console.error('Error editing message:', err);
                    return res.status(500).json({
                        success: false,
                        message: 'Failed to edit message'
                    });
                }

                // Fetch updated message
                db.get(
                    'SELECT * FROM ChatMessages WHERE id = ?',
                    [messageId],
                    (err, updatedMessage) => {
                        if (err) {
                            console.error('Error fetching updated message:', err);
                            return res.status(500).json({
                                success: false,
                                message: 'Message updated but failed to fetch'
                            });
                        }

                        res.json({
                            success: true,
                            message: 'Message edited successfully',
                            data: updatedMessage
                        });
                    }
                );
            }
        );
    } catch (error) {
        console.error('Error in editMessage:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};

// Delete a message (soft delete)
const deleteMessage = async (req, res) => {
    const { messageId } = req.params;
    const { userId } = req.body;

    if (!userId) {
        return res.status(400).json({
            success: false,
            message: 'User ID is required'
        });
    }

    try {
        // Check if message exists and belongs to user
        const message = await new Promise((resolve, reject) => {
            db.get(
                'SELECT * FROM ChatMessages WHERE id = ? AND isDeleted = 0',
                [messageId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        if (!message) {
            return res.status(404).json({
                success: false,
                message: 'Message not found'
            });
        }

        if (message.senderId != userId) {
            return res.status(403).json({
                success: false,
                message: 'You can only delete your own messages'
            });
        }

        // Soft delete message
        db.run(
            'UPDATE ChatMessages SET isDeleted = 1, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
            [messageId],
            function (err) {
                if (err) {
                    console.error('Error deleting message:', err);
                    return res.status(500).json({
                        success: false,
                        message: 'Failed to delete message'
                    });
                }

                res.json({
                    success: true,
                    message: 'Message deleted successfully'
                });
            }
        );
    } catch (error) {
        console.error('Error in deleteMessage:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};

// Update message status (for read receipts)
const updateMessageStatus = async (req, res) => {
    const { messageId } = req.params;
    const { status } = req.body;

    if (!status || !['sent', 'delivered', 'read'].includes(status)) {
        return res.status(400).json({
            success: false,
            message: 'Valid status is required (sent, delivered, read)'
        });
    }

    try {
        db.run(
            'UPDATE ChatMessages SET messageStatus = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
            [status, messageId],
            function (err) {
                if (err) {
                    console.error('Error updating message status:', err);
                    return res.status(500).json({
                        success: false,
                        message: 'Failed to update message status'
                    });
                }

                res.json({
                    success: true,
                    message: 'Message status updated successfully'
                });
            }
        );
    } catch (error) {
        console.error('Error in updateMessageStatus:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};

module.exports = {
    getChatHistory,
    sendMessage,
    editMessage,
    deleteMessage,
    updateMessageStatus,
    isProjectMember
};
