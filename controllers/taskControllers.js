const db = require('../database/initDb');

// Create a new task
exports.createTask = (req, res) => {
    const { projectId, title, description, taskAuthor, taskAuthorId, onlyAuthorCanComplete, dueDate } = req.body;

    if (!projectId || !title || !taskAuthor || !taskAuthorId) {
        return res.status(400).json({
            success: false,
            message: 'Project ID, title, task author, and author ID are required'
        });
    }

    const query = `
        INSERT INTO Tasks (
            projectId, 
            title, 
            description,
            taskAuthor, 
            taskAuthorId, 
            createdBy, 
            createdById, 
            onlyAuthorCanComplete,
            dueDate
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const onlyAuthor = onlyAuthorCanComplete ? 1 : 0;

    db.run(
        query,
        [projectId, title, description || null, taskAuthor, taskAuthorId, taskAuthor, taskAuthorId, onlyAuthor, dueDate || null],
        function (err) {
            if (err) {
                console.error('Error creating task:', err.message);
                return res.status(500).json({
                    success: false,
                    message: 'Error creating task',
                    error: err.message
                });
            }

            const taskId = this.lastID;

            // Fetch the created task
            const fetchQuery = `SELECT * FROM Tasks WHERE id = ?`;

            db.get(fetchQuery, [taskId], (fetchErr, task) => {
                if (fetchErr) {
                    console.error('Error fetching created task:', fetchErr.message);
                    return res.status(500).json({
                        success: false,
                        message: 'Task created but error fetching details'
                    });
                }

                res.status(201).json({
                    success: true,
                    message: 'Task created successfully',
                    task: task
                });
            });
        }
    );
};

// Get all tasks for a specific project
exports.getProjectTasks = (req, res) => {
    const { projectId } = req.params;

    if (!projectId) {
        return res.status(400).json({
            success: false,
            message: 'Project ID is required'
        });
    }

    const query = `
        SELECT * FROM Tasks 
        WHERE projectId = ? 
        ORDER BY completed ASC, createdAt DESC
    `;

    db.all(query, [projectId], (err, tasks) => {
        if (err) {
            console.error('Error fetching tasks:', err.message);
            return res.status(500).json({
                success: false,
                message: 'Error fetching tasks',
                error: err.message
            });
        }

        res.status(200).json({
            success: true,
            tasks: tasks || []
        });
    });
};

// Toggle task completion with access control
exports.toggleTaskCompletion = (req, res) => {
    const { taskId } = req.params;
    const { userId, userName } = req.body;

    if (!taskId || !userId || !userName) {
        return res.status(400).json({
            success: false,
            message: 'Task ID, user ID, and user name are required'
        });
    }

    // First, fetch the task to check current status and permissions
    const fetchQuery = `SELECT * FROM Tasks WHERE id = ?`;

    db.get(fetchQuery, [taskId], (err, task) => {
        if (err) {
            console.error('Error fetching task:', err.message);
            return res.status(500).json({
                success: false,
                message: 'Error fetching task',
                error: err.message
            });
        }

        if (!task) {
            return res.status(404).json({
                success: false,
                message: 'Task not found'
            });
        }

        // Check if task is being marked as complete
        if (!task.completed) {
            // Check if onlyAuthorCanComplete is enabled
            if (task.onlyAuthorCanComplete && task.taskAuthorId != userId) {
                return res.status(403).json({
                    success: false,
                    message: 'Only the task author can complete this task'
                });
            }

            // Mark task as complete
            const updateQuery = `
                UPDATE Tasks 
                SET completed = 1, 
                    completedBy = ?, 
                    completedById = ?,
                    completionDate = datetime('now')
                WHERE id = ?
            `;

            db.run(updateQuery, [userName, userId, taskId], function (updateErr) {
                if (updateErr) {
                    console.error('Error updating task:', updateErr.message);
                    return res.status(500).json({
                        success: false,
                        message: 'Error updating task',
                        error: updateErr.message
                    });
                }

                // Fetch updated task
                db.get(fetchQuery, [taskId], (fetchErr, updatedTask) => {
                    if (fetchErr) {
                        console.error('Error fetching updated task:', fetchErr.message);
                        return res.status(500).json({
                            success: false,
                            message: 'Task updated but error fetching details'
                        });
                    }

                    res.status(200).json({
                        success: true,
                        message: 'Task marked as complete',
                        task: updatedTask
                    });
                });
            });
        } else {
            // Mark task as incomplete (uncomplete)
            // Check if onlyAuthorCanComplete is enabled - prevent unauthorized uncomplete
            if (task.onlyAuthorCanComplete && task.taskAuthorId != userId) {
                return res.status(403).json({
                    success: false,
                    message: 'Only the task author can modify this task'
                });
            }

            const updateQuery = `
                UPDATE Tasks 
                SET completed = 0, 
                    completedBy = NULL, 
                    completedById = NULL,
                    completionDate = NULL
                WHERE id = ?
            `;

            db.run(updateQuery, [taskId], function (updateErr) {
                if (updateErr) {
                    console.error('Error updating task:', updateErr.message);
                    return res.status(500).json({
                        success: false,
                        message: 'Error updating task',
                        error: updateErr.message
                    });
                }

                // Fetch updated task
                db.get(fetchQuery, [taskId], (fetchErr, updatedTask) => {
                    if (fetchErr) {
                        console.error('Error fetching updated task:', fetchErr.message);
                        return res.status(500).json({
                            success: false,
                            message: 'Task updated but error fetching details'
                        });
                    }

                    res.status(200).json({
                        success: true,
                        message: 'Task marked as incomplete',
                        task: updatedTask
                    });
                });
            });
        }
    });
};

// Edit a task (only author can edit)
exports.editTask = (req, res) => {
    const { taskId } = req.params;
    const { userId, title, description, onlyAuthorCanComplete, dueDate } = req.body;

    if (!taskId || !userId) {
        return res.status(400).json({
            success: false,
            message: 'Task ID and user ID are required'
        });
    }

    if (!title) {
        return res.status(400).json({
            success: false,
            message: 'Task title is required'
        });
    }

    // Check if user is the task author
    const checkQuery = `SELECT * FROM Tasks WHERE id = ? AND taskAuthorId = ?`;

    db.get(checkQuery, [taskId, userId], (err, task) => {
        if (err) {
            console.error('Error checking task ownership:', err.message);
            return res.status(500).json({
                success: false,
                message: 'Error checking task ownership',
                error: err.message
            });
        }

        if (!task) {
            return res.status(403).json({
                success: false,
                message: 'Only the task author can edit this task'
            });
        }

        // Update the task
        const onlyAuthor = onlyAuthorCanComplete ? 1 : 0;
        const updateQuery = `
            UPDATE Tasks 
            SET title = ?, 
                description = ?, 
                onlyAuthorCanComplete = ?,
                dueDate = ?
            WHERE id = ?
        `;

        db.run(updateQuery, [title, description || null, onlyAuthor, dueDate || null, taskId], function (updateErr) {
            if (updateErr) {
                console.error('Error updating task:', updateErr.message);
                return res.status(500).json({
                    success: false,
                    message: 'Error updating task',
                    error: updateErr.message
                });
            }

            // Fetch updated task
            const fetchQuery = `SELECT * FROM Tasks WHERE id = ?`;
            db.get(fetchQuery, [taskId], (fetchErr, updatedTask) => {
                if (fetchErr) {
                    console.error('Error fetching updated task:', fetchErr.message);
                    return res.status(500).json({
                        success: false,
                        message: 'Task updated but error fetching details'
                    });
                }

                res.status(200).json({
                    success: true,
                    message: 'Task updated successfully',
                    task: updatedTask
                });
            });
        });
    });
};

// Delete a task (optional - only author can delete)
exports.deleteTask = (req, res) => {
    const { taskId } = req.params;
    const { userId } = req.body;

    if (!taskId || !userId) {
        return res.status(400).json({
            success: false,
            message: 'Task ID and user ID are required'
        });
    }

    // Check if user is the task author
    const checkQuery = `SELECT * FROM Tasks WHERE id = ? AND taskAuthorId = ?`;

    db.get(checkQuery, [taskId, userId], (err, task) => {
        if (err) {
            console.error('Error checking task ownership:', err.message);
            return res.status(500).json({
                success: false,
                message: 'Error checking task ownership',
                error: err.message
            });
        }

        if (!task) {
            return res.status(403).json({
                success: false,
                message: 'Only the task author can delete this task'
            });
        }

        // Delete the task
        const deleteQuery = `DELETE FROM Tasks WHERE id = ?`;

        db.run(deleteQuery, [taskId], function (deleteErr) {
            if (deleteErr) {
                console.error('Error deleting task:', deleteErr.message);
                return res.status(500).json({
                    success: false,
                    message: 'Error deleting task',
                    error: deleteErr.message
                });
            }

            res.status(200).json({
                success: true,
                message: 'Task deleted successfully'
            });
        });
    });
};
