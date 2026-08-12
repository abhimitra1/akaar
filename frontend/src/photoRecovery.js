// Client-side safety net for the Create flow's handoff to 3D generation. Right as
// CreatePage submits (craft created, photo uploaded, job created, about to kick off
// runReconstruction), it stashes a copy of the photo here in localStorage, keyed by the
// new craft's id. If reconstruction fails (jobs.status = 'failed'), ProcessingPage routes
// back to `/create` with that craft id, and CreatePage restores the photo from here — so
// the user doesn't have to re-pick a photo or, worse, redo an AI co-creation generation
// (real GPU time, rate-limited) just because the *reconstruction* step failed. Cleared
// once a job completes successfully, or as soon as it's been restored on retry.
const KEY_PREFIX = 'PATHS:recovery-photo:'

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Failed to read photo'))
    reader.readAsDataURL(file)
  })
}

function dataUrlToFile(dataUrl, name) {
  const [header, base64] = dataUrl.split(',')
  const type = /data:(.*?);base64/.exec(header)?.[1] || 'image/jpeg'
  const bytes = atob(base64)
  const buffer = new Uint8Array(bytes.length)
  for (let i = 0; i < bytes.length; i++) buffer[i] = bytes.charCodeAt(i)
  return new File([buffer], name, { type })
}

// Best-effort only (quota exceeded, private browsing, unreadable file) — must never block
// the actual generation request, so failures here are swallowed, not surfaced.
export async function saveRecoveryPhoto(craftId, file, parentDesign, isAiGenerated) {
  try {
    const dataUrl = await fileToDataUrl(file)
    localStorage.setItem(
      KEY_PREFIX + craftId,
      JSON.stringify({ dataUrl, name: file.name, parentDesign: parentDesign || null, isAiGenerated: Boolean(isAiGenerated) })
    )
  } catch {
    // Ignore — see comment above.
  }
}

export function loadRecoveryPhoto(craftId) {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + craftId)
    if (!raw) return null
    const { dataUrl, name, parentDesign, isAiGenerated } = JSON.parse(raw)
    return {
      file: dataUrlToFile(dataUrl, name),
      previewUrl: dataUrl,
      parentDesign: parentDesign || null,
      isAiGenerated: Boolean(isAiGenerated),
    }
  } catch {
    return null
  }
}

export function clearRecoveryPhoto(craftId) {
  try {
    localStorage.removeItem(KEY_PREFIX + craftId)
  } catch {
    // Ignore.
  }
}
