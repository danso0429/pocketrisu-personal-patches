import { afterEach, expect, it } from 'vitest'
import { spawn, execFileSync, type ChildProcess } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'node:https'
import { createServer as createNetServer } from 'node:net'
import { once } from 'node:events'
import WebSocket from 'ws'

const target = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const cleanups: Array<() => Promise<void> | void> = []
afterEach(async () => { while (cleanups.length) await cleanups.pop()!() })

it('uses saved rules through real proxy GET/POST and WebSocket jobs, preserving disabled requests', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'external-headers-process-'))
    cleanups.push(() => rmSync(root, { recursive: true, force: true }))
    mkdirSync(path.join(root, 'save')); mkdirSync(path.join(root, 'dist'))
    writeFileSync(path.join(root, 'save/__password'), 'synthetic-test-password')
    writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'pocketrisu', version: '1.10.0' }))
    writeFileSync(path.join(root, 'dist/build-stamp.json'), JSON.stringify({ version: '1.10.0', stamp: 'external-header-test' }))
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', path.join(root, 'key.pem'),
        '-out', path.join(root, 'cert.pem'), '-days', '1', '-subj', '/CN=localhost', '-addext', 'subjectAltName=IP:127.0.0.1,DNS:localhost'], { stdio: 'ignore' })
    const upstream = createServer({ key: readFileSync(path.join(root, 'key.pem')), cert: readFileSync(path.join(root, 'cert.pem')) }, async (req, res) => {
        const chunks = []
        for await (const chunk of req) chunks.push(Buffer.from(chunk))
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify({ method: req.method, headers: req.headers, body: Buffer.concat(chunks).toString() }))
    })
    upstream.listen(0, '127.0.0.1'); await once(upstream, 'listening')
    cleanups.push(async () => { upstream.closeAllConnections(); await new Promise<void>(resolve => upstream.close(() => resolve())) })
    const destination = `https://127.0.0.1:${(upstream.address() as any).port}/api`
    const reserve = createNetServer(); reserve.listen(0, '127.0.0.1'); await once(reserve, 'listening')
    const port = (reserve.address() as any).port
    await new Promise<void>(resolve => reserve.close(() => resolve()))
    let child: ChildProcess
    const launch = async () => {
        child = spawn(process.execPath, [path.join(target, 'server/node/server.cjs')], {
            cwd: root, stdio: ['ignore', 'pipe', 'pipe'],
            env: { ...process.env, PORT: String(port), RISU_TUNNEL_DISABLED: 'true', UPDATE_CHECK_DISABLED: '1', NODE_EXTRA_CA_CERTS: path.join(root, 'cert.pem') },
        })
        // Drain logs; fixtures contain no live credentials or user content.
        child.stdout?.resume(); child.stderr?.resume()
        for (let n = 0; n < 100; n++) {
            if (child.exitCode !== null) throw new Error('Test server exited')
            try {
                const r = await fetch(`http://127.0.0.1:${port}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'synthetic-test-password' }) })
                if (r.ok) return (await r.json() as any).token as string
            } catch { /* wait for listener */ }
            await new Promise(resolve => setTimeout(resolve, 50))
        }
        throw new Error('Test server did not become ready')
    }
    const stop = async () => { if (child && child.exitCode === null) { const ended = once(child, 'exit'); child.kill(); await ended } }
    cleanups.push(stop)
    let token = await launch()
    const base = `http://127.0.0.1:${port}`
    const auth = () => ({ 'risu-auth': token, 'content-type': 'application/json', 'x-client-build': 'external-header-test' })
    // PocketRisu checkAuth returns 400 for an absent risu-auth header.
    expect((await fetch(base + '/api/external-request-headers')).status).toBe(400)
    expect((await fetch(base + '/api/external-request-headers', { method: 'PUT', headers: { ...auth(), 'x-client-build': 'old' }, body: '{}' })).status).toBe(426)
    const config = { revision: 0, rules: [{ id: 'session-rule', name: 'Session', enabled: false, destination, header: 'x-session', valueKind: 'conversation-session' }] }
    const save = () => fetch(base + '/api/external-request-headers', { method: 'PUT', headers: auth(), body: JSON.stringify(config) })
    expect((await save()).status).toBe(200)
    const proxy = async (method: string) => {
        const response = await fetch(base + '/proxy2', { method, headers: { ...auth(), 'risu-url': encodeURIComponent(destination + '/chat'), 'risu-header': encodeURIComponent(JSON.stringify({ 'content-type': 'text/plain', 'x-original': 'kept' })) }, ...(method === 'GET' ? {} : { body: JSON.stringify({ message: 'exact body' }) }) })
        expect(response.status).toBe(200)
        return response.json() as Promise<any>
    }
    expect((await proxy('POST')).headers['x-session']).toBeUndefined()
    config.revision = 1; config.rules[0].enabled = true
    expect((await save()).status).toBe(200)
    const first = await proxy('POST')
    expect(first).toMatchObject({ method: 'POST', body: JSON.stringify({ message: 'exact body' }), headers: { 'x-original': 'kept' } })
    expect(first.headers['x-session']).toMatch(/^[a-f0-9]{64}$/)
    expect((await proxy('GET')).headers['x-session']).toBe(first.headers['x-session'])
    const job = await fetch(base + '/proxy-stream-jobs', { method: 'POST', headers: auth(), body: JSON.stringify({ url: destination + '/chat', method: 'POST', headers: { 'content-type': 'text/plain' }, bodyBase64: Buffer.from('ws body').toString('base64') }) })
    expect(job.status).toBe(200)
    const { jobId } = await job.json() as any
    const ws = new WebSocket(`ws://127.0.0.1:${port}/proxy-stream-jobs/${jobId}/ws?risu-auth=${encodeURIComponent(token)}`)
    const body = await new Promise<string>((resolve, reject) => {
        const chunks: Buffer[] = []
        const timer = setTimeout(() => { ws.terminate(); reject(new Error('WebSocket timeout')) }, 10000)
        ws.on('error', error => { clearTimeout(timer); reject(error) })
        ws.on('message', raw => { const event = JSON.parse(String(raw)); if (event.type === 'chunk') chunks.push(Buffer.from(event.dataBase64, 'base64')); if (event.type === 'done') { clearTimeout(timer); ws.close(); resolve(Buffer.concat(chunks).toString()) } })
    })
    expect(JSON.parse(body)).toMatchObject({ body: 'ws body', headers: { 'x-session': first.headers['x-session'] } })
    await stop(); token = await launch()
    expect((await proxy('GET')).headers['x-session']).toBe(first.headers['x-session'])
    expect((await save()).status).toBe(409)
}, 30000)
