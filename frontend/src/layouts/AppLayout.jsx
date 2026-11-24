import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation, useOutlet } from 'react-router-dom'
import { AnimatePresence, m, useReducedMotion } from 'framer-motion'
import { ArrowRight, Menu, X } from 'lucide-react'
import { Wordmark } from '../components/brand/Logo'
import { buttonClass } from '../components/ui/styles'

const LINKS = [
  { to: '/predict', label: 'Estimate fare' },
  { to: '/methodology', label: 'About the model' },
]

const desktopLink = ({ isActive }) =>
  `relative flex min-h-11 items-center rounded-lg px-3.5 text-[0.9375rem] font-medium transition-colors ${isActive ? 'text-ink' : 'text-mist hover:text-ink'}`

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
    <header className={`fixed inset-x-0 top-0 z-50 transition-[background-color,border-color,backdrop-filter] duration-300 ${solid ? 'border-b border-white/[0.07] bg-night-950/80 backdrop-blur-xl' : 'border-b border-transparent'}`}>
      <div className="mx-auto flex h-16 w-full max-w-[1440px] items-center justify-between gap-3 px-4 sm:px-6 lg:h-[4.5rem] lg:px-10">
        <Link to="/" aria-label="AirfareIndex home" className="flex min-h-11 items-center rounded-lg" onClick={() => setOpen(false)}>
          <Wordmark />
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <NavLink key={l.to} to={l.to} className={desktopLink}>
              {({ isActive }) => (
                <>
                  {l.label}
                  {isActive && <span className="absolute inset-x-3 -bottom-0.5 h-px bg-gradient-to-r from-azure to-cyan" />}
                </>
              )}
            </NavLink>
          ))}
          {pathname !== '/predict' && (
            <Link to="/predict" className={buttonClass('primary', 'ml-3 min-h-11 px-4 text-[0.9375rem]')}>Estimate a fare<ArrowRight aria-hidden="true" className="h-4 w-4" /></Link>
          )}
        </nav>
        <button ref={menuBtn} type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="mobile-nav"
          aria-label={open ? 'Close menu' : 'Open menu'} className="grid h-11 w-11 place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-ink md:hidden">
          {open ? <X aria-hidden="true" className="h-5 w-5" /> : <Menu aria-hidden="true" className="h-5 w-5" />}
        </button>
      </div>
      <AnimatePresence>
        {open && (
          <m.nav id="mobile-nav" aria-label="Main" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }} className="border-t border-white/[0.07] bg-night-950/95 px-4 pb-5 pt-3 backdrop-blur-xl md:hidden">
            <ul className="flex flex-col gap-1">
              {[{ to: '/', label: 'Home', end: true }, ...LINKS].map((l, i) => (
                <li key={l.to}>
                  <NavLink ref={i === 0 ? firstLink : undefined} to={l.to} end={l.end} onClick={() => setOpen(false)}
                    className={({ isActive }) => `flex min-h-12 items-center justify-between rounded-xl px-4 text-base font-medium ${isActive ? 'bg-white/[0.07] text-ink' : 'text-mist hover:bg-white/[0.04]'}`}>
                    {l.label}<ArrowRight aria-hidden="true" className="h-4 w-4 opacity-50" />
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
  return (
    <footer className="relative border-t border-white/[0.07] bg-night-950">
      <div className="mx-auto grid w-full max-w-[1440px] gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr] lg:px-10">
        <div className="max-w-md">
          <Wordmark />
          <p className="mt-4 text-sm leading-relaxed text-mist">
            Fare estimates for Indian domestic routes from a machine-learning model trained on historical listed fares for journeys in January to March 2023.
            Not live prices, not a booking service, not affiliated with any airline.
          </p>
        </div>
        <nav aria-label="Footer">
          <p className="eyebrow !text-fog">Explore</p>
          <ul className="mt-3 space-y-1 text-sm">
            {[['/', 'Home'], ['/predict', 'Estimate a fare'], ['/methodology', 'Methodology and limits']].map(([to, label]) => (
              <li key={to}><Link to={to} className="inline-flex min-h-11 min-w-11 items-center text-mist transition-colors hover:text-ink">{label}</Link></li>
            ))}
          </ul>
        </nav>
        <div>
          <p className="eyebrow !text-fog">Model</p>
          <p className="mt-3 text-sm leading-relaxed text-mist">Random Forest blended with a route-level lookup. Typical error about 11 to 12% on flights it had not seen. Estimates can differ from real fares.</p>
        </div>
      </div>
      <div className="border-t border-white/[0.05]">
        <p className="mx-auto max-w-[1440px] px-4 py-5 font-mono text-xs text-fog sm:px-6 lg:px-10">AirfareIndex · Supervised learning project · Estimates are model outputs, not quotes.</p>
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
          initial={reduce ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={reduce ? undefined : { opacity: 0, y: -8 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}>
          {outlet}
        </m.main>
      </AnimatePresence>
      <SiteFooter />
    </div>
  )
}
