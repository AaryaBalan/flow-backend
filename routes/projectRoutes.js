const express = require('express');
const router = express.Router();
const projectControllers = require('../controllers/projectControllers');

// Create a new project
router.post('/create', projectControllers.createProject);

// Join a project using join code
router.post('/join', projectControllers.joinProject);

// Get all projects for a user
router.get('/user/:userId', projectControllers.getUserProjects);

// Get project members
router.get('/:projectId/members', projectControllers.getProjectMembers);

// Get pending join requests
router.get('/:projectId/requests', projectControllers.getPendingRequests);

// Approve a join request
router.put('/:projectId/requests/:userId/approve', projectControllers.approveRequest);

// Reject a join request
router.put('/:projectId/requests/:userId/reject', projectControllers.rejectRequest);

// Get project by ID
router.get('/:projectId', projectControllers.getProjectById);

// Update project
router.put('/:id', projectControllers.updateProject);

// Delete project
router.delete('/:id', projectControllers.deleteProject);

module.exports = router;
