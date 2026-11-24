// Original procedural narrow-body airliner built from three.js primitives (no external model, no licence constraints).
// Axis convention: nose points +X, up is +Y, starboard (right wing) is +Z. Fuselage length ≈ 10 units.
import { forwardRef, useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

const v2 = (x, y) => new THREE.Vector2(x, y)

function fuselageGeometry(segments) {
  const profile = [[0, -5.05], [0.1, -4.96], [0.22, -4.72], [0.36, -4.28], [0.5, -3.62], [0.6, -2.92], [0.645, -2.2], [0.652, -1],
    [0.652, 2.55], [0.635, 3.2], [0.585, 3.72], [0.49, 4.18], [0.35, 4.55], [0.19, 4.8], [0.06, 4.95], [0, 4.99]]
  const pts = new THREE.SplineCurve(profile.map(([r, y]) => v2(r, y))).getPoints(90).map((p) => v2(Math.max(p.x, 0), p.y))
  const g = new THREE.LatheGeometry(pts, segments)
  g.rotateZ(-Math.PI / 2) // lathe axis Y -> X
  const pos = g.attributes.position
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i), y = pos.getY(i)
    if (x < -2.6) y += 0.43 * Math.pow((-2.6 - x) / 2.45, 1.6)       // upswept tail cone
    if (x > 3.2) y -= 0.1 * Math.pow((x - 3.2) / 1.8, 2)            // slightly drooped nose
    pos.setY(i, y * 1.035)
  }
  g.computeVertexNormals()
  return g
}

// Swept planform in (chord x, span y), extruded for thickness and rotated so span runs along +Z.
function surfaceGeometry(points, thickness, bevel = 0.022) {
  const shape = new THREE.Shape(points.map(([x, y]) => v2(x, y)))
  const g = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.9, bevelSegments: 2, curveSegments: 1 })
  g.translate(0, 0, -thickness / 2)
  g.rotateX(Math.PI / 2)
  g.computeVertexNormals()
  return g
}

// Vertical plate in the XY plane (fin, winglet, livery mark)
function plateGeometry(points, thickness) {
  const shape = new THREE.Shape(points.map(([x, y]) => v2(x, y)))
  const g = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.014, bevelSegments: 2, curveSegments: 2 })
  g.translate(0, 0, -thickness / 2)
  g.computeVertexNormals()
  return g
}

function nacelleGeometry(segments) {
  const profile = [[0.2, -0.95], [0.27, -0.8], [0.35, -0.35], [0.385, 0.2], [0.375, 0.6], [0.335, 0.86], [0.3, 0.92]]
  const pts = new THREE.SplineCurve(profile.map(([r, y]) => v2(r, y))).getPoints(30)
  const g = new THREE.LatheGeometry(pts, segments)
  g.rotateZ(-Math.PI / 2)
  g.computeVertexNormals()
  return g
}

function useMaterials() {
  return useMemo(() => ({
    skin: new THREE.MeshPhysicalMaterial({ color: '#e8edf4', metalness: 0.55, roughness: 0.3, clearcoat: 0.7, clearcoatRoughness: 0.22, envMapIntensity: 1.1 }),
    wing: new THREE.MeshStandardMaterial({ color: '#c3ccd9', metalness: 0.72, roughness: 0.34, envMapIntensity: 1.0 }),
    navy: new THREE.MeshPhysicalMaterial({ color: '#0d2347', metalness: 0.5, roughness: 0.32, clearcoat: 0.5, envMapIntensity: 1.0, side: THREE.DoubleSide }),
    glass: new THREE.MeshStandardMaterial({ color: '#07111f', metalness: 0.4, roughness: 0.08 }),
    cyan: new THREE.MeshStandardMaterial({ color: '#3fd0ee', emissive: '#0d7d96', emissiveIntensity: 0.55, metalness: 0.3, roughness: 0.35 }),
    dark: new THREE.MeshStandardMaterial({ color: '#0b1220', metalness: 0.6, roughness: 0.5 }),
    starboard: new THREE.MeshBasicMaterial({ color: '#59ffa4' }),
    port: new THREE.MeshBasicMaterial({ color: '#ff5468' }),
    beacon: new THREE.MeshStandardMaterial({ color: '#ff3b4f', emissive: '#ff2040', emissiveIntensity: 0.2 }),
  }), [])
}

// One side (starboard) of the aircraft; rendered again mirrored for port.
function Side({ geo, mat, light }) {
  return (
    <group>
      <group position={[0.32, -0.3, 0.2]} rotation={[-0.09, 0, 0]}>
        <mesh geometry={geo.wing} material={mat.wing} />
        <mesh geometry={geo.winglet} material={mat.navy} position={[-1.22, 0.02, 4.72]} rotation={[-0.22, 0, 0]} />
        <mesh material={light} position={[-1.05, 0.02, 4.76]}><sphereGeometry args={[0.04, 10, 10]} /></mesh>
        {/* engine on pylon */}
        <group position={[0.42, -0.42, 1.75]}>
          <mesh geometry={geo.nacelle} material={mat.navy} />
          <mesh material={mat.dark} position={[0.84, 0, 0]} rotation={[0, Math.PI / 2, 0]}><circleGeometry args={[0.3, 32]} /></mesh>
          <mesh material={mat.wing} position={[0.9, 0, 0]} rotation={[0, 0, -Math.PI / 2]}><coneGeometry args={[0.085, 0.2, 20]} /></mesh>
          <mesh material={mat.cyan} position={[0.905, 0, 0]} rotation={[0, Math.PI / 2, 0]}><torusGeometry args={[0.31, 0.017, 10, 40]} /></mesh>
          <mesh material={mat.dark} position={[-0.98, 0, 0]} rotation={[0, 0, Math.PI / 2]}><coneGeometry args={[0.16, 0.32, 20]} /></mesh>
          <mesh material={mat.wing} position={[-0.05, 0.42, 0]} rotation={[0, 0, 0.12]}><boxGeometry args={[1.05, 0.2, 0.06]} /></mesh>
        </group>
      </group>
      <mesh geometry={geo.stabiliser} material={mat.wing} position={[-3.92, 0.27, 0.12]} rotation={[-0.07, 0, 0]} />
      <instancedMesh ref={geo.setWindows} args={[geo.window, mat.glass, geo.windowCount]} />
      <mesh material={mat.cyan} position={[0.15, 0.02, 0.664]}><boxGeometry args={[4.7, 0.028, 0.006]} /></mesh>
      {/* cockpit glazing */}
      <mesh material={mat.glass} position={[4.36, 0.34, 0.25]} rotation={[0.25, -0.5, -0.32]}><boxGeometry args={[0.22, 0.09, 0.02]} /></mesh>
      <mesh material={mat.glass} position={[4.14, 0.38, 0.4]} rotation={[0.35, -0.2, -0.18]}><boxGeometry args={[0.24, 0.08, 0.02]} /></mesh>
    </group>
  )
}

const Aircraft = forwardRef(function Aircraft({ lowPower = false, animate = true }, ref) {
  const mat = useMaterials()
  const beacon = useRef()
  const geo = useMemo(() => {
    const wing = surfaceGeometry([[0.95, 0], [-1.15, 4.7], [-1.78, 4.7], [-1.2, 1.55], [-1.06, 0]], 0.075)
    const stabiliser = surfaceGeometry([[0.1, 0], [-0.82, 1.95], [-1.27, 1.95], [-1.0, 0]], 0.05, 0.016)
    const winglet = plateGeometry([[0, 0], [-0.32, 0.62], [-0.55, 0.62], [-0.6, 0]], 0.03)
    const fin = plateGeometry([[0, 0], [-1.3, 2.3], [-1.85, 2.3], [-1.98, 0]], 0.09)
    const finMark = plateGeometry([[-0.62, 0.55], [-1.17, 1.55], [-1.45, 1.55], [-0.95, 0.55]], 0.1)
    const window = new THREE.CapsuleGeometry(0.021, 0.034, 3, 8)
    const xs = []
    for (let x = -2.7; x <= 2.95; x += 0.2) if (Math.abs(x - 2.75) > 0.12 && Math.abs(x + 0.15) > 0.08) xs.push(x)
    return {
      fuselage: fuselageGeometry(lowPower ? 36 : 64), nacelle: nacelleGeometry(lowPower ? 24 : 40),
      wing, stabiliser, winglet, fin, finMark, window, windowCount: xs.length,
      setWindows: (im) => {
        if (!im) return
        const m = new THREE.Matrix4()
        xs.forEach((x, i) => { m.makeTranslation(x, 0.17, 0.628); im.setMatrixAt(i, m) })
        im.instanceMatrix.needsUpdate = true
      },
    }
  }, [lowPower])

  useEffect(() => () => {
    Object.values(geo).forEach((g) => g?.dispose?.())
    Object.values(mat).forEach((m) => m.dispose())
  }, [geo, mat])

  useFrame(({ clock }) => {
    if (!animate || !beacon.current) return
    const t = clock.getElapsedTime() % 1.4
    beacon.current.emissiveIntensity = t < 0.12 ? 4 : 0.2
  })

  return (
    <group ref={ref} dispose={null}>
      <mesh geometry={geo.fuselage} material={mat.skin} />
      <mesh geometry={geo.fin} material={mat.navy} position={[-3.02, 0.52, 0]} />
      <mesh geometry={geo.finMark} material={mat.cyan} position={[-3.02, 0.52, 0]} />
      <mesh position={[0.4, 0.665, 0]}><sphereGeometry args={[0.035, 10, 10]} /><primitive object={mat.beacon} attach="material" ref={beacon} /></mesh>
      <Side geo={geo} mat={mat} light={mat.starboard} />
      <group scale={[1, 1, -1]}><Side geo={geo} mat={mat} light={mat.port} /></group>
    </group>
  )
})

export default Aircraft
