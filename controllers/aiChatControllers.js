const db = require('../database/initDb');

// Get all chat messages for a project
const getProjectChatMessages = async (req, res) => {
    const { projectId } = req.params;
    const { userId } = req.query;

    if (!userId) {
        return res.status(400).json({
            success: false,
            message: 'User ID is required'
        });
    }

    try {
        // First check if user is a member of the project
        const memberCheck = await new Promise((resolve, reject) => {
            db.get(
                `SELECT pm.* FROM ProjectMembers pm 
                 WHERE pm.projectId = ? AND pm.userId = ?`,
                [projectId, userId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        if (!memberCheck) {
            return res.status(403).json({
                success: false,
                message: 'You are not a member of this project'
            });
        }

        // Get all chat messages for this project
        db.all(
            `SELECT 
                acm.id,
                acm.projectId,
                acm.userId,
                acm.messageType,
                acm.messageText,
                acm.createdAt,
                u.name as userName,
                u.email as userEmail
             FROM AIChatMessages acm
             LEFT JOIN Users u ON acm.userId = u.id
             WHERE acm.projectId = ?
             ORDER BY acm.createdAt ASC`,
            [projectId],
            (err, rows) => {
                if (err) {
                    console.error('Error fetching chat messages:', err);
                    return res.status(500).json({
                        success: false,
                        message: 'Failed to fetch chat messages'
                    });
                }

                res.json({
                    success: true,
                    messages: rows || []
                });
            }
        );
    } catch (error) {
        console.error('Error in getProjectChatMessages:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};

// Save a new chat message
const saveChatMessage = async (req, res) => {
    const { projectId, userId, messageType, messageText } = req.body;

    // Validate required fields
    if (!projectId || !userId || !messageType || !messageText) {
        return res.status(400).json({
            success: false,
            message: 'Project ID, User ID, message type, and message text are required'
        });
    }

    // Validate messageType
    if (!['user', 'ai'].includes(messageType)) {
        return res.status(400).json({
            success: false,
            message: 'Message type must be either "user" or "ai"'
        });
    }

    try {
        // Check if user is a member of the project
        const memberCheck = await new Promise((resolve, reject) => {
            db.get(
                `SELECT pm.* FROM ProjectMembers pm 
                 WHERE pm.projectId = ? AND pm.userId = ?`,
                [projectId, userId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        if (!memberCheck) {
            return res.status(403).json({
                success: false,
                message: 'You are not a member of this project'
            });
        }

        // Insert the chat message
        db.run(
            `INSERT INTO AIChatMessages (projectId, userId, messageType, messageText)
             VALUES (?, ?, ?, ?)`,
            [projectId, userId, messageType, messageText],
            function (err) {
                if (err) {
                    console.error('Error saving chat message:', err);
                    return res.status(500).json({
                        success: false,
                        message: 'Failed to save chat message'
                    });
                }

                // Get the inserted message with user details
                db.get(
                    `SELECT 
                        acm.id,
                        acm.projectId,
                        acm.userId,
                        acm.messageType,
                        acm.messageText,
                        acm.createdAt,
                        u.name as userName,
                        u.email as userEmail
                     FROM AIChatMessages acm
                     LEFT JOIN Users u ON acm.userId = u.id
                     WHERE acm.id = ?`,
                    [this.lastID],
                    (err, row) => {
                        if (err) {
                            console.error('Error fetching saved message:', err);
                            return res.status(500).json({
                                success: false,
                                message: 'Message saved but failed to retrieve'
                            });
                        }

                        res.json({
                            success: true,
                            message: 'Chat message saved successfully',
                            chatMessage: row
                        });
                    }
                );
            }
        );
    } catch (error) {
        console.error('Error in saveChatMessage:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};

// Delete all chat messages for a project (optional - for admin)
const deleteProjectChatMessages = async (req, res) => {
    const { projectId } = req.params;
    const { userId } = req.body;

    if (!userId) {
        return res.status(400).json({
            success: false,
            message: 'User ID is required'
        });
    }

    try {
        // Check if user is project owner/admin
        const project = await new Promise((resolve, reject) => {
            db.get(
                `SELECT * FROM Projects WHERE id = ? AND authorId = ?`,
                [projectId, userId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        if (!project) {
            return res.status(403).json({
                success: false,
                message: 'Only project owner can delete chat history'
            });
        }

        // Delete all messages for this project
        db.run(
            `DELETE FROM AIChatMessages WHERE projectId = ?`,
            [projectId],
            function (err) {
                if (err) {
                    console.error('Error deleting chat messages:', err);
                    return res.status(500).json({
                        success: false,
                        message: 'Failed to delete chat messages'
                    });
                }

                res.json({
                    success: true,
                    message: 'Chat history cleared successfully',
                    deletedCount: this.changes
                });
            }
        );
    } catch (error) {
        console.error('Error in deleteProjectChatMessages:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};

module.exports = {
    getProjectChatMessages,
    saveChatMessage,
    deleteProjectChatMessages
};
