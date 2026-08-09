'use strict';

const fs = require('node:fs');
const path = require('node:path');

const CLIENT_BUILD_HEADER = 'x-client-build';
const CLIENT_UPGRADE_REQUIRED_CODE = 'CLIENT_UPGRADE_REQUIRED';
const SAFE_BUILD_TOKEN = /^[A-Za-z0-9._-]{1,128}$/;

const EXACT_WRITER_ROUTES = new Set([
    'GET /api/remove',
    'HEAD /api/remove',
    'POST /api/write',
    'POST /api/patch',
    'POST /api/assets/bulk-write',
    'POST /api/backup/import/prepare',
    'POST /api/backup/import',
    'POST /api/backup/server/save',
    'POST /api/backup/server/restore',
    'POST /api/migrate/save-folder/scan',
    'POST /api/migrate/save-folder/execute',
    'POST /api/migrate/save-folder/upload',
    'POST /api/migrate/save-folder/cleanup/scan',
    'POST /api/migrate/save-folder/cleanup/execute',
    'POST /api/db/optimize',
    'POST /api/db/wal-checkpoint',
    'PUT /api/db/snapshots/limits',
    'DELETE /api/db/snapshots',
    'POST /api/db/snapshots/restore',
    'PUT /api/backup/boot-reminder',
    'PUT /api/backup/server/path',
    'POST /api/inlays/compress',
    'POST /api/bg-stream-draft/delete',
    // Reserved for the detached server-backup job pack. Keeping the fence here
    // ensures that adding the route cannot accidentally create an unfenced writer.
    'POST /api/backup/server/jobs',
]);

function parseExpectedClientBuild(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    if (typeof value.version !== 'string' || !SAFE_BUILD_TOKEN.test(value.version)) return null;
    if (typeof value.stamp !== 'string' || !SAFE_BUILD_TOKEN.test(value.stamp)) return null;
    return Object.freeze({ version: value.version, stamp: value.stamp });
}

function loadExpectedClientBuild(distDir) {
    try {
        const raw = fs.readFileSync(path.join(distDir, 'build-stamp.json'), 'utf8');
        return parseExpectedClientBuild(JSON.parse(raw));
    } catch {
        // Missing/invalid artifacts must not brick recovery deployments.
        return null;
    }
}

function isWriterRoute(req) {
    const method = String(req.method || '').toUpperCase();
    const rawPath = String(req.path || '');
    const requestPath = (rawPath.length > 1 ? rawPath.replace(/\/+$/, '') : rawPath).toLowerCase();
    if (EXACT_WRITER_ROUTES.has(`${method} ${requestPath}`)) return true;
    if (method === 'POST' && /^\/api\/chat-content\/[^/]+\/[^/]+(?:\/patch)?$/.test(requestPath)) {
        return true;
    }
    if (method === 'DELETE' && /^\/api\/backup\/server\/[^/]+$/.test(requestPath)) return true;
    // Paired with the reserved detached server-backup job creation route above.
    if (method === 'DELETE' && /^\/api\/backup\/server\/jobs\/[^/]+$/.test(requestPath)) return true;
    if (method === 'POST' && /^\/api\/model-jobs\/[^/]+\/claim$/.test(requestPath)) return true;
    if (method === 'DELETE' && /^\/api\/model-jobs\/[^/]+$/.test(requestPath)) return true;
    if (method === 'POST' && /^\/api\/pending-sends\/[^/]+\/claim$/.test(requestPath)) return true;
    if (method === 'DELETE' && /^\/api\/pending-sends\/[^/]+$/.test(requestPath)) return true;
    if (method === 'POST' && /^\/api\/bg-sub-result\/[^/]+\/ack$/.test(requestPath)) return true;
    if (method === 'DELETE' && /^\/proxy-stream-jobs\/[^/]+$/.test(requestPath)) return true;
    if (method === 'DELETE' && /^\/api\/bg-orchestrate\/[^/]+$/.test(requestPath)) return true;
    if (method === 'DELETE'
        && /^\/api\/bg-orchestrate-result(?:\/[^/]+){2,3}$/.test(requestPath)) return true;
    return false;
}

function sendUpgradeRequired(res, expectedBuild) {
    res.setHeader('Connection', 'close');
    return res.status(426).json({
        error: 'This client build does not match the server. Reload to continue.',
        code: CLIENT_UPGRADE_REQUIRED_CODE,
        expectedBuild,
        retryable: false,
        commitOutcome: 'not-committed',
        commitOutcomeUnknown: false,
    });
}

function createClientBuildFence({ distDir, logger = console }) {
    const expectedBuild = loadExpectedClientBuild(distDir);
    if (!expectedBuild) {
        logger?.warn?.(
            '[client-build-fence] disabled: dist/build-stamp.json is missing or invalid',
        );
    }
    const middleware = (req, res, next) => {
        if (!expectedBuild || !isWriterRoute(req)) return next();
        const clientBuild = req.headers?.[CLIENT_BUILD_HEADER];
        if (typeof clientBuild === 'string' && clientBuild === expectedBuild.stamp) return next();
        return sendUpgradeRequired(res, expectedBuild);
    };
    return Object.freeze({ expectedBuild, middleware });
}

module.exports = {
    CLIENT_BUILD_HEADER,
    CLIENT_UPGRADE_REQUIRED_CODE,
    SAFE_BUILD_TOKEN,
    EXACT_WRITER_ROUTES,
    parseExpectedClientBuild,
    loadExpectedClientBuild,
    isWriterRoute,
    sendUpgradeRequired,
    createClientBuildFence,
};
