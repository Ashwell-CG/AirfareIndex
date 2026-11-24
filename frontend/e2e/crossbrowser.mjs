// Real-browser end-to-end check: installed Chrome, Edge and Firefox drive the production build against the live backend.
//   node e2e/crossbrowser.mjs [baseUrl] [onlyBrowser]     (needs: backend on :8000 and `npm run preview` on :4173)
// Per browser and viewport: landing page (3D canvas or fallback, overflow, frame rate, console errors), estimator flow
// (fill, submit, compare DISPLAYED fare with a direct /api/predict call), methodology page; screenshots to ../docs/screenshots/.
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer-core'

const here = dirname(fileURLToPath(import.meta.url))
const shots = resolve(here, '../../docs/screenshots/phase8')
mkdirSync(shots, { recursive: true })
const base = process.argv[2] || 'http://localhost:4173'
const only = process.argv[3]
const outFile = resolve(here, '../../docs/08-crossbrowser-results.json')

const BROWSERS = [
  { name: 'chrome', browser: 'chrome', path: 'C:/Program Files/Google/Chrome/Application/chrome.exe' },
  { name: 'edge', browser: 'chrome', path: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' },
  { name: 'firefox', browser: 'firefox', path: 'C:/Program Files/Mozilla Firefox/firefox.exe' },
]
const VIEWPORTS = [
  { name: 'mobile-375x812', width: 375, height: 812, mobile: true },
  { name: 'tablet-768x1024', width: 768, height: 1024, mobile: false },
  { name: 'laptop-1366x768', width: 1366, height: 768, mobile: false },
]
const FORM = { source: 'Delhi', destination: 'Mumbai', airline: 'Vistara', travel_class: 'Business' }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
// Scroll through the page so scroll-triggered reveals run before a full-page capture
const scrollThrough = async (page) => {
  await page.evaluate(async () => {
    for (let y = 0; y < document.documentElement.scrollHeight; y += Math.round(innerHeight * 0.7)) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)) }
    window.scrollTo(0, 0); await new Promise((r) => setTimeout(r, 300))
  })
}
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)

async function landing(page, b, vp, r) {
  await page.goto(base + '/', { waitUntil: 'networkidle2' })
  await sleep(3500)
  Object.assign(r, await page.evaluate(async () => {
    const c = document.querySelector('canvas')
    const gl = c && (c.getContext('webgl2') || c.getContext('webgl'))
    const dbg = gl && gl.getExtension('WEBGL_debug_renderer_info')
    let frames = 0
    const t0 = performance.now()
    await new Promise((res) => { const f = () => { frames++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else res() }; requestAnimationFrame(f) })
    const paint = Object.fromEntries(performance.getEntriesByType('paint').map((e) => [e.name, Math.round(e.startTime)]))
    const res = performance.getEntriesByType('resource')
    return {
      landingWebGL: !!gl, glRenderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl ? 'masked' : null,
      landingPosterVisible: getComputedStyle(document.querySelector('svg[aria-label*="aircraft"]').parentElement).opacity !== '0',
      landingRafFps: Math.round(frames / 2), firstContentfulPaintMs: paint['first-contentful-paint'] ?? null,
      landingTransferKB: Math.round(res.reduce((s, e) => s + (e.transferSize || 0), 0) / 1024),
      heroHeading: document.querySelector('h1')?.textContent,
      coverageLoaded: document.body.innerText.includes('Routes') && !!document.querySelector('table'),
    }
  }))
  r.landingOverflow = await overflow(page)
  await page.screenshot({ path: resolve(shots, `${b.name}-${vp.name}-landing.png`) })
  if (vp.name.startsWith('laptop') || vp.name.startsWith('mobile')) { await scrollThrough(page); await page.screenshot({ path: resolve(shots, `${b.name}-${vp.name}-landing-full.png`), fullPage: true }) }
}

async function estimator(page, b, vp, r) {
  await page.goto(base + '/predict', { waitUntil: 'networkidle2' })
  await page.waitForSelector('#source', { timeout: 15000 })
  for (const [id, v] of Object.entries(FORM)) { await page.select(`#${id}`, v); await sleep(80) }
  r.durationPrefilled = `${await page.$eval('#durH', (e) => e.value)}h ${await page.$eval('#durM', (e) => e.value)}m`
  if (vp.name.startsWith('mobile')) {
    await page.select('#airline', '')
    await page.click('button[type=submit]'); await sleep(350)
    r.validationErrorsShown = (await page.$$('form .text-danger')).length
    await page.screenshot({ path: resolve(shots, `${b.name}-${vp.name}-validation.png`) })
    await page.select('#airline', FORM.airline); await sleep(80); await page.select('#travel_class', FORM.travel_class)
  }
  await page.click('button[type=submit]')
  await page.waitForSelector('[data-testid=predicted-fare]', { timeout: 15000 })
  await sleep(1600) // count-up and reveal animations
  r.displayedFare = await page.$eval('[data-testid=predicted-fare]', (e) => e.textContent)
  r.visibleFareAfterCountUp = await page.$eval('[data-testid=predicted-fare]', (e) => e.previousElementSibling?.textContent)
  const v = await page.evaluate(() => ({ h: durH.value, m: durM.value, t: departure_time.value, d: days_left.value }))
  const body = { ...FORM, departure_time: v.t, stops: 'non-stop', duration_hours: Math.round((Number(v.h) + Number(v.m) / 60) * 10000) / 10000, days_left: Number(v.d) }
  const direct = await (await fetch(`${base}/api/predict`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json()
  r.directApiFare = '₹' + new Intl.NumberFormat('en-IN').format(direct.predicted_fare_inr)
  r.matchesDirectApi = r.displayedFare === r.directApiFare && r.visibleFareAfterCountUp === r.directApiFare
  r.limitationsShown = await page.$$eval('#limits-h ~ ul li', (l) => l.length)
  r.typicalErrorShown = await page.evaluate(() => document.body.innerText.includes('model-level statistic, not a confidence score'))
  r.estimatorOverflow = await overflow(page)
  if (vp.name.startsWith('mobile')) await scrollThrough(page)
  else await page.$eval('#result-h', (e) => e.scrollIntoView({ block: 'start' }))
  await page.screenshot({ path: resolve(shots, `${b.name}-${vp.name}-result.png`), fullPage: vp.name.startsWith('mobile') })
}

async function methodology(page, r) {
  const link = await page.$('nav[aria-label=Main] a[href="/methodology"]')
  const visible = link && await link.evaluate((e) => e.offsetParent !== null)
  if (visible) await link.click()
  else { await page.click('button[aria-controls=mobile-nav]'); await sleep(300); await page.click('#mobile-nav a[href="/methodology"]') }
  await page.waitForSelector('#acc-h', { timeout: 15000 })
  r.methodologyLoaded = true
  r.methodologyOverflow = await overflow(page)
}

async function run(b) {
  const out = { browser: b.name, viewports: [] }
  let proc = null, browser
  if (b.name === 'edge') { // Edge hands off to an already-running Edge, so it is started with its own profile and attached to
    const port = 9333
    proc = spawn(b.path, ['--headless=new', '--no-first-run', `--remote-debugging-port=${port}`, `--user-data-dir=${resolve(tmpdir(), 'airfare-edge-profile')}`, 'about:blank'], { stdio: 'ignore' })
    for (let i = 0; i < 60; i++) { try { await fetch(`http://127.0.0.1:${port}/json/version`); break } catch { await sleep(250) } }
    browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${port}` })
  } else {
    browser = await puppeteer.launch({ browser: b.browser, executablePath: b.path, headless: true, args: b.browser === 'chrome' ? ['--no-first-run'] : [] })
  }
  out.version = await browser.version()
  try {
    for (const vp of VIEWPORTS) {
      const page = await browser.newPage()
      const errors = []
      page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
      page.on('pageerror', (e) => errors.push(String(e)))
      await page.setViewport({ width: vp.width, height: vp.height, isMobile: vp.mobile && b.browser === 'chrome', hasTouch: vp.mobile && b.browser === 'chrome' })
      const r = { viewport: vp.name, ok: false }
      try {
        await landing(page, b, vp, r)
        await estimator(page, b, vp, r)
        await methodology(page, r)
        r.consoleErrors = errors
        r.ok = r.matchesDirectApi && !r.landingOverflow && !r.estimatorOverflow && !r.methodologyOverflow && errors.length === 0
      } catch (e) {
        r.error = String(e).slice(0, 300)
        r.consoleErrors = errors
      }
      out.viewports.push(r)
      await page.close()
      console.log(b.name, vp.name, r.ok ? 'OK' : 'FAIL', `webgl=${r.landingWebGL} fps=${r.landingRafFps}`, r.displayedFare ?? '', r.error ?? '')
    }
  } finally {
    if (proc) { await browser.disconnect(); spawnSync('taskkill', ['/PID', String(proc.pid), '/T', '/F']) } else await browser.close()
  }
  return out
}

const results = only && existsSync(outFile) ? JSON.parse(readFileSync(outFile, 'utf-8')).filter((r) => r.browser !== only) : []
for (const b of BROWSERS.filter((x) => !only || x.name === only)) {
  try { results.push(await run(b)) } catch (e) { results.push({ browser: b.name, launchError: String(e).slice(0, 400) }); console.log(b.name, 'LAUNCH FAIL', String(e).slice(0, 200)) }
}
writeFileSync(outFile, JSON.stringify(results, null, 1))
process.exit(0)
