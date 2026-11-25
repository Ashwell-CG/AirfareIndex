import { Suspense, lazy } from 'react'
import { Link, Navigate, Route, Routes } from 'react-router-dom'
import { LazyMotion, MotionConfig, domAnimation } from 'framer-motion'
import AppLayout from './layouts/AppLayout'
import LandingPage from './pages/LandingPage'
import { Spinner } from './components/ui/ui'
import { buttonClass } from './components/ui/styles'

const PredictPage = lazy(() => import('./pages/PredictPage'))
const MethodologyPage = lazy(() => import('./pages/MethodologyPage'))

function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 pb-28 pt-36 text-center">
      <p className="display-xl text-[7rem] text-fog/60" aria-hidden="true">404</p>
      <h1 className="display-lg mt-2 text-5xl text-ink">Page not found</h1>
      <p className="mt-3 text-mist">That page doesn’t exist. The estimator and the model notes are still here.</p>
      <Link to="/predict" className={buttonClass('primary', 'mt-8')}>Back to fare estimates</Link>
    </div>
  )
}

const Loading = () => <p className="flex items-center justify-center gap-3 pt-40 text-mist" role="status"><Spinner className="h-5 w-5 text-cyan" /> Loading…</p>

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
