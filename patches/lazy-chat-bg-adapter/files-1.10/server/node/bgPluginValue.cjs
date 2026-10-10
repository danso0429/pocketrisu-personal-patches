'use strict';

// Bound host-side copies before allocating a structured clone or JSON string.
// The wire's frame limit is a second boundary, not a substitute for this one.
function measurePluginValue(value, maxBytes = 4 * 1024 * 1024) {
    let bytes = 0, nodes = 0;
    const seen = new Set();
    const reject = () => { throw Object.assign(new Error('plugin_value_limit'), { code: 'plugin_value_limit' }); };
    const visit = (item, depth) => {
        if (++nodes > 100_000 || depth > 64) reject();
        if (typeof item === 'string') {
            if (item.length > maxBytes) reject();
            bytes += Buffer.byteLength(item);
        } else if (item && typeof item === 'object') {
            if (seen.has(item)) reject();
            seen.add(item);
            if (item instanceof Headers) { for (const [key, value] of item) { visit(key, depth + 1); visit(value, depth + 1); } }
            else if (ArrayBuffer.isView(item)) bytes += item.byteLength;
            else if (item instanceof ArrayBuffer) bytes += item.byteLength;
            else if (Array.isArray(item)) {
                if (item.length > 100_000) reject();
                for (const child of item) visit(child, depth + 1);
            } else {
                const keys = Object.keys(item);
                if (keys.length > 100_000) reject();
                for (const key of keys) { visit(key, depth + 1); visit(item[key], depth + 1); }
            }
            seen.delete(item);
        } else bytes += 8;
        if (bytes > maxBytes) reject();
    };
    visit(value, 0);
    return bytes;
}

function clonePluginValue(value, maxBytes) {
    measurePluginValue(value, maxBytes);
    if (typeof value === 'string') return value; // Immutable scalar; no duplicate allocation is needed.
    return structuredClone(value);
}

module.exports = { clonePluginValue, measurePluginValue };
