const express = require('express');
const router = express.Router();
const githubControllers = require('../controllers/githubControllers');

// Get repository details
router.get('/repo/:owner/:repo', githubControllers.getRepoDetails);

// Get repository tree structure
router.get('/repo/:owner/:repo/tree', githubControllers.getRepoTree);

// Get file contents
router.get('/repo/:owner/:repo/file', githubControllers.getFileContents);

// Get repository languages
router.get('/repo/:owner/:repo/languages', githubControllers.getRepoLanguages);

// Get repository README
router.get('/repo/:owner/:repo/readme', githubControllers.getRepoReadme);

// Clear cache (admin endpoint)
router.post('/cache/clear', githubControllers.clearCache);

module.exports = router;
