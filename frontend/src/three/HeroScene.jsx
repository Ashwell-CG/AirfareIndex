// Lazy-loaded WebGL hero (three.js + react-three-fiber). Loaded as its own chunk only on the landing page.
import { useEffect, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import Aircraft from './Aircraft'
import Clouds from './Clouds'

// Image-based lighting generated in memory (no HDR download)
function StudioEnvironment() {
  const { gl, scene } = useThree()
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl)
    const room = new RoomEnvironment()
    const env = pmrem.fromScene(room, 0.04).texture
    scene.environment = env
    return () => { scene.environment = null; env.dispose(); pmrem.dispose(); room.dispose?.() }
  }, [gl, scene])
  return null
}

const damp = (a, b, k, dt) => THREE.MathUtils.damp(a, b, k, dt)

// Places the aircraft for the viewport shape and drives idle motion, pointer response and scroll-linked flight.
function Rig({ heroRef, animate, lowPower, finePointer }) {
  const outer = useRef()
  const inner = useRef()
  const { size, camera } = useThree()
  const aspect = size.width / size.height
  const layout = aspect > 1.25 ? { x: 2.6, y: 0.1, s: 0.58 } : aspect > 0.85 ? { x: 1.6, y: 0.4, s: 0.55 } : { x: -0.35, y: -0.2, s: 0.38 * Math.min(1, aspect / 0.75) }
  const scroll = useRef(0)

  useEffect(() => {
    const onScroll = () => {
      const h = heroRef.current?.offsetHeight || window.innerHeight
      scroll.current = THREE.MathUtils.clamp(window.scrollY / h, 0, 1)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [heroRef])

  useFrame((state, dt) => {
    const o = outer.current, i = inner.current
    if (!o || !i) return
    const t = state.clock.getElapsedTime()
    const p = animate ? scroll.current : 0
    const px = animate && finePointer ? state.pointer.x : 0
    const py = animate && finePointer ? state.pointer.y : 0
    // position and heading (scroll: the aircraft climbs away to the right)
    o.position.x = damp(o.position.x, layout.x + p * 3.4, 4, dt)
    o.position.y = damp(o.position.y, layout.y + p * 1.6 + (animate ? Math.sin(t * 0.7) * 0.08 : 0), 4, dt)
    o.scale.setScalar(damp(o.scale.x, layout.s * (1 - p * 0.18), 4, dt))
    o.rotation.y = damp(o.rotation.y, -0.72 - p * 0.45 + px * 0.12, 3, dt)
    // roll and pitch about the aircraft's own axes
    i.rotation.x = damp(i.rotation.x, (animate ? Math.sin(t * 0.45) * 0.03 : 0) - px * 0.16 - p * 0.12, 3, dt)
    i.rotation.z = damp(i.rotation.z, 0.04 + py * 0.06 + p * 0.1, 3, dt)
    camera.position.y = damp(camera.position.y, 2.6 + py * 0.35, 2.5, dt)
    camera.lookAt(0, 0.1, 0)
  })

  return (
    <group ref={outer} position={[layout.x, layout.y, 0]} rotation={[0, -0.72, 0]} scale={layout.s}>
      <group ref={inner}>
        <Aircraft lowPower={lowPower} animate={animate} />
      </group>
    </group>
  )
}

// Safety net: if frames stay slow (weak GPU, thermal throttling), freeze the scene on its current frame.
function FrameGuard({ onSlow }) {
  const samples = useRef([])
  const done = useRef(false)
  useFrame((_, dt) => {
    if (done.current) return
    samples.current.push(dt)
    if (samples.current.length < 90) return
    const sorted = [...samples.current].sort((a, b) => a - b)
    if (sorted[Math.floor(sorted.length / 2)] > 0.045) { done.current = true; onSlow() } // median slower than ~22 fps
    samples.current = []
  })
  return null
}

export default function HeroScene({ heroRef, active, reducedMotion, lowPower, finePointer, onReady }) {
  const [slow, setSlow] = useState(false)
  const animate = active && !reducedMotion && !slow
  return (
    <Canvas
      className="!absolute inset-0"
      eventSource={heroRef}
      eventPrefix="client"
      frameloop={animate ? 'always' : 'demand'}
      dpr={[1, lowPower ? 1.25 : 1.75]}
      camera={{ fov: 32, position: [0, 2.6, 15], near: 0.1, far: 90 }}
      gl={{ antialias: !lowPower, alpha: true, powerPreference: 'high-performance' }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping
        gl.toneMappingExposure = 1.05
        onReady?.()
      }}
    >
      <fog attach="fog" args={['#0f2140', 14, 48]} />
      <StudioEnvironment />
      <hemisphereLight args={['#c4d8ff', '#0a1630', 0.45]} />
      <directionalLight position={[7, 3, 9]} intensity={2.6} color="#ffd6a3" />
      <directionalLight position={[-7, 5, -7]} intensity={1.8} color="#63d3ff" />
      <directionalLight position={[0, -6, 4]} intensity={0.35} color="#4c8dff" />
      <Rig heroRef={heroRef} animate={animate} lowPower={lowPower} finePointer={finePointer} />
      <Clouds count={lowPower ? 10 : 24} animate={animate} />
      {animate && <FrameGuard onSlow={() => setSlow(true)} />}
    </Canvas>
  )
}
