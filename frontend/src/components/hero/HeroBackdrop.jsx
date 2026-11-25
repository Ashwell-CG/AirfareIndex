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

// Night sky + 3D aircraft over the route network, behind the hero copy. Decorative: hidden from assistive tech.
export default function HeroBackdrop({ heroRef, pairs }) {
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
      <div className="starfield absolute inset-0 opacity-70" />
      {/* Small screens: the scene gets its own band above the copy. Larger screens: it fills the hero. */}
      <div className={`absolute inset-x-0 top-0 h-[54svh] transition-opacity duration-700 md:h-full ${show3d && ready ? 'opacity-0' : 'opacity-100'}`}>
        <AircraftPoster className="absolute left-1/2 top-[24%] w-[min(88vw,520px)] -translate-x-1/2 md:left-auto md:right-[3%] md:top-[22%] md:w-[min(50vw,760px)] md:translate-x-0" />
      </div>
      {show3d && (
        <div className={`absolute inset-x-0 top-0 h-[54svh] transition-opacity duration-1000 md:h-full ${ready ? 'opacity-100' : 'opacity-0'}`}>
          <SceneBoundary onError={() => setFailed(true)}>
            <Suspense fallback={null}>
              <HeroScene heroRef={heroRef} active={inView && tabVisible} reducedMotion={!!reduced} lowPower={lowPower} finePointer={finePointer}
                onReady={() => setReady(true)} pairs={pairs} />
            </Suspense>
          </SceneBoundary>
        </div>
      )}
      {/* legibility gradients behind the copy */}
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgb(6_14_31/0.86)_0%,rgb(6_14_31/0.5)_38%,transparent_66%)] max-md:bg-[linear-gradient(0deg,rgb(6_14_31/0.97)_0%,rgb(6_14_31/0.75)_44%,transparent_58%)]" />
      <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-b from-transparent to-night-950" />
    </div>
  )
}
