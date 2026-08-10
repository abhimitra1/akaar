// Rasterizes one of public/brand/'s logo SVGs to a PNG at the given size and triggers a
// browser download — for users who need a raster format (social profile pictures, places
// that don't accept SVG) rather than the vector original. Same canvas-based, browser-only
// approach as imageCompression.js.
export async function downloadSvgAsPng(svgUrl, filename, size = 512) {
  const res = await fetch(svgUrl)
  const svgText = await res.text()
  const svgBlob = new Blob([svgText], { type: 'image/svg+xml' })
  const blobUrl = URL.createObjectURL(svgBlob)

  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('Failed to rasterize logo'))
      el.src = blobUrl
    })

    // Preserve the source SVG's own aspect ratio rather than forcing a square canvas —
    // the lockup/on-dark chip files are wider than tall.
    const aspect = img.naturalWidth / img.naturalHeight || 1
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = Math.round(size / aspect)
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)

    const pngBlob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
    const downloadUrl = URL.createObjectURL(pngBlob)
    const a = document.createElement('a')
    a.href = downloadUrl
    a.download = filename
    a.click()
    URL.revokeObjectURL(downloadUrl)
  } finally {
    URL.revokeObjectURL(blobUrl)
  }
}
