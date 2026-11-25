// Post-deployment verification against PUBLIC URLs (or a local production-style stack).
//   node e2e/verify-deployment.mjs <frontendUrl> <apiUrl> [--browser]
// Example: node e2e/verify-deployment.mjs https://airfareindex.vercel.app https://airfareindex-api.onrender.com --browser
// HTTP checks need only Node. --browser additionally drives installed Chrome (puppeteer-core): estimator flow, direct-route refresh,
// methodology page, 3D canvas on desktop and mobile. Exit code 1 if any check fails. Nothing is mocked: results come from the live services.
import { writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const [front, api] = process.argv.slice(2, 4).map((u) => u?.replace(/\/+$/, ''))
const withBrowser = process.argv.includes('--browser')
if (!front || !api) { console.error('usage: node e2e/verify-deployment.mjs <frontendUrl> <apiUrl> [--browser]'); process.exit(2) }

const results = []
const check = async (name, fn) => {
  const t = Date.now()
  try { const detail = await fn(); results.push({ name, ok: true, detail, ms: Date.now() - t }); console.log('PASS', name, detail ?? '') }
  catch (e) { results.push({ name, ok: false, detail: String(e.message ?? e), ms: Date.now() - t }); console.log('FAIL', name, '-', String(e.message ?? e)) }
}
const assert = (c, m) => { if (!c) throw new Error(m) }
const get = (url, init) => fetch(url, { signal: AbortSignal.timeout(90000), ...init })
const post = (body, origin) => get(`${api}/predict`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) }, body: JSON.stringify(body) })
const VALID = { source: 'Delhi', destination: 'Mumbai', airline: 'Vistara', travel_class: 'Economy', departure_time: '09:30', stops: 'non-stop', duration_hours: 2.25, days_left: 14 }
const frontOrigin = new URL(front).origin

// --- API
await check('API /health (also wakes a sleeping free-tier instance)', async () => { const r = await get(`${api}/health`); assert(r.ok, r.status); return `${(await r.json()).status}` })
await check('API /ready: model loaded', async () => { const r = await get(`${api}/ready`); const j = await r.json(); assert(r.ok && j.status === 'ready', JSON.stringify(j)); return j.model })
await check('API uses HTTPS (or local)', async () => { assert(api.startsWith('https://') || /localhost|127\.0\.0\.1/.test(api), 'API is not served over HTTPS'); return api.split(':')[0] })
await check('API /options: 9 airlines, 7 cities, no First class', async () => {
  const o = await (await get(`${api}/options`)).json()
  const classes = new Set(Object.values(o.airline_class_routes).flatMap((a) => Object.keys(a)))
  assert(Object.keys(o.airline_class_routes).length === 9 && o.cities.length === 7 && !classes.has('First') && o.days_left_range.join() === '1,50', 'unexpected options')
  return `${o.cities.length} cities, ${Object.keys(o.airline_class_routes).length} airlines`
})
const fares = {}
for (const [label, patch] of [['Delhi-Mumbai Vistara Economy', {}], ['Delhi-Mumbai Vistara Business', { travel_class: 'Business' }], ['Delhi-Mumbai Vistara Premium Economy', { travel_class: 'Premium Economy' }],
  ['Bangalore-Kolkata Air India Business 1-stop', { source: 'Bangalore', destination: 'Kolkata', airline: 'Air India', travel_class: 'Business', stops: '1-stop', duration_hours: 7.5, days_left: 21 }],
  ['Chennai-Hyderabad Indigo Economy', { source: 'Chennai', destination: 'Hyderabad', airline: 'Indigo', duration_hours: 1.5, days_left: 40 }]]) {
  await check(`predict: ${label}`, async () => {
    const r = await post({ ...VALID, ...patch }); const j = await r.json()
    assert(r.ok, `${r.status} ${JSON.stringify(j).slice(0, 120)}`)
    assert(j.currency === 'INR' && Number.isInteger(j.predicted_fare_inr) && j.predicted_fare_inr > 0, 'bad fare')
    assert(j.typical_error.is_per_prediction_confidence === false && j.lead_time_profile.length === 8, 'transparency fields missing')
    fares[label] = j.predicted_fare_inr
    return `INR ${j.predicted_fare_inr}`
  })
}
await check('predictions differ by class and are deterministic', async () => {
  assert(fares['Delhi-Mumbai Vistara Business'] > 3 * fares['Delhi-Mumbai Vistara Economy'], 'class effect missing')
  const again = (await (await post(VALID)).json()).predicted_fare_inr
  assert(again === fares['Delhi-Mumbai Vistara Economy'], 'non-deterministic'); return `${fares['Delhi-Mumbai Vistara Economy']} twice`
})
for (const [label, body, status] of [
  ['First class rejected', { ...VALID, travel_class: 'First' }, 422], ['days_left 51 rejected', { ...VALID, days_left: 51 }, 422], ['days_left 0 rejected', { ...VALID, days_left: 0 }, 422],
  ['unsupported airline/class rejected', { ...VALID, airline: 'Indigo', travel_class: 'Business' }, 422], ['same city rejected', { ...VALID, destination: 'Delhi' }, 422],
  ['duration out of range rejected', { ...VALID, duration_hours: 10 }, 422], ['unknown field rejected', { ...VALID, flight_code: 'UK-1' }, 422], ['missing field rejected', (({ airline, ...r }) => r)(VALID), 422]]) {
  await check(`invalid input: ${label}`, async () => {
    const r = await post(body); const t = await r.text()
    assert(r.status === status, `expected ${status}, got ${r.status}`)
    assert(!/Traceback|File "|site-packages/.test(t), 'internal details leaked'); return `${r.status}`
  })
}
await check('malformed JSON rejected without internals', async () => {
  const r = await get(`${api}/predict`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bad' }); const t = await r.text()
  assert(r.status === 422 && !/Traceback|site-packages/.test(t), `status ${r.status}`); return '422'
})
await check('CORS: frontend origin allowed', async () => {
  const r = await get(`${api}/predict`, { method: 'OPTIONS', headers: { Origin: frontOrigin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' } })
  assert(r.headers.get('access-control-allow-origin') === frontOrigin, `allow-origin=${r.headers.get('access-control-allow-origin')}`); return frontOrigin
})
await check('CORS: foreign origin not allowed, no wildcard', async () => {
  const r = await get(`${api}/predict`, { method: 'OPTIONS', headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'POST' } })
  const v = r.headers.get('access-control-allow-origin'); assert(v !== '*' && v !== 'https://evil.example', `allow-origin=${v}`); return 'blocked'
})
await check('API docs/openapi not public', async () => { for (const p of ['/docs', '/openapi.json']) assert((await get(`${api}${p}`)).status === 404, `${p} is public`); return '404' })
await check('API timing: warm /predict', async () => { const t = []; for (let i = 0; i < 5; i++) { const s = Date.now(); await post(VALID); t.push(Date.now() - s) } t.sort((a, b) => a - b); return `median ${t[2]} ms (network included)` })

// --- Frontend (HTTP)
for (const p of ['/', '/predict', '/methodology', '/about']) {
  await check(`frontend GET ${p} serves the app (direct URL / refresh)`, async () => {
    const r = await get(front + p); const t = await r.text(); assert(r.ok && /<div id="root">/.test(t), `status ${r.status}`); return r.status
  })
}
await check('frontend serves hashed assets with caching', async () => {
  const html = await (await get(front + '/')).text(); const m = html.match(/\/assets\/[^"']+\.js/); assert(m, 'no asset link'); const r = await get(front + m[0])
  assert(r.ok && /javascript/.test(r.headers.get('content-type')), 'asset not JS'); return r.headers.get('cache-control') ?? 'no cache-control'
})

// --- Frontend (real browser)
if (withBrowser) {
  const { default: puppeteer } = await import('puppeteer-core')
  const browser = await puppeteer.launch({ browser: 'chrome', executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--no-first-run'] })
  const shots = resolve(dirname(fileURLToPath(import.meta.url)), '../../docs/screenshots/phase9'); (await import('node:fs')).mkdirSync(shots, { recursive: true })
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  for (const vp of [{ n: 'desktop', width: 1366, height: 768, mobile: false }, { n: 'mobile', width: 390, height: 844, mobile: true }]) {
    const page = await browser.newPage(); const errs = []
    page.on('console', (m) => m.type() === 'error' && errs.push(m.text())); page.on('pageerror', (e) => errs.push(String(e)))
    await page.setViewport({ width: vp.width, height: vp.height, isMobile: vp.mobile, hasTouch: vp.mobile })
    await check(`[${vp.n}] landing: 3D canvas renders, no overflow`, async () => {
      await page.goto(front + '/', { waitUntil: 'networkidle2', timeout: 90000 }); await sleep(3500)
      const r = await page.evaluate(() => ({ canvas: !!document.querySelector('canvas'), h1: document.querySelector('h1')?.textContent, ovf: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1, facts: document.body.innerText.includes('Routes') }))
      assert(r.canvas, '3D canvas missing (fallback shown)'); assert(!r.ovf, 'horizontal overflow'); assert(r.h1 && r.h1.trim().length > 0, 'no h1')
      await page.screenshot({ path: resolve(shots, `${vp.n}-landing.png`) }); return 'canvas ok'
    })
    await check(`[${vp.n}] direct load of /predict, submit valid itinerary, genuine INR fare`, async () => {
      await page.goto(front + '/predict', { waitUntil: 'networkidle2', timeout: 90000 }); await page.waitForSelector('#source', { timeout: 90000 })
      for (const [id, v] of Object.entries({ source: 'Delhi', destination: 'Mumbai', airline: 'Vistara', travel_class: 'Economy' })) { await page.select(`#${id}`, v); await sleep(80) }
      await page.click('button[type=submit]'); await page.waitForSelector('[data-testid=predicted-fare]', { timeout: 90000 }); await sleep(1600)
      const shown = await page.$eval('[data-testid=predicted-fare]', (e) => e.textContent)
      const direct = '₹' + new Intl.NumberFormat('en-IN').format((await (await post({ ...VALID, duration_hours: Number(await page.$eval('#durH', (e) => e.value)) + Number(await page.$eval('#durM', (e) => e.value)) / 60 })).json()).predicted_fare_inr)
      assert(shown === direct, `UI ${shown} != API ${direct}`)
      assert(await page.evaluate(() => document.body.innerText.includes('model-level statistic, not a confidence score')), 'typical-error disclaimer missing')
      await page.screenshot({ path: resolve(shots, `${vp.n}-result.png`), fullPage: vp.mobile }); return shown
    })
    await check(`[${vp.n}] unsupported/invalid input shows validation, no request needed`, async () => {
      await page.reload({ waitUntil: 'networkidle2' }); await page.waitForSelector('#source'); await page.click('button[type=submit]'); await sleep(300)
      const n = (await page.$$('form .text-danger')).length; assert(n >= 3, `only ${n} errors shown`); return `${n} errors`
    })
    await check(`[${vp.n}] backend error handled (API unreachable)`, async () => {
      await page.setRequestInterception(true); const h = (req) => (req.url().includes('/predict') ? req.abort('failed') : req.continue()); page.on('request', h)
      for (const [id, v] of Object.entries({ source: 'Delhi', destination: 'Mumbai', airline: 'Vistara', travel_class: 'Economy' })) { await page.select(`#${id}`, v); await sleep(60) }
      await page.click('button[type=submit]'); await page.waitForSelector('[role=alert]', { timeout: 20000 })
      const t = await page.$eval('[role=alert]', (e) => e.textContent); page.off('request', h); await page.setRequestInterception(false)
      assert(/couldn't reach the prediction service/.test(t), t); return 'friendly error shown'
    })
    await check(`[${vp.n}] methodology page via refresh of /methodology`, async () => {
      await page.goto(front + '/methodology', { waitUntil: 'networkidle2', timeout: 90000 }); await page.waitForSelector('#acc-h', { timeout: 30000 })
      const r = await page.evaluate(() => ({ t: document.body.innerText, ovf: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 }))
      assert(/11\.4%/.test(r.t) && /Unseen airlines, routes and future market periods/.test(r.t) && !r.ovf, 'methodology content/overflow'); return 'ok'
    })
    await check(`[${vp.n}] no console errors`, async () => { assert(errs.filter((e) => !/Failed to load resource|ERR_FAILED/.test(e)).length === 0, errs.join(' | ').slice(0, 200)); return '0' })
    await page.close()
  }
  await browser.close()
}

const failed = results.filter((r) => !r.ok)
writeFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../docs/09-verification-run.json'), JSON.stringify({ frontend: front, api, when: new Date().toISOString(), passed: results.length - failed.length, failed: failed.length, results }, null, 1))
console.log(`\n${results.length - failed.length}/${results.length} checks passed${failed.length ? ' - FAILED: ' + failed.map((f) => f.name).join('; ') : ''}`)
process.exit(failed.length ? 1 : 0)
