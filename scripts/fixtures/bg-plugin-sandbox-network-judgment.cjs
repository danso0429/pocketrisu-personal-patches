'use strict';

const NETWORK_CHECKS = ['loopback', 'externalIp', 'dns'];

function judgeNetwork(nodeMajor, controls, sandbox) {
    if (nodeMajor >= 25) {
        return sandbox.loopback === 'ERR_ACCESS_DENIED'
            ? { blocked: true, reason: null, check: null }
            : { blocked: false, reason: 'sandbox_network_not_blocked', check: 'loopback' };
    }

    const failedControl = NETWORK_CHECKS.find(name => controls[name] !== null);
    if (failedControl) return { blocked: false, reason: 'control_failed', check: failedControl };

    const expected = { loopback: 'ECONNREFUSED', externalIp: 'ENETUNREACH', dns: 'EAI_AGAIN' };
    const mismatch = NETWORK_CHECKS.find(name => sandbox[name] !== expected[name]);
    return mismatch
        ? { blocked: false, reason: 'sandbox_network_not_blocked', check: mismatch }
        : { blocked: true, reason: null, check: null };
}

module.exports = { judgeNetwork };
