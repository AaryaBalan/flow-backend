const db = require('../database/initDb');

// Generate a unique 6-digit join code
function generateJoinCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// Calculate progress based on due date
// If no due date is set, returns 0
// Otherwise returns (days_elapsed / days_until_due) * 100, capped at 100
function calculateProgress(createdAt, dueDate) {
    if (!dueDate) {
        return 0;
    }

    const now = new Date();
    const projectStart = new Date(createdAt);
    const projectDue = new Date(dueDate);

    // If due date is in the past, return 100
    if (projectDue <= now) {
        return 100;
    }

    // Calculate days elapsed and total days
    const daysElapsed = (now - projectStart) / (1000 * 60 * 60 * 24);
    const totalDays = (projectDue - projectStart) / (1000 * 60 * 60 * 24);

    // Avoid division by zero
    if (totalDays <= 0) {
        return 0;
    }

    const progress = (daysElapsed / totalDays) * 100;
    const cappedProgress = Math.min(progress, 100); // Cap at 100%
    return parseFloat(cappedProgress.toFixed(2)); // Round to 2 decimal places
}

// Create a new project
exports.createProject = (req, res) => {
    const { title, description, authorId, authorName, joinCode, dueDate } = req.body;

    if (!title || !description || !authorId || !authorName) {
        return res.status(400).json({
            success: false,
            message: 'Title, description, authorId, and authorName are required'
        });
    }

    // Use provided join code or generate one if not provided (fallback)
    const finalJoinCode = joinCode || generateJoinCode();

    // Format dueDate - convert empty string to null for database
    const finalDueDate = dueDate && dueDate.trim() ? dueDate : null;

    const query = `
        INSERT INTO Projects (title, description, authorId, authorName, joinCode, status, progress, dueDate)
        VALUES (?, ?, ?, ?, ?, 'Active', 0, ?)
    `;

    db.run(query, [title, description, authorId, authorName, finalJoinCode, finalDueDate], function (err) {
        if (err) {
            console.error('Error creating project:', err.message);
            return res.status(500).json({
                success: false,
                message: 'Error creating project',
                error: err.message
            });
        }

        const projectId = this.lastID;

        // Add the creator as a member of the project
        const memberQuery = `INSERT INTO ProjectMembers (projectId, userId, invitationStatus) VALUES (?, ?, 'approved')`;

        db.run(memberQuery, [projectId, authorId], (memberErr) => {
            if (memberErr) {
                console.error('Error adding project creator as member:', memberErr.message);
                return res.status(500).json({
                    success: false,
                    message: 'Error adding creator as member',
                    error: memberErr.message
                });
            }

            // Fetch the created project with member count
            const fetchQuery = `
                SELECT p.*, COUNT(pm.userId) as peopleJoined
                FROM Projects p
                LEFT JOIN ProjectMembers pm ON p.id = pm.projectId
                WHERE p.id = ?
                GROUP BY p.id
            `;

            db.get(fetchQuery, [projectId], (fetchErr, project) => {
                if (fetchErr) {
                    console.error('Error fetching created project:', fetchErr.message);
                    return res.status(500).json({
                        success: false,
                        message: 'Project created but error fetching details'
                    });
                }

                res.status(201).json({
                    success: true,
                    message: 'Project created successfully',
                    project: project
                });
            });
        });
    });
};

// Join a project using join code
exports.joinProject = (req, res) => {
    const { joinCode, userId } = req.body;

    if (!joinCode || !userId) {
        return res.status(400).json({
            success: false,
            message: 'Join code and user ID are required'
        });
    }

    // Find project by join code (case-insensitive)
    const findProjectQuery = `SELECT * FROM Projects WHERE LOWER(joinCode) = LOWER(?)`;

    db.get(findProjectQuery, [joinCode], (err, project) => {
        if (err) {
            console.error('Error finding project:', err.message);
            return res.status(500).json({
                success: false,
                message: 'Error finding project',
                error: err.message
            });
        }

        if (!project) {
            return res.status(404).json({
                success: false,
                message: 'Invalid join code. Please check and try again.'
            });
        }

        // Check if user is the project owner
        if (project.authorId === userId) {
            return res.status(400).json({
                success: false,
                message: 'You cannot join your own project'
            });
        }

        // Check if user is already a member
        const checkMemberQuery = `SELECT * FROM ProjectMembers WHERE projectId = ? AND userId = ?`;

        db.get(checkMemberQuery, [project.id, userId], (checkErr, existingMember) => {
            if (checkErr) {
                console.error('Error checking membership:', checkErr.message);
                return res.status(500).json({
                    success: false,
                    message: 'Error checking membership',
                    error: checkErr.message
                });
            }

            if (existingMember) {
                if (existingMember.invitationStatus === 'pending') {
                    return res.status(400).json({
                        success: false,
                        message: 'Your request is pending approval'
                    });
                }
                return res.status(400).json({
                    success: false,
                    message: 'You are already a member of this project'
                });
            }

            // Add user to project with pending status
            const addMemberQuery = `INSERT INTO ProjectMembers (projectId, userId, invitationStatus) VALUES (?, ?, 'pending')`;

            db.run(addMemberQuery, [project.id, userId], (addErr) => {
                if (addErr) {
                    console.error('Error creating join request:', addErr.message);
                    return res.status(500).json({
                        success: false,
                        message: 'Error creating join request',
                        error: addErr.message
                    });
                }

                res.status(200).json({
                    success: true,
                    message: `Join request sent for "${project.title}". Waiting for approval.`,
                    project: project
                });
            });
        });
    });
};

// Get all projects for a specific user (including pending)
exports.getUserProjects = (req, res) => {
    const { userId } = req.params;

    if (!userId) {
        return res.status(400).json({
            success: false,
            message: 'User ID is required'
        });
    }

    const query = `
        SELECT 
            p.*, 
            pm.invitationStatus,
            COUNT(pm2.userId) as peopleJoined
        FROM Projects p
        INNER JOIN ProjectMembers pm ON p.id = pm.projectId
        LEFT JOIN ProjectMembers pm2 ON p.id = pm2.projectId AND pm2.invitationStatus = 'approved'
        WHERE pm.userId = ? AND pm.invitationStatus IN ('approved', 'pending')
        GROUP BY p.id
        ORDER BY pm.invitationStatus ASC, p.createdAt DESC
    `;

    db.all(query, [userId], (err, projects) => {
        if (err) {
            console.error('Error fetching user projects:', err.message);
            return res.status(500).json({
                success: false,
                message: 'Error fetching projects',
                error: err.message
            });
        }

        // Calculate dynamic progress for each project
        const projectsWithProgress = (projects || []).map(project => ({
            ...project,
            progress: calculateProgress(project.createdAt, project.dueDate)
        }));

        res.status(200).json({
            success: true,
            projects: projectsWithProgress
        });
    });
};

// Get project by ID with member check
exports.getProjectById = (req, res) => {
    const { projectId } = req.params;
    const { userId } = req.query;

    if (!projectId) {
        return res.status(400).json({
            success: false,
            message: 'Project ID is required'
        });
    }

    const query = `
        SELECT p.*, COUNT(pm.userId) as peopleJoined
        FROM Projects p
        LEFT JOIN ProjectMembers pm ON p.id = pm.projectId
        WHERE p.id = ?
        GROUP BY p.id
    `;

    db.get(query, [projectId], (err, project) => {
        if (err) {
            console.error('Error fetching project:', err.message);
            return res.status(500).json({
                success: false,
                message: 'Error fetching project',
                error: err.message
            });
        }

        if (!project) {
            return res.status(404).json({
                success: false,
                message: 'Project not found'
            });
        }

        // Calculate dynamic progress
        project.progress = calculateProgress(project.createdAt, project.dueDate);

        // Check if user is a member (if userId provided)
        if (userId) {
            const memberQuery = `SELECT * FROM ProjectMembers WHERE projectId = ? AND userId = ?`;

            db.get(memberQuery, [projectId, userId], (memberErr, member) => {
                if (memberErr) {
                    console.error('Error checking membership:', memberErr.message);
                }

                project.isMember = !!member;
                project.isAuthor = project.authorId == userId;

                res.status(200).json({
                    success: true,
                    project: project
                });
            });
        } else {
            res.status(200).json({
                success: true,
                project: project
            });
        }
    });
};

// Get all members of a project
exports.getProjectMembers = (req, res) => {
    const { projectId } = req.params;

    if (!projectId) {
        return res.status(400).json({
            success: false,
            message: 'Project ID is required'
        });
    }

    const query = `
        SELECT 
            u.id,
            u.name,
            u.email,
            u.designation,
            u.company,
            u.location,
            pm.joinedAt,
            p.authorId,
            CASE WHEN p.authorId = u.id THEN 1 ELSE 0 END as isOwner
        FROM ProjectMembers pm
        INNER JOIN Users u ON pm.userId = u.id
        INNER JOIN Projects p ON pm.projectId = p.id
        WHERE pm.projectId = ? AND pm.invitationStatus = 'approved'
        ORDER BY isOwner DESC, pm.joinedAt ASC
    `;

    db.all(query, [projectId], (err, members) => {
        if (err) {
            console.error('Error fetching project members:', err.message);
            return res.status(500).json({
                success: false,
                message: 'Error fetching project members',
                error: err.message
            });
        }

        res.status(200).json({
            success: true,
            members: members || []
        });
    });
};

// Get pending join requests for a project
exports.getPendingRequests = (req, res) => {
    const { projectId } = req.params;

    if (!projectId) {
        return res.status(400).json({
            success: false,
            message: 'Project ID is required'
        });
    }

    const query = `
        SELECT 
            u.id,
            u.name,
            u.email,
            u.designation,
            u.company,
            u.location,
            pm.joinedAt as requestedAt
        FROM ProjectMembers pm
        INNER JOIN Users u ON pm.userId = u.id
        WHERE pm.projectId = ? AND pm.invitationStatus = 'pending'
        ORDER BY pm.joinedAt DESC
    `;

    db.all(query, [projectId], (err, requests) => {
        if (err) {
            console.error('Error fetching pending requests:', err.message);
            return res.status(500).json({
                success: false,
                message: 'Error fetching pending requests',
                error: err.message
            });
        }

        res.status(200).json({
            success: true,
            requests: requests || []
        });
    });
};

// Approve a join request
exports.approveRequest = (req, res) => {
    const { projectId, userId } = req.params;

    if (!projectId || !userId) {
        return res.status(400).json({
            success: false,
            message: 'Project ID and User ID are required'
        });
    }

    const query = `
        UPDATE ProjectMembers 
        SET invitationStatus = 'approved'
        WHERE projectId = ? AND userId = ? AND invitationStatus = 'pending'
    `;

    db.run(query, [projectId, userId], function (err) {
        if (err) {
            console.error('Error approving request:', err.message);
            return res.status(500).json({
                success: false,
                message: 'Error approving request',
                error: err.message
            });
        }

        if (this.changes === 0) {
            return res.status(404).json({
                success: false,
                message: 'Request not found or already processed'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Join request approved successfully'
        });
    });
};

// Reject a join request
exports.rejectRequest = (req, res) => {
    const { projectId, userId } = req.params;

    if (!projectId || !userId) {
        return res.status(400).json({
            success: false,
            message: 'Project ID and User ID are required'
        });
    }

    const query = `
        DELETE FROM ProjectMembers 
        WHERE projectId = ? AND userId = ? AND invitationStatus = 'pending'
    `;

    db.run(query, [projectId, userId], function (err) {
        if (err) {
            console.error('Error rejecting request:', err.message);
            return res.status(500).json({
                success: false,
                message: 'Error rejecting request',
                error: err.message
            });
        }

        if (this.changes === 0) {
            return res.status(404).json({
                success: false,
                message: 'Request not found or already processed'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Join request rejected'
        });
    });
};

// Update project
exports.updateProject = (req, res) => {
    const { id } = req.params;
    const { title, description, userId, githubRepoUrl, githubOwner, githubRepo, dueDate } = req.body;

    // Build dynamic update query based on provided fields
    const updates = [];
    const values = [];

    if (title !== undefined) {
        updates.push('title = ?');
        values.push(title);
    }

    if (description !== undefined) {
        updates.push('description = ?');
        values.push(description);
    }

    if (githubRepoUrl !== undefined) {
        updates.push('githubRepoUrl = ?');
        values.push(githubRepoUrl);
    }

    if (githubOwner !== undefined) {
        updates.push('githubOwner = ?');
        values.push(githubOwner);
    }

    if (githubRepo !== undefined) {
        updates.push('githubRepo = ?');
        values.push(githubRepo);
    }

    if (dueDate !== undefined) {
        updates.push('dueDate = ?');
        const finalDueDate = dueDate && dueDate.trim() ? dueDate : null;
        values.push(finalDueDate);
    }

    if (updates.length === 0) {
        return res.status(400).json({
            success: false,
            message: 'No fields to update'
        });
    }

    // First check if the user is the project author (only for title/description updates)
    // GitHub URL updates are allowed for any project member
    const isGithubOnlyUpdate = (updates.length > 0) &&
        !updates.some(u => u.includes('title') || u.includes('description') || u.includes('dueDate'));

    const checkQuery = `SELECT authorId FROM Projects WHERE id = ?`;

    db.get(checkQuery, [id], (err, project) => {
        if (err) {
            console.error('Error checking project ownership:', err.message);
            return res.status(500).json({
                success: false,
                message: 'Error checking project ownership',
                error: err.message
            });
        }

        if (!project) {
            return res.status(404).json({
                success: false,
                message: 'Project not found'
            });
        }

        // Only check authorization for title/description/dueDate updates, not for GitHub URL updates
        if (!isGithubOnlyUpdate && userId && project.authorId != userId) {
            return res.status(403).json({
                success: false,
                message: 'Only the project owner can update the project'
            });
        }

        // Update the project
        values.push(id); // Add id at the end for WHERE clause
        const updateQuery = `
            UPDATE Projects 
            SET ${updates.join(', ')}
            WHERE id = ?
        `;

        db.run(updateQuery, values, function (updateErr) {
            if (updateErr) {
                console.error('Error updating project:', updateErr.message);
                return res.status(500).json({
                    success: false,
                    message: 'Error updating project',
                    error: updateErr.message
                });
            }

            res.status(200).json({
                success: true,
                message: 'Project updated successfully'
            });
        });
    });
};

// Delete project
exports.deleteProject = (req, res) => {
    const { id } = req.params;
    const { userId } = req.body;

    // First check if the user is the project author
    const checkQuery = `SELECT authorId FROM Projects WHERE id = ?`;

    db.get(checkQuery, [id], (err, project) => {
        if (err) {
            console.error('Error checking project ownership:', err.message);
            return res.status(500).json({
                success: false,
                message: 'Error checking project ownership',
                error: err.message
            });
        }

        if (!project) {
            return res.status(404).json({
                success: false,
                message: 'Project not found'
            });
        }

        if (project.authorId != userId) {
            return res.status(403).json({
                success: false,
                message: 'Only the project owner can delete the project'
            });
        }

        // Delete all project members first
        const deleteMembersQuery = `DELETE FROM ProjectMembers WHERE projectId = ?`;

        db.run(deleteMembersQuery, [id], (memberErr) => {
            if (memberErr) {
                console.error('Error deleting project members:', memberErr.message);
                return res.status(500).json({
                    success: false,
                    message: 'Error deleting project members',
                    error: memberErr.message
                });
            }

            // Delete all tasks associated with the project
            const deleteTasksQuery = `DELETE FROM Tasks WHERE projectId = ?`;

            db.run(deleteTasksQuery, [id], (taskErr) => {
                if (taskErr) {
                    console.error('Error deleting project tasks:', taskErr.message);
                    return res.status(500).json({
                        success: false,
                        message: 'Error deleting project tasks',
                        error: taskErr.message
                    });
                }

                // Delete the project
                const deleteProjectQuery = `DELETE FROM Projects WHERE id = ?`;

                db.run(deleteProjectQuery, [id], function (deleteErr) {
                    if (deleteErr) {
                        console.error('Error deleting project:', deleteErr.message);
                        return res.status(500).json({
                            success: false,
                            message: 'Error deleting project',
                            error: deleteErr.message
                        });
                    }

                    res.status(200).json({
                        success: true,
                        message: 'Project and all associated data deleted successfully'
                    });
                });
            });
        });
    });
};
