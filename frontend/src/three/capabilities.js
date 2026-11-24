// Feature detection for the 3D layer. Kept outside the three.js chunk so pages can decide without loading WebGL code.
const SOFTWARE = /swiftshader|llvmpipe|softpipe|basic render driver|software|warp/i

// Hardware-accelerated WebGL only: software rasterisers (no GPU) can starve the main thread with a live 3D scene,
// so those devices get the static illustration instead.
export function hasWebGL() {
  if (typeof window === 'undefined') return false
  try {
    const c = document.createElement('canvas')
    const opts = { failIfMajorPerformanceCaveat: true }
    const gl = (window.WebGL2RenderingContext && c.getContext('webgl2', opts)) || (window.WebGLRenderingContext && c.getContext('webgl', opts))
    if (!gl) return false
    const dbg = gl.getExtension('WEBGL_debug_renderer_info')
    const renderer = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : ''
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return !SOFTWARE.test(renderer)
  } catch {
    return false
  }
}

// Conservative "low power" signal: few cores, little memory, data-saver, or a small coarse-pointer screen.
export function isLowPower() {
  if (typeof window === 'undefined') return true
  const nav = window.navigator
  const cores = nav.hardwareConcurrency || 4
  const mem = nav.deviceMemory || 8
  const saveData = nav.connection?.saveData === true
  const coarseSmall = window.matchMedia?.('(pointer: coarse)').matches && Math.min(window.innerWidth, window.innerHeight) < 500
  return saveData || cores <= 4 || mem <= 4 || !!coarseSmall
}
