const express = require('express');
const router = express.Router();
const taskControllers = require('../controllers/taskControllers');

// Create a new task
router.post('/create', taskControllers.createTask);

// Get all tasks for a project
router.get('/project/:projectId', taskControllers.getProjectTasks);

// Toggle task completion
router.put('/:taskId/toggle', taskControllers.toggleTaskCompletion);

// Edit a task
router.put('/:taskId/edit', taskControllers.editTask);

// Delete a task
router.delete('/:taskId', taskControllers.deleteTask);

module.exports = router;
