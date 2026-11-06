/**
 * dsh-novel-reader — Host half.
 *
 * Owns the durable library: one JSON index (`library.json`) plus one JSON
 * document per book under `books/`. Book text is normalized in the page
 * (chapter titles and paragraph blocks), so the Host never parses a format
 * and the browser never needs a file to be re-imported after a restart.
 *
 * The Client half draws the reader in the right Sidebar and calls these
 * same-origin routes for the shelf, book content, and reading progress.
 */
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const name = 'dsh-novel-reader'

/** Route prefix served by the Web server. */
const ROUTE_PREFIX = '/api/novel-reader'
/** Upper bound for one imported book document. */
const MAX_BODY_BYTES = 96 * 1024 * 1024
/** Ids are chosen by the page: short, URL-safe, never a path. */
const ID_PATTERN = /^[A-Za-z0-9_-]{4,64}$/
const FORMATS = new Set(['txt', 'md', 'epub'])
const BLOCK_KINDS = new Set(['h', 'p', 'q', 'pre'])
const MAX_CHAPTERS = 50_000
const MAX_NAME = 300
const MAX_TITLE = 200
const MAX_BLOCK = 400_000

function emptyLibrary() {
  return { version: 1, books: [], lastOpened: null }
}

function httpError(status, message, code = 'BAD_REQUEST') {
  const error = new Error(message)
  error.status = status
  error.code = code
  return error
}

function clamp01(value) {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0
}

function integer(value, fallback, min = 0, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.round(value)))
}

function normalizeProgress(raw, chapterCount) {
  if (!raw || typeof raw !== 'object') return null
  const chapter = integer(raw.chapter, 0, 0, Math.max(0, chapterCount - 1))
  return {
    chapter,
    ratio: clamp01(raw.ratio),
    percent: clamp01(raw.percent),
    at: integer(raw.at, 0, 0),
  }
}

function normalizeMeta(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || !ID_PATTERN.test(raw.id)) return null
  const chapterCount = integer(raw.chapterCount, 0, 0, MAX_CHAPTERS)
  return {
    id: raw.id,
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, MAX_NAME) : raw.id,
    format: FORMATS.has(raw.format) ? raw.format : 'txt',
    encoding: typeof raw.encoding === 'string' ? raw.encoding.slice(0, 32) : 'UTF-8',
    size: integer(raw.size, 0, 0),
    charCount: integer(raw.charCount, 0, 0),
    chapterCount,
    addedAt: integer(raw.addedAt, Date.now(), 0),
    updatedAt: integer(raw.updatedAt, 0, 0),
    progress: normalizeProgress(raw.progress, chapterCount),
  }
}

function normalizeLibrary(raw) {
  const seen = new Set()
  const books = []
  for (const item of Array.isArray(raw?.books) ? raw.books : []) {
    const meta = normalizeMeta(item)
    if (!meta || seen.has(meta.id)) continue
    seen.add(meta.id)
    books.push(meta)
  }
  const lastOpened = typeof raw?.lastOpened === 'string' && seen.has(raw.lastOpened) ? raw.lastOpened : null
  return { version: 1, books, lastOpened }
}

/** Validate one page-supplied book document and compute its true size. */
function normalizeBook(input) {
  if (!input || typeof input !== 'object') throw httpError(400, 'invalid book')
  const id = typeof input.id === 'string' ? input.id : ''
  if (!ID_PATTERN.test(id)) throw httpError(400, 'invalid book id')
  const name = typeof input.name === 'string' ? input.name.trim().slice(0, MAX_NAME) : ''
  if (!name) throw httpError(400, 'missing book name')
  const format = FORMATS.has(input.format) ? input.format : 'txt'
  const encoding = typeof input.encoding === 'string' ? input.encoding.slice(0, 32) : 'UTF-8'
  const source = Array.isArray(input.chapters) ? input.chapters : []
  if (source.length === 0) throw httpError(400, 'book has no chapters')
  if (source.length > MAX_CHAPTERS) throw httpError(413, 'book has too many chapters')

  let charCount = 0
  const chapters = []
  for (const item of source) {
    if (!item || typeof item !== 'object') continue
    const blocksIn = Array.isArray(item.blocks) ? item.blocks : []
    const blocks = []
    for (const block of blocksIn) {
      if (!block || typeof block !== 'object') continue
      const kind = BLOCK_KINDS.has(block.t) ? block.t : 'p'
      const value = typeof block.v === 'string' ? block.v : ''
      if (!value) continue
      const text = value.length > MAX_BLOCK ? value.slice(0, MAX_BLOCK) : value
      if (!text.trim()) continue
      blocks.push({ t: kind, v: text })
      charCount += text.length
    }
    if (blocks.length === 0) continue
    const title = (typeof item.title === 'string' ? item.title.trim() : '').slice(0, MAX_TITLE) ||
      `Chapter ${chapters.length + 1}`
    chapters.push({
      title,
      ...(item.implicit === true ? { implicit: true } : {}),
      blocks,
    })
  }
  if (chapters.length === 0) throw httpError(400, 'book has no readable text')
  return { id, name, format, encoding, chapters, charCount }
}

/**
 * One durable store. Reads are served from memory; every mutation goes
 * through one promise chain, so a scroll storm of progress updates can
 * never interleave index writes.
 */
function createStore(directory, logger) {
  const booksDir = join(directory, 'books')
  const indexPath = join(directory, 'library.json')
  let cache
  let loading
  let queue = Promise.resolve()

  async function ensureDirectories() {
    await mkdir(booksDir, { recursive: true, mode: 0o700 })
  }

  async function load() {
    if (cache) return cache
    if (!loading) {
      loading = (async () => {
        try {
          const raw = await readFile(indexPath, 'utf8')
          cache = normalizeLibrary(JSON.parse(raw))
        } catch (error) {
          if (error?.code !== 'ENOENT') {
            logger.warn?.(`[novel-reader] library could not be read, starting empty: ${error?.message ?? error}`)
          }
          cache = emptyLibrary()
        }
        return cache
      })()
    }
    return loading
  }

  function serialize(operation) {
    const run = queue.then(operation, operation)
    queue = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }

  async function persist() {
    await ensureDirectories()
    const temporary = `${indexPath}.${process.pid}.tmp`
    await writeFile(temporary, JSON.stringify(cache), { mode: 0o600 })
    await rename(temporary, indexPath)
  }

  function bookPath(id) {
    return join(booksDir, `${id}.json`)
  }

  async function library() {
    const current = await load()
    const books = [...current.books].sort((a, b) => {
      const left = a.progress?.at || a.addedAt
      const right = b.progress?.at || b.addedAt
      return right - left
    })
    return { books, lastOpened: current.lastOpened }
  }

  async function readBook(id) {
    let raw
    try {
      raw = await readFile(bookPath(id), 'utf8')
    } catch (error) {
      if (error?.code === 'ENOENT') throw httpError(404, 'book not found', 'NOT_FOUND')
      throw error
    }
    const document = JSON.parse(raw)
    const current = await load()
    const meta = current.books.find((book) => book.id === id)
    return {
      id,
      name: document.name ?? meta?.name ?? id,
      format: document.format ?? meta?.format ?? 'txt',
      encoding: document.encoding ?? meta?.encoding ?? 'UTF-8',
      chapters: Array.isArray(document.chapters) ? document.chapters : [],
      progress: meta?.progress ?? null,
    }
  }

  async function putBook(input) {
    const book = normalizeBook(input)
    return serialize(async () => {
      const current = await load()
      await ensureDirectories()
      const temporary = `${bookPath(book.id)}.${process.pid}.tmp`
      await writeFile(
        temporary,
        JSON.stringify({
          version: 1,
          id: book.id,
          name: book.name,
          format: book.format,
          encoding: book.encoding,
          chapters: book.chapters,
        }),
        { mode: 0o600 },
      )
      await rename(temporary, bookPath(book.id))

      const now = Date.now()
      const existing = current.books.find((entry) => entry.id === book.id)
      const meta = {
        id: book.id,
        name: book.name,
        format: book.format,
        encoding: book.encoding,
        size: integer(input.size, 0, 0),
        charCount: book.charCount,
        chapterCount: book.chapters.length,
        addedAt: existing?.addedAt ?? now,
        updatedAt: now,
        progress: existing?.progress ?? null,
      }
      current.books = current.books.filter((entry) => entry.id !== book.id)
      current.books.unshift(meta)
      current.lastOpened = book.id
      await persist()
      return meta
    })
  }

  async function saveProgress(id, position) {
    return serialize(async () => {
      const current = await load()
      const meta = current.books.find((entry) => entry.id === id)
      if (!meta) throw httpError(404, 'book not found', 'NOT_FOUND')
      const progress = {
        chapter: integer(position?.chapter, 0, 0, Math.max(0, meta.chapterCount - 1)),
        ratio: clamp01(position?.ratio),
        percent: clamp01(position?.percent),
        at: Date.now(),
      }
      meta.progress = progress
      current.lastOpened = id
      await persist()
      return progress
    })
  }

  async function markOpened(id) {
    return serialize(async () => {
      const current = await load()
      if (!current.books.some((entry) => entry.id === id)) {
        throw httpError(404, 'book not found', 'NOT_FOUND')
      }
      current.lastOpened = id
      await persist()
      return current.lastOpened
    })
  }

  async function removeBook(id) {
    return serialize(async () => {
      const current = await load()
      await rm(bookPath(id), { force: true })
      const before = current.books.length
      current.books = current.books.filter((entry) => entry.id !== id)
      if (current.lastOpened === id) current.lastOpened = current.books[0]?.id ?? null
      if (current.books.length !== before) await persist()
      return current.books.length !== before
    })
  }

  return { library, readBook, putBook, saveProgress, markOpened, removeBook }
}

/** Read a bounded JSON request body. */
async function readJson(request, limit = MAX_BODY_BYTES) {
  const declared = Number(request.headers?.['content-length'])
  if (Number.isFinite(declared) && declared > limit) {
    throw httpError(413, 'book is too large', 'TOO_LARGE')
  }
  const chunks = []
  let total = 0
  for await (const chunk of request) {
    total += chunk.length
    if (total > limit) throw httpError(413, 'book is too large', 'TOO_LARGE')
    chunks.push(chunk)
  }
  if (total === 0) throw httpError(400, 'empty body')
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw httpError(400, 'invalid JSON body')
  }
}

function sendJson(response, status, body) {
  if (response.writableEnded) return
  const text = JSON.stringify(body)
  response.statusCode = status
  response.setHeader('content-type', 'application/json; charset=utf-8')
  response.setHeader('cache-control', 'no-store')
  response.setHeader('content-length', String(Buffer.byteLength(text)))
  response.end(text)
}

async function handleHttp(request, response, store, logger) {
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`)
  const prefix = url.pathname.startsWith(ROUTE_PREFIX) ? url.pathname.slice(ROUTE_PREFIX.length) : ''
  const segments = prefix.split('/').filter(Boolean).map((part) => decodeURIComponent(part))
  const method = (request.method || 'GET').toUpperCase()

  try {
    if (method === 'GET' && segments.length === 0) {
      return sendJson(response, 200, { ok: true, service: 'dsh-novel-reader' })
    }
    if (method === 'GET' && segments[0] === 'health' && segments.length === 1) {
      const current = await store.library()
      return sendJson(response, 200, { ok: true, books: current.books.length })
    }

    if (segments[0] === 'library') {
      if (method === 'GET' && segments.length === 1) {
        const current = await store.library()
        return sendJson(response, 200, { ok: true, ...current })
      }
      if (method === 'POST' && segments[1] === 'open' && segments.length === 2) {
        const body = await readJson(request, 64 * 1024)
        if (typeof body?.id !== 'string' || !ID_PATTERN.test(body.id)) {
          throw httpError(400, 'invalid book id')
        }
        const lastOpened = await store.markOpened(body.id)
        return sendJson(response, 200, { ok: true, lastOpened })
      }
      throw httpError(404, 'not found', 'NOT_FOUND')
    }

    if (segments[0] === 'books') {
      if (segments.length === 1 && method === 'POST') {
        const body = await readJson(request)
        const meta = await store.putBook(body)
        return sendJson(response, 200, { ok: true, book: meta })
      }
      const id = segments[1]
      if (!id || !ID_PATTERN.test(id)) throw httpError(400, 'invalid book id')
      if (segments.length === 2 && method === 'GET') {
        const book = await store.readBook(id)
        return sendJson(response, 200, { ok: true, ...book })
      }
      if (segments.length === 3 && segments[2] === 'progress' && method === 'PUT') {
        const body = await readJson(request, 256 * 1024)
        const progress = await store.saveProgress(id, body)
        return sendJson(response, 200, { ok: true, progress })
      }
      if (segments.length === 2 && method === 'DELETE') {
        const removed = await store.removeBook(id)
        if (!removed) throw httpError(404, 'book not found', 'NOT_FOUND')
        return sendJson(response, 200, { ok: true })
      }
      throw httpError(405, 'method not allowed', 'METHOD_NOT_ALLOWED')
    }

    throw httpError(404, 'not found', 'NOT_FOUND')
  } catch (error) {
    const status = Number.isInteger(error?.status) ? error.status : 500
    if (status >= 500) {
      logger.warn?.(`[novel-reader] route error: ${error?.stack ?? error}`)
    }
    sendJson(response, status, {
      ok: false,
      error: { code: error?.code ?? 'ERROR', message: String(error?.message ?? error) },
    })
  }
}

export function apply(ctx, config = {}) {
  const logger = ctx.logger ?? { info() {}, warn() {}, error() {} }
  const configured = typeof config.dataDir === 'string' && config.dataDir.trim() ? config.dataDir.trim() : ''
  const directory = configured ||
    (process.env.DSH_PLUGIN_DATA_DIR
      ? join(process.env.DSH_PLUGIN_DATA_DIR, 'dsh-novel-reader')
      : join(homedir(), '.dsh', 'plugin-data', 'dsh-novel-reader'))
  const store = createStore(directory, logger)
  logger.info?.(`[novel-reader] library at ${directory}`)

  ctx.inject(['webServer'], (web) => {
    const guard = (handler) => (request, response) =>
      Promise.resolve(handler(request, response)).catch((error) => {
        logger.warn?.(`[novel-reader] route crashed: ${error?.stack ?? error}`)
        if (!response.headersSent) response.statusCode = 500
        if (!response.writableEnded) response.end()
      })
    // One effect owns the route, so unloading the plugin frees it.
    return ctx.effect(
      () =>
        web.webServer.register({
          kind: 'prefix',
          path: ROUTE_PREFIX,
          handler: guard((request, response) => handleHttp(request, response, store, logger)),
        }),
      'novel-reader: routes',
    )
  })
}
