// The supported route network seen from cruise altitude: the seven cities as sodium lights on the ground plane,
// every supported city pair as a faint arc, and a few light pulses travelling along them.
// City positions come from real coordinates; arcs come from the /options payload (nothing invented).
import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { COORDS, project } from '../lib/airports'

const GROUND_Y = -7.5
const W = 24, D = 15, ZC = -20

function toWorld(city) {
  const p = project(city)
  return p ? new THREE.Vector3((p[0] - 0.5) * W, GROUND_Y, ZC + (p[1] - 0.5) * D) : null
}

function glowTexture() {
  const size = 64
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.25, 'rgba(255,255,255,0.65)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

export default function Network({ pairs = [], animate = true, pulses = 10 }) {
  const pulseRef = useRef()
  const { size } = useThree()
  const offsetX = size.width / size.height > 1.25 ? 5 : 0 // wide screens: keep the network under the aircraft, clear of the copy
  const built = useMemo(() => {
    const tex = glowTexture()
    const cities = Object.keys(COORDS).map(toWorld).filter(Boolean)
    const cityGeo = new THREE.BufferGeometry().setFromPoints(cities)
    const cityMat = new THREE.PointsMaterial({ map: tex, color: '#f2b05e', size: 1.5, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })
    const haloMat = new THREE.PointsMaterial({ map: tex, color: '#f2b05e', size: 4.2, opacity: 0.22, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })

    const curves = pairs.map(([a, b]) => {
      const A = toWorld(a), B = toWorld(b)
      if (!A || !B) return null
      const mid = A.clone().add(B).multiplyScalar(0.5)
      mid.y += 0.9 + A.distanceTo(B) * 0.22
      return new THREE.QuadraticBezierCurve3(A, mid, B)
    }).filter(Boolean)
    const seg = []
    for (const c of curves) {
      const pts = c.getPoints(36)
      for (let i = 0; i < pts.length - 1; i++) seg.push(pts[i], pts[i + 1])
    }
    const arcGeo = new THREE.BufferGeometry().setFromPoints(seg)
    const arcMat = new THREE.LineBasicMaterial({ color: '#62d4ee', transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending })

    const n = Math.min(pulses, curves.length)
    const riders = Array.from({ length: n }, (_, i) => ({ curve: curves[Math.round((i * curves.length) / Math.max(n, 1)) % curves.length], t: i / Math.max(n, 1), v: 0.07 + (i % 3) * 0.025 }))
    const pulseGeo = new THREE.BufferGeometry()
    pulseGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(Math.max(n, 1) * 3), 3))
    const pulseMat = new THREE.PointsMaterial({ map: tex, color: '#bdf2ff', size: 0.9, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })
    return { tex, cityGeo, cityMat, haloMat, arcGeo, arcMat, riders, pulseGeo, pulseMat }
  }, [pairs, pulses])

  useEffect(() => () => {
    const { tex, cityGeo, cityMat, haloMat, arcGeo, arcMat, pulseGeo, pulseMat } = built
    ;[tex, cityGeo, cityMat, haloMat, arcGeo, arcMat, pulseGeo, pulseMat].forEach((o) => o.dispose())
  }, [built])

  const place = (dt) => {
    const attr = built.pulseGeo.attributes.position
    built.riders.forEach((r, i) => {
      r.t = (r.t + dt * r.v) % 1
      const p = r.curve.getPoint(r.t)
      attr.setXYZ(i, p.x, p.y, p.z)
    })
    attr.needsUpdate = true
  }

  useEffect(() => { place(0) }, [built]) // eslint-disable-line react-hooks/exhaustive-deps
  useFrame((_, dt) => { if (animate && built.riders.length) place(Math.min(dt, 0.05)) })

  return (
    <group position={[offsetX, 0, 0]}>
      <points geometry={built.cityGeo} material={built.haloMat} />
      <points geometry={built.cityGeo} material={built.cityMat} />
      {built.riders.length > 0 && <lineSegments geometry={built.arcGeo} material={built.arcMat} />}
      {built.riders.length > 0 && <points ref={pulseRef} geometry={built.pulseGeo} material={built.pulseMat} />}
    </group>
  )
}
