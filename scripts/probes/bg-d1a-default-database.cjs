'use strict';

const path = require('node:path');
const { pathToFileURL } = require('node:url');

(async () => {
    const target = path.resolve(process.argv[2]);
    await import(pathToFileURL(path.join(target, 'node_modules/@huggingface/transformers/dist/transformers.node.mjs')).href);
    require(path.join(target, 'node_modules/wasmoon'));
    await import(pathToFileURL(path.join(target, 'server/node/bgOrchBundle.mjs')).href);
    process.send?.(structuredClone(globalThis.__bgOrch.dbmod.getDatabase()));
})().catch(error => { console.error(error); process.exitCode = 1; });
