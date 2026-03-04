import express from 'express'
import { randomUUID } from 'node:crypto'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import pkg from '../package.json' with { type: 'json' }
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { listingCopyTool, runListingCopy } from './tools/listing_copy.js'
import { keywordStrategyTool, runKeywordStrategy } from './tools/keyword_strategy.js'

const PORT = Number(process.env.PORT || 3000)
const HOST = process.env.HOST?.trim()
const APP_VERSION = pkg.version
const RUNTIME_RECYCLE_MS = Number(process.env.MCP_RUNTIME_RECYCLE_MS || 0)
const __dirname = dirname(fileURLToPath(import.meta.url))
const DOCS_DIR = resolve(__dirname, '../docs')

const TOOL_REGISTRY = [
  { def: listingCopyTool, run: runListingCopy },
  { def: keywordStrategyTool, run: runKeywordStrategy },
]

function createMcpServer() {
  const server = new McpServer({
    name: 'sellermate-mcp',
    version: APP_VERSION,
  })

  for (const { def, run } of TOOL_REGISTRY) {
    server.registerTool(
      def.name,
      {
        title: def.title,
        description: def.description,
        annotations: def.annotations,
        inputSchema: def.inputSchema,
      },
      async (args) => {
        const result = await run(args)
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          structuredContent: result,
        }
      }
    )
  }

  return server
}

let runtime = null
let runtimeInitPromise = null
let activeMcpRequests = 0
let recycleRequested = false
let recycleTimer = null

async function getRuntime() {
  if (runtime) {
    console.log('[mcp-runtime] reuse existing runtime')
    return runtime
  }

  if (!runtimeInitPromise) {
    console.log('[mcp-runtime] initializing runtime...')
    runtimeInitPromise = (async () => {
      const server = createMcpServer()
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID() })
      await server.connect(transport)
      runtime = { server, transport, createdAt: Date.now() }
      console.log('[mcp-runtime] initialized')
      return runtime
    })()
  }

  return runtimeInitPromise
}

async function closeRuntime(reason = 'manual') {
  if (!runtime) return
  const current = runtime
  runtime = null
  runtimeInitPromise = null

  const { server, transport, createdAt } = current
  console.log(`[mcp-runtime] closing runtime... reason=${reason} age_ms=${Date.now() - createdAt}`)

  try {
    await transport.close()
  } catch (error) {
    console.error('[mcp-runtime] transport.close failed', error?.name || error)
  }

  try {
    await server.close()
  } catch (error) {
    console.error('[mcp-runtime] server.close failed', error?.name || error)
  }

  console.log('[mcp-runtime] closed')
}

async function maybeRecycleRuntime(trigger = 'request') {
  if (!RUNTIME_RECYCLE_MS || RUNTIME_RECYCLE_MS <= 0) return
  if (!runtime) return

  const ageMs = Date.now() - runtime.createdAt
  if (ageMs < RUNTIME_RECYCLE_MS) return

  if (activeMcpRequests > 0) {
    recycleRequested = true
    console.log(`[mcp-runtime] recycle deferred trigger=${trigger} active=${activeMcpRequests} age_ms=${ageMs}`)
    return
  }

  recycleRequested = false
  await closeRuntime(`periodic_recycle:${trigger}`)
}

const app = express()
app.use(express.json({ limit: '1mb' }))
app.use('/docs', express.static(DOCS_DIR))

app.get('/', (_req, res) => {
  res.status(200).send('ok')
})

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'sellermate-mcp', version: APP_VERSION })
})

app.all('/mcp', async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Method not allowed.' },
      id: null,
    })
  }

  activeMcpRequests += 1
  console.log(`[mcp-runtime] request_start active=${activeMcpRequests}`)

  try {
    const { transport } = await getRuntime()
    await transport.handleRequest(req, res, req.body)
  } catch (error) {
    console.error('[mcp] request failed', error?.name || error)
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal server error' },
        id: null,
      })
    }
  } finally {
    activeMcpRequests = Math.max(0, activeMcpRequests - 1)
    console.log(`[mcp-runtime] request_end active=${activeMcpRequests}`)

    if (recycleRequested && activeMcpRequests === 0) {
      await closeRuntime('deferred_recycle')
      recycleRequested = false
    }

    await maybeRecycleRuntime('request')
  }
})

const httpServer = HOST ? app.listen(PORT, HOST, onListen) : app.listen(PORT, onListen)

function onListen() {
  const logHost = HOST || 'localhost'
  console.log(`[sellermate] v${APP_VERSION} http://${logHost}:${PORT}`)
  console.log(`[sellermate] MCP endpoint: http://${logHost}:${PORT}/mcp`)
  console.log(`[sellermate] privacy policy: http://${logHost}:${PORT}/docs/privacy-policy.html`)
  console.log('[sellermate] note: Streamable HTTP session internals are SDK-managed; app-level request/runtime logs are enabled for leak diagnosis')
  if (RUNTIME_RECYCLE_MS > 0) {
    recycleTimer = setInterval(() => {
      maybeRecycleRuntime('interval').catch((e) => console.error('[mcp-runtime] interval recycle check failed', e?.name || e))
    }, Math.max(1000, Math.floor(RUNTIME_RECYCLE_MS / 2)))
    console.log(`[mcp-runtime] periodic recycle enabled ms=${RUNTIME_RECYCLE_MS}`)
  }
}

async function shutdown() {
  if (recycleTimer) clearInterval(recycleTimer)
  httpServer.close(async () => {
    await closeRuntime('shutdown')
    process.exit(0)
  })
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
