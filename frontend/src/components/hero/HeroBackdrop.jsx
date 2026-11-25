import { Component, Suspense, lazy, useEffect, useState } from 'react'
import { useReducedMotion } from 'framer-motion'
import AircraftPoster from './AircraftPoster'
import { hasWebGL, isLowPower } from '../../three/capabilities'

const HeroScene = lazy(() => import('../../three/HeroScene'))

class SceneBoundary extends Component {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(err) { this.props.onError?.(err) }
  render() { return this.state.failed ? null : this.props.children }
}

// Sky + 3D aircraft behind the hero copy. Decorative: hidden from assistive tech (the copy carries the meaning).
export default function HeroBackdrop({ heroRef }) {
  const reduced = useReducedMotion()
  const [webgl] = useState(() => hasWebGL())
  const [lowPower] = useState(() => isLowPower())
  const [finePointer] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: fine)').matches)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const [inView, setInView] = useState(true)
  const [tabVisible, setTabVisible] = useState(() => typeof document === 'undefined' || document.visibilityState !== 'hidden')

  // Pause rendering when the hero scrolls out of view or the tab is hidden (battery and heat on mobile)
  useEffect(() => {
    const el = heroRef.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.02 })
    io.observe(el)
    const onVis = () => setTabVisible(document.visibilityState !== 'hidden')
    document.addEventListener('visibilitychange', onVis)
    return () => { io.disconnect(); document.removeEventListener('visibilitychange', onVis) }
  }, [heroRef])

  const show3d = webgl && !failed
  return (
    <div aria-hidden="true" className="sky pointer-events-none absolute inset-0 overflow-hidden">
      {/* On small screens the aircraft gets its own band above the copy; on larger screens it sits beside it. */}
      <div className={`absolute inset-x-0 top-0 h-[52svh] transition-opacity duration-700 md:h-full ${show3d && ready ? 'opacity-0' : 'opacity-100'}`}>
        <AircraftPoster className="absolute left-1/2 top-[22%] w-[min(88vw,520px)] -translate-x-1/2 md:left-auto md:right-[3%] md:top-[24%] md:w-[min(48vw,700px)] md:translate-x-0" />
      </div>
      {show3d && (
        <div className={`absolute inset-x-0 top-0 h-[52svh] transition-opacity duration-1000 md:h-full ${ready ? 'opacity-100' : 'opacity-0'}`}>
          <SceneBoundary onError={() => setFailed(true)}>
            <Suspense fallback={null}>
              <HeroScene heroRef={heroRef} active={inView && tabVisible} reducedMotion={!!reduced} lowPower={lowPower} finePointer={finePointer} onReady={() => setReady(true)} />
            </Suspense>
          </SceneBoundary>
        </div>
      )}
      {/* legibility gradient behind the copy */}
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgb(4_9_20/0.82)_0%,rgb(4_9_20/0.45)_42%,transparent_70%)] max-md:bg-[linear-gradient(0deg,rgb(4_9_20/0.95)_0%,rgb(4_9_20/0.7)_42%,transparent_56%)]" />
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-night-950" />
    </div>
  )
}
