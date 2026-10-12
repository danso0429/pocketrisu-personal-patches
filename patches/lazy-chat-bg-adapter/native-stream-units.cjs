'use strict'
const fs = require('node:fs')
const path = require('node:path')
module.exports = prior => {
    const prefix = 'lazy-chat-bg-adapter:stream-preview:'
    const targetVersions = { pocketrisu: ['1.10.0'] }
    const units = []
    const add = (name, file, anchor, content, type = 'replace', where) => {
        units.push({ id: prefix + name, file, type, anchor,
            ...(file.endsWith('.svelte') ? { managed: content } : { content }),
            ...(where ? { where } : {}), targetVersions,
            after: [...prior, ...units].filter(unit => unit.file === file).map(unit => unit.id) })
    }
    for (const file of ["server/node/bgStreamingScheduler.cjs","server/node/bgStreamingScheduler.test.ts"]) {
        units.push({ id: prefix + file, file, type: 'owned', targetVersions,
            content: fs.readFileSync(path.join(__dirname, 'files-1.10', file), 'utf8') })
    }
    add('bundle-scheduler', 'server/node/bgOrchBundle.build.cjs',
        "    if(typeof g.matchMedia==='undefined')g.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});",
        "    if(typeof g.matchMedia==='undefined')g.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});\n    require('./bgStreamingScheduler.cjs').installBgStreamingScheduler(g);")
    add('window-frame', 'server/node/bgOrchBundle.build.cjs',
        "if(k==='userScriptFetch')return undefined;",
        "if(k==='userScriptFetch')return undefined;if(k==='requestAnimationFrame')return g.requestAnimationFrame;if(k==='cancelAnimationFrame')return g.cancelAnimationFrame;")
    const openai = 'src/ts/process/request/openAI/requests.ts'
    add('openai-pipe-error', openai, '        da.body.pipeTo(transtream.writable)',
        `        // pipeTo aborts the TransformStream on source failure; the returned
        // readable remains the caller's error authority. Handle the separate
        // piping promise so that same failure is not an unhandled rejection.
        void da.body.pipeTo(transtream.writable).catch(() => {})`)
    add('openai-tool-pipe-error', openai, '                        resRec.body.pipeTo(transtream.writable)',
        `                        // The readable below still rejects on a source/body
                        // failure. Do not leave its piping promise unobserved.
                        void resRec.body.pipeTo(transtream.writable).catch(() => {})`)
    return units
}
