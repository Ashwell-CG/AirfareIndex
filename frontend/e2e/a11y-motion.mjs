// Reduced-motion and keyboard checks in installed Chrome against the running app.
//   node e2e/a11y-motion.mjs [baseUrl]
import puppeteer from 'puppeteer-core'

const base = process.argv[2] || 'http://localhost:4173'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await puppeteer.launch({ browser: 'chrome', executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--no-first-run'] })
const out = {}

// 1. prefers-reduced-motion: content must be fully visible immediately, the 3D scene must not animate
{
  const page = await browser.newPage()
  await page.setViewport({ width: 1366, height: 768 })
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }])
  await page.goto(base + '/', { waitUntil: 'networkidle2' }); await sleep(2500)
  out.reducedMotion = await page.evaluate(async () => {
    const h1 = getComputedStyle(document.querySelector('h1')).opacity
    const c = document.querySelector('canvas')
    let changed = null
    if (c) { // compare two frames 600 ms apart: a static scene renders identically
      const snap = () => c.toDataURL().length
      const a = snap(); await new Promise((r) => setTimeout(r, 600)); changed = snap() !== a
    }
    return { h1Opacity: h1, canvas: !!c, canvasChangedBetweenFrames: changed }
  })
  await page.goto(base + '/predict', { waitUntil: 'networkidle2' })
  await page.waitForSelector('#source')
  for (const [id, v] of Object.entries({ source: 'Delhi', destination: 'Mumbai', airline: 'Vistara', travel_class: 'Economy' })) { await page.select(`#${id}`, v); await sleep(60) }
  await page.click('button[type=submit]'); await page.waitForSelector('[data-testid=predicted-fare]'); await sleep(150)
  out.reducedMotion.fareShownImmediately = await page.$eval('[data-testid=predicted-fare]', (e) => e.previousElementSibling.textContent === e.textContent)
  out.reducedMotion.barWidthSet = await page.$eval('#lead-h', (h) => h.closest('section').querySelector('li span span').style.width)
  await page.close()
}

// 2. keyboard: Tab order from the top of the estimator, focus visibility, Enter submits
{
  const page = await browser.newPage()
  await page.setViewport({ width: 1366, height: 768 })
  await page.goto(base + '/predict', { waitUntil: 'networkidle2' })
  await page.waitForSelector('#source')
  const seq = []
  for (let i = 0; i < 14; i++) {
    await page.keyboard.press('Tab')
    seq.push(await page.evaluate(() => {
      const a = document.activeElement
      const cs = getComputedStyle(a)
      return `${a.tagName.toLowerCase()}${a.id ? '#' + a.id : ''}:${(a.getAttribute('aria-label') || a.textContent || '').trim().slice(0, 22)}|outline=${cs.outlineStyle !== 'none' && cs.outlineWidth !== '0px'}`
    }))
  }
  out.tabOrder = seq
  // keyboard-only form completion
  await page.focus('#source'); await page.keyboard.press('ArrowDown') // native select keyboard change
  await page.select('#source', 'Kolkata'); await page.select('#destination', 'Delhi'); await page.select('#airline', 'Indigo')
  await page.focus('#days_left'); await page.keyboard.press('Enter')
  await page.waitForSelector('[data-testid=predicted-fare]', { timeout: 10000 })
  out.enterSubmits = await page.$eval('[data-testid=predicted-fare]', (e) => e.textContent)
  out.focusMovedToResult = await page.evaluate(() => document.activeElement?.id)
  await page.close()
}
await browser.close()
console.log(JSON.stringify(out, null, 1))
