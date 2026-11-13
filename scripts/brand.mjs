// Renders the brand assets from the SVG/HTML sources in build/logo with headless
// Edge or Chrome: app icons (build/icon.png, build/icon.ico, resources/icon.png)
// and the cover image (docs/images/capa.png).
//
// Usage: node scripts/brand.mjs

/* eslint-disable @typescript-eslint/explicit-function-return-type -- plain JS, no type annotations */

import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const at = (...parts) => join(root, ...parts)
const fileUrl = (...parts) => pathToFileURL(at(...parts)).href

const BROWSERS = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
]
const browser = BROWSERS.find((path) => existsSync(path))
if (!browser) {
  console.error('Edge ou Chrome não encontrado.')
  process.exit(1)
}

const PORT = 9334
const profile = mkdtempSync(join(tmpdir(), 'ata-brand-'))
const child = spawn(browser, [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`,
  '--no-first-run',
  '--allow-file-access-from-files',
  'about:blank'
])
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

let targets
for (let i = 0; i < 50 && !targets; i++) {
  await sleep(200)
  try {
    targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()
  } catch {
    // Not listening yet.
  }
}
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl)
await new Promise((resolve) => ws.addEventListener('open', resolve))
let seq = 0
const pending = new Map()
ws.addEventListener('message', (event) => {
  const message = JSON.parse(event.data)
  pending.get(message.id)?.(message)
  pending.delete(message.id)
})
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++seq
    pending.set(id, (m) => (m.error ? reject(new Error(m.error.message)) : resolve(m.result)))
    ws.send(JSON.stringify({ id, method, params }))
  })

await send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } })

/** Renders a page at width x height CSS pixels and returns the PNG bytes. */
async function render(url, width, height = width) {
  await send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false
  })
  await send('Page.navigate', { url })
  await sleep(800)
  await send('Runtime.evaluate', { expression: 'document.fonts.ready', awaitPromise: true })
  const { data } = await send('Page.captureScreenshot', { format: 'png' })
  return Buffer.from(data, 'base64')
}

/** An SVG scaled to fill a square page of the given size. */
const svgPage = (file) =>
  'data:text/html,' +
  encodeURIComponent(
    `<style>html,body{margin:0;background:transparent}svg{display:block;width:100vw;height:100vh}</style>` +
      readFileSync(at('build', 'logo', file), 'utf8')
  )

/** Packs PNG images into a .ico (PNG entries, supported since Windows Vista). */
function ico(images) {
  const header = Buffer.alloc(6 + 16 * images.length)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)
  let offset = header.length
  images.forEach(({ size, png }, i) => {
    const entry = 6 + 16 * i
    header.writeUInt8(size >= 256 ? 0 : size, entry)
    header.writeUInt8(size >= 256 ? 0 : size, entry + 1)
    header.writeUInt16LE(1, entry + 4)
    header.writeUInt16LE(32, entry + 6)
    header.writeUInt32LE(png.length, entry + 8)
    header.writeUInt32LE(offset, entry + 12)
    offset += png.length
  })
  return Buffer.concat([header, ...images.map(({ png }) => png)])
}

try {
  const icon = await render(svgPage('icon.svg'), 1024)
  writeFileSync(at('build', 'icon.png'), icon)
  writeFileSync(at('resources', 'icon.png'), await render(svgPage('icon.svg'), 512))

  const sizes = [16, 24, 32, 48, 64, 128, 256]
  const images = []
  for (const size of sizes) {
    // Small sizes use the simplified drawing, which stays readable at 16 px.
    const source = size <= 32 ? 'icon-small.svg' : 'icon.svg'
    images.push({ size, png: await render(svgPage(source), size) })
  }
  writeFileSync(at('build', 'icon.ico'), ico(images))

  if (existsSync(at('build', 'logo', 'cover.html'))) {
    writeFileSync(
      at('docs', 'images', 'capa.png'),
      await render(fileUrl('build', 'logo', 'cover.html'), 1280, 640)
    )
  }
  console.log('Pronto: build/icon.png, build/icon.ico, resources/icon.png, docs/images/capa.png')
} finally {
  ws.close()
  child.kill()
  await sleep(300)
  try {
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  } catch {
    // The browser may still hold its profile; the temp folder is cleaned by the OS.
  }
}
process.exit(0)
