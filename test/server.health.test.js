import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

const PORT = 3210

async function waitForHealth(url, timeoutMs = 10000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    try {
      const r = await fetch(url)
      if (r.ok) return r
    } catch {
      // retry
    }
    await sleep(200)
  }
  throw new Error('health check timeout')
}

test('GET /health returns 200 and version', async (t) => {
  const child = spawn('node', ['src/server.js'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'pipe',
  })

  t.after(async () => {
    if (!child.killed) child.kill('SIGTERM')
    await new Promise((resolve) => child.once('exit', resolve))
  })

  const response = await waitForHealth(`http://localhost:${PORT}/health`)
  const body = await response.json()

  assert.equal(response.status, 200)
  assert.equal(body.ok, true)
  assert.equal(typeof body.version, 'string')
  assert.match(body.version, /^\d+\.\d+\.\d+$/)
})
