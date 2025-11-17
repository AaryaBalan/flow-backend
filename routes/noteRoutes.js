const express = require('express');
const router = express.Router();
const noteControllers = require('../controllers/noteControllers');

// Create a new note
router.post('/create', noteControllers.createNote);

// Get all notes for a project (with pagination)
router.get('/project/:projectId', noteControllers.getProjectNotes);

// Get a single note by ID
router.get('/:noteId', noteControllers.getNoteById);

// Update a note
router.put('/:noteId', noteControllers.updateNote);

// Delete a note (soft delete)
router.delete('/:noteId', noteControllers.deleteNote);

// Grant permissions to a user for a note
router.post('/:noteId/permissions', noteControllers.grantPermission);

// Get permissions for a specific user on a note
router.get('/:noteId/permissions/:userId', noteControllers.getUserPermissions);

// Revoke permissions from a user for a note
router.delete('/:noteId/permissions/:userId', noteControllers.revokePermission);

module.exports = router;
