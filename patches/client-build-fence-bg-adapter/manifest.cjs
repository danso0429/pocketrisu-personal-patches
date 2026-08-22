'use strict'

const pocketRisu190 = { pocketrisu: ['1.9.0', '1.10.0'] }

module.exports = {
    id: 'client-build-fence-bg-adapter',
    title: 'Client build fence BG recovery adapter',
    version: '0.1.1',
    targets: {
        pocketrisu: { verified: ['1.9.0'], reviewing: ['1.10.0'] },
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
            targetVersions: pocketRisu190,
        },
        {
            id: 'client-build-fence-bg-adapter:stream-result-ack:1.9',
            file: 'src/ts/bgStreamFetch.ts',
            type: 'replace',
            anchor: "            fetch(`/api/bg-sub-result/${encodeURIComponent(jobId)}/ack`, {\n",
            content: "            clientBuildFetch(`/api/bg-sub-result/${encodeURIComponent(jobId)}/ack`, {\n",
            requires: ['client-build-fence-bg-adapter:stream-import:1.9'],
            targetVersions: pocketRisu190,
        },
        {
            id: 'client-build-fence-bg-adapter:stream-delete:1.9',
            file: 'src/ts/bgStreamFetch.ts',
            type: 'replace',
            anchor: "            fetch(`/proxy-stream-jobs/${encodeURIComponent(jobId)}`, {\n",
            content: "            clientBuildFetch(`/proxy-stream-jobs/${encodeURIComponent(jobId)}`, {\n",
            requires: ['client-build-fence-bg-adapter:stream-result-ack:1.9'],
            targetVersions: pocketRisu190,
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
            targetVersions: pocketRisu190,
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
            targetVersions: pocketRisu190,
        },
        {
            id: 'client-build-fence-bg-adapter:draft-delete:1.9',
            file: 'src/ts/bgStreamPreserve.svelte.ts',
            type: 'replace',
            anchor: "        await fetch(SERVER_PATH + '/delete', {\n",
            content: "        await clientBuildFetch(SERVER_PATH + '/delete', {\n",
            requires: ['client-build-fence-bg-adapter:draft-import:1.9'],
            targetVersions: pocketRisu190,
        },
        {
            id: 'client-build-fence-bg-adapter:orchestration-control:1.9',
            file: 'src/ts/bgOrchestrate.ts',
            type: 'replace',
            anchor: "        return await fetch(url, { ...init, signal: controller.signal })\n",
            content: "        return await clientBuildFetch(url, { ...init, signal: controller.signal })\n",
            requires: ['client-build-fence-bg-adapter:orchestration-import:1.9'],
            targetVersions: pocketRisu190,
        },
    ],
}
