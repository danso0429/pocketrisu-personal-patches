'use strict';
const fs = require('node:fs');
const readline = require('node:readline');
const { Socket } = require('node:net');
const channel = new Socket({ fd: 3 });
const send = value => channel.write(JSON.stringify(value) + '\n');
readline.createInterface({ input: channel }).on('line', async line => {
    const request = JSON.parse(line);
    if (request.kind === 'permissions') {
        const denied = {};
        for (const [name, action] of Object.entries({
            read: () => fs.readFileSync('/etc/passwd'),
            write: () => fs.writeFileSync('/tmp/test', 'test'),
            spawn: () => require('node:child_process').spawnSync('/node'),
            worker: () => new (require('node:worker_threads').Worker)('0', { eval: true }),
        })) {
            try { action(); denied[name] = false; }
            catch (error) { denied[name] = error.code === 'ERR_ACCESS_DENIED'; }
        }
        try { await fetch('http://127.0.0.1:6001'); denied.network = false; }
        catch (error) { denied.network = error.cause?.code === 'ERR_ACCESS_DENIED'; }
        send({ denied, environmentKeys: Object.keys(process.env) });
    } else if (request.kind === 'exit') process.exit(0);
    else if (request.kind === 'loop') { for (;;) {} }
    else if (request.kind === 'memory') {
        const blocks = [];
        for (;;) blocks.push(Buffer.alloc(8 * 1024 * 1024, 1));
    } else if (request.kind === 'malformed') channel.write('invalid\n');
    else if (request.kind === 'oversized') channel.write('x'.repeat(9 * 1024 * 1024));
    else if (request.kind === 'console') { console.log('ordinary log'); console.warn('ordinary warning'); send({ logged: true }); }
    else if (request.kind === 'bytes') { for (let i = 0; i < 24; i++) send({ data: 'x'.repeat(1024 * 1024) }); }
    else if (request.kind === 'stderr') process.stderr.write('s'.repeat(128 * 1024));
    else if (request.kind === 'flood') { for (let i = 0; i < 20000; i++) send({ i }); }
});
send({ ready: true });
