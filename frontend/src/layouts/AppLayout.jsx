import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation, useOutlet } from 'react-router-dom'
import { AnimatePresence, m, useReducedMotion } from 'framer-motion'
import { Menu, Plane, X } from 'lucide-react'
import { Wordmark } from '../components/brand/Logo'

const REPO = 'https://github.com/Ashwell-CG/AirfareIndex'
const API = 'https://airfareindex-api.onrender.com'
const LINKS = [
  { to: '/predict', label: 'Estimate fare' },
  { to: '/methodology', label: 'About the model' },
]

const desktopLink = ({ isActive }) =>
  `relative flex min-h-11 items-center px-3.5 text-[0.9375rem] font-medium transition-colors ${isActive ? 'text-ink' : 'text-mist hover:text-ink'}`

function SiteNav() {
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const menuBtn = useRef(null)
  const firstLink = useRef(null)
  const landing = pathname === '/'

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  useEffect(() => {
    if (!open) return undefined
    firstLink.current?.focus()
    const onKey = (e) => { if (e.key === 'Escape') { setOpen(false); menuBtn.current?.focus() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const solid = scrolled || !landing || open
  return (
    <header className={`fixed inset-x-0 top-0 z-50 transition-[background-color,border-color] duration-300 ${solid ? 'border-b border-white/[0.08] bg-night-950/70 backdrop-blur-xl' : 'border-b border-transparent'}`}>
      <div className="mx-auto flex h-16 w-full max-w-[1600px] items-center justify-between gap-3 px-4 sm:px-6 lg:h-[4.5rem] lg:px-10">
        <Link to="/" aria-label="AirfareIndex home" className="flex min-h-11 items-center rounded-lg" onClick={() => setOpen(false)}>
          <Wordmark />
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <NavLink key={l.to} to={l.to} className={desktopLink}>
              {({ isActive }) => (
                <>
                  {l.label}
                  {isActive && <span className="absolute inset-x-3.5 -bottom-[0.6rem] h-0.5 rounded-full bg-cyan" />}
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <button ref={menuBtn} type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="mobile-nav"
          aria-label={open ? 'Close menu' : 'Open menu'} className="grid h-11 w-11 place-items-center rounded-full border border-white/15 bg-white/[0.04] text-ink md:hidden">
          {open ? <X aria-hidden="true" className="h-5 w-5" /> : <Menu aria-hidden="true" className="h-5 w-5" />}
        </button>
      </div>
      <AnimatePresence>
        {open && (
          <m.nav id="mobile-nav" aria-label="Main" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }} className="border-t border-white/[0.08] bg-night-950/95 px-4 pb-6 pt-3 backdrop-blur-xl md:hidden">
            <ul className="flex flex-col">
              {[{ to: '/', label: 'Home', end: true }, ...LINKS].map((l, i) => (
                <li key={l.to}>
                  <NavLink ref={i === 0 ? firstLink : undefined} to={l.to} end={l.end} onClick={() => setOpen(false)}
                    className={({ isActive }) => `display-md flex min-h-14 items-center border-b border-white/[0.06] px-2 text-[1.75rem] ${isActive ? 'text-cyan' : 'text-ink'}`}>
                    {l.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </m.nav>
        )}
      </AnimatePresence>
    </header>
  )
}

function SiteFooter() {
  const linkCls = 'inline-flex min-h-11 items-center text-mist transition-colors hover:text-ink'
  return (
    <footer className="relative overflow-hidden border-t border-white/[0.08] bg-night-950">
      <div className="mx-auto grid w-full max-w-[1600px] gap-12 px-4 pb-10 pt-16 sm:px-6 md:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr_1.2fr] lg:px-10">
        <div className="max-w-md">
          <Wordmark />
          <p className="mt-5 text-[0.9375rem] leading-relaxed text-mist">
            Fare estimates in rupees for Indian domestic flights, from a machine learning model trained on historical listed fares for journeys in January to March 2023.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-fog">Not live prices, not a booking service, not affiliated with any airline.</p>
        </div>
        <nav aria-label="Footer">
          <h2 className="text-sm font-semibold text-ink">Explore</h2>
          <ul className="mt-3 text-sm">
            {[['/', 'Home'], ['/predict', 'Estimate a fare'], ['/methodology', 'Methodology and limits']].map(([to, label]) => (
              <li key={to}><Link to={to} className={linkCls}>{label}</Link></li>
            ))}
          </ul>
        </nav>
        <div>
          <h2 className="text-sm font-semibold text-ink">Project</h2>
          <ul className="mt-3 text-sm">
            <li><a href={REPO} className={linkCls} target="_blank" rel="noreferrer">Source code on GitHub</a></li>
            <li><a href={`${REPO}#readme`} className={linkCls} target="_blank" rel="noreferrer">Documentation</a></li>
            <li><a href={`${API}/health`} className={linkCls} target="_blank" rel="noreferrer">API status</a></li>
          </ul>
        </div>
        <div>
          <h2 className="text-sm font-semibold text-ink">Built with</h2>
          <p className="mt-3 text-sm leading-relaxed text-mist">React, Vite, Tailwind CSS and three.js in the browser. FastAPI and scikit-learn on the server. Hosted on Vercel and Render.</p>
        </div>
      </div>
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-2 border-t border-white/[0.06] px-4 py-6 text-xs text-fog sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-10">
        <p>An academic supervised learning project. Estimates are model outputs, not quotes.</p>
        <p className="flex items-center gap-2"><Plane aria-hidden="true" className="h-3.5 w-3.5 text-horizon" />Random Forest and route lookup blend, typical error about 11 to 12% on unseen flights.</p>
      </div>
    </footer>
  )
}

export default function AppLayout() {
  const location = useLocation()
  const outlet = useOutlet()
  const reduce = useReducedMotion()
  useLayoutEffect(() => { if (!location.hash) window.scrollTo(0, 0) }, [location.pathname, location.hash])

  return (
    <div className="flex min-h-dvh flex-col bg-night-950">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-lg focus:bg-ink focus:px-4 focus:py-2 focus:text-night-950">Skip to content</a>
      <SiteNav />
      <AnimatePresence mode="wait" initial={false}>
        <m.main key={location.pathname} id="main" className="flex-1"
          initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={reduce ? undefined : { opacity: 0 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}>
          {outlet}
        </m.main>
      </AnimatePresence>
      <SiteFooter />
    </div>
  )
}
