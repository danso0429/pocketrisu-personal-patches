'use strict'

const pocketRisu1100 = { pocketrisu: ['1.10.0'] }
// Optional order for the legacy start units: after this pack's control unit and,
// when lazy chat storage is installed, after the session-gate units that own
// the start request block (not required; absent ids are ignored).
const afterLegacyStartSession = [
    'client-build-fence-bg-adapter:orchestration-control:1.9',
    'lazy-chat-bg-adapter:session-gate:legacy-start:1.10',
    'lazy-chat-bg-adapter:session-gate:legacy-no-fallback:1.10',
]

module.exports = {
    id: 'client-build-fence-bg-adapter',
    title: 'Client build fence BG recovery adapter',
    version: '0.1.2',
    targets: {
        pocketrisu: { verified: ['1.10.0'], reviewing: [] },
    },
    userSelectable: false,
    requires: ['client-build-fence', 'bg-preserve'],
    autoWhen: {
        all: ['client-build-fence', 'bg-preserve'],
    },
    units: [
        {
            id: 'client-build-fence-bg-adapter:stream-import:1.9',
            file: 'src/ts/bgStreamFetch.ts',
            type: 'insert',
            where: 'after',
            anchor: "import { recoveredResponseWithAck } from './bgResponseAck'\n",
            content: "import { clientBuildFetch } from './storage/clientBuildHandshake'\n",
            requires: [
                'client-build-fence:client-handshake:1.9',
                'bg-preserve:owned:src/ts/bgStreamFetch.ts',
            ],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'client-build-fence-bg-adapter:stream-result-ack:1.9',
            file: 'src/ts/bgStreamFetch.ts',
            type: 'replace',
            anchor: "            fetch(`/api/bg-sub-result/${encodeURIComponent(jobId)}/ack`, {\n",
            content: "            clientBuildFetch(`/api/bg-sub-result/${encodeURIComponent(jobId)}/ack`, {\n",
            requires: ['client-build-fence-bg-adapter:stream-import:1.9'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'client-build-fence-bg-adapter:stream-delete:1.9',
            file: 'src/ts/bgStreamFetch.ts',
            type: 'replace',
            anchor: "            fetch(`/proxy-stream-jobs/${encodeURIComponent(jobId)}`, {\n",
            content: "            clientBuildFetch(`/proxy-stream-jobs/${encodeURIComponent(jobId)}`, {\n",
            requires: ['client-build-fence-bg-adapter:stream-result-ack:1.9'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'client-build-fence-bg-adapter:orchestration-import:1.9',
            file: 'src/ts/bgOrchestrate.ts',
            type: 'insert',
            where: 'after',
            anchor: "import { runClientFallbackLifecycle } from './bgOrchestrationFallback'\n",
            content: "import { clientBuildFetch } from './storage/clientBuildHandshake'\n",
            requires: [
                'client-build-fence:client-handshake:1.9',
                'bg-preserve:owned:src/ts/bgOrchestrate.ts:1.9',
            ],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'client-build-fence-bg-adapter:draft-import:1.9',
            file: 'src/ts/bgStreamPreserve.svelte.ts',
            type: 'insert',
            where: 'after',
            anchor: "import { requestImmediateSave, setBgStreamFetchImpl, reportBgPreserveSignal } from './globalApi.svelte'\n",
            content: "import { clientBuildFetch } from './storage/clientBuildHandshake'\n",
            requires: [
                'client-build-fence:client-handshake:1.9',
                'bg-preserve:owned:src/ts/bgStreamPreserve.svelte.ts',
            ],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'client-build-fence-bg-adapter:draft-delete:1.9',
            file: 'src/ts/bgStreamPreserve.svelte.ts',
            type: 'replace',
            anchor: "        await fetch(SERVER_PATH + '/delete', {\n",
            content: "        await clientBuildFetch(SERVER_PATH + '/delete', {\n",
            requires: ['client-build-fence-bg-adapter:draft-import:1.9'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'client-build-fence-bg-adapter:orchestration-control:1.9',
            file: 'src/ts/bgOrchestrate.ts',
            type: 'replace',
            anchor: "        return await fetch(url, { ...init, signal: controller.signal })\n",
            content: "        return await clientBuildFetch(url, { ...init, signal: controller.signal })\n",
            requires: ['client-build-fence-bg-adapter:orchestration-import:1.9'],
            targetVersions: pocketRisu1100,
        },
        // Legacy delegated start on the build handshake. Only the call line is
        // replaced, after the optional session-gate unit that owns the whole
        // request block when lazy chat storage is installed.
        {
            id: 'client-build-fence-bg-adapter:legacy-start-fetch:1.10',
            file: 'src/ts/bgOrchestrate.ts',
            type: 'replace',
            anchor: "                const res = await fetch('/api/bg-orchestrate', {\n",
            content: "                const res = await clientBuildFetch('/api/bg-orchestrate', {\n",
            requires: ['client-build-fence-bg-adapter:orchestration-import:1.9'],
            after: afterLegacyStartSession,
            targetVersions: pocketRisu1100,
        },
        {
            id: 'client-build-fence-bg-adapter:legacy-start-upgrade-state:1.10',
            file: 'src/ts/bgOrchestrate.ts',
            type: 'insert',
            where: 'before',
            anchor: '        void reconcileOrchestrationStart({\n',
            content: `        // Set when the build fence refused this start (coded 426): a definitive
        // non-start; the build handshake shows the reload or recovery state.
        let startFenceRejection: 'client-upgrade-required' | null = null
`,
            requires: ['client-build-fence-bg-adapter:legacy-start-fetch:1.10'],
            after: [...afterLegacyStartSession, 'lazy-chat-bg-adapter:start-diagnostic-state:1.10'],
            targetVersions: pocketRisu1100,
        },
        {
            id: 'client-build-fence-bg-adapter:legacy-start-upgrade-required:1.10',
            file: 'src/ts/bgOrchestrate.ts',
            type: 'insert',
            where: 'before',
            anchor: '                if (res.ok && data?.started === true) {\n',
            content: `                if (res.status === 426 && data?.code === 'CLIENT_UPGRADE_REQUIRED') {
                    // Refused by the build fence before admission; final after this
                    // one attempt (no status polling, no retry).
                    startFenceRejection = 'client-upgrade-required'
                    return 'rejected'
                }
`,
            requires: ['client-build-fence-bg-adapter:legacy-start-upgrade-state:1.10'],
            after: afterLegacyStartSession,
            targetVersions: pocketRisu1100,
        },
        {
            id: 'client-build-fence-bg-adapter:legacy-start-no-fallback:1.10',
            file: 'src/ts/bgOrchestrate.ts',
            type: 'insert',
            where: 'after',
            anchor: `        }).then((resolution) => {
            if (activeOperationId !== operationId || !watchKey) return
`,
            content: `            if (resolution === 'rejected' && startFenceRejection !== null) {
                // No browser fallback generation and no extra notice: the build
                // handshake already reloads or shows the recovery banner.
                console.error('[bg-orch] detached start rejected:', startFenceRejection)
                stopWatch()
                return
            }
`,
            requires: ['client-build-fence-bg-adapter:legacy-start-upgrade-required:1.10'],
            after: afterLegacyStartSession,
            targetVersions: pocketRisu1100,
        },
    ],
}
