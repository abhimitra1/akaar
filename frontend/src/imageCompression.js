// Client-side compression for every photo that ends up in Supabase Storage (no backend to
// do this server-side, per AGENTS.md §6 — "no backend, frontend talks directly to
// Supabase"). Runs at the point a photo is picked/accepted, before it's previewed, cached
// for recovery (photoRecovery.js), or uploaded — so every downstream consumer already gets
// the smaller version for free.
//
// 1600px long edge / JPEG q=0.82 is comfortably more detail than InstantMesh's single-image
// reconstruction or a phone-screen 3D/AR view need, while cutting a typical modern phone
// photo (10-15MB, 4000px+) down to a few hundred KB — the actual "too much space" problem.
const MAX_DIMENSION = 1600
const JPEG_QUALITY = 0.82

// iPhone's default camera format, and one neither <img> nor createImageBitmap can decode
// on most browsers: no vendor other than Safari (and Chrome on macOS/Android) ships a
// licensed HEVC decoder, so Chrome-on-Windows/Linux and Firefox everywhere fail silently —
// no error, no onLoad, just a blank preview. `heic-to` is a real WASM decoder that works
// regardless of platform; it's dynamically imported (~3MB) so non-HEIC uploads, the common
// case, never pay for it.
//
// Detection reads the file's own bytes (the ISO-BMFF 'ftyp' box) rather than trusting
// file.name/file.type: a gallery pick keeps its real IMG_XXXX.HEIC name and image/heic
// type, but iOS's camera-capture picker (<input capture="environment">) can hand back a
// HEIC blob mislabeled as "image.jpg" / image/jpeg — a name/MIME check misses that file
// entirely and it goes on to break the same way an unconverted HEIC always did.
const HEIC_FTYP_BRANDS = new Set(['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx', 'hevm', 'hevs', 'mif1', 'msf1'])

async function isHeicFile(file) {
  try {
    const bytes = new Uint8Array(await file.slice(4, 12).arrayBuffer())
    if (bytes.length < 8) return false
    const marker = String.fromCharCode(...bytes)
    return marker.startsWith('ftyp') && HEIC_FTYP_BRANDS.has(marker.slice(4, 8))
  } catch {
    return false
  }
}

export async function normalizeHeic(file) {
  if (!(await isHeicFile(file))) return file
  try {
    const { heicTo } = await import('heic-to')
    const blob = await heicTo({ blob: file, type: 'image/jpeg', quality: JPEG_QUALITY })
    const name = file.name.replace(/\.\w+$/, '') + '.jpg'
    return new File([blob], name, { type: 'image/jpeg' })
  } catch {
    return file
  }
}

// Best-effort: any failure (unsupported API, canvas blocked, corrupt image) returns the
// original file untouched rather than blocking the create flow over a compression error —
// same fail-open philosophy as photoRecovery.js's own best-effort caching.
export async function compressImage(file, { maxDimension = MAX_DIMENSION, quality = JPEG_QUALITY } = {}) {
  file = await normalizeHeic(file)
  if (!file?.type?.startsWith('image/') || file.type === 'image/svg+xml') return file

  try {
    // `imageOrientation: 'from-image'` matters here specifically: an <img> tag always
    // honors a photo's EXIF orientation, but a raw canvas re-encode won't unless asked —
    // without this, a portrait phone photo could come out sideways after compression.
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height))
    const width = Math.round(bitmap.width * scale)
    const height = Math.round(bitmap.height * scale)

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height)
    bitmap.close?.()

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
    // A tiny/already-compressed source can occasionally re-encode larger — keep whichever
    // is actually smaller rather than trusting the pipeline blindly.
    if (!blob || blob.size >= file.size) return file

    const name = file.name.replace(/\.\w+$/, '') + '.jpg'
    return new File([blob], name, { type: 'image/jpeg' })
  } catch {
    return file
  }
}
