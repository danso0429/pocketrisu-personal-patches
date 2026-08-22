import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { describe, expect, test } from 'vitest'

class TestResponse {
    readonly status: number
    private readonly bytes: Uint8Array

    constructor(body: string | Uint8Array = '', options: { status?: number } = {}) {
        this.bytes = typeof body === 'string' ? new TextEncoder().encode(body) : body.slice()
        this.status = options.status ?? 200
    }

    static redirect(): TestResponse {
        return new TestResponse('', { status: 303 })
    }

    async arrayBuffer(): Promise<ArrayBuffer> {
        const copy = new Uint8Array(this.bytes.byteLength)
        copy.set(this.bytes)
        return copy.buffer
    }

    clone(): TestResponse {
        return new TestResponse(this.bytes, { status: this.status })
    }
}

describe('module share service-worker transport', () => {
    test('POST caches exact bytes and redirected GET serves them once centralized importer fetches', async () => {
        const source = fs.readFileSync(path.resolve(process.cwd(), 'public/sw.js'), 'utf8')
        const stored = new Map<string, TestResponse>()
        let fetchHandler: ((event: any) => void) | undefined
        const context = {
            URL,
            Uint8Array,
            Response: TestResponse,
            caches: {
                async open() {
                    return {
                        async put(url: URL, response: TestResponse) {
                            stored.set(url.toString(), response.clone())
                        },
                        async match(url: URL) {
                            return stored.get(url.toString())?.clone()
                        },
                    }
                },
            },
            self: {
                location: { origin: 'https://example.invalid' },
                addEventListener(type: string, handler: (event: any) => void) {
                    if (type === 'fetch') fetchHandler = handler
                },
            },
        }
        vm.runInNewContext(source, context)
        expect(fetchHandler).toBeTypeOf('function')

        const payload = new TextEncoder().encode('module-share-bytes')
        let response: Promise<TestResponse> | undefined
        fetchHandler!({
            request: {
                url: 'https://example.invalid/sw/share',
                method: 'POST',
                async formData() {
                    return {
                        get(key: string) {
                            return key === 'module' ? { arrayBuffer: async () => payload.buffer } : null
                        },
                    }
                },
            },
            respondWith(value: Promise<TestResponse> | TestResponse) {
                response = Promise.resolve(value)
            },
        })
        expect((await response!).status).toBe(303)

        fetchHandler!({
            request: { url: 'https://example.invalid/sw/share/module', method: 'GET' },
            respondWith(value: Promise<TestResponse> | TestResponse) {
                response = Promise.resolve(value)
            },
        })
        expect(new Uint8Array(await (await response!).arrayBuffer())).toEqual(payload)

        fetchHandler!({
            request: { url: 'https://example.invalid/sw/share/missing', method: 'GET' },
            respondWith(value: Promise<TestResponse> | TestResponse) {
                response = Promise.resolve(value)
            },
        })
        expect((await response!).status).toBe(404)
    })
})
