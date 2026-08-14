import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'

// InstantMesh's reconstructed GLBs carry all of their color as a per-vertex COLOR_0
// attribute — no UV coordinates, no material, no texture image (confirmed by inspecting
// real output: `materials`/`textures`/`images` all absent, mesh primitives have only
// POSITION + COLOR_0). That renders fine in WebGL — this app's on-page 3D view and
// Android's WebXR/Scene Viewer AR all consume the live three.js scene, whose glTF loader
// auto-enables `vertexColors` on a fallback material for exactly this case. But iOS AR
// Quick Look never sees that live scene: without a pre-made `ios-src`, model-viewer
// converts the GLB to USDZ client-side via three.js's `USDZExporter` on every "View in
// AR" tap, and that exporter's material builder only ever reads `material.map` or
// `material.color` (a single flat color) — it has no vertex-color support at all, so the
// exported USDZ comes out completely untextured. Confirmed directly by reading
// `USDZExporter`'s `buildMaterial()` — no reference to `vertexColors` anywhere in it.
//
// This bakes each mesh's vertex colors into a real baseColorTexture with real UVs, so
// every consumer — WebGL preview, Android AR, iOS USDZ export — reads the exact same
// ordinary textured material. No vertex-color-only code path is left for anything to miss.
//
// Approach: give every triangle its own small, isolated cell in a texture atlas (the
// mesh is flattened first — one vertex per triangle corner, nothing shared across
// triangles — so a triangle's UV interpolation can never sample into a neighboring
// triangle's cell), and rasterize each cell directly from that triangle's 3 vertex
// colors via barycentric interpolation. Reproduces the original vertex-color gradient
// as an ordinary texture, at the cost of some blockiness within very large triangles
// (bounded by CELL_PIXELS) compared to true per-fragment vertex-color interpolation.

const CELL_PIXELS = 8
const CELL_INSET = 0.15 // fraction of the cell kept as a gutter — safely more than the
// half-texel (1/(2*CELL_PIXELS) = 0.0625) that bilinear filtering can reach outside the
// sampled UV, so adjacent triangles' cells never bleed into each other.

function linearToSRGB(c) {
  return c < 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055
}

function isBakeable(mesh) {
  if (!mesh.isMesh) return false
  const { geometry, material } = mesh
  if (!geometry?.attributes?.color) return false
  if (material?.map) return false // already textured — leave it alone
  return true
}

function bakeMeshTexture(mesh) {
  const { geometry } = mesh
  const position = geometry.attributes.position
  const color = geometry.attributes.color
  const index = geometry.index
  const getIndex = (i) => (index ? index.getX(i) : i)
  const triCount = Math.floor((index ? index.count : position.count) / 3)

  const cellsPerRow = Math.max(1, Math.ceil(Math.sqrt(triCount)))
  const atlasSize = cellsPerRow * CELL_PIXELS
  const pixels = new Uint8Array(atlasSize * atlasSize * 4)

  const flatPosition = new Float32Array(triCount * 9)
  const flatNormal = new Float32Array(triCount * 9)
  const flatUV = new Float32Array(triCount * 6)

  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const c = new THREE.Vector3()
  const edge1 = new THREE.Vector3()
  const edge2 = new THREE.Vector3()
  const normal = new THREE.Vector3()

  const lo = CELL_INSET
  const span = 1 - 2 * CELL_INSET
  const uvCorners = [
    [lo, lo],
    [lo + span, lo],
    [lo, lo + span],
  ]

  for (let t = 0; t < triCount; t++) {
    const idx = [getIndex(t * 3), getIndex(t * 3 + 1), getIndex(t * 3 + 2)]
    a.fromBufferAttribute(position, idx[0])
    b.fromBufferAttribute(position, idx[1])
    c.fromBufferAttribute(position, idx[2])

    // Flat face normal — the source mesh has no NORMAL attribute at all (glTF's
    // documented fallback for that case), and flat shading is the natural fit anyway
    // once the mesh is triangle-flattened below.
    edge1.subVectors(b, a)
    edge2.subVectors(c, a)
    normal.crossVectors(edge1, edge2).normalize()

    const cellX = t % cellsPerRow
    const cellY = Math.floor(t / cellsPerRow)
    const originX = cellX * CELL_PIXELS
    const originY = cellY * CELL_PIXELS

    const cols = idx.map((i) => [color.getX(i), color.getY(i), color.getZ(i)])

    for (let corner = 0; corner < 3; corner++) {
      const outIdx = t * 3 + corner
      const p = corner === 0 ? a : corner === 1 ? b : c
      flatPosition[outIdx * 3] = p.x
      flatPosition[outIdx * 3 + 1] = p.y
      flatPosition[outIdx * 3 + 2] = p.z
      flatNormal[outIdx * 3] = normal.x
      flatNormal[outIdx * 3 + 1] = normal.y
      flatNormal[outIdx * 3 + 2] = normal.z

      const [u, v] = uvCorners[corner]
      flatUV[outIdx * 2] = (originX + u * CELL_PIXELS) / atlasSize
      // glTF/three.js V is top-down in UV space, matching how the pixel buffer below
      // is filled row-by-row from the top — no flip needed here.
      flatUV[outIdx * 2 + 1] = (originY + v * CELL_PIXELS) / atlasSize
    }

    // Rasterize this triangle's cell: for every texel, find its barycentric weight
    // relative to the (inset) triangle corners assigned above, mirroring texels that
    // fall outside the triangle back inside it so the whole square cell gets a smooth,
    // seamless fill (that mirrored region is only ever touched by filtering reaching
    // slightly past the true corners, never by the mesh's own UVs).
    for (let py = 0; py < CELL_PIXELS; py++) {
      for (let px = 0; px < CELL_PIXELS; px++) {
        const u = (px + 0.5) / CELL_PIXELS
        const v = (py + 0.5) / CELL_PIXELS
        let w1 = (u - lo) / span
        let w2 = (v - lo) / span
        if (w1 + w2 > 1) {
          const nw1 = 1 - w2
          const nw2 = 1 - w1
          w1 = nw1
          w2 = nw2
        }
        w1 = Math.min(1, Math.max(0, w1))
        w2 = Math.min(1, Math.max(0, w2))
        if (w1 + w2 > 1) {
          const s = w1 + w2
          w1 /= s
          w2 /= s
        }
        const w0 = 1 - w1 - w2

        const r = w0 * cols[0][0] + w1 * cols[1][0] + w2 * cols[2][0]
        const g = w0 * cols[0][1] + w1 * cols[1][1] + w2 * cols[2][1]
        const bl = w0 * cols[0][2] + w1 * cols[1][2] + w2 * cols[2][2]

        const pi = ((originY + py) * atlasSize + (originX + px)) * 4
        // Vertex colors decoded by GLTFLoader are in linear working color space;
        // baseColorTexture is expected sRGB-encoded (colorSpace set below) — convert
        // so the baked texture reproduces the same colors the vertex-color path shows.
        pixels[pi] = Math.round(linearToSRGB(r) * 255)
        pixels[pi + 1] = Math.round(linearToSRGB(g) * 255)
        pixels[pi + 2] = Math.round(linearToSRGB(bl) * 255)
        pixels[pi + 3] = 255
      }
    }
  }

  const canvas = document.createElement('canvas')
  canvas.width = atlasSize
  canvas.height = atlasSize
  const ctx = canvas.getContext('2d')
  ctx.putImageData(new ImageData(new Uint8ClampedArray(pixels.buffer), atlasSize, atlasSize), 0, 0)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.flipY = false // UVs above already match the canvas's own (top-down) row order
  texture.needsUpdate = true

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(flatPosition, 3))
  geo.setAttribute('normal', new THREE.BufferAttribute(flatNormal, 3))
  geo.setAttribute('uv', new THREE.BufferAttribute(flatUV, 2))

  const material = new THREE.MeshStandardMaterial({ map: texture, metalness: 0, roughness: 1 })

  mesh.geometry.dispose()
  mesh.geometry = geo
  if (Array.isArray(mesh.material)) mesh.material.forEach((m) => m.dispose())
  else mesh.material?.dispose()
  mesh.material = material
}

// Takes a GLB ArrayBuffer, returns a new GLB ArrayBuffer with vertex colors baked into
// a real texture, or null if there was nothing bakeable (already textured, or no vertex
// color data to begin with) — callers should fall back to uploading the original GLB.
export async function bakeVertexColorsToTexture(glbArrayBuffer) {
  const loader = new GLTFLoader()
  const gltf = await loader.parseAsync(glbArrayBuffer, '')

  let baked = false
  gltf.scene.traverse((obj) => {
    if (isBakeable(obj)) {
      bakeMeshTexture(obj)
      baked = true
    }
  })
  if (!baked) return null

  const exporter = new GLTFExporter()
  const result = await exporter.parseAsync(gltf.scene, { binary: true })
  return result // ArrayBuffer (GLB)
}
