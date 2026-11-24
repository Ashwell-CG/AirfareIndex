// Drifting cloud deck: one instanced mesh, one procedurally painted canvas texture (no image files).
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

function cloudTexture() {
  const size = 256
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')
  const puffs = [[0.5, 0.58, 0.34], [0.32, 0.62, 0.24], [0.68, 0.62, 0.26], [0.42, 0.46, 0.22], [0.6, 0.44, 0.2], [0.2, 0.66, 0.16], [0.8, 0.66, 0.16]]
  for (const [x, y, r] of puffs) {
    const g = ctx.createRadialGradient(x * size, y * size, 0, x * size, y * size, r * size)
    g.addColorStop(0, 'rgba(255,255,255,0.55)')
    g.addColorStop(0.6, 'rgba(255,255,255,0.18)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, size, size)
  }
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

// Deterministic pseudo-random so layouts are stable between renders
function rng(seed) {
  let s = seed
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
}

export default function Clouds({ count = 24, animate = true, speed = 1 }) {
  const ref = useRef()
  const { tex, geom, mat, items } = useMemo(() => {
    const tex = cloudTexture()
    const r = rng(7)
    const items = Array.from({ length: count }, (_, i) => {
      const far = i % 3 === 0
      return {
        x: -24 + r() * 48,
        y: far ? -2.5 + r() * 5 : -6.2 + r() * 3.6,
        z: far ? -26 + r() * 14 : -6 + r() * 9,
        sx: 7 + r() * 10, sy: 2.6 + r() * 3,
        v: (far ? 0.25 : 0.9) + r() * 0.5,
        tint: far ? 0.55 + r() * 0.15 : 0.7 + r() * 0.3,
      }
    })
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.85, color: '#b9c9e6', fog: true })
    return { tex, geom: new THREE.PlaneGeometry(1, 1), mat, items }
  }, [count])

  const write = (im) => {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), col = new THREE.Color()
    items.forEach((c, i) => {
      p.set(c.x, c.y, c.z); s.set(c.sx, c.sy, 1)
      m.compose(p, q, s)
      im.setMatrixAt(i, m)
      im.setColorAt(i, col.setRGB(c.tint, c.tint * 1.02, c.tint * 1.08))
    })
    im.instanceMatrix.needsUpdate = true
    if (im.instanceColor) im.instanceColor.needsUpdate = true
  }

  useEffect(() => {
    if (ref.current) write(ref.current)
    return () => { tex.dispose(); geom.dispose(); mat.dispose() }
  }, [tex, geom, mat]) // eslint-disable-line react-hooks/exhaustive-deps

  useFrame((_, dt) => {
    if (!animate || !ref.current) return
    const step = Math.min(dt, 0.05) * speed
    for (const c of items) {
      c.x -= c.v * step * 2.2
      if (c.x < -26) c.x = 26
    }
    write(ref.current)
  })

  return <instancedMesh ref={ref} args={[geom, mat, count]} frustumCulled={false} />
}
