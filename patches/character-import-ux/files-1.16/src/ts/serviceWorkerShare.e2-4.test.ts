import { readFile } from 'node:fs/promises'
import { describe, expect, test } from 'vitest'

class TestResponse {
    status: number
    headers: Headers
    private body: Uint8Array

    constructor(body: string | Uint8Array = '', init: { status?: number, headers?: HeadersInit } = {}) {
        this.status = init.status ?? 200
        this.headers = new Headers(init.headers)
        this.body = typeof body === 'string' ? new TextEncoder().encode(body) : body
    }

    static redirect(url: string, status = 302) {
        return new TestResponse('', { status, headers: { location: url } })
    }

    async arrayBuffer() {
        return this.body.slice().buffer
    }

    async text() {
        return new TextDecoder().decode(this.body)
    }
}

class TestURL extends URL {
    constructor(url: string | URL, base = 'https://app.test/') {
        super(url, base)
    }
}

async function serviceWorkerHarness() {
    const source = await readFile(`${process.cwd()}/public/sw.js`, 'utf8')
    let fetchHandler: ((event: any) => void) | undefined
    const entries = new Map<string, TestResponse>()
    const cache = {
        match: async (url: string | URL) => entries.get(new TestURL(url).pathname),
        put: async (url: string | URL, response: TestResponse) => {
            entries.set(new TestURL(url).pathname, response)
        },
    }
    const workerScope = {
        location: { origin: 'https://app.test' },
        addEventListener(type: string, handler: (event: any) => void) {
            if (type === 'fetch') fetchHandler = handler
        },
    }
    const evaluate = new Function('self', 'caches', 'Response', 'URL', source)
    evaluate(workerScope, { open: async () => cache }, TestResponse, TestURL)
    expect(fetchHandler, 'service worker fetch handler').toBeDefined()

    const dispatch = async (request: any) => {
        let response: Promise<TestResponse> | TestResponse | undefined
        fetchHandler!({ request, respondWith(value: Promise<TestResponse> | TestResponse) { response = value } })
        if (!response) return new TestResponse('no response', { status: 599 })
        return Promise.resolve(response).catch((error) => new TestResponse(String(error), { status: 599 }))
    }
    return { dispatch }
}

describe('[E2-4e] Rebase character-import-ux onto PocketRisu 1.16.1', () => {
    test('[unchanged] e2 preserves the native share-target POST module path', async () => {
        const { dispatch } = await serviceWorkerHarness()
        const bytes = new TextEncoder().encode('module-data')
        const response = await dispatch({
            url: 'https://app.test/sw/share',
            method: 'POST',
            headers: new Headers(),
            formData: async () => ({
                get: (name: string) => name === 'module' ? { arrayBuffer: async () => bytes.buffer } : null,
            }),
        })
        expect(response.status).toBe(303)
        expect(response.headers.get('location')).toBe('/#share_module')
    })

    test('[new] e2 serves a cached share-target GET and returns 404 on a miss', async () => {
        const { dispatch } = await serviceWorkerHarness()
        const bytes = new TextEncoder().encode('module-data')
        await dispatch({
            url: 'https://app.test/sw/share',
            method: 'POST',
            headers: new Headers(),
            formData: async () => ({
                get: (name: string) => name === 'module' ? { arrayBuffer: async () => bytes.buffer } : null,
            }),
        })

        const hit = await dispatch({
            url: 'https://app.test/sw/share/module',
            method: 'GET',
            headers: new Headers(),
        })
        expect(hit.status).toBe(200)
        expect(new Uint8Array(await hit.arrayBuffer())).toEqual(bytes)

        const miss = await dispatch({
            url: 'https://app.test/sw/share/not-cached',
            method: 'GET',
            headers: new Headers(),
        })
        expect(miss.status).toBe(404)
    })
})
