import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { clearResourceCache } from '../hooks/useResource'

// jsdom lacks these browser APIs; the components only use them as progressive enhancements.
window.HTMLElement.prototype.scrollIntoView = () => {}
window.scrollTo = () => {}
class IO {
  constructor(cb) { this.cb = cb }
  observe(el) { this.cb([{ isIntersecting: true, intersectionRatio: 1, target: el }]) }
  unobserve() {}
  disconnect() {}
  takeRecords() { return [] }
}
window.IntersectionObserver = IO
window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
window.matchMedia = window.matchMedia || ((q) => ({ matches: false, media: q, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false } }))

afterEach(() => clearResourceCache())
