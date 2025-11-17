const axios = require('axios');
const NodeCache = require('node-cache');

// Cache with TTL of 1 hour
const cache = new NodeCache({ stdTTL: 3600, checkperiod: 600 });

// GitHub API configuration
const GITHUB_API_BASE = 'https://api.github.com';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || ''; // Add token in .env for higher rate limits

// Helper to make GitHub API requests with auth
const githubRequest = async (url, params = {}) => {
    const headers = {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'DevCollab-App'
    };

    if (GITHUB_TOKEN) {
        headers['Authorization'] = `token ${GITHUB_TOKEN}`;
    }

    const response = await axios.get(url, {
        headers,
        params,
        timeout: 10000
    });

    return response.data;
};

// Get repository details
exports.getRepoDetails = async (req, res) => {
    const { owner, repo } = req.params;

    if (!owner || !repo) {
        return res.status(400).json({
            success: false,
            message: 'Repository owner and name are required'
        });
    }

    const cacheKey = `repo_${owner}_${repo}`;
    const cached = cache.get(cacheKey);

    if (cached) {
        return res.status(200).json({
            success: true,
            data: cached,
            cached: true
        });
    }

    try {
        const repoData = await githubRequest(`${GITHUB_API_BASE}/repos/${owner}/${repo}`);

        const result = {
            name: repoData.name,
            fullName: repoData.full_name,
            description: repoData.description,
            owner: {
                login: repoData.owner.login,
                avatarUrl: repoData.owner.avatar_url,
                htmlUrl: repoData.owner.html_url
            },
            htmlUrl: repoData.html_url,
            language: repoData.language,
            stars: repoData.stargazers_count,
            forks: repoData.forks_count,
            watchers: repoData.watchers_count,
            openIssues: repoData.open_issues_count,
            defaultBranch: repoData.default_branch,
            topics: repoData.topics || [],
            license: repoData.license ? repoData.license.name : null,
            createdAt: repoData.created_at,
            updatedAt: repoData.updated_at,
            pushedAt: repoData.pushed_at,
            size: repoData.size,
            visibility: repoData.visibility || 'public'
        };

        cache.set(cacheKey, result);

        res.status(200).json({
            success: true,
            data: result,
            cached: false
        });
    } catch (error) {
        console.error('Error fetching repository details:', error.message);

        if (error.response?.status === 404) {
            return res.status(404).json({
                success: false,
                message: 'Repository not found'
            });
        }

        if (error.response?.status === 403) {
            return res.status(403).json({
                success: false,
                message: 'GitHub API rate limit exceeded. Please try again later.'
            });
        }

        res.status(500).json({
            success: false,
            message: 'Error fetching repository details',
            error: error.message
        });
    }
};

// Get repository tree structure
exports.getRepoTree = async (req, res) => {
    const { owner, repo } = req.params;
    const { branch } = req.query;

    if (!owner || !repo) {
        return res.status(400).json({
            success: false,
            message: 'Repository owner and name are required'
        });
    }

    try {
        // If no branch specified, get the default branch from repo details
        let defaultBranch = branch;
        if (!defaultBranch) {
            const repoData = await githubRequest(`${GITHUB_API_BASE}/repos/${owner}/${repo}`);
            defaultBranch = repoData.default_branch;
        }

        const cacheKey = `tree_${owner}_${repo}_${defaultBranch}`;
        const cached = cache.get(cacheKey);

        if (cached) {
            return res.status(200).json({
                success: true,
                data: cached,
                cached: true
            });
        }

        // Get the latest commit SHA for the branch
        const branchData = await githubRequest(
            `${GITHUB_API_BASE}/repos/${owner}/${repo}/branches/${defaultBranch}`
        );

        const treeSha = branchData.commit.commit.tree.sha;

        // Get the tree recursively
        const treeData = await githubRequest(
            `${GITHUB_API_BASE}/repos/${owner}/${repo}/git/trees/${treeSha}`,
            { recursive: 1 }
        );

        // Build a structured tree
        const structuredTree = buildTree(treeData.tree);

        const result = {
            branch: defaultBranch,
            sha: treeSha,
            truncated: treeData.truncated,
            tree: structuredTree
        };

        cache.set(cacheKey, result);

        res.status(200).json({
            success: true,
            data: result,
            cached: false
        });
    } catch (error) {
        console.error('Error fetching repository tree:', error.message);

        if (error.response?.status === 404) {
            return res.status(404).json({
                success: false,
                message: 'Repository or branch not found'
            });
        }

        res.status(500).json({
            success: false,
            message: 'Error fetching repository tree',
            error: error.message
        });
    }
};

// Get file contents
exports.getFileContents = async (req, res) => {
    const { owner, repo } = req.params;
    const { path, branch } = req.query;

    if (!owner || !repo || !path) {
        return res.status(400).json({
            success: false,
            message: 'Repository owner, name, and file path are required'
        });
    }

    try {
        // If no branch specified, get the default branch from repo details
        let defaultBranch = branch;
        if (!defaultBranch) {
            const repoData = await githubRequest(`${GITHUB_API_BASE}/repos/${owner}/${repo}`);
            defaultBranch = repoData.default_branch;
        }

        const cacheKey = `file_${owner}_${repo}_${defaultBranch}_${path}`;
        const cached = cache.get(cacheKey);

        if (cached) {
            return res.status(200).json({
                success: true,
                data: cached,
                cached: true
            });
        }

        const fileData = await githubRequest(
            `${GITHUB_API_BASE}/repos/${owner}/${repo}/contents/${path}`,
            { ref: defaultBranch }
        );

        // Decode base64 content
        const content = fileData.encoding === 'base64'
            ? Buffer.from(fileData.content, 'base64').toString('utf-8')
            : fileData.content;

        const result = {
            name: fileData.name,
            path: fileData.path,
            sha: fileData.sha,
            size: fileData.size,
            content: content,
            downloadUrl: fileData.download_url,
            htmlUrl: fileData.html_url
        };

        cache.set(cacheKey, result);

        res.status(200).json({
            success: true,
            data: result,
            cached: false
        });
    } catch (error) {
        console.error('Error fetching file contents:', error.message);

        if (error.response?.status === 404) {
            return res.status(404).json({
                success: false,
                message: 'File not found'
            });
        }

        res.status(500).json({
            success: false,
            message: 'Error fetching file contents',
            error: error.message
        });
    }
};

// Get repository languages
exports.getRepoLanguages = async (req, res) => {
    const { owner, repo } = req.params;

    if (!owner || !repo) {
        return res.status(400).json({
            success: false,
            message: 'Repository owner and name are required'
        });
    }

    const cacheKey = `languages_${owner}_${repo}`;
    const cached = cache.get(cacheKey);

    if (cached) {
        return res.status(200).json({
            success: true,
            data: cached,
            cached: true
        });
    }

    try {
        const languages = await githubRequest(`${GITHUB_API_BASE}/repos/${owner}/${repo}/languages`);

        // Calculate percentages
        const total = Object.values(languages).reduce((sum, bytes) => sum + bytes, 0);
        const languagesWithPercentages = Object.entries(languages).map(([name, bytes]) => ({
            name,
            bytes,
            percentage: ((bytes / total) * 100).toFixed(1)
        })).sort((a, b) => b.bytes - a.bytes);

        cache.set(cacheKey, languagesWithPercentages);

        res.status(200).json({
            success: true,
            data: languagesWithPercentages,
            cached: false
        });
    } catch (error) {
        console.error('Error fetching repository languages:', error.message);

        res.status(500).json({
            success: false,
            message: 'Error fetching repository languages',
            error: error.message
        });
    }
};

// Get repository README
exports.getRepoReadme = async (req, res) => {
    const { owner, repo } = req.params;

    if (!owner || !repo) {
        return res.status(400).json({
            success: false,
            message: 'Repository owner and name are required'
        });
    }

    const cacheKey = `readme_${owner}_${repo}`;
    const cached = cache.get(cacheKey);

    if (cached) {
        return res.status(200).json({
            success: true,
            data: cached,
            cached: true
        });
    }

    try {
        const readmeData = await githubRequest(`${GITHUB_API_BASE}/repos/${owner}/${repo}/readme`);

        const content = readmeData.encoding === 'base64'
            ? Buffer.from(readmeData.content, 'base64').toString('utf-8')
            : readmeData.content;

        const result = {
            name: readmeData.name,
            content: content,
            downloadUrl: readmeData.download_url,
            htmlUrl: readmeData.html_url
        };

        cache.set(cacheKey, result);

        res.status(200).json({
            success: true,
            data: result,
            cached: false
        });
    } catch (error) {
        if (error.response?.status === 404) {
            return res.status(404).json({
                success: false,
                message: 'README not found'
            });
        }

        console.error('Error fetching README:', error.message);

        res.status(500).json({
            success: false,
            message: 'Error fetching README',
            error: error.message
        });
    }
};

// Helper function to build a tree structure from flat array
function buildTree(items) {
    const root = { type: 'tree', path: '', children: [] };
    const pathMap = { '': root };

    // Sort items by path to ensure parent directories come before children
    items.sort((a, b) => a.path.localeCompare(b.path));

    items.forEach(item => {
        const parts = item.path.split('/');
        const filename = parts[parts.length - 1];
        const parentPath = parts.slice(0, -1).join('/');

        const node = {
            name: filename,
            path: item.path,
            type: item.type,
            size: item.size,
            sha: item.sha,
            children: item.type === 'tree' ? [] : undefined
        };

        // Add to parent
        const parent = pathMap[parentPath] || root;
        if (!parent.children) parent.children = [];
        parent.children.push(node);

        // Add to path map for future lookups
        if (item.type === 'tree') {
            pathMap[item.path] = node;
        }
    });

    return root.children;
}

// Clear cache endpoint (optional, for admin use)
exports.clearCache = (req, res) => {
    cache.flushAll();
    res.status(200).json({
        success: true,
        message: 'Cache cleared successfully'
    });
};
