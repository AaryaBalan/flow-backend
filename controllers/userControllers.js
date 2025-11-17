const sqlite3 = require("sqlite3").verbose();
const path = require('path');
const dbPath = path.join(__dirname, '../database/devcollab.db');

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Could not connect to database', err);
    } else {
        console.log('Connected to SQLite database');
    }
});

// Create Users table if it doesn't exist
db.run(`CREATE TABLE IF NOT EXISTS Users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
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
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

module.exports.createUser = (req, res) => {
    console.log('Request body:', req.body);
    const { name, email, password } = req.body;
    db.run(`INSERT INTO Users (name, email, password) VALUES (?, ?, ?)`,
        [name, email, password], function (err) {
            if (err) {
                console.error('Error inserting user', err);
                res.status(500).send({ message: 'Error creating user', status: 'error' });
            } else {
                res.status(201).send({ message: 'User created successfully', userId: this.lastID, status: 'success' });
            }
        });
};

module.exports.getUserByEmail = (req, res) => {
    const { email } = req.params;
    console.log(`Fetching user with email: ${email}`);
    db.get(
        `SELECT * FROM Users WHERE email = ?`,
        [email],
        (err, row) => {
            if (err) {
                console.error("Error fetching user by email:", err);
                res.status(500).send("Error fetching user");
            } else {
                if (!row) {
                    return res.status(200).send({ exist: false });
                }
                res.status(200).send({ user: row, exist: true });
            }
        }
    );
}

module.exports.updateSetup = (req, res) => {
    const {
        designation,
        company,
        location,
        phone,
        about,
        skills,
        experience,
        github,
        linkedin
    } = req.body;
    const userId = req.body.userId;
    db.run(`UPDATE Users SET designation = ?, company = ?, location = ?, phone = ?, about = ?, skills = ?, experience = ?, github = ?, linkedin = ?, setupCompleted = 1 WHERE id = ?`,
        [designation, company, location, phone, about, skills, experience, github, linkedin, userId],
        function (err) {
            if (err) {
                console.error('Error updating user setup', err);
                res.status(500).send({ message: 'Error updating setup', status: 'error' });
            } else {
                res.status(200).send({ message: 'Setup updated successfully', status: 'success' });
            }
        });
}

module.exports.updateProfile = (req, res) => {
    const { id } = req.params;
    const {
        name,
        email,
        designation,
        company,
        location,
        phone,
        about,
        skills,
        experience,
        github,
        linkedin
    } = req.body;

    console.log(`Updating profile for user ID: ${id}`);

    db.run(
        `UPDATE Users SET 
            name = ?, 
            email = ?, 
            designation = ?, 
            company = ?, 
            location = ?, 
            phone = ?, 
            about = ?, 
            skills = ?, 
            experience = ?, 
            github = ?, 
            linkedin = ? 
        WHERE id = ?`,
        [name, email, designation, company, location, phone, about, skills, experience, github, linkedin, id],
        function (err) {
            if (err) {
                console.error('Error updating user profile:', err);
                res.status(500).send({
                    success: false,
                    message: 'Error updating profile'
                });
            } else {
                if (this.changes === 0) {
                    res.status(404).send({
                        success: false,
                        message: 'User not found'
                    });
                } else {
                    // Fetch updated user data
                    db.get('SELECT * FROM Users WHERE id = ?', [id], (err, row) => {
                        if (err) {
                            res.status(500).send({
                                success: false,
                                message: 'Error fetching updated profile'
                            });
                        } else {
                            res.status(200).send({
                                success: true,
                                message: 'Profile updated successfully',
                                user: row
                            });
                        }
                    });
                }
            }
        }
    );
}

// Toggle user status (active/break)
module.exports.toggleUserStatus = (req, res) => {
    const { id } = req.params;
    const { status } = req.body; // 'active' or 'break'

    console.log(`Toggling status for user ID: ${id} to ${status}`);

    // First get current user data
    db.get('SELECT * FROM Users WHERE id = ?', [id], (err, user) => {
        if (err) {
            console.error('Error fetching user:', err);
            return res.status(500).send({
                success: false,
                message: 'Error fetching user data'
            });
        }

        if (!user) {
            console.error('User not found with ID:', id);
            return res.status(404).send({
                success: false,
                message: 'User not found'
            });
        }

        console.log('Current user status:', user.currentStatus);
        console.log('Work session start:', user.workSessionStart);
        console.log('Work time today:', user.workTimeToday);

        const now = new Date().toISOString();
        let updateQuery;
        let updateParams;

        if (status === 'break') {
            // User is taking a break - save work time accumulated
            let additionalWorkTime = 0;
            if (user.workSessionStart && user.currentStatus === 'active') {
                const sessionStart = new Date(user.workSessionStart);
                const sessionEnd = new Date();
                additionalWorkTime = Math.floor((sessionEnd - sessionStart) / 60000); // minutes
            }

            const newWorkTime = (user.workTimeToday || 0) + additionalWorkTime;

            updateQuery = `UPDATE Users SET 
                currentStatus = ?, 
                lastBreakTime = ?, 
                lastStatusChange = ?,
                workTimeToday = ?,
                workSessionStart = NULL
                WHERE id = ?`;
            updateParams = ['break', now, now, newWorkTime, id];
        } else {
            // User is returning to work - start new session
            updateQuery = `UPDATE Users SET 
                currentStatus = ?, 
                lastStatusChange = ?,
                workSessionStart = ?
                WHERE id = ?`;
            updateParams = ['active', now, now, id];
        }

        db.run(updateQuery, updateParams, function (err) {
            if (err) {
                console.error('Error updating user status:', err);
                console.error('Query:', updateQuery);
                console.error('Params:', updateParams);
                return res.status(500).send({
                    success: false,
                    message: 'Error updating status',
                    error: err.message
                });
            }

            // Log the activity
            db.run(
                `INSERT INTO ActivityLogs (userId, activityType, status, timestamp) VALUES (?, ?, ?, ?)`,
                [id, 'status_change', status, now],
                (logErr) => {
                    if (logErr) {
                        console.error('Error logging activity:', logErr);
                    }
                }
            );

            // Fetch updated user data
            db.get('SELECT * FROM Users WHERE id = ?', [id], (err, updatedUser) => {
                if (err) {
                    return res.status(500).send({
                        success: false,
                        message: 'Error fetching updated user data'
                    });
                }

                res.status(200).send({
                    success: true,
                    message: `Status updated to ${status}`,
                    user: {
                        id: updatedUser.id,
                        name: updatedUser.name,
                        currentStatus: updatedUser.currentStatus,
                        workTimeToday: updatedUser.workTimeToday,
                        lastBreakTime: updatedUser.lastBreakTime,
                        lastStatusChange: updatedUser.lastStatusChange
                    }
                });
            });
        });
    });
};

// Get today's activity for a user
module.exports.getUserActivity = (req, res) => {
    const { id } = req.params;

    console.log(`Fetching activity for user ID: ${id}`);

    db.get('SELECT * FROM Users WHERE id = ?', [id], (err, user) => {
        if (err) {
            console.error('Error fetching user:', err);
            return res.status(500).send({
                success: false,
                message: 'Error fetching user data'
            });
        }

        if (!user) {
            return res.status(404).send({
                success: false,
                message: 'User not found'
            });
        }

        // Calculate current work time including active session
        let currentWorkTime = user.workTimeToday || 0;
        if (user.currentStatus === 'active' && user.workSessionStart) {
            const sessionStart = new Date(user.workSessionStart);
            const now = new Date();
            const sessionMinutes = Math.floor((now - sessionStart) / 60000);
            currentWorkTime += sessionMinutes;
        }

        // Get total tasks completed by user (all time)
        db.get(
            `SELECT COUNT(*) as count FROM Tasks WHERE completedById = ? AND completed = 1`,
            [id],
            (err, taskResult) => {
                if (err) {
                    console.error('Error fetching tasks:', err);
                }

                // Get active projects count
                db.get(
                    `SELECT COUNT(DISTINCT projectId) as count FROM ProjectMembers WHERE userId = ? AND invitationStatus = 'approved'`,
                    [id],
                    (err, projectResult) => {
                        if (err) {
                            console.error('Error fetching projects:', err);
                        }

                        res.status(200).send({
                            success: true,
                            activity: {
                                currentStatus: user.currentStatus,
                                workTimeToday: currentWorkTime,
                                lastBreakTime: user.lastBreakTime,
                                lastStatusChange: user.lastStatusChange,
                                tasksCompletedTotal: taskResult?.count || 0,
                                activeProjects: projectResult?.count || 0
                            }
                        });
                    }
                );
            }
        );
    });
};

// Reset daily work time (call this at midnight via cron job)
module.exports.resetDailyWorkTime = (req, res) => {
    db.run(
        `UPDATE Users SET workTimeToday = 0, workSessionStart = CASE WHEN currentStatus = 'active' THEN datetime('now') ELSE NULL END`,
        [],
        function (err) {
            if (err) {
                console.error('Error resetting daily work time:', err);
                return res.status(500).send({
                    success: false,
                    message: 'Error resetting work time'
                });
            }

            res.status(200).send({
                success: true,
                message: 'Daily work time reset successfully',
                rowsAffected: this.changes
            });
        }
    );
};


module.exports.getUserById = (req, res) => {
    const { id } = req.params;
    console.log(`Fetching user with ID: ${id}`);

    db.get(
        `SELECT id, name, email, designation, company, location, phone, about, skills, experience, github, linkedin, createdAt FROM Users WHERE id = ?`,
        [id],
        (err, row) => {
            if (err) {
                console.error("Error fetching user by ID:", err);
                res.status(500).send({
                    success: false,
                    message: 'Error fetching user'
                });
            } else {
                if (!row) {
                    return res.status(404).send({
                        success: false,
                        message: 'User not found'
                    });
                }
                res.status(200).send({
                    success: true,
                    user: row
                });
            }
        }
    );
}