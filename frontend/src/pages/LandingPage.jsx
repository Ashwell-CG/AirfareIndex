import { useRef } from 'react'
import { Link } from 'react-router-dom'
import { m, useReducedMotion } from 'framer-motion'
import HeroBackdrop from '../components/hero/HeroBackdrop'
import Instrument from '../components/Instrument'
import { SectionHeading } from '../components/motion/Reveal'
import { buttonClass } from '../components/ui/styles'
import { useResource } from '../hooks/useResource'
import { IATA } from '../lib/airports'
import { formatInr } from '../lib/format'
import { CLASS_ORDER } from '../lib/options'
import { getInsights, getModelInfo, getOptions } from '../services/api'

const loadOptions = () => getOptions()
const loadInsights = () => getInsights()
const loadInfo = () => getModelInfo()
const container = 'mx-auto w-full max-w-[1440px] px-4 sm:px-6 lg:px-10'

function coverageFacts(options) {
  if (!options) return null
  const routes = new Set()
  for (const classes of Object.values(options.airline_class_routes)) for (const v of Object.values(classes)) v.routes.forEach((r) => routes.add(r))
  return { routes: routes.size, airlines: Object.keys(options.airline_class_routes).length, cities: options.cities.length }
}

// The page's only entrance: the hero copy fades and rises 8px, 60ms apart.
function Hero({ facts, insights, rows }) {
  const ref = useRef(null)
  const reduce = useReducedMotion()
  const item = (i) => ({ initial: reduce ? false : { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.4, delay: 0.1 + i * 0.06, ease: [0.22, 1, 0.36, 1] } })
  const typical = insights?.evaluation?.unseen_flights?.median_ape_pct
  const strip = [
    ['Routes', facts?.routes], ['Airlines', facts?.airlines], ['Cities', facts?.cities],
    ['Typical error, unseen flights', typical != null ? `${typical}%` : null],
  ]
  return (
    <section ref={ref} aria-labelledby="hero-h" className="relative isolate flex min-h-[100svh] flex-col overflow-hidden">
      <HeroBackdrop heroRef={ref} />
      <div className={`relative flex flex-1 flex-col pb-12 pt-[46svh] md:justify-center md:pb-16 md:pt-32 ${container}`}>
        <div className="max-w-[44rem]">
          <m.h1 {...item(0)} id="hero-h" className="font-display text-[clamp(2.75rem,6.2vw,5.5rem)] leading-[1.02] tracking-[-0.03em] text-ink">
            Fare estimates for Indian domestic flights
          </m.h1>
          <m.p {...item(1)} className="mt-6 max-w-[36rem] text-lg leading-[1.6] text-mist sm:text-xl">
            Choose a route, airline and cabin. A model trained on {rows ? rows.toLocaleString('en-IN') : 'historical'} listed fares returns a price in rupees, shown next to the error it made on flights it had not seen.
          </m.p>
          <m.div {...item(2)} className="mt-8 flex flex-col gap-3 min-[420px]:flex-row">
            <Link to="/predict" className={buttonClass('primary', 'px-6')}>Estimate a fare</Link>
            <a href="#how" className={buttonClass('secondary', 'px-6')}>How it works</a>
          </m.div>
          <m.p {...item(3)} className="mt-4 text-[13px] leading-5 text-fog">Model estimates, not live prices. Training data covers journeys from January to March 2023.</m.p>
        </div>

        <m.dl {...item(4)} className="mt-12 grid max-w-[44rem] grid-cols-2 overflow-hidden rounded-2xl border border-ink/10 bg-night-950/70 sm:grid-cols-4 md:mt-16">
          {strip.map(([label, value], i) => (
            <div key={label} className={`p-4 sm:p-5 ${i % 2 === 1 ? 'border-l border-ink/[0.08]' : ''} ${i >= 2 ? 'border-t border-ink/[0.08] sm:border-t-0' : ''} ${i === 2 ? 'sm:border-l' : ''}`}>
              <dt className="text-[13px] leading-5 text-mist">{label}</dt>
              <dd className="mt-2 font-display text-4xl leading-none text-ink tabular">{value ?? <span className="text-fog">—</span>}</dd>
            </div>
          ))}
        </m.dl>
      </div>
    </section>
  )
}

const FEATURES = [
  { title: 'Estimate a fare', text: 'Pick a supported itinerary and get a machine learning estimate in Indian rupees, in about a second.' },
  { title: 'See the effect of booking ahead', text: 'Each estimate comes with the same itinerary re-run from 1 to 50 days before departure, so you can see how the model’s estimate shifts.' },
  { title: 'Understand the model', text: 'Which factors the model leans on, how accurate it was in testing, and where it should not be trusted.' },
]

function Product() {
  return (
    <section id="product" aria-labelledby="product-h" className={`py-24 lg:py-32 ${container}`}>
      <SectionHeading id="product-h" title="A fare estimate with the evidence beside it">
        Airfares move with class, airline, route, stops and timing. AirfareIndex learns those patterns from historical listed fares and turns them into an estimate, with the evidence and the caveats beside it.
      </SectionHeading>
      <ul className="mt-12 grid gap-8 md:grid-cols-3 md:gap-10">
        {FEATURES.map((f) => (
          <li key={f.title} className="border-t border-ink/10 pt-6">
            <h3 className="text-lg font-medium text-ink">{f.title}</h3>
            <p className="mt-2 leading-relaxed text-mist">{f.text}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}

function HowItWorks({ trainingRows }) {
  const steps = [
    { title: 'Choose an itinerary', text: 'Route, airline, class, stops, duration and how many days ahead you are booking. Only combinations seen in the data are offered.' },
    { title: 'Checked against coverage', text: 'The service validates every input against the airlines, routes, classes and the 1 to 50 day range the model was trained on.' },
    { title: 'The model estimates', text: `A Random Forest blended with a route-level median lookup${trainingRows ? `, trained on ${trainingRows.toLocaleString('en-IN')} listed fares,` : ''} returns a fare in INR.` },
    { title: 'Read it with context', text: 'The estimate arrives with its typical error, how it shifts with lead time, the main factors and the limits.' },
  ]
  return (
    <section id="how" aria-labelledby="how-h" className="border-y border-ink/[0.06] bg-night-900 py-24 lg:py-32">
      <div className={container}>
        <SectionHeading id="how-h" title="From itinerary to estimate in four steps" />
        <ol className="relative mt-12 grid gap-8 lg:grid-cols-4 lg:gap-6">
          <span aria-hidden="true" className="absolute left-5 top-5 hidden h-px w-[calc(100%-2.5rem)] bg-ink/10 lg:block" />
          {steps.map((s, i) => (
            <li key={s.title} className="relative grid grid-cols-[2.5rem_minmax(0,1fr)] gap-4 lg:block">
              <span className="relative grid h-10 w-10 place-items-center rounded-full border border-ink/15 bg-night-900 font-mono text-sm text-ink">{i + 1}</span>
              <div className="lg:mt-6">
                <h3 className="text-lg font-medium text-ink">{s.title}</h3>
                <p className="mt-2 leading-relaxed text-mist">{s.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

function Transparency({ insights }) {
  const u = insights?.evaluation?.unseen_flights
  return (
    <section id="transparency" aria-labelledby="tr-h" className={`py-24 lg:py-32 ${container}`}>
      <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_1fr] lg:gap-20">
        <div>
          <SectionHeading id="tr-h" title="Every estimate shows the model’s typical error">
            Every estimate is shown beside the error the model made on flights it had not seen in training. That figure describes the model as a whole. It is not a confidence score for any single prediction.
          </SectionHeading>
          <dl className="mt-8 grid overflow-hidden rounded-2xl border border-ink/[0.08] sm:grid-cols-3">
            {[
              ['Median error', u ? `${u.median_ape_pct}%` : '—', u ? `±${u.median_ape_sd_pct} across ${u.draws} draws` : ''],
              ['Average error', u ? formatInr(u.mae_inr) : '—', 'Flights not seen in training'],
              ['Business, average', u ? formatInr(u.by_class_mae_inr.Business) : '—', 'Larger fares, larger errors'],
            ].map(([k, v, note], i) => (
              <div key={k} className={`bg-night-900 p-5 ${i > 0 ? 'border-t border-ink/[0.08] sm:border-l sm:border-t-0' : ''}`}>
                <dt className="text-[13px] leading-5 text-mist">{k}</dt>
                <dd className="mt-2 font-display text-3xl leading-none text-ink tabular">{v}</dd>
                <dd className="mt-2 text-sm text-fog">{note}</dd>
              </div>
            ))}
          </dl>
          <Link to="/methodology" className="mt-6 inline-flex min-h-11 items-center font-medium text-ink underline decoration-ink/30 underline-offset-4 transition-colors hover:decoration-ink">
            Read the methodology and limits
          </Link>
        </div>
        <div className="panel p-8 sm:p-10">
          {u ? <Instrument value={u.median_ape_pct} label="Typical error on unseen flights" sub="Median absolute percentage error" /> : <div className="h-72 rounded-2xl bg-night-850" />}
        </div>
      </div>
    </section>
  )
}

function Coverage({ options }) {
  if (!options) return null
  const airlines = Object.entries(options.airline_class_routes).sort(([a], [b]) => a.localeCompare(b))
  return (
    <section id="coverage" aria-labelledby="cov-h" className="border-t border-ink/[0.06] bg-night-900 py-24 lg:py-32">
      <div className={container}>
        <SectionHeading id="cov-h" title="Where the model has seen fares">
          Seven cities, every direction between them. Each cell shows how many routes an airline sells in that class in the data. First class is not supported.
        </SectionHeading>
        <ul className="mt-10 flex flex-wrap gap-2">
          {options.cities.map((c) => (
            <li key={c} className="inline-flex items-baseline gap-2 rounded-lg border border-ink/10 bg-night-850 px-4 py-2 text-sm text-mist">
              <span className="font-mono text-xs text-ink">{IATA[c]}</span>{c}
            </li>
          ))}
        </ul>
        <div className="panel mt-8 overflow-hidden bg-night-950">
          <table className="w-full table-fixed text-left text-sm">
            <caption className="sr-only">Routes per airline and travel class in the training data</caption>
            <thead>
              <tr className="border-b border-ink/[0.08] text-[13px] text-mist">
                <th scope="col" className="w-[38%] px-4 py-3 font-medium sm:px-6">Airline</th>
                {CLASS_ORDER.map((c) => <th key={c} scope="col" className="px-2 py-3 text-right font-medium sm:px-6"><span className="sm:hidden">{c === 'Premium Economy' ? 'Premium' : c === 'Economy' ? 'Econ.' : 'Bus.'}</span><span className="hidden sm:inline">{c}</span></th>)}
              </tr>
            </thead>
            <tbody>
              {airlines.map(([a, classes]) => (
                <tr key={a} className="border-b border-ink/[0.05] last:border-0">
                  <th scope="row" className="truncate px-4 py-3 font-medium text-ink sm:px-6">{a}</th>
                  {CLASS_ORDER.map((c) => (
                    <td key={c} className="px-2 py-3 text-right font-mono text-[13px] tabular sm:px-6">
                      {classes[c] ? <span className="text-ink">{classes[c].routes.length}</span> : <span className="text-fog" aria-label="not offered">–</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}

function FinalCta() {
  return (
    <section aria-labelledby="cta-h" className="border-t border-ink/[0.06]">
      <div className={`flex flex-col items-start gap-8 py-24 md:flex-row md:items-end md:justify-between lg:py-28 ${container}`}>
        <h2 id="cta-h" className="max-w-2xl font-display text-[clamp(2.25rem,4.5vw,3.75rem)] leading-[1.04] tracking-[-0.02em] text-ink">Check a route in under a minute</h2>
        <Link to="/predict" className={buttonClass('primary', 'px-6')}>Open the estimator</Link>
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
      <Hero facts={coverageFacts(options.data)} insights={insights.data} rows={info.data?.training?.rows} />
      <Product />
      <HowItWorks trainingRows={info.data?.training?.rows} />
      <Transparency insights={insights.data} />
      <Coverage options={options.data} />
      <FinalCta />
    </>
  )
}
