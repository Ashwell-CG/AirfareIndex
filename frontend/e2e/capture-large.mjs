// Captures the main pages at large-display sizes in installed Chrome (for the Phase 8 report).
//   node e2e/capture-large.mjs [baseUrl]
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer-core'

const here = dirname(fileURLToPath(import.meta.url))
const shots = resolve(here, '../../docs/screenshots/phase8')
const base = process.argv[2] || 'http://localhost:4173'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await puppeteer.launch({ browser: 'chrome', executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--no-first-run'] })
for (const [w, h] of [[1920, 1080], [2560, 1440]]) {
  const page = await browser.newPage()
  await page.setViewport({ width: w, height: h })
  await page.goto(base + '/', { waitUntil: 'networkidle2' }); await sleep(3500)
  await page.screenshot({ path: resolve(shots, `chrome-${w}x${h}-landing.png`) })
  await page.goto(base + '/methodology', { waitUntil: 'networkidle2' })
  await page.waitForSelector('#acc-h'); await page.$eval('#acc-h', (e) => e.scrollIntoView({ block: 'start' })); await sleep(2000)
  await page.screenshot({ path: resolve(shots, `chrome-${w}x${h}-methodology.png`) })
  await page.close()
  console.log('captured', w, h)
}
await browser.close()
