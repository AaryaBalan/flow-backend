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

// Helper function to check note permissions for a user
const checkNotePermissions = async (noteId, userId) => {
    return new Promise((resolve, reject) => {
        db.get(
            `SELECT n.*, 
                    np.canEdit, 
                    np.canDelete,
                    p.authorId as projectAuthorId
             FROM Notes n
             LEFT JOIN NotePermissions np ON n.id = np.noteId AND np.userId = ?
             JOIN Projects p ON n.projectId = p.id
             WHERE n.id = ? AND n.isDeleted = 0`,
            [userId, noteId],
            (err, row) => {
                if (err) reject(err);
                else resolve(row);
            }
        );
    });
};

// Create a new note
const createNote = async (req, res) => {
    const { projectId, title, content, userId, userName } = req.body;

    if (!projectId || !title || !content || !userId || !userName) {
        return res.status(400).json({
            success: false,
            message: 'Project ID, title, content, user ID, and user name are required'
        });
    }

    try {
        // Check if user is a project member
        const membership = await isProjectMember(projectId, userId);
        if (!membership) {
            return res.status(403).json({
                success: false,
                message: 'You must be a project member to create notes'
            });
        }

        db.run(
            `INSERT INTO Notes (projectId, title, content, createdBy, createdByName, updatedAt) 
             VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
            [projectId, title, content, userId, userName],
            function (err) {
                if (err) {
                    console.error('Error creating note:', err);
                    return res.status(500).json({
                        success: false,
                        message: 'Failed to create note'
                    });
                }

                // Return the created note
                db.get(
                    `SELECT * FROM Notes WHERE id = ?`,
                    [this.lastID],
                    (err, note) => {
                        if (err) {
                            console.error('Error fetching created note:', err);
                            return res.status(500).json({
                                success: false,
                                message: 'Note created but failed to fetch'
                            });
                        }

                        res.status(201).json({
                            success: true,
                            message: 'Note created successfully',
                            note: note
                        });
                    }
                );
            }
        );
    } catch (error) {
        console.error('Error in createNote:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};

// Get all notes for a project with pagination
const getProjectNotes = async (req, res) => {
    const { projectId } = req.params;
    const { userId, page = 1, limit = 20 } = req.query;

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
                message: 'You must be a project member to view notes'
            });
        }

        const offset = (page - 1) * limit;

        // Get total count
        db.get(
            `SELECT COUNT(*) as total FROM Notes WHERE projectId = ? AND isDeleted = 0`,
            [projectId],
            (err, countResult) => {
                if (err) {
                    console.error('Error counting notes:', err);
                    return res.status(500).json({
                        success: false,
                        message: 'Failed to count notes'
                    });
                }

                const total = countResult.total;
                const totalPages = Math.ceil(total / limit);

                // Get notes with permissions
                db.all(
                    `SELECT n.*, 
                            np.canEdit, 
                            np.canDelete,
                            (n.createdBy = ?) as isOwner,
                            (p.authorId = ?) as isProjectAdmin
                     FROM Notes n
                     LEFT JOIN NotePermissions np ON n.id = np.noteId AND np.userId = ?
                     JOIN Projects p ON n.projectId = p.id
                     WHERE n.projectId = ? AND n.isDeleted = 0
                     ORDER BY n.updatedAt DESC
                     LIMIT ? OFFSET ?`,
                    [userId, userId, userId, projectId, limit, offset],
                    (err, notes) => {
                        if (err) {
                            console.error('Error fetching notes:', err);
                            return res.status(500).json({
                                success: false,
                                message: 'Failed to fetch notes'
                            });
                        }

                        // Convert SQLite boolean integers to actual booleans
                        const formattedNotes = notes.map(note => ({
                            ...note,
                            canEdit: note.canEdit === 1,
                            canDelete: note.canDelete === 1,
                            isOwner: note.isOwner === 1,
                            isProjectAdmin: note.isProjectAdmin === 1
                        }));

                        res.json({
                            success: true,
                            notes: formattedNotes,
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
        console.error('Error in getProjectNotes:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};

// Get a single note by ID
const getNoteById = async (req, res) => {
    const { noteId } = req.params;
    const { userId } = req.query;

    if (!userId) {
        return res.status(400).json({
            success: false,
            message: 'User ID is required'
        });
    }

    try {
        const note = await checkNotePermissions(noteId, userId);

        if (!note) {
            return res.status(404).json({
                success: false,
                message: 'Note not found'
            });
        }

        // Check if user is project member
        const membership = await isProjectMember(note.projectId, userId);
        if (!membership) {
            return res.status(403).json({
                success: false,
                message: 'You must be a project member to view this note'
            });
        }

        // Add permission flags
        note.isOwner = note.createdBy == userId;
        note.isProjectAdmin = note.projectAuthorId == userId;
        note.canEdit = note.canEdit === 1;
        note.canDelete = note.canDelete === 1;

        res.json({
            success: true,
            note: note
        });
    } catch (error) {
        console.error('Error in getNoteById:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};

// Update a note
const updateNote = async (req, res) => {
    const { noteId } = req.params;
    const { title, content, userId, userName } = req.body;

    if (!title || !content || !userId || !userName) {
        return res.status(400).json({
            success: false,
            message: 'Title, content, user ID, and user name are required'
        });
    }

    try {
        const note = await checkNotePermissions(noteId, userId);

        if (!note) {
            return res.status(404).json({
                success: false,
                message: 'Note not found'
            });
        }

        // Check permissions: owner, has edit permission, or is project admin
        const canEdit = note.createdBy == userId || note.canEdit || note.projectAuthorId == userId;

        if (!canEdit) {
            return res.status(403).json({
                success: false,
                message: 'You do not have permission to edit this note'
            });
        }

        // Use transaction for concurrent update safety
        db.serialize(() => {
            db.run('BEGIN TRANSACTION');

            db.run(
                `UPDATE Notes 
                 SET title = ?, 
                     content = ?, 
                     updatedBy = ?, 
                     updatedByName = ?, 
                     updatedAt = CURRENT_TIMESTAMP
                 WHERE id = ? AND isDeleted = 0`,
                [title, content, userId, userName, noteId],
                function (err) {
                    if (err) {
                        db.run('ROLLBACK');
                        console.error('Error updating note:', err);
                        return res.status(500).json({
                            success: false,
                            message: 'Failed to update note'
                        });
                    }

                    if (this.changes === 0) {
                        db.run('ROLLBACK');
                        return res.status(404).json({
                            success: false,
                            message: 'Note not found or already deleted'
                        });
                    }

                    db.run('COMMIT');

                    // Fetch and return updated note
                    db.get(
                        `SELECT * FROM Notes WHERE id = ?`,
                        [noteId],
                        (err, updatedNote) => {
                            if (err) {
                                console.error('Error fetching updated note:', err);
                                return res.status(500).json({
                                    success: false,
                                    message: 'Note updated but failed to fetch'
                                });
                            }

                            res.json({
                                success: true,
                                message: 'Note updated successfully',
                                note: updatedNote
                            });
                        }
                    );
                }
            );
        });
    } catch (error) {
        console.error('Error in updateNote:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};

// Delete a note (soft delete)
const deleteNote = async (req, res) => {
    const { noteId } = req.params;
    const { userId } = req.body;

    if (!userId) {
        return res.status(400).json({
            success: false,
            message: 'User ID is required'
        });
    }

    try {
        const note = await checkNotePermissions(noteId, userId);

        if (!note) {
            return res.status(404).json({
                success: false,
                message: 'Note not found'
            });
        }

        // Check permissions: owner, has delete permission, or is project admin
        const canDelete = note.createdBy == userId || note.canDelete || note.projectAuthorId == userId;

        if (!canDelete) {
            return res.status(403).json({
                success: false,
                message: 'You do not have permission to delete this note'
            });
        }

        db.run(
            `UPDATE Notes SET isDeleted = 1, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
            [noteId],
            function (err) {
                if (err) {
                    console.error('Error deleting note:', err);
                    return res.status(500).json({
                        success: false,
                        message: 'Failed to delete note'
                    });
                }

                res.json({
                    success: true,
                    message: 'Note deleted successfully'
                });
            }
        );
    } catch (error) {
        console.error('Error in deleteNote:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};

// Grant permissions to a user for a note
const grantPermission = async (req, res) => {
    const { noteId } = req.params;
    const { targetUserId, canEdit, canDelete, grantedBy } = req.body;

    if (!targetUserId || !grantedBy || canEdit === undefined || canDelete === undefined) {
        return res.status(400).json({
            success: false,
            message: 'Target user ID, granted by, and permissions are required'
        });
    }

    try {
        const note = await checkNotePermissions(noteId, grantedBy);

        if (!note) {
            return res.status(404).json({
                success: false,
                message: 'Note not found'
            });
        }

        // Only note owner or project admin can grant permissions
        if (note.createdBy != grantedBy && note.projectAuthorId != grantedBy) {
            return res.status(403).json({
                success: false,
                message: 'Only note owner or project admin can grant permissions'
            });
        }

        // Check if target user is a project member
        const targetMembership = await isProjectMember(note.projectId, targetUserId);
        if (!targetMembership) {
            return res.status(400).json({
                success: false,
                message: 'Target user must be a project member'
            });
        }

        db.run(
            `INSERT INTO NotePermissions (noteId, userId, canEdit, canDelete, grantedBy)
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(noteId, userId) DO UPDATE SET
                canEdit = excluded.canEdit,
                canDelete = excluded.canDelete,
                grantedBy = excluded.grantedBy,
                grantedAt = CURRENT_TIMESTAMP`,
            [noteId, targetUserId, canEdit ? 1 : 0, canDelete ? 1 : 0, grantedBy],
            function (err) {
                if (err) {
                    console.error('Error granting permission:', err);
                    return res.status(500).json({
                        success: false,
                        message: 'Failed to grant permission'
                    });
                }

                res.json({
                    success: true,
                    message: 'Permission granted successfully'
                });
            }
        );
    } catch (error) {
        console.error('Error in grantPermission:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};

// Revoke permissions from a user for a note
const revokePermission = async (req, res) => {
    const { noteId, userId } = req.params;
    const { revokedBy } = req.body;

    if (!revokedBy) {
        return res.status(400).json({
            success: false,
            message: 'Revoked by user ID is required'
        });
    }

    try {
        const note = await checkNotePermissions(noteId, revokedBy);

        if (!note) {
            return res.status(404).json({
                success: false,
                message: 'Note not found'
            });
        }

        // Only note owner or project admin can revoke permissions
        if (note.createdBy != revokedBy && note.projectAuthorId != revokedBy) {
            return res.status(403).json({
                success: false,
                message: 'Only note owner or project admin can revoke permissions'
            });
        }

        db.run(
            `DELETE FROM NotePermissions WHERE noteId = ? AND userId = ?`,
            [noteId, userId],
            function (err) {
                if (err) {
                    console.error('Error revoking permission:', err);
                    return res.status(500).json({
                        success: false,
                        message: 'Failed to revoke permission'
                    });
                }

                res.json({
                    success: true,
                    message: 'Permission revoked successfully'
                });
            }
        );
    } catch (error) {
        console.error('Error in revokePermission:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};

// Get permissions for a specific user on a note
const getUserPermissions = async (req, res) => {
    const { noteId, userId } = req.params;

    if (!noteId || !userId) {
        return res.status(400).json({
            success: false,
            message: 'Note ID and User ID are required'
        });
    }

    try {
        // Check if note exists
        const note = await new Promise((resolve, reject) => {
            db.get(
                `SELECT id, createdBy FROM Notes WHERE id = ? AND isDeleted = 0`,
                [noteId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        if (!note) {
            return res.status(404).json({
                success: false,
                message: 'Note not found'
            });
        }

        // Get permissions from NotePermissions table
        const permissions = await new Promise((resolve, reject) => {
            db.get(
                `SELECT canEdit, canDelete FROM NotePermissions WHERE noteId = ? AND userId = ?`,
                [noteId, userId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        res.json({
            success: true,
            canEdit: permissions?.canEdit === 1 || false,
            canDelete: permissions?.canDelete === 1 || false,
            isOwner: note.createdBy == userId
        });
    } catch (error) {
        console.error('Error in getUserPermissions:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};

module.exports = {
    createNote,
    getProjectNotes,
    getNoteById,
    updateNote,
    deleteNote,
    grantPermission,
    revokePermission,
    getUserPermissions
};
