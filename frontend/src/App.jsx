import { Suspense, lazy } from 'react'
import { Link, Navigate, Route, Routes } from 'react-router-dom'
import { LazyMotion, MotionConfig, domAnimation } from 'framer-motion'
import AppLayout from './layouts/AppLayout'
import LandingPage from './pages/LandingPage'
import { Panel, Spinner } from './components/ui/ui'
import { buttonClass } from './components/ui/styles'

const PredictPage = lazy(() => import('./pages/PredictPage'))
const MethodologyPage = lazy(() => import('./pages/MethodologyPage'))

function NotFound() {
  return (
    <div className="mx-auto max-w-lg px-4 pb-24 pt-32">
      <Panel className="text-center">
        <h1 className="font-display text-4xl text-ink">Page not found</h1>
        <p className="mt-2 text-mist">That page doesn’t exist.</p>
        <Link to="/predict" className={buttonClass('primary', 'mt-6')}>Back to fare estimates</Link>
      </Panel>
    </div>
  )
}

const Loading = () => <p className="flex items-center justify-center gap-3 pt-40 text-mist" role="status"><Spinner /> Loading…</p>

export default function App() {
  return (
    <LazyMotion features={domAnimation} strict>
    <MotionConfig reducedMotion="user">
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<LandingPage />} />
          <Route path="predict" element={<Suspense fallback={<Loading />}><PredictPage /></Suspense>} />
          <Route path="methodology" element={<Suspense fallback={<Loading />}><MethodologyPage /></Suspense>} />
          <Route path="about" element={<Navigate to="/methodology" replace />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </MotionConfig>
    </LazyMotion>
  )
}
