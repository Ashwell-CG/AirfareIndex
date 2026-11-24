// In-page layout audit, injected into the running app by the browser tooling at each viewport (see docs/08 report).
// Visits every page state and measures: horizontal overflow, elements beyond the viewport, clipped text,
// interactive targets smaller than 44 px, smallest font size, and whether the hero canvas rendered.
window.__auditAll = async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const waitFor = async (fn, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = fn(); if (v) return v; await sleep(60) } return null }
  const set = (id, value) => { const el = document.getElementById(id); const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value); el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })) }
  const go = async (path) => { window.history.pushState({}, '', path); window.dispatchEvent(new PopStateEvent('popstate')); await sleep(700) }
  const scrollAll = async () => { for (let y = 0; y < document.documentElement.scrollHeight; y += innerHeight * 0.8) { scrollTo(0, y); await sleep(90) } scrollTo(0, 0); await sleep(150) }
  const audit = () => {
    const vw = document.documentElement.clientWidth, de = document.documentElement
    const visible = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && !el.classList.contains('sr-only') && !el.closest('.sr-only') }
    const all = [...document.querySelectorAll('body *')].filter(visible)
    const beyond = all.filter((el) => { const r = el.getBoundingClientRect(); return (r.right > vw + 1 || r.left < -1) && !el.closest('[aria-hidden=true]') && getComputedStyle(el).position !== 'fixed' }).slice(0, 5)
      .map((el) => `${el.tagName}.${String(el.className).slice(0, 40)}`)
    const clipped = all.filter((el) => { const cs = getComputedStyle(el); return (cs.overflow === 'hidden' || cs.textOverflow === 'ellipsis') && el.scrollWidth > el.clientWidth + 1 && el.children.length === 0 && el.textContent.trim() }).slice(0, 5).map((el) => el.textContent.trim().slice(0, 30))
    const interactive = [...document.querySelectorAll('a[href],button,select,input:not([type=radio]):not([type=range]),label:has(input[type=radio])')].filter(visible)
    const small = interactive.filter((el) => { const r = el.getBoundingClientRect(); return r.height < 44 || r.width < 44 }).map((el) => `${el.getAttribute('aria-label') || el.id || el.textContent.trim().slice(0, 18)} ${Math.round(el.getBoundingClientRect().width)}x${Math.round(el.getBoundingClientRect().height)}`)
    const fonts = all.filter((el) => el.children.length === 0 && el.textContent.trim()).map((el) => parseFloat(getComputedStyle(el).fontSize))
    return { hOverflow: de.scrollWidth > vw + 1, beyond, clipped, small, minFont: Math.min(...fonts) }
  }
  const out = {}
  await go('/'); await sleep(2500)
  out.landing = { ...audit(), canvas: !!document.querySelector('canvas'), h1: document.querySelector('h1')?.textContent?.slice(0, 40) }
  await scrollAll(); out.landingScrolled = audit()
  await go('/predict'); await waitFor(() => document.getElementById('source'))
  out.predictEmpty = audit()
  document.querySelector('button[type=submit]').click(); await sleep(300)
  out.predictValidation = { ...audit(), errors: document.querySelectorAll('form .text-danger').length }
  set('source', 'Delhi'); await sleep(60); set('destination', 'Mumbai'); await sleep(60); set('airline', 'Vistara'); await sleep(60); set('travel_class', 'Business'); await sleep(60)
  document.querySelector('button[type=submit]').click()
  const fare = await waitFor(() => document.querySelector('[data-testid=predicted-fare]'))
  await sleep(1500); await scrollAll()
  out.predictResult = { ...audit(), fare: fare?.textContent }
  const realFetch = window.fetch; window.fetch = () => Promise.reject(new TypeError('Failed to fetch'))
  set('days_left', '30'); await sleep(80); document.querySelector('button[type=submit]').click(); await sleep(700)
  out.predictBackendDown = { ...audit(), alert: document.querySelector('[role=alert]')?.textContent?.slice(0, 40) }
  window.fetch = realFetch
  await go('/methodology'); await waitFor(() => document.getElementById('acc-h')); await scrollAll()
  out.methodology = audit()
  if (document.documentElement.clientWidth < 768) {
    document.querySelector('button[aria-controls=mobile-nav]').click(); await sleep(350)
    out.mobileMenu = { ...audit(), focused: document.activeElement?.textContent }
    document.querySelector('button[aria-controls=mobile-nav]').click(); await sleep(250)
  }
  await go('/nowhere'); out.notFound = audit()
  return out
}
