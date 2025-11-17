const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'devcollab.db');

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
    } else {
        console.log('Connected to SQLite database');
        initializeTables();
    }
});

function initializeTables() {
    db.serialize(() => {
        // Create Users table if not exists
        db.run(`
            CREATE TABLE IF NOT EXISTS Users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                designation TEXT,
                company TEXT,
                location TEXT,
                phone TEXT,
                about TEXT,
                skills TEXT,
                experience TEXT,
                github TEXT,
                linkedin TEXT,
                setupCompleted INTEGER DEFAULT 0,
                currentStatus TEXT DEFAULT 'active',
                workTimeToday INTEGER DEFAULT 0,
                lastBreakTime DATETIME,
                lastStatusChange DATETIME DEFAULT CURRENT_TIMESTAMP,
                workSessionStart DATETIME,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `, (err) => {
            if (err) {
                console.error('Error creating Users table:', err.message);
            } else {
                console.log('Users table ready');

                // Add new columns to existing table if they don't exist
                const newColumns = [
                    { name: 'currentStatus', definition: 'TEXT DEFAULT "active"' },
                    { name: 'workTimeToday', definition: 'INTEGER DEFAULT 0' },
                    { name: 'lastBreakTime', definition: 'DATETIME' },
                    { name: 'lastStatusChange', definition: 'DATETIME' },
                    { name: 'workSessionStart', definition: 'DATETIME' }
                ];

                newColumns.forEach(column => {
                    db.run(`ALTER TABLE Users ADD COLUMN ${column.name} ${column.definition}`, (alterErr) => {
                        if (alterErr && !alterErr.message.includes('duplicate column')) {
                            console.error(`Error adding ${column.name} column:`, alterErr.message);
                        }
                    });
                });
            }
        });

        // Create Projects table
        db.run(`
            CREATE TABLE IF NOT EXISTS Projects (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                description TEXT NOT NULL,
                authorId INTEGER NOT NULL,
                authorName TEXT NOT NULL,
                joinCode TEXT UNIQUE NOT NULL,
                status TEXT DEFAULT 'Active',
                progress INTEGER DEFAULT 0,
                dueDate DATETIME,
                githubRepoUrl TEXT,
                githubOwner TEXT,
                githubRepo TEXT,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (authorId) REFERENCES Users(id) ON DELETE CASCADE
            )
        `, (err) => {
            if (err) {
                console.error('Error creating Projects table:', err.message);
            } else {
                console.log('Projects table ready');

                // Add dueDate column to existing table if it doesn't exist
                db.run(`ALTER TABLE Projects ADD COLUMN dueDate DATETIME`, (alterErr) => {
                    if (alterErr && !alterErr.message.includes('duplicate column')) {
                        console.error('Error adding dueDate column:', alterErr.message);
                    } else if (!alterErr) {
                        console.log('✓ Added dueDate column');
                    }
                });

                // Add GitHub columns to existing table if they don't exist
                const githubColumns = [
                    { name: 'githubRepoUrl', definition: 'TEXT' },
                    { name: 'githubOwner', definition: 'TEXT' },
                    { name: 'githubRepo', definition: 'TEXT' }
                ];

                githubColumns.forEach(column => {
                    db.run(`ALTER TABLE Projects ADD COLUMN ${column.name} ${column.definition}`, (alterErr) => {
                        if (alterErr && !alterErr.message.includes('duplicate column')) {
                            console.error(`Error adding ${column.name} column:`, alterErr.message);
                        } else if (!alterErr) {
                            console.log(`✓ Added GitHub column: ${column.name}`);
                        }
                    });
                });
            }
        });

        // Create ProjectMembers junction table
        db.run(`
            CREATE TABLE IF NOT EXISTS ProjectMembers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                projectId INTEGER NOT NULL,
                userId INTEGER NOT NULL,
                invitationStatus TEXT DEFAULT 'approved',
                joinedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(projectId, userId),
                FOREIGN KEY (projectId) REFERENCES Projects(id) ON DELETE CASCADE,
                FOREIGN KEY (userId) REFERENCES Users(id) ON DELETE CASCADE
            )
        `, (err) => {
            if (err) {
                console.error('Error creating ProjectMembers table:', err.message);
            } else {
                console.log('ProjectMembers table ready');

                // Add invitationStatus column to existing table if it doesn't exist
                db.run(`
                    ALTER TABLE ProjectMembers ADD COLUMN invitationStatus TEXT DEFAULT 'approved'
                `, (alterErr) => {
                    if (alterErr && !alterErr.message.includes('duplicate column')) {
                        console.error('Error adding invitationStatus column:', alterErr.message);
                    }
                });
            }
        });

        // Create indexes for better query performance
        db.run(`CREATE INDEX IF NOT EXISTS idx_projects_joinCode ON Projects(joinCode)`, (err) => {
            if (err) console.error('Error creating joinCode index:', err.message);
        });

        db.run(`CREATE INDEX IF NOT EXISTS idx_projectMembers_userId ON ProjectMembers(userId)`, (err) => {
            if (err) console.error('Error creating userId index:', err.message);
        });

        db.run(`CREATE INDEX IF NOT EXISTS idx_projectMembers_projectId ON ProjectMembers(projectId)`, (err) => {
            if (err) console.error('Error creating projectId index:', err.message);
        });

        db.run(`CREATE INDEX IF NOT EXISTS idx_projectMembers_status ON ProjectMembers(invitationStatus)`, (err) => {
            if (err) console.error('Error creating invitationStatus index:', err.message);
        });

        // Create Tasks table
        db.run(`
            CREATE TABLE IF NOT EXISTS Tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                projectId INTEGER NOT NULL,
                title TEXT NOT NULL,
                description TEXT,
                taskAuthor TEXT NOT NULL,
                taskAuthorId INTEGER NOT NULL,
                createdBy TEXT NOT NULL,
                createdById INTEGER NOT NULL,
                completed INTEGER DEFAULT 0,
                completedBy TEXT,
                completedById INTEGER,
                completionDate DATETIME,
                onlyAuthorCanComplete INTEGER DEFAULT 0,
                dueDate DATETIME,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (projectId) REFERENCES Projects(id) ON DELETE CASCADE,
                FOREIGN KEY (taskAuthorId) REFERENCES Users(id) ON DELETE CASCADE,
                FOREIGN KEY (createdById) REFERENCES Users(id) ON DELETE CASCADE,
                FOREIGN KEY (completedById) REFERENCES Users(id) ON DELETE SET NULL
            )
        `, (err) => {
            if (err) {
                console.error('Error creating Tasks table:', err.message);
            } else {
                console.log('Tasks table ready');

                // Add columns to existing table if they don't exist
                db.run(`
                    ALTER TABLE Tasks ADD COLUMN description TEXT
                `, (alterErr) => {
                    if (alterErr && !alterErr.message.includes('duplicate column')) {
                        console.error('Error adding description column:', alterErr.message);
                    }
                });

                db.run(`
                    ALTER TABLE Tasks ADD COLUMN dueDate DATETIME
                `, (alterErr) => {
                    if (alterErr && !alterErr.message.includes('duplicate column')) {
                        console.error('Error adding dueDate column:', alterErr.message);
                    }
                });
            }
        });

        // Create indexes for Tasks table
        db.run(`CREATE INDEX IF NOT EXISTS idx_tasks_projectId ON Tasks(projectId)`, (err) => {
            if (err) console.error('Error creating tasks projectId index:', err.message);
        });

        db.run(`CREATE INDEX IF NOT EXISTS idx_tasks_authorId ON Tasks(taskAuthorId)`, (err) => {
            if (err) console.error('Error creating tasks authorId index:', err.message);
        });

        db.run(`CREATE INDEX IF NOT EXISTS idx_tasks_completed ON Tasks(completed)`, (err) => {
            if (err) console.error('Error creating tasks completed index:', err.message);
        });

        // Create ActivityLogs table for tracking work sessions and status changes
        db.run(`
            CREATE TABLE IF NOT EXISTS ActivityLogs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                userId INTEGER NOT NULL,
                activityType TEXT NOT NULL,
                status TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                metadata TEXT,
                FOREIGN KEY (userId) REFERENCES Users(id) ON DELETE CASCADE
            )
        `, (err) => {
            if (err) {
                console.error('Error creating ActivityLogs table:', err.message);
            } else {
                console.log('ActivityLogs table ready');
            }
        });

        // Create indexes for ActivityLogs table
        db.run(`CREATE INDEX IF NOT EXISTS idx_activityLogs_userId ON ActivityLogs(userId)`, (err) => {
            if (err) console.error('Error creating activityLogs userId index:', err.message);
        });

        db.run(`CREATE INDEX IF NOT EXISTS idx_activityLogs_timestamp ON ActivityLogs(timestamp)`, (err) => {
            if (err) console.error('Error creating activityLogs timestamp index:', err.message);
        });

        // Create Notes table
        db.run(`
            CREATE TABLE IF NOT EXISTS Notes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                projectId INTEGER NOT NULL,
                title TEXT NOT NULL,
                content TEXT NOT NULL,
                createdBy INTEGER NOT NULL,
                createdByName TEXT NOT NULL,
                updatedBy INTEGER,
                updatedByName TEXT,
                isDeleted INTEGER DEFAULT 0,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (projectId) REFERENCES Projects(id) ON DELETE CASCADE,
                FOREIGN KEY (createdBy) REFERENCES Users(id),
                FOREIGN KEY (updatedBy) REFERENCES Users(id)
            )
        `, (err) => {
            if (err) {
                console.error('Error creating Notes table:', err.message);
            } else {
                console.log('Notes table ready');
            }
        });

        // Create NotePermissions table for role-based access control
        db.run(`
            CREATE TABLE IF NOT EXISTS NotePermissions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                noteId INTEGER NOT NULL,
                userId INTEGER NOT NULL,
                canEdit INTEGER DEFAULT 0,
                canDelete INTEGER DEFAULT 0,
                grantedBy INTEGER NOT NULL,
                grantedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (noteId) REFERENCES Notes(id) ON DELETE CASCADE,
                FOREIGN KEY (userId) REFERENCES Users(id),
                FOREIGN KEY (grantedBy) REFERENCES Users(id),
                UNIQUE(noteId, userId)
            )
        `, (err) => {
            if (err) {
                console.error('Error creating NotePermissions table:', err.message);
            } else {
                console.log('NotePermissions table ready');
            }
        });

        // Create indexes for Notes table
        db.run(`CREATE INDEX IF NOT EXISTS idx_notes_projectId ON Notes(projectId)`, (err) => {
            if (err) console.error('Error creating notes projectId index:', err.message);
        });

        db.run(`CREATE INDEX IF NOT EXISTS idx_notes_createdBy ON Notes(createdBy)`, (err) => {
            if (err) console.error('Error creating notes createdBy index:', err.message);
        });

        db.run(`CREATE INDEX IF NOT EXISTS idx_notes_createdAt ON Notes(createdAt DESC)`, (err) => {
            if (err) console.error('Error creating notes createdAt index:', err.message);
        });

        db.run(`CREATE INDEX IF NOT EXISTS idx_notes_isDeleted ON Notes(isDeleted)`, (err) => {
            if (err) console.error('Error creating notes isDeleted index:', err.message);
        });

        // Create indexes for NotePermissions table
        db.run(`CREATE INDEX IF NOT EXISTS idx_notePermissions_noteId ON NotePermissions(noteId)`, (err) => {
            if (err) console.error('Error creating notePermissions noteId index:', err.message);
        });

        db.run(`CREATE INDEX IF NOT EXISTS idx_notePermissions_userId ON NotePermissions(userId)`, (err) => {
            if (err) console.error('Error creating notePermissions userId index:', err.message);
        });

        // Create AIChatMessages table
        db.run(`
            CREATE TABLE IF NOT EXISTS AIChatMessages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                projectId INTEGER NOT NULL,
                userId INTEGER NOT NULL,
                messageType TEXT NOT NULL CHECK(messageType IN ('user', 'ai')),
                messageText TEXT NOT NULL,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (projectId) REFERENCES Projects(id) ON DELETE CASCADE,
                FOREIGN KEY (userId) REFERENCES Users(id) ON DELETE CASCADE
            )
        `, (err) => {
            if (err) {
                console.error('Error creating AIChatMessages table:', err.message);
            } else {
                console.log('AIChatMessages table ready');
            }
        });

        // Create indexes for AIChatMessages table
        db.run(`CREATE INDEX IF NOT EXISTS idx_aiChatMessages_projectId ON AIChatMessages(projectId)`, (err) => {
            if (err) console.error('Error creating aiChatMessages projectId index:', err.message);
        });

        db.run(`CREATE INDEX IF NOT EXISTS idx_aiChatMessages_userId ON AIChatMessages(userId)`, (err) => {
            if (err) console.error('Error creating aiChatMessages userId index:', err.message);
        });

        db.run(`CREATE INDEX IF NOT EXISTS idx_aiChatMessages_createdAt ON AIChatMessages(createdAt DESC)`, (err) => {
            if (err) console.error('Error creating aiChatMessages createdAt index:', err.message);
        });

        // Create ChatMessages table for project chat
        db.run(`
            CREATE TABLE IF NOT EXISTS ChatMessages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                projectId INTEGER NOT NULL,
                senderId INTEGER NOT NULL,
                senderName TEXT NOT NULL,
                messageContent TEXT NOT NULL,
                replyToMessageId INTEGER,
                replyToUserId INTEGER,
                replyToUserName TEXT,
                replyToMessageContent TEXT,
                messageStatus TEXT DEFAULT 'sent' CHECK(messageStatus IN ('sent', 'delivered', 'read')),
                isDeleted INTEGER DEFAULT 0,
                editedAt DATETIME,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (projectId) REFERENCES Projects(id) ON DELETE CASCADE,
                FOREIGN KEY (senderId) REFERENCES Users(id) ON DELETE CASCADE,
                FOREIGN KEY (replyToMessageId) REFERENCES ChatMessages(id) ON DELETE SET NULL,
                FOREIGN KEY (replyToUserId) REFERENCES Users(id) ON DELETE SET NULL
            )
        `, (err) => {
            if (err) {
                console.error('Error creating ChatMessages table:', err.message);
            } else {
                console.log('ChatMessages table ready');
            }
        });

        // Create indexes for ChatMessages table
        db.run(`CREATE INDEX IF NOT EXISTS idx_chatMessages_projectId ON ChatMessages(projectId)`, (err) => {
            if (err) console.error('Error creating chatMessages projectId index:', err.message);
        });

        db.run(`CREATE INDEX IF NOT EXISTS idx_chatMessages_senderId ON ChatMessages(senderId)`, (err) => {
            if (err) console.error('Error creating chatMessages senderId index:', err.message);
        });

        db.run(`CREATE INDEX IF NOT EXISTS idx_chatMessages_createdAt ON ChatMessages(createdAt DESC)`, (err) => {
            if (err) console.error('Error creating chatMessages createdAt index:', err.message);
        });

        db.run(`CREATE INDEX IF NOT EXISTS idx_chatMessages_isDeleted ON ChatMessages(isDeleted)`, (err) => {
            if (err) console.error('Error creating chatMessages isDeleted index:', err.message);
        });

        db.run(`CREATE INDEX IF NOT EXISTS idx_chatMessages_replyTo ON ChatMessages(replyToMessageId)`, (err) => {
            if (err) console.error('Error creating chatMessages replyTo index:', err.message);
        });
    });
}

module.exports = db;
