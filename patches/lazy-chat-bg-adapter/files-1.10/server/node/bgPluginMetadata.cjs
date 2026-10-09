'use strict';
const { createHash } = require('node:crypto');
const clean = (value, max) => (typeof value === 'string' || typeof value === 'number' ? String(value) : 'unknown')
    .replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, max) || 'unknown';
// Existing failure-receipt identity; never an execution admission gate.
const identityOf = plugin => createHash('sha256').update(JSON.stringify([
    clean(plugin.name, 120), clean(plugin.version, 80),
    typeof plugin.script === 'string' && Buffer.byteLength(plugin.script) <= 4 * 1024 * 1024
        ? createHash('sha256').update(plugin.script).digest('hex') : 'invalid-or-oversized',
])).digest('hex');
const pluginMetadata = plugin => ({ pluginName: clean(plugin.name, 120),
    pluginVersion: clean(typeof plugin.script === 'string'
        ? plugin.script.match(/^\/\/@version\s+(.+)$/m)?.[1] ?? plugin.version : plugin.version, 80) });
module.exports = { clean, identityOf, pluginMetadata };
