const express = require('express');
const app = express();
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cors = require('cors');
const userRoutes = require('./routes/userRoutes');
const projectRoutes = require('./routes/projectRoutes');
const taskRoutes = require('./routes/taskRoutes');
const noteRoutes = require('./routes/noteRoutes');
const aiChatRoutes = require('./routes/aiChatRoutes');
const chatRoutes = require('./routes/chatRoutes');
const githubRoutes = require('./routes/githubRoutes');

// Load environment variables from .env file
dotenv.config();

const port = process.env.PORT || 3000;

// Middleware
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true,
}));

// Create HTTP server
const server = http.createServer(app);

// Initialize Socket.io with CORS
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST'],
        credentials: true
    }
});


app.use(express.json()); // Parse JSON bodies
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies

app.use('/api/users', userRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/notes', noteRoutes);
app.use('/api/ai-chat', aiChatRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/github', githubRoutes);


// Sample route
app.get('/', (req, res) => {
    res.send('Hello World!');
});

// Socket.io connection handler
const { isProjectMember } = require('./controllers/chatControllers');
const db = require('./database/initDb');

// Rate limiting map: userId -> { count, timestamp }
const userMessageRateLimit = new Map();
const RATE_LIMIT_WINDOW = 10000; // 10 seconds
const MAX_MESSAGES_PER_WINDOW = 5;

// Typing users map: projectId -> { userId: timeout }
const typingUsers = new Map();

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Join project chat room
    socket.on('join-project-chat', async ({ projectId, userId, userName }) => {
        try {
            // Validate project membership
            const membership = await isProjectMember(projectId, userId);
            if (!membership) {
                socket.emit('error', { message: 'You must be a project member to join chat' });
                return;
            }

            // Join the room
            socket.join(`project-${projectId}`);
            socket.projectId = projectId;
            socket.userId = userId;
            socket.userName = userName;

            console.log(`User ${userName} (${userId}) joined project ${projectId} chat`);

            // Notify others that user joined
            socket.to(`project-${projectId}`).emit('user-joined', {
                userId,
                userName,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            console.error('Error joining project chat:', error);
            socket.emit('error', { message: 'Failed to join chat' });
        }
    });

    // Send message
    socket.on('send-message', async ({ projectId, senderId, senderName, messageContent, replyToMessageId, replyToUserId }) => {
        try {
            // Rate limiting check
            const now = Date.now();
            const userRateData = userMessageRateLimit.get(senderId);

            if (userRateData) {
                // Check if within the same window
                if (now - userRateData.timestamp < RATE_LIMIT_WINDOW) {
                    if (userRateData.count >= MAX_MESSAGES_PER_WINDOW) {
                        socket.emit('error', { message: 'You are sending messages too quickly. Please wait a moment.' });
                        return;
                    }
                    userRateData.count++;
                } else {
                    // Reset window
                    userMessageRateLimit.set(senderId, { count: 1, timestamp: now });
                }
            } else {
                userMessageRateLimit.set(senderId, { count: 1, timestamp: now });
            }

            // Validate message
            if (!messageContent || !messageContent.trim()) {
                socket.emit('error', { message: 'Message cannot be empty' });
                return;
            }

            // Validate membership
            const membership = await isProjectMember(projectId, senderId);
            if (!membership) {
                socket.emit('error', { message: 'You must be a project member to send messages' });
                return;
            }

            // Get reply details if replying
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

            // Save message to database
            db.run(
                `INSERT INTO ChatMessages (projectId, senderId, senderName, messageContent, replyToMessageId, replyToUserId, replyToUserName, replyToMessageContent)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [projectId, senderId, senderName, messageContent, replyToMessageId || null, replyToUserId || null, replyToUserName, replyToMessageContent],
                function (err) {
                    if (err) {
                        console.error('Error saving message:', err);
                        socket.emit('error', { message: 'Failed to send message' });
                        return;
                    }

                    // Get the created message
                    db.get(
                        'SELECT * FROM ChatMessages WHERE id = ?',
                        [this.lastID],
                        (err, message) => {
                            if (err) {
                                console.error('Error fetching created message:', err);
                                return;
                            }

                            // Broadcast message to all users in the project room
                            io.to(`project-${projectId}`).emit('new-message', message);

                            // Clear typing indicator for this user
                            clearTypingIndicator(projectId, senderId);
                        }
                    );
                }
            );
        } catch (error) {
            console.error('Error sending message:', error);
            socket.emit('error', { message: 'Failed to send message' });
        }
    });

    // Typing indicator
    socket.on('typing', ({ projectId, userId, userName }) => {
        // Clear existing timeout
        clearTypingIndicator(projectId, userId);

        // Set new timeout
        if (!typingUsers.has(projectId)) {
            typingUsers.set(projectId, new Map());
        }

        const timeout = setTimeout(() => {
            clearTypingIndicator(projectId, userId);
        }, 3000); // Auto-clear after 3 seconds

        typingUsers.get(projectId).set(userId, timeout);

        // Notify others in the room
        socket.to(`project-${projectId}`).emit('user-typing', { userId, userName });
    });

    // Stop typing
    socket.on('stop-typing', ({ projectId, userId }) => {
        clearTypingIndicator(projectId, userId);
    });

    // Edit message
    socket.on('edit-message', async ({ messageId, userId, messageContent }) => {
        try {
            if (!messageContent || !messageContent.trim()) {
                socket.emit('error', { message: 'Message cannot be empty' });
                return;
            }

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
                socket.emit('error', { message: 'Message not found' });
                return;
            }

            if (message.senderId != userId) {
                socket.emit('error', { message: 'You can only edit your own messages' });
                return;
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
                        socket.emit('error', { message: 'Failed to edit message' });
                        return;
                    }

                    // Get updated message
                    db.get(
                        'SELECT * FROM ChatMessages WHERE id = ?',
                        [messageId],
                        (err, updatedMessage) => {
                            if (err) {
                                console.error('Error fetching updated message:', err);
                                return;
                            }

                            // Broadcast update to all users in the project room
                            io.to(`project-${message.projectId}`).emit('message-edited', updatedMessage);
                        }
                    );
                }
            );
        } catch (error) {
            console.error('Error editing message:', error);
            socket.emit('error', { message: 'Failed to edit message' });
        }
    });

    // Delete message
    socket.on('delete-message', async ({ messageId, userId }) => {
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
                socket.emit('error', { message: 'Message not found' });
                return;
            }

            if (message.senderId != userId) {
                socket.emit('error', { message: 'You can only delete your own messages' });
                return;
            }

            // Soft delete message
            db.run(
                'UPDATE ChatMessages SET isDeleted = 1, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
                [messageId],
                function (err) {
                    if (err) {
                        console.error('Error deleting message:', err);
                        socket.emit('error', { message: 'Failed to delete message' });
                        return;
                    }

                    // Broadcast deletion to all users in the project room
                    io.to(`project-${message.projectId}`).emit('message-deleted', { messageId });
                }
            );
        } catch (error) {
            console.error('Error deleting message:', error);
            socket.emit('error', { message: 'Failed to delete message' });
        }
    });

    // Disconnect
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);

        // Clear typing indicator if any
        if (socket.projectId && socket.userId) {
            clearTypingIndicator(socket.projectId, socket.userId);

            // Notify others that user left
            socket.to(`project-${socket.projectId}`).emit('user-left', {
                userId: socket.userId,
                userName: socket.userName,
                timestamp: new Date().toISOString()
            });
        }
    });
});

// Helper function to clear typing indicator
function clearTypingIndicator(projectId, userId) {
    if (typingUsers.has(projectId)) {
        const projectTyping = typingUsers.get(projectId);
        if (projectTyping.has(userId)) {
            clearTimeout(projectTyping.get(userId));
            projectTyping.delete(userId);

            // Notify others
            io.to(`project-${projectId}`).emit('user-stopped-typing', { userId });

            // Clean up empty maps
            if (projectTyping.size === 0) {
                typingUsers.delete(projectId);
            }
        }
    }
}


// Start the server
server.listen(port, '0.0.0.0', () => {
    console.log(`Server is running at http://localhost:${port}`);
    console.log(`Socket.io server is ready`);
});