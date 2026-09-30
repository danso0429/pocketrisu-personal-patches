'use strict'

// These exact-source changes follow the existing orchestration owners, including
// the external-header bridge. They do not change raw-input model eligibility.
module.exports = (priorUnits) => {
    const file = 'server/node/bgOrchestrator.cjs'
    const targetVersions = { pocketrisu: ['1.10.0'] }
    const prefix = 'lazy-chat-bg-adapter:input-execution'
    const after = priorUnits.filter(unit => unit.file === file).map(unit => unit.id)
    return [
        {
            id: `${prefix}:remove-late-wrapper:1.10`, file, type: 'replace',
            anchor: "    const runWithOrchestrationAbort = async (task) => orchestrationAbortContext.run(llmAbort.signal, async () => {\n      // requestChatData's higher-level retry/fallback loop also needs to see cancellation. This\n      // bundle-only marker supplies the inherited signal when Hypa/trigger callers omit the arg.\n      const priorSignal = globalThis.__bgOrchAbortSignal\n      globalThis.__bgOrchAbortSignal = llmAbort.signal\n/* POCKETRISU-PATCH:lazy-chat-bg-adapter:external-header-context:1.10:START */\n      try { return await withExternalHeaderConversation(JSON.stringify([selectedCharId, selectedChatId]), task) }\n/* POCKETRISU-PATCH:lazy-chat-bg-adapter:external-header-context:1.10:END */      finally {\n        if (priorSignal === undefined) delete globalThis.__bgOrchAbortSignal\n        else globalThis.__bgOrchAbortSignal = priorSignal\n      }\n    })\n",
            content: '',
            requires: ['lazy-chat-bg-adapter:external-header-context:1.10',
                'lazy-chat-bg-adapter:server-input-transform:1.10'],
            after, targetVersions,
        },
        {
            id: `${prefix}:early-wrapper:1.10`, file, type: 'insert', where: 'after',
            anchor: '    const { idx, stores, dbmod, status } = bg\n',
            content: "    const runWithOrchestrationAbort = async (task) => orchestrationAbortContext.run(llmAbort.signal, async () => {\n      const priorSignal = Object.getOwnPropertyDescriptor(globalThis, '__bgOrchAbortSignal')\n      const priorDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')\n      const priorLocation = Object.getOwnPropertyDescriptor(globalThis, 'location')\n      if (llmAbort.signal.aborted\n        || (control && typeof control.isCancelled === 'function' && control.isCancelled())) {\n        throw new Error((externalSignal && externalSignal.aborted) || (control && typeof control.isCancelled === 'function' && control.isCancelled()) ? 'orchestration cancelled' : 'llm aborted (600s timeout)')\n      }\n      try {\n        // Input triggers/editinput share the same cancellation, host identity and\n        // node environment as main/post. Lua re-detects document at engine creation.\n        globalThis.__bgOrchAbortSignal = llmAbort.signal\n        delete globalThis.document\n        delete globalThis.location\n        return await withExternalHeaderConversation(JSON.stringify([selectedCharId, selectedChatId]), task)\n      } finally {\n        for (const [key, descriptor] of [\n          ['__bgOrchAbortSignal', priorSignal], ['document', priorDocument], ['location', priorLocation],\n        ]) {\n          if (descriptor) Object.defineProperty(globalThis, key, descriptor)\n          else delete globalThis[key]\n        }\n      }\n    })\n",
            requires: [`${prefix}:remove-late-wrapper:1.10`], targetVersions,
        },
        {
            id: `${prefix}:wrap-transform:1.10`, file, type: 'replace',
            anchor: `        const transformedChat = await transformServerChatInput(
          inputCharacter,
          db.characters[charIdx].chats[chatIdx],
          command,
          bg.triggers,
          bg.scripts,
          (chat) => { db.characters[charIdx].chats[chatIdx] = chat },
        )
`,
            content: `        const transformedChat = await runWithOrchestrationAbort(() => transformServerChatInput(
          inputCharacter,
          db.characters[charIdx].chats[chatIdx],
          command,
          bg.triggers,
          bg.scripts,
          (chat) => { db.characters[charIdx].chats[chatIdx] = chat },
        ))
        // A script can handle a provider failure normally. Cancellation still
        // belongs to the operation and cannot turn into a durable new input.
        if (llmAbort.signal.aborted
          || (control && typeof control.isCancelled === 'function' && control.isCancelled())) {
          throw new Error((externalSignal && externalSignal.aborted) || (control && typeof control.isCancelled === 'function' && control.isCancelled()) ? 'orchestration cancelled' : 'llm aborted (600s timeout)')
        }
`,
            requires: [`${prefix}:early-wrapper:1.10`], targetVersions,
        },
    ]
}
