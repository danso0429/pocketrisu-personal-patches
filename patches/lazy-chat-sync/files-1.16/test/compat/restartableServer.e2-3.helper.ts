import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..', '..')
const SERVER_SCRIPT = path.join(PROJECT_ROOT, 'server', 'node', 'server.cjs')
const TEST_PASSWORD = 'compat-test-pass'

async function getFreePort(): Promise<number> {
  const { createServer } = await import('node:net')
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.on('error', reject)
    server.listen(0, () => {
      const address = server.address()
      if (!address || typeof address === 'string') return reject(new Error('Unable to determine port'))
      server.close(() => resolve(address.port))
    })
  })
}

export interface RestartableServer {
  port: number
  password: string
  cwd: string
  child: ChildProcess
  restart: () => Promise<void>
  stop: (signal?: NodeJS.Signals) => Promise<void>
  cleanup: () => Promise<void>
}

export async function spawnRestartableServer(options: {
  env?: Record<string, string>
  seedSave?: (saveDir: string) => Promise<void>
} = {}): Promise<RestartableServer> {
  const cwd = await mkdtemp(path.join(tmpdir(), 'risu-e2-3-restart-'))
  await mkdir(path.join(cwd, 'save'), { recursive: true })
  await mkdir(path.join(cwd, 'backups'), { recursive: true })
  await writeFile(path.join(cwd, 'save', '__password'), TEST_PASSWORD, 'utf8')
  await options.seedSave?.(path.join(cwd, 'save'))

  let child: ChildProcess
  let port = 0
  let stderr = ''

  const start = async () => {
    port = await getFreePort()
    stderr = ''
    child = spawn(process.execPath, [SERVER_SCRIPT], {
      cwd,
      env: { ...process.env, PORT: String(port), NODE_ENV: 'test', ...options.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    child.stderr?.on('data', chunk => { stderr += chunk.toString() })
    await new Promise<void>((resolve, reject) => {
      let settled = false
      const finish = (error?: Error) => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        error ? reject(error) : resolve()
      }
      const timeout = setTimeout(() => finish(new Error(`Server did not start within 10 s.\n${stderr}`)), 10_000)
      child.stdout?.on('data', chunk => {
        const text = chunk.toString()
        if (text.includes('[Server]') && text.includes('server is running')) finish()
      })
      child.once('error', finish)
      child.once('exit', code => finish(new Error(`Server exited early with code ${code}.\n${stderr}`)))
    })
  }

  const stop = async (signal: NodeJS.Signals = 'SIGTERM') => {
    if (!child || child.exitCode !== null || child.signalCode !== null) return
    child.kill(signal)
    await new Promise<void>(resolve => {
      const timeout = setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
        resolve()
      }, 3_000)
      child.once('exit', () => { clearTimeout(timeout); resolve() })
    })
  }

  const handle = {
    get port() { return port },
    password: TEST_PASSWORD,
    cwd,
    get child() { return child },
    stop,
    restart: async () => { await stop(); await start() },
    cleanup: async () => { await stop(); await rm(cwd, { recursive: true, force: true }) },
  } as RestartableServer
  await start()
  return handle
}
