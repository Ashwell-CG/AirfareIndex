import { useMemo, useRef } from 'react'
import { Link } from 'react-router-dom'
import { m, useReducedMotion, useScroll, useTransform } from 'framer-motion'
import { Plane } from 'lucide-react'
import HeroBackdrop from '../components/hero/HeroBackdrop'
import Instrument from '../components/Instrument'
import RouteMap from '../components/RouteMap'
import { buttonClass } from '../components/ui/styles'
import { useResource } from '../hooks/useResource'
import { routePairs } from '../lib/airports'
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

const container = 'mx-auto w-full max-w-[1600px] px-4 sm:px-6 lg:px-10'

function Hero({ facts, insights, rows, pairs }) {
  const ref = useRef(null)
  const reduce = useReducedMotion()
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] })
  const copyY = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : 90])
  const item = (d) => ({ initial: reduce ? false : { opacity: 0, y: 26 }, animate: { opacity: 1, y: 0 }, transition: { duration: 1, delay: d, ease: [0.22, 1, 0.36, 1] } })
  const typical = insights?.evaluation?.unseen_flights?.median_ape_pct
  const strip = [
    ['Routes', facts?.routes], ['Airlines', facts?.airlines], ['Cities', facts?.cities],
    ['Typical error, unseen flights', typical != null ? `${typical}%` : null],
  ]
  return (
    <section ref={ref} aria-labelledby="hero-h" className="relative isolate flex min-h-[100svh] flex-col overflow-hidden">
      <HeroBackdrop heroRef={ref} pairs={pairs} />
      <m.div style={{ y: copyY }} className={`relative flex flex-1 flex-col pb-10 pt-[50svh] md:justify-center md:pb-20 md:pt-32 ${container}`}>
        <div className="max-w-[56rem]">
          <m.h1 {...item(0.15)} id="hero-h" className="display-xl max-w-[12ch] text-[clamp(3.5rem,7.6vw,8.25rem)] text-ink">
            What should this flight cost?
          </m.h1>
          <m.p {...item(0.35)} className="mt-6 max-w-[36rem] text-lg leading-relaxed text-mist sm:text-xl">
            AirfareIndex estimates Indian domestic airfares in rupees from {rows ? rows.toLocaleString('en-IN') : 'hundreds of thousands of'} historical listed fares, and tells you how far to trust each estimate.
          </m.p>
          <m.div {...item(0.5)} className="mt-9 flex flex-col gap-3 min-[420px]:flex-row">
            <Link to="/predict" className={buttonClass('primary', 'min-h-14 px-7 text-[1.0625rem]')}><Plane aria-hidden="true" className="h-5 w-5" />Estimate a fare</Link>
            <a href="#how" className={buttonClass('secondary', 'min-h-14 px-7 text-[1.0625rem]')}>How estimates are made</a>
          </m.div>
        </div>

        <m.dl {...item(0.7)} className="glass mt-12 grid max-w-[46rem] grid-cols-2 overflow-hidden rounded-[1.75rem] sm:grid-cols-4 md:mt-16">
          {strip.map(([label, value], i) => (
            <div key={label} className={`p-4 sm:p-5 ${i % 2 === 1 ? 'border-l border-white/[0.08]' : ''} ${i >= 2 ? 'border-t border-white/[0.08] sm:border-t-0' : ''} ${i === 2 ? 'sm:border-l' : ''}`}>
              <dt className="text-[0.8125rem] leading-snug text-mist">{label}</dt>
              <dd className="display-lg mt-1 text-[2.6rem] text-ink tabular">{value ?? <span className="text-fog">—</span>}</dd>
            </div>
          ))}
        </m.dl>
        <m.p {...item(0.8)} className="mt-4 text-sm text-fog">Model estimates from journeys in January to March 2023. Not live prices.</m.p>
      </m.div>
    </section>
  )
}

function HowItWorks({ rows }) {
  const ref = useRef(null)
  const reduce = useReducedMotion()
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 75%', 'end 55%'] })
  const draw = useTransform(scrollYProgress, [0, 1], [0.03, 1])
  const steps = [
    { title: 'Choose an itinerary', text: 'Route, airline, cabin, stops, duration and travel date. Only combinations that exist in the data are offered.' },
    { title: 'Check it against coverage', text: 'The service validates every input against the airlines, routes, cabins and the 1 to 50 day booking window the model was trained on.' },
    { title: 'Run the model', text: `A Random Forest blended with a route-level median lookup${rows ? `, trained on ${rows.toLocaleString('en-IN')} listed fares,` : ''} returns a fare in rupees.` },
    { title: 'Read it with context', text: 'Each estimate comes with its typical error, how it shifts with booking time, the main factors and the limits.' },
  ]
  return (
    <section id="how" ref={ref} aria-labelledby="how-h" className="relative border-t border-white/[0.06] py-24 lg:py-36">
      <div className={container}>
        <div className="grid gap-14 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.3fr)] lg:gap-24">
          <div className="lg:sticky lg:top-32 lg:self-start">
            <h2 id="how-h" className="display-lg text-[clamp(2.75rem,5.5vw,5rem)] text-ink">From itinerary to estimate in four steps.</h2>
            <p className="mt-5 max-w-md text-lg leading-relaxed text-mist">The same path every request takes, from the form to the model and back.</p>
          </div>
          <div className="relative">
            <div aria-hidden="true" className="absolute bottom-3 left-[1.375rem] top-3 w-px bg-white/10">
              <m.div className="h-full w-px origin-top bg-cyan" style={{ scaleY: reduce ? 1 : draw }} />
            </div>
            <ol className="relative space-y-12">
              {steps.map((s, i) => (
                <li key={s.title} className="relative grid grid-cols-[2.75rem_minmax(0,1fr)] gap-6">
                  <span className="display-md grid h-11 w-11 place-items-center rounded-full border border-cyan/40 bg-night-950 text-xl text-cyan">{i + 1}</span>
                  <div className="pt-1.5">
                    <h3 className="text-xl font-semibold text-ink">{s.title}</h3>
                    <p className="mt-2 max-w-xl leading-relaxed text-mist">{s.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </section>
  )
}

function Network({ options }) {
  return (
    <section id="network" aria-labelledby="net-h" className="relative overflow-hidden border-t border-white/[0.06] bg-night-900/50 py-24 lg:py-36">
      <div className="starfield pointer-events-none absolute inset-0 opacity-40" aria-hidden="true" />
      <div className={`relative ${container}`}>
        <div className="max-w-3xl">
          <h2 id="net-h" className="display-lg text-[clamp(2.75rem,5.5vw,5rem)] text-ink">The network the model knows.</h2>
          <p className="mt-5 text-lg leading-relaxed text-mist">Seven cities and every direction between them. Outside this network, the model has no fares to learn from, so it does not estimate.</p>
        </div>
        <div className="mt-14">
          {options ? <RouteMap options={options} /> : <div className="h-[28rem] animate-pulse rounded-[1.75rem] bg-white/[0.03]" />}
        </div>
      </div>
    </section>
  )
}

function Transparency({ insights }) {
  const u = insights?.evaluation?.unseen_flights
  return (
    <section id="transparency" aria-labelledby="tr-h" className="border-t border-white/[0.06] py-24 lg:py-36">
      <div className={`grid items-center gap-14 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-24 ${container}`}>
        <div>
          <h2 id="tr-h" className="display-lg text-[clamp(2.75rem,5.5vw,5rem)] text-ink">Every estimate comes with its error bar.</h2>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-mist">
            Beside each fare you see the error the model made on flights it had not seen in training. That figure describes the model as a whole. It is not a confidence score for one prediction.
          </p>
          <dl className="mt-10 grid gap-x-8 gap-y-6 border-t border-white/[0.08] pt-8 sm:grid-cols-3">
            {[
              ['Median error', u ? `${u.median_ape_pct}%` : '—', u ? `±${u.median_ape_sd_pct} points over ${u.draws} test draws` : ''],
              ['Average error', u ? formatInr(u.mae_inr) : '—', 'On flights not seen in training'],
              ['Business, average', u ? formatInr(u.by_class_mae_inr.Business) : '—', 'Larger fares, larger errors'],
            ].map(([k, v, note]) => (
              <div key={k}>
                <dt className="text-sm text-mist">{k}</dt>
                <dd className="display-lg mt-1 text-[2.75rem] text-ink tabular">{v}</dd>
                <dd className="mt-1 text-sm text-fog">{note}</dd>
              </div>
            ))}
          </dl>
          <Link to="/methodology" className="mt-8 inline-flex min-h-11 items-center font-semibold text-cyan underline decoration-cyan/40 underline-offset-4 transition-colors hover:text-ink hover:decoration-ink">
            Read the methodology and limits
          </Link>
        </div>
        <div className="glass rounded-[2rem] p-8 sm:p-12">
          {u ? <Instrument value={u.median_ape_pct} label="Typical error on unseen flights" sub="Median absolute percentage error" /> : <div className="h-72 animate-pulse rounded-2xl bg-white/[0.03]" />}
        </div>
      </div>
    </section>
  )
}

function Coverage({ options }) {
  if (!options) return null
  const airlines = Object.entries(options.airline_class_routes).sort(([a], [b]) => a.localeCompare(b))
  return (
    <section id="coverage" aria-labelledby="cov-h" className="border-t border-white/[0.06] py-24 lg:py-36">
      <div className={container}>
        <div className="grid gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.4fr)] lg:gap-24">
          <div>
            <h2 id="cov-h" className="display-lg text-[clamp(2.75rem,5.5vw,5rem)] text-ink">Airlines and cabins on record.</h2>
            <p className="mt-5 max-w-md text-lg leading-relaxed text-mist">Each number is how many routes an airline sells in that cabin in the data. First class is not supported.</p>
          </div>
          <div className="panel overflow-hidden">
            <table className="w-full table-fixed text-left text-sm">
              <caption className="sr-only">Routes per airline and travel class in the training data</caption>
              <thead>
                <tr className="border-b border-white/[0.08] text-[0.8125rem] text-mist">
                  <th scope="col" className="w-[38%] px-4 py-4 font-medium sm:px-6">Airline</th>
                  {CLASS_ORDER.map((c) => <th key={c} scope="col" className="px-2 py-4 text-center font-medium sm:px-4"><span className="sm:hidden">{c === 'Premium Economy' ? 'Premium' : c}</span><span className="hidden sm:inline">{c}</span></th>)}
                </tr>
              </thead>
              <tbody>
                {airlines.map(([a, classes]) => (
                  <tr key={a} className="border-b border-white/[0.05] transition-colors last:border-0 hover:bg-white/[0.025]">
                    <th scope="row" className="truncate px-4 py-3.5 font-medium text-ink sm:px-6">{a}</th>
                    {CLASS_ORDER.map((c) => (
                      <td key={c} className="px-2 py-3.5 text-center sm:px-4">
                        {classes[c]
                          ? <span className="display-md text-xl text-cyan tabular">{classes[c].routes.length}</span>
                          : <span className="text-fog" aria-label="not offered">–</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  )
}

function FinalCta() {
  return (
    <section aria-labelledby="cta-h" className="relative overflow-hidden">
      <div className="sky absolute inset-0" aria-hidden="true" />
      <div className="starfield absolute inset-0 opacity-60" aria-hidden="true" />
      <div className={`relative flex flex-col items-start gap-8 py-28 md:flex-row md:items-end md:justify-between lg:py-36 ${container}`}>
        <h2 id="cta-h" className="display-xl max-w-3xl text-[clamp(3rem,7vw,6.5rem)] text-ink">Pick a route. See the estimate.</h2>
        <Link to="/predict" className={buttonClass('primary', 'min-h-14 shrink-0 px-8 text-lg')}><Plane aria-hidden="true" className="h-5 w-5" />Open the estimator</Link>
      </div>
    </section>
  )
}

export default function LandingPage() {
  const options = useResource('options', loadOptions)
  const insights = useResource('insights', loadInsights)
  const info = useResource('info', loadInfo)
  const pairs = useMemo(() => routePairs(options.data), [options.data])
  const rows = info.data?.training?.rows
  return (
    <>
      <Hero facts={coverageFacts(options.data)} insights={insights.data} rows={rows} pairs={pairs} />
      <HowItWorks rows={rows} />
      <Network options={options.data} />
      <Transparency insights={insights.data} />
      <Coverage options={options.data} />
      <FinalCta />
    </>
  )
}
