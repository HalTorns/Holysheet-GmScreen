import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { join, resolve } from 'node:path'
import { gzipSync } from 'node:zlib'

import { chromium } from '@playwright/test'
import { build } from 'vite'

import { createUIPlugins, sharedResolve } from '../config/vite-shared.ts'

// Pass the JSON inventory recorded from an unmodified production build.
// Every client JS asset is counted once, including shared chunks. This is a
// conservative total-client delta; F4b is only imported by the private Screen.
const baselinePath = process.argv[2]
if (!baselinePath)
  throw new Error('Usage: node scripts/measure-rich-text.mjs baseline.json')
const baseline =
  baselinePath === '--render-only'
    ? null
    : JSON.parse(await readFile(baselinePath, 'utf-8'))
const assets = resolve('.output/public/assets')
const current = await Promise.all(
  (await readdir(assets))
    .filter((name) => name.endsWith('.js'))
    .map(async (name) => {
      const data = await readFile(join(assets, name))
      return { bytes: data.length, gzip: gzipSync(data).length }
    })
)
const sum = (items, key) => items.reduce((total, item) => total + item[key], 0)
const delta = baseline
  ? {
      bytes: sum(current, 'bytes') - sum(baseline, 'bytes'),
      gzip: sum(current, 'gzip') - sum(baseline, 'gzip'),
    }
  : null
const temporary = await mkdtemp(resolve('.f4b-measure-'))
let server
let browser
try {
  await writeFile(
    join(temporary, 'index.html'),
    '<!doctype html><html><body><div id="root"></div><script type="module" src="/entry.ts"></script></body></html>'
  )
  await writeFile(
    join(temporary, 'entry.ts'),
    `
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { NoteRender } from '../src/features/gm/rich-text/render'
const element = document.getElementById('root')
if (!element) throw new Error('Missing measurement root')
const root = createRoot(element)
const large = '**gras** texte\\n'.repeat(700).padEnd(50000, 'x')
function measure(count: number, body: string) {
  const times: number[] = []
  for (let trial = 0; trial < 5; trial++) {
    flushSync(() => root.render(null))
    const start = performance.now()
    flushSync(() => root.render(createElement('div', null, Array.from({ length: count }, (_, index) => createElement(NoteRender, { key: index, body, bodyFormat: 'markdown-v1' })))))
    document.body.getBoundingClientRect()
    times.push(performance.now() - start)
  }
  return { trials: times, median: [...times].sort((a,b) => a-b)[2] }
}
const one = measure(1, large)
const hundred = measure(100, '**note**\\ncontenu')
const start = performance.now()
flushSync(() => root.render(createElement('div', null, Array.from({ length: 100 }, (_, index) => createElement(NoteRender, { key: index, body: index === 0 ? 'frappe' : '**note**\\ncontenu', bodyFormat: 'markdown-v1' })))))
const update = performance.now() - start
Object.assign(window, { noteMeasurements: { one, hundred, update, userAgent: navigator.userAgent } })
`
  )
  await build({
    configFile: false,
    root: temporary,
    resolve: sharedResolve,
    plugins: [...createUIPlugins()],
    logLevel: 'error',
    build: { outDir: join(temporary, 'dist'), minify: true },
  })
  const respond = async (request, response) => {
    const pathname = new URL(request.url ?? '/', 'http://localhost').pathname
    const path = pathname === '/' ? 'index.html' : pathname.slice(1)
    if (!/^(?:index\.html|assets\/[\w.-]+\.js)$/u.test(path)) {
      response.writeHead(404).end()
      return
    }
    try {
      response.setHeader(
        'Content-Type',
        path.endsWith('.js') ? 'text/javascript' : 'text/html'
      )
      response.setHeader(
        'Content-Security-Policy',
        "default-src 'none'; script-src 'self'"
      )
      response.end(await readFile(join(temporary, 'dist', path)))
    } catch {
      response.writeHead(404).end()
    }
  }
  server = createServer((request, response) => {
    void respond(request, response)
  })
  await new Promise((_resolve) => {
    server.listen(0, '127.0.0.1', _resolve)
  })
  const address = server.address()
  if (!address || typeof address === 'string')
    throw new Error('Missing measurement port')
  browser = await chromium.launch()
  const page = await browser.newPage()
  await page.goto(`http://127.0.0.1:${address.port}`)
  await page.waitForFunction(() => 'noteMeasurements' in window)
  const measurements = await page.evaluate(() =>
    Reflect.get(window, 'noteMeasurements')
  )
  console.log(
    JSON.stringify(
      {
        delta,
        budgetPassed: delta
          ? delta.bytes <= 250 * 1024 && delta.gzip <= 80 * 1024
          : null,
        measurements,
      },
      null,
      2
    )
  )
  if (delta && (delta.bytes > 250 * 1024 || delta.gzip > 80 * 1024))
    process.exitCode = 1
} finally {
  await browser?.close()
  if (server)
    await new Promise((_resolve) => {
      server.close(_resolve)
    })
  await rm(temporary, { recursive: true, force: true })
}
