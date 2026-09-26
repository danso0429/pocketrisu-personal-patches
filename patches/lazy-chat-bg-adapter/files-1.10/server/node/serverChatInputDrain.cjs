'use strict';

// The input owner stores the command and its settings snapshot before a waiting
// response is returned. This scheduler retains only the already-authenticated
// request envelope needed to enter the existing start path after the exact
// predecessor publishes. It never resumes paid work after a process restart.
function createServerChatInputDrain({ loadExecution, start, delayMs = 250 }) {
    if (typeof loadExecution !== 'function' || typeof start !== 'function') {
        throw new Error('server input drain requires owner and start callbacks');
    }
    const waiting = new Map();
    const attempts = new Map();
    let timer = null;
    let active = false;

    function schedule() {
        if (timer || waiting.size === 0) return;
        timer = setTimeout(() => {
            timer = null;
            void drain();
        }, delayMs);
        if (typeof timer.unref === 'function') timer.unref();
    }

    function enqueue(operationId, body) {
        if (typeof operationId !== 'string' || !operationId || !body
            || typeof body !== 'object' || Array.isArray(body)) return false;
        if (!waiting.has(operationId)) {
            waiting.set(operationId, structuredClone(body));
            attempts.set(operationId, 0);
        }
        schedule();
        return true;
    }

    async function drain() {
        if (active) return;
        active = true;
        try {
            for (const [operationId, body] of waiting) {
                let execution;
                try { execution = await loadExecution(operationId); }
                catch {
                    const failures = (attempts.get(operationId) || 0) + 1;
                    if (failures >= 3) {
                        waiting.delete(operationId);
                        attempts.delete(operationId);
                    } else {
                        attempts.set(operationId, failures);
                    }
                    continue;
                }
                if (execution?.status === 'waiting') continue;
                if (execution?.status !== 'transform-required'
                    && execution?.status !== 'attached') {
                    // The durable owner/status route retains the blocked state;
                    // do not fabricate a provider result or client fallback.
                    waiting.delete(operationId);
                    attempts.delete(operationId);
                    continue;
                }
                let outcome;
                attempts.set(operationId, (attempts.get(operationId) || 0) + 1);
                try { outcome = await start(body); }
                catch { /* exact operation status remains the recovery authority */ }
                if (outcome?.started === true
                    || outcome?.status === 409 || outcome?.status === 429
                    || attempts.get(operationId) >= 3) {
                    waiting.delete(operationId);
                    attempts.delete(operationId);
                }
            }
        } finally {
            active = false;
            schedule();
        }
    }

    return { enqueue, drain, pending: () => waiting.size };
}

module.exports = { createServerChatInputDrain };
