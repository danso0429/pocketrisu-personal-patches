'use strict'
module.exports = [
    {
        id: 'lazy-chat-bg-adapter:external-header-import:1.10',
        file: 'server/node/bgOrchestrator.cjs', type: 'insert', where: 'after',
        anchor: "const fs = require('fs')\n",
        content: "const { fetchWithExternalHeaders, withExternalHeaderConversation } = require('./externalRequestHeaders.cjs')\n",
        requires: ['personal-settings:external-headers:server/node/externalRequestHeaders.cjs'],
        targetVersions: { pocketrisu: ['1.10.0'] },
    },
    {
        id: 'lazy-chat-bg-adapter:external-header-fetch:1.10',
        file: 'server/node/bgOrchestrator.cjs', type: 'replace',
        anchor: '          return llmMark(target, realFetch.call(this, target, {\n',
        content: '          return llmMark(target, fetchWithExternalHeaders(realFetch.bind(this), target, {\n',
        requires: ['lazy-chat-bg-adapter:external-header-import:1.10'],
        targetVersions: { pocketrisu: ['1.10.0'] },
    },
    {
        id: 'lazy-chat-bg-adapter:external-header-context:1.10',
        file: 'server/node/bgOrchestrator.cjs', type: 'replace',
        anchor: '      try { return await task() }\n',
        content: '      try { return await withExternalHeaderConversation(JSON.stringify([selectedCharId, selectedChatId]), task) }\n',
        requires: ['lazy-chat-bg-adapter:external-header-fetch:1.10'],
        targetVersions: { pocketrisu: ['1.10.0'] },
    },
]
