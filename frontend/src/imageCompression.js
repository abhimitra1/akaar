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

// Best-effort: any failure (unsupported API, canvas blocked, corrupt image) returns the
// original file untouched rather than blocking the create flow over a compression error —
// same fail-open philosophy as photoRecovery.js's own best-effort caching.
export async function compressImage(file, { maxDimension = MAX_DIMENSION, quality = JPEG_QUALITY } = {}) {
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
