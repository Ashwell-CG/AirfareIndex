import { useRef } from 'react'
import { Link } from 'react-router-dom'
import { m, useReducedMotion, useScroll, useTransform } from 'framer-motion'
import { ArrowDown, ArrowRight, BarChart3, CalendarClock, Gauge, Layers, Route, ShieldCheck, Sparkles } from 'lucide-react'
import HeroBackdrop from '../components/hero/HeroBackdrop'
import Instrument from '../components/Instrument'
import { Reveal, SectionHeading } from '../components/motion/Reveal'
import { buttonClass } from '../components/ui/styles'
import { useResource } from '../hooks/useResource'
import { IATA } from '../lib/airports'
import { formatInr } from '../lib/format'
import { CLASS_ORDER } from '../lib/options'
import { getInsights, getModelInfo, getOptions } from '../services/api'

const loadOptions = () => getOptions()
const loadInsights = () => getInsights()
const loadInfo = () => getModelInfo()

function coverageFacts(options) {
  if (!options) return null
  const routes = new Set()
  for (const classes of Object.values(options.airline_class_routes)) for (const v of Object.values(classes)) v.routes.forEach((r) => routes.add(r))
  return { routes: routes.size, airlines: Object.keys(options.airline_class_routes).length, cities: options.cities.length }
}

function Hero({ facts, insights }) {
  const ref = useRef(null)
  const reduce = useReducedMotion()
  const item = (d) => ({ initial: reduce ? false : { opacity: 0, y: 22 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.9, delay: d, ease: [0.22, 1, 0.36, 1] } })
  const typical = insights?.evaluation?.unseen_flights?.median_ape_pct
  const strip = [
    ['Routes', facts?.routes], ['Airlines', facts?.airlines], ['Cities', facts?.cities],
    ['Typical error, unseen flights', typical != null ? `${typical}%` : null],
  ]
  return (
    <section ref={ref} aria-labelledby="hero-h" className="relative isolate flex min-h-[100svh] flex-col overflow-hidden">
      <HeroBackdrop heroRef={ref} />
      <div className="relative mx-auto flex w-full max-w-[1440px] flex-1 flex-col px-4 pb-10 pt-[46svh] sm:px-6 md:justify-center md:pb-16 md:pt-28 lg:px-10">
        <div className="max-w-[44rem]">
          <m.p {...item(0.1)} className="eyebrow">Airfare intelligence · Indian domestic routes</m.p>
          <m.h1 {...item(0.2)} id="hero-h" className="mt-5 font-display text-[clamp(3rem,8.4vw,7rem)] leading-[0.94] tracking-[-0.02em] text-ink">
            Understand airfares.<br /><span className="bg-[linear-gradient(100deg,#eaf0f9_10%,#8fd8ff_55%,#f2b66d)] bg-clip-text pr-2 italic text-transparent">Travel smarter.</span>
          </m.h1>
          <m.p {...item(0.35)} className="mt-6 max-w-[34rem] text-lg leading-relaxed text-mist sm:text-xl">
            Explore historical airfare patterns and estimate flight prices with intelligent machine learning, trained on listed fares across India’s busiest domestic routes.
          </m.p>
          <m.div {...item(0.5)} className="mt-8 flex flex-col gap-3 min-[420px]:flex-row">
            <Link to="/predict" className={buttonClass('primary', 'min-h-13 px-6 text-[1.0625rem]')}>Estimate a fare<ArrowRight aria-hidden="true" className="h-5 w-5" /></Link>
            <a href="#how" className={buttonClass('secondary', 'min-h-13 px-6 text-[1.0625rem]')}>How it works</a>
          </m.div>
          <m.p {...item(0.6)} className="mt-5 font-mono text-xs tracking-wide text-fog">Model estimates, not live prices · Training data: journeys Jan to Mar 2023</m.p>
        </div>

        <m.dl {...item(0.75)} className="mt-10 grid max-w-[44rem] grid-cols-2 overflow-hidden rounded-2xl border border-white/10 bg-night-950/45 backdrop-blur-md sm:grid-cols-4 md:mt-14">
          {strip.map(([label, value], i) => (
            <div key={label} className={`p-4 sm:p-5 ${i % 2 === 1 ? 'border-l border-white/[0.07]' : ''} ${i >= 2 ? 'border-t border-white/[0.07] sm:border-t-0' : ''} ${i === 2 ? 'sm:border-l' : ''}`}>
              <dt className="font-mono text-xs uppercase leading-snug tracking-[0.12em] text-fog">{label}</dt>
              <dd className="mt-1.5 font-display text-3xl leading-none text-ink tabular sm:text-4xl">{value ?? <span className="text-fog">—</span>}</dd>
            </div>
          ))}
        </m.dl>
      </div>
      <a href="#product" className="relative mx-auto mb-6 hidden min-h-11 items-center gap-2 rounded-full px-4 font-mono text-xs uppercase tracking-[0.16em] text-fog transition-colors hover:text-ink md:inline-flex">
        Scroll<ArrowDown aria-hidden="true" className="h-4 w-4 motion-safe:animate-bounce" />
      </a>
    </section>
  )
}

const FEATURES = [
  { icon: Sparkles, n: '01', title: 'Estimate a fare', text: 'Pick a supported itinerary and get a machine-learning estimate in Indian rupees, in about a second.' },
  { icon: CalendarClock, n: '02', title: 'See the effect of booking ahead', text: 'Each estimate comes with the same itinerary re-run from 1 to 50 days before departure, so you can see how the model’s estimate shifts.' },
  { icon: BarChart3, n: '03', title: 'Understand the model', text: 'Which factors the model leans on, how accurate it was in testing, and where it should not be trusted.' },
]

function Product() {
  return (
    <section id="product" aria-labelledby="product-h" className="relative mx-auto w-full max-w-[1440px] px-4 py-24 sm:px-6 lg:px-10 lg:py-32">
      <div className="grid gap-12 lg:grid-cols-[1fr_1.1fr] lg:gap-20">
        <SectionHeading id="product-h" eyebrow="What AirfareIndex does" title={<>A fare estimate you can <em className="text-cyan">reason about</em>.</>}>
          Airfares move with class, airline, route, stops and timing. AirfareIndex learns those patterns from historical listed fares and turns them into an estimate, with the evidence and the caveats beside it.
        </SectionHeading>
        <ol className="grid gap-4">
          {FEATURES.map((f, i) => (
            <Reveal as="li" key={f.n} delay={0.08 * i} className="panel group flex gap-5 p-5 transition-colors hover:border-white/15 sm:p-6">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-white/10 bg-night-800 text-cyan transition-transform duration-500 group-hover:-translate-y-0.5">
                <f.icon aria-hidden="true" className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="font-mono text-xs text-fog">{f.n}</p>
                <h3 className="mt-1 text-lg font-semibold text-ink">{f.title}</h3>
                <p className="mt-1.5 leading-relaxed text-mist">{f.text}</p>
              </div>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  )
}

function HowItWorks({ trainingRows }) {
  const ref = useRef(null)
  const reduce = useReducedMotion()
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 75%', 'end 60%'] })
  const draw = useTransform(scrollYProgress, [0, 1], [0.04, 1])
  const steps = [
    { icon: Route, title: 'Choose an itinerary', text: 'Route, airline, class, stops, duration and how many days ahead you are booking. Only combinations seen in the data are offered.' },
    { icon: ShieldCheck, title: 'Checked against coverage', text: 'The service validates every input against the airlines, routes, classes and the 1 to 50 day range the model was trained on.' },
    { icon: Layers, title: 'The model estimates', text: `A Random Forest blended with a route-level median lookup${trainingRows ? `, trained on ${trainingRows.toLocaleString('en-IN')} listed fares,` : ''} returns a fare in INR.` },
    { icon: Gauge, title: 'Read it with context', text: 'The estimate arrives with its typical error, how it shifts with lead time, the main factors and the limits.' },
  ]
  return (
    <section id="how" ref={ref} aria-labelledby="how-h" className="relative overflow-hidden border-y border-white/[0.06] bg-night-900/60 py-24 lg:py-32">
      <div className="grid-lines pointer-events-none absolute inset-0" aria-hidden="true" />
      <div className="relative mx-auto w-full max-w-[1440px] px-4 sm:px-6 lg:px-10">
        <SectionHeading id="how-h" eyebrow="How it works" title="From itinerary to estimate, in four waypoints." />
        <div className="relative mt-14">
          {/* flight path: horizontal on large screens, vertical on small */}
          <svg className="pointer-events-none absolute left-0 right-0 top-6 hidden h-6 w-full lg:block" viewBox="0 0 1000 24" preserveAspectRatio="none" aria-hidden="true">
            <path d="M20 12 H980" stroke="rgb(255 255 255 / 0.1)" strokeWidth="2" strokeDasharray="2 8" fill="none" />
            <m.path d="M20 12 H980" stroke="url(#how-g)" strokeWidth="2.5" fill="none" style={{ pathLength: reduce ? 1 : draw }} />
            <defs><linearGradient id="how-g"><stop offset="0" stopColor="#4c8dff" /><stop offset="1" stopColor="#3fd0ee" /></linearGradient></defs>
          </svg>
          <div aria-hidden="true" className="absolute bottom-6 left-6 top-6 w-px bg-white/10 lg:hidden">
            <m.div className="h-full w-px origin-top bg-gradient-to-b from-azure to-cyan" style={{ scaleY: reduce ? 1 : draw }} />
          </div>
          <ol className="relative grid gap-8 lg:grid-cols-4 lg:gap-6">
            {steps.map((s, i) => (
              <Reveal as="li" key={s.title} delay={0.1 * i} className="relative pl-16 lg:pl-0">
                <span className="absolute left-0 top-0 grid h-12 w-12 place-items-center rounded-full border border-cyan/40 bg-night-900 text-cyan shadow-[0_0_0_6px_rgb(4_9_20)] lg:relative">
                  <s.icon aria-hidden="true" className="h-5 w-5" />
                </span>
                <p className="font-mono text-xs text-fog lg:mt-6">WAYPOINT 0{i + 1}</p>
                <h3 className="mt-1.5 text-xl font-semibold text-ink">{s.title}</h3>
                <p className="mt-2 leading-relaxed text-mist">{s.text}</p>
              </Reveal>
            ))}
          </ol>
        </div>
      </div>
    </section>
  )
}

function Transparency({ insights }) {
  const u = insights?.evaluation?.unseen_flights
  return (
    <section id="transparency" aria-labelledby="tr-h" className="mx-auto w-full max-w-[1440px] px-4 py-24 sm:px-6 lg:px-10 lg:py-32">
      <div className="grid items-center gap-14 lg:grid-cols-[1.05fr_1fr] lg:gap-20">
        <div>
          <SectionHeading id="tr-h" eyebrow="Model transparency" title={<>A number with its <em className="text-horizon">uncertainty</em> attached.</>}>
            Every estimate is shown beside the error the model made on flights it had not seen in training. That figure describes the model as a whole. It is not a confidence score for any single prediction.
          </SectionHeading>
          <Reveal delay={0.1}>
            <dl className="mt-8 grid gap-px overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.06] sm:grid-cols-3">
              {[
                ['Median error', u ? `${u.median_ape_pct}%` : '—', u ? `±${u.median_ape_sd_pct} across ${u.draws} draws` : ''],
                ['Average error', u ? formatInr(u.mae_inr) : '—', 'Flights not seen in training'],
                ['Business, average', u ? formatInr(u.by_class_mae_inr.Business) : '—', 'Larger fares, larger errors'],
              ].map(([k, v, note]) => (
                <div key={k} className="bg-night-900 p-5">
                  <dt className="font-mono text-xs uppercase tracking-[0.12em] text-fog">{k}</dt>
                  <dd className="mt-2 font-display text-3xl text-ink tabular">{v}</dd>
                  <dd className="mt-1 text-sm text-mist">{note}</dd>
                </div>
              ))}
            </dl>
            <Link to="/methodology" className="mt-6 inline-flex min-h-11 items-center gap-2 font-semibold text-cyan transition-colors hover:text-ink">
              Read the methodology and limits<ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
          </Reveal>
        </div>
        <Reveal delay={0.15} className="panel p-8 [perspective:1200px] sm:p-10">
          {u ? <Instrument value={u.median_ape_pct} label="Typical error · unseen flights" sub="Median absolute percentage error" /> : <div className="h-72 animate-pulse rounded-2xl bg-white/[0.03]" />}
        </Reveal>
      </div>
    </section>
  )
}

function Coverage({ options }) {
  if (!options) return null
  const airlines = Object.entries(options.airline_class_routes).sort(([a], [b]) => a.localeCompare(b))
  return (
    <section id="coverage" aria-labelledby="cov-h" className="border-t border-white/[0.06] bg-night-900/40 py-24 lg:py-32">
      <div className="mx-auto w-full max-w-[1440px] px-4 sm:px-6 lg:px-10">
        <SectionHeading id="cov-h" eyebrow="Coverage" title="Where the model has seen fares.">
          Seven cities, every direction between them. Each cell shows how many routes an airline sells in that class in the data. First class is not supported.
        </SectionHeading>
        <Reveal className="mt-10 flex flex-wrap gap-2">
          {options.cities.map((c) => (
            <span key={c} className="inline-flex items-baseline gap-2 rounded-full border border-white/10 bg-night-850 px-4 py-2 text-sm text-mist">
              <span className="font-mono text-xs text-cyan">{IATA[c]}</span>{c}
            </span>
          ))}
        </Reveal>
        <Reveal delay={0.1} className="panel mt-8 overflow-hidden p-0">
          <table className="w-full table-fixed text-left text-sm">
            <caption className="sr-only">Routes per airline and travel class in the training data</caption>
            <thead>
              <tr className="border-b border-white/[0.07] font-mono text-xs uppercase tracking-[0.1em] text-fog">
                <th scope="col" className="w-[38%] px-4 py-3 font-normal sm:px-6">Airline</th>
                {CLASS_ORDER.map((c) => <th key={c} scope="col" className="px-2 py-3 text-center font-normal sm:px-4"><span className="sm:hidden">{c === 'Premium Economy' ? 'Prem.' : c === 'Economy' ? 'Econ.' : 'Bus.'}</span><span className="hidden sm:inline">{c}</span></th>)}
              </tr>
            </thead>
            <tbody>
              {airlines.map(([a, classes]) => (
                <tr key={a} className="border-b border-white/[0.05] last:border-0">
                  <th scope="row" className="truncate px-4 py-3 font-medium text-ink sm:px-6">{a}</th>
                  {CLASS_ORDER.map((c) => (
                    <td key={c} className="px-2 py-3 text-center sm:px-4">
                      {classes[c]
                        ? <span className="inline-flex min-w-9 items-center justify-center rounded-md bg-cyan/10 px-2 py-0.5 font-mono text-xs text-cyan">{classes[c].routes.length}</span>
                        : <span className="text-fog" aria-label="not offered">·</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Reveal>
      </div>
    </section>
  )
}

function FinalCta() {
  return (
    <section aria-labelledby="cta-h" className="relative overflow-hidden">
      <div className="sky absolute inset-0 opacity-80" aria-hidden="true" />
      <div className="relative mx-auto flex w-full max-w-[1440px] flex-col items-start gap-8 px-4 py-24 sm:px-6 md:flex-row md:items-end md:justify-between lg:px-10 lg:py-28">
        <Reveal>
          <p className="eyebrow">Ready when you are</p>
          <h2 id="cta-h" className="mt-3 max-w-2xl font-display text-[clamp(2.2rem,5vw,4.2rem)] leading-[1.02] text-ink">Check a route in under a minute.</h2>
        </Reveal>
        <Reveal delay={0.1}>
          <Link to="/predict" className={buttonClass('primary', 'min-h-14 px-7 text-lg')}>Open the estimator<ArrowRight aria-hidden="true" className="h-5 w-5" /></Link>
        </Reveal>
      </div>
    </section>
  )
}

export default function LandingPage() {
  const options = useResource('options', loadOptions)
  const insights = useResource('insights', loadInsights)
  const info = useResource('info', loadInfo)
  return (
    <>
      <Hero facts={coverageFacts(options.data)} insights={insights.data} />
      <Product />
      <HowItWorks trainingRows={info.data?.training?.rows} />
      <Transparency insights={insights.data} />
      <Coverage options={options.data} />
      <FinalCta />
    </>
  )
}
