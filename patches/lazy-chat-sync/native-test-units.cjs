'use strict'

// E2-3d: setup changes to native PocketRisu 1.16.1 tests that the chat
// revision protocol and the stripped database invariant otherwise refuse.
// Only how a test reaches its state changes; no assertion or expected value
// does.
//
// - Tests that overwrite a chat over HTTP read it first and send the revision
//   they got (x-chat-base-revision); a test that creates a chat sends
//   If-None-Match: * (a full POST without a base revision gets 428).
// - The server tests that seed "a database already on disk" through
//   /api/write (duplicate ids, a listed chat without a body) write that first
//   database to the store before the server starts; the invariant refuses
//   such a client write with 422. A later seedDb call is the client's write
//   under test and still goes through /api/write.

const seedDbAnchor = `async function seedDb(db: Record<string, unknown>) {
    await writeKey('database/database.bin', encodeRisuSaveLegacy(db))
}
`

const seedDbContent = (warm) => `async function seedDb(db: Record<string, unknown>) {
    // lazy-chat-sync: the first seed is the database already on disk; it is
    // written to the store before the server starts, since the stripped
    // database invariant refuses a client write that lists a new chat without
    // its body or repeats an id. A later call is the client's write.
    if (!hasKey('database/database.bin')) {
        await stopServer()
        withDb((store) => {
            store.prepare('INSERT OR REPLACE INTO kv (key, value, updated_at) VALUES (?, ?, ?)')
                .run('database/database.bin', Buffer.from(encodeRisuSaveLegacy(db)), Date.now())
        })
        await startServer()
${warm}        return
    }
    await writeKey('database/database.bin', encodeRisuSaveLegacy(db))
}
`

const seedDbUnits = [
    ['duplicate-ids', 'server/node/duplicateIds.test.ts'],
    ['archive-batch', 'server/node/archiveBatch.test.ts'],
    ['archive-restore', 'server/node/archiveRestore.test.ts'],
].map(([name, file]) => ({
    id: `lazy-chat-sync:native-test-${name}-seed-db:1.16`,
    file,
    type: 'replace',
    anchor: seedDbAnchor,
    // archiveRestore's next client write meets the database in the cache, as
    // the native first write left it (the archive guard compares with it).
    content: seedDbContent(name === 'archive-restore'
        ? "        // As the native first write left it: in the server's cache.\n        await readKey('database/database.bin')\n"
        : ''),
}))

const archiveRestoreFile = 'server/node/archiveRestore.test.ts'

// A chat POST in archiveRestore.test.ts: the same request with the revision
// read right before it.
function archiveRestorePost(name, declaration, chaId, chatId) {
    const request = (extra) => `        const ${declaration} = await fetch(\`\${base}/api/chat-content/${chaId}/0\`, {
            method: 'POST',
            headers: { ...authHeaders(), ${extra}'content-type': 'application/json', 'x-chat-id': '${chatId}' },
`
    return {
        id: `lazy-chat-sync:native-test-archive-restore-${name}:1.16`,
        file: archiveRestoreFile,
        type: 'replace',
        anchor: request(''),
        content: request(`...(await chatBaseRevision('${chaId}', 0, '${chatId}')), `),
    }
}

const archiveRestoreUnits = [
    {
        id: 'lazy-chat-sync:native-test-archive-restore-revision-helper:1.16',
        file: archiveRestoreFile,
        type: 'insert',
        where: 'before',
        anchor: `async function seedReferencedDb() {
`,
        content: `// lazy-chat-sync: a chat POST that replaces a stored chat names the revision
// it was based on; read it right before the write.
async function chatBaseRevision(chaId: string, index: number, chatId: string): Promise<Record<string, string>> {
    const res = await fetch(\`\${base}/api/chat-content/\${encodeURIComponent(chaId)}/\${index}\`, { headers: { ...authHeaders(), 'x-chat-id': chatId } })
    const revision = res.headers.get('x-chat-revision')
    await res.arrayBuffer()
    return revision ? { 'x-chat-base-revision': revision } : {}
}
`,
    },
    archiveRestorePost('persist-post', 'res', 'other', 'o1'),
    archiveRestorePost('restart-post', 'saved', 'back', 'c1'),
    archiveRestorePost('activate-edit-back', 'editBack', 'back', 'c1'),
    archiveRestorePost('activate-edit-other', 'editOther', 'other', 'o1'),
]

const chatDeltaSyncFile = 'test/compat/chat-delta-sync.test.ts'
const chatDeltaSyncUnits = [
    {
        id: 'lazy-chat-sync:native-test-chat-delta-sync-get-revision:1.16',
        file: chatDeltaSyncFile,
        type: 'replace',
        anchor: `  return { chat, delta: res.headers.get('x-chat-delta-base') }
`,
        content: `  return { chat, delta: res.headers.get('x-chat-delta-base'), revision: res.headers.get('x-chat-revision') }
`,
    },
    {
        id: 'lazy-chat-sync:native-test-chat-delta-sync-full-post:1.16',
        file: chatDeltaSyncFile,
        type: 'replace',
        anchor: `    const res = await post(next, {}, true)
`,
        content: `    // lazy-chat-sync: a full save names the revision it was based on.
    const res = await post(next, { 'x-chat-base-revision': (await get()).revision ?? '' }, true)
`,
    },
]

const coldLoadFile = 'test/compat/chat-store-cold-load.test.ts'
const coldLoadUnits = [
    {
        id: 'lazy-chat-sync:native-test-chat-store-cold-load-get-revision:1.16',
        file: coldLoadFile,
        type: 'replace',
        anchor: `  if (res.status !== 200) return { status: res.status, chat: null as any }
  return { status: 200, chat: await utils.decodeRisuSave(Buffer.from(await res.arrayBuffer())) as any }
`,
        content: `  if (res.status !== 200) return { status: res.status, chat: null as any, revision: null as string | null }
  return { status: 200, chat: await utils.decodeRisuSave(Buffer.from(await res.arrayBuffer())) as any, revision: res.headers.get('x-chat-revision') }
`,
    },
    {
        id: 'lazy-chat-sync:native-test-chat-store-cold-load-post-headers:1.16',
        file: coldLoadFile,
        type: 'replace',
        anchor: `async function postChat(chat: any, chatId = CHAT, index = 0) {
  const res = await client.fetch(\`/api/chat-content/\${CHA}/\${index}\`, {
    method: 'POST',
    headers: { 'content-type': 'application/octet-stream', 'x-chat-id': chatId },
`,
        content: `async function postChat(chat: any, chatId = CHAT, index = 0, revisionHeaders: Record<string, string> = {}) {
  const res = await client.fetch(\`/api/chat-content/\${CHA}/\${index}\`, {
    method: 'POST',
    headers: { 'content-type': 'application/octet-stream', 'x-chat-id': chatId, ...revisionHeaders },
`,
    },
    {
        id: 'lazy-chat-sync:native-test-chat-store-cold-load-save-revision:1.16',
        file: coldLoadFile,
        type: 'replace',
        anchor: `  const { chat } = await getChat()
  await postChat({ ...chat, message: [...chat.message, { role: 'user', data: text }] })
`,
        content: `  const { chat, revision } = await getChat()
  await postChat({ ...chat, message: [...chat.message, { role: 'user', data: text }] }, CHAT, 0, revision ? { 'x-chat-base-revision': revision } : {})
`,
    },
    {
        id: 'lazy-chat-sync:native-test-chat-store-cold-load-create-only:1.16',
        file: coldLoadFile,
        type: 'replace',
        anchor: `  await postChat({ id: NEW, name: 'New', message: [{ role: 'user', data: text }], note: '', localLore: [] }, NEW, 1)
`,
        content: `  await postChat({ id: NEW, name: 'New', message: [{ role: 'user', data: text }], note: '', localLore: [] }, NEW, 1, { 'if-none-match': '*' })
`,
    },
]

const characterArchiveUnits = [
    {
        id: 'lazy-chat-sync:native-test-character-archive-chat-post:1.16',
        file: 'test/compat/character-archive.test.ts',
        type: 'replace',
        anchor: `    const saved = await client.fetch(\`/api/chat-content/\${ARCH}/0\`, {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream', 'x-chat-id': 'a-chat-0' },
`,
        content: `    const saved = await client.fetch(\`/api/chat-content/\${ARCH}/0\`, {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream', 'x-chat-id': 'a-chat-0', 'x-chat-base-revision': chatRes.headers.get('x-chat-revision') ?? '' },
`,
    },
]

module.exports = [
    ...seedDbUnits,
    ...archiveRestoreUnits,
    ...chatDeltaSyncUnits,
    ...coldLoadUnits,
    ...characterArchiveUnits,
]
