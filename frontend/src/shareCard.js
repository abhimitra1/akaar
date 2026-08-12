import QRCode from 'qrcode'

// Generates a shareable PATHS-branded image for a craft (Instagram 4:5 feed-post size —
// the tallest ratio Instagram's feed accepts without cropping) for CraftPage.jsx's Share
// button: craft photo, title, maker, real stats (no fabricated view/comment counts — this
// app doesn't track those), a QR code linking back to the craft, and a footer credit.
// Deliberately does NOT include a social-icon strip (native share sheets already do that
// job) — see CraftPage.jsx's handleShare for how the resulting image is actually shared.
//
// Canvas-based, same browser-only rasterization approach as svgDownload.js/
// imageCompression.js — no server, no headless-browser rendering.

const WIDTH = 1080
const HEIGHT = 1350

// Plain hex, not CSS custom properties — canvas can't read those. Kept in sync by hand with
// index.css/PathsMark.jsx; these are brand constants, not runtime theme values, so drift
// risk is low.
const INK = '#231a12'
const INK_DIM = '#4a3b2c'
const INK_FAINT = '#8a7266'
const TERRACOTTA = '#974400'
const VIOLET = '#6c5ecb'
const CREAM_BG = '#fff8f6'
const LINE = '#eadfd0'
const MARK_INK = '#2a241f'
const MARK_RING = '#c1662e'

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function drawImageCover(ctx, img, x, y, w, h) {
  const imgRatio = img.width / img.height
  const boxRatio = w / h
  let sx, sy, sw, sh
  if (imgRatio > boxRatio) {
    sh = img.height
    sw = sh * boxRatio
    sx = (img.width - sw) / 2
    sy = 0
  } else {
    sw = img.width
    sh = sw / boxRatio
    sx = 0
    sy = (img.height - sh) / 2
  }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h)
}

// Fetches then loads via a blob URL (not a direct `img.src = url`) — Supabase Storage
// serves cross-origin from the app; going through fetch()+blob sidesteps canvas
// "tainted" restrictions the same way svgDownload.js already does for logo assets.
async function loadImage(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error('Failed to fetch image')
  const blob = await res.blob()
  const blobUrl = URL.createObjectURL(blob)
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('Failed to decode image'))
      img.src = blobUrl
    })
  } finally {
    setTimeout(() => URL.revokeObjectURL(blobUrl), 500)
  }
}

// Greedy word-wrap to at most maxLines, ellipsizing the last line if it overflows —
// canvas has no native line-clamp, ctx.font must already be set by the caller.
function wrapText(ctx, text, maxWidth, maxLines) {
  const words = text.split(/\s+/).filter(Boolean)
  const lines = []
  let current = ''
  let i = 0
  while (i < words.length) {
    const test = current ? `${current} ${words[i]}` : words[i]
    if (ctx.measureText(test).width <= maxWidth || !current) {
      current = test
      i++
    } else {
      lines.push(current)
      current = ''
      if (lines.length === maxLines) break
    }
  }
  const overflowed = i < words.length
  if (lines.length < maxLines && current) lines.push(current)

  if (overflowed || lines.length > maxLines) {
    lines.length = Math.min(lines.length, maxLines)
    let last = lines[lines.length - 1] || ''
    while (last.length > 0 && ctx.measureText(last + '…').width > maxWidth) {
      last = last.slice(0, -1)
    }
    lines[lines.length - 1] = last.trimEnd() + '…'
  }
  return lines
}

// Canvas port of components/PathsMark.jsx's three-circle geometry (outer dashed ring,
// terracotta thrown ring, ink center) — R is the outer ring's radius.
function drawPathsMark(ctx, cx, cy, R) {
  ctx.save()
  ctx.strokeStyle = MARK_INK
  ctx.lineWidth = R * (4 / 34)
  ctx.setLineDash([R * (5 / 34), R * (5 / 34)])
  ctx.beginPath()
  ctx.arc(cx, cy, R, 0, Math.PI * 2)
  ctx.stroke()

  ctx.setLineDash([])
  ctx.strokeStyle = MARK_RING
  ctx.lineWidth = R * (10 / 34)
  ctx.beginPath()
  ctx.arc(cx, cy, R * (24 / 34), 0, Math.PI * 2)
  ctx.stroke()

  ctx.fillStyle = MARK_INK
  ctx.beginPath()
  ctx.arc(cx, cy, R * (9 / 34), 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

// Matches components/AiGeneratedBadge.jsx's sparkle glyph — the app's one consistent
// visual for "AI-touched", reused here so the shared image stays recognizably PATHS.
function drawSparkleBadge(ctx, cx, cy, R) {
  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, R, 0, Math.PI * 2)
  ctx.fillStyle = VIOLET
  ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.translate(cx - R * 0.55, cy - R * 0.55)
  ctx.scale(R / 22, R / 22)
  const star = new Path2D('M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z')
  ctx.fill(star)
  ctx.restore()
}

function drawPlaceholder(ctx, x, y, w, h) {
  const grad = ctx.createLinearGradient(x, y, x + w, y + h)
  grad.addColorStop(0, '#bb5808')
  grad.addColorStop(1, TERRACOTTA)
  ctx.fillStyle = grad
  ctx.fillRect(x, y, w, h)
  ctx.globalAlpha = 0.9
  drawPathsMark(ctx, x + w / 2, y + h / 2, Math.min(w, h) * 0.16)
  ctx.globalAlpha = 1
}

async function ensureFontsReady() {
  await Promise.all([
    document.fonts.load('700 60px "Space Grotesk"'),
    document.fonts.load('800 44px "Space Grotesk"'),
    document.fonts.load('600 34px "Space Grotesk"'),
    document.fonts.load('italic 400 30px "Spectral"'),
  ])
  await document.fonts.ready
}

// craft: the full row from `crafts` (+ owner_name, joined in CraftPage.jsx already).
// Returns a PNG Blob.
export async function generateShareCard(craft, { likeCount = 0, shareUrl }) {
  await ensureFontsReady()

  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = HEIGHT
  const ctx = canvas.getContext('2d')

  ctx.fillStyle = CREAM_BG
  ctx.fillRect(0, 0, WIDTH, HEIGHT)

  const margin = 64
  const photoX = margin
  const photoY = margin
  const photoW = WIDTH - margin * 2
  const photoH = 650
  // Footer (divider + QR block + wordmark + credit line) gets a fixed zone off the bottom
  // rather than flowing with the content above it — keeps it from drifting if a title
  // wraps to 2 lines, and gives the content flow above a hard boundary to budget against
  // (see the story-line clamp below).
  const footerTop = HEIGHT - 300

  roundRectPath(ctx, photoX, photoY, photoW, photoH, 40)
  ctx.save()
  ctx.clip()
  const photoUrl = craft.photos && craft.photos.length > 0 ? craft.photos[0] : null
  if (photoUrl) {
    try {
      const img = await loadImage(photoUrl)
      drawImageCover(ctx, img, photoX, photoY, photoW, photoH)
    } catch {
      drawPlaceholder(ctx, photoX, photoY, photoW, photoH)
    }
  } else {
    drawPlaceholder(ctx, photoX, photoY, photoW, photoH)
  }
  ctx.restore()

  if (craft.image_source === 'ai_generated') {
    drawSparkleBadge(ctx, photoX + photoW - 60, photoY + 60, 34)
  }

  let cursorY = photoY + photoH + 60

  ctx.fillStyle = INK
  ctx.font = '700 60px "Space Grotesk", sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  const titleLines = wrapText(ctx, craft.title || 'Untitled craft', WIDTH - margin * 2, 2)
  for (const line of titleLines) {
    ctx.fillText(line, margin, cursorY)
    cursorY += 68
  }

  cursorY += 16
  ctx.font = '600 34px -apple-system, BlinkMacSystemFont, sans-serif'
  ctx.fillStyle = TERRACOTTA
  ctx.fillText(`By ${craft.owner_name || 'a PATHS maker'}`, margin, cursorY)

  cursorY += 48
  const metaParts = [craft.craft_type, craft.material]
    .filter(Boolean)
    .concat([`${likeCount} like${likeCount === 1 ? '' : 's'}`])
  ctx.font = '600 24px ui-monospace, "SF Mono", Menlo, monospace'
  ctx.fillStyle = INK_DIM
  ctx.fillText(metaParts.join('   ·   ').toUpperCase(), margin, cursorY)

  // Story gets whatever whole lines still fit above footerTop (2, 1, or skipped entirely)
  // rather than a fixed 2 — a 2-line title already used some of this page's fixed height,
  // and the footer's position doesn't move to make room.
  if (craft.story) {
    const storyLineHeight = 40
    const storyStart = cursorY + 54
    // Room for lines *after* the first (which always gets a fair try) — 10px covers the
    // first line's own descenders, 24px is the safety gap kept above the divider.
    const spareForExtraLines = footerTop - 24 - storyStart - 10
    const maxStoryLines = Math.min(2, Math.max(0, spareForExtraLines >= 0 ? 1 + Math.floor(spareForExtraLines / storyLineHeight) : 0))
    if (maxStoryLines > 0) {
      cursorY = storyStart
      ctx.font = 'italic 400 30px "Spectral", Georgia, serif'
      ctx.fillStyle = INK_DIM
      const storyLines = wrapText(ctx, `"${craft.story}"`, WIDTH - margin * 2, maxStoryLines)
      for (const line of storyLines) {
        ctx.fillText(line, margin, cursorY)
        cursorY += storyLineHeight
      }
    }
  }

  const dividerY = footerTop
  ctx.strokeStyle = LINE
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(margin, dividerY)
  ctx.lineTo(WIDTH - margin, dividerY)
  ctx.stroke()

  // QR code — terracotta modules on a white card (transparent QR background composited
  // over an explicit white rounded rect) for reliable scan contrast against the cream page.
  const qrSize = 160
  const qrX = margin
  const qrY = dividerY + 36
  roundRectPath(ctx, qrX - 16, qrY - 16, qrSize + 32, qrSize + 32, 20)
  ctx.fillStyle = '#ffffff'
  ctx.fill()
  const qrDataUrl = await QRCode.toDataURL(shareUrl, {
    margin: 0,
    width: qrSize,
    color: { dark: TERRACOTTA, light: '#0000' },
  })
  const qrImg = await new Promise((resolve, reject) => {
    const im = new Image()
    im.onload = () => resolve(im)
    im.onerror = reject
    im.src = qrDataUrl
  })
  ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize)

  ctx.font = '600 20px ui-monospace, "SF Mono", Menlo, monospace'
  ctx.fillStyle = INK_FAINT
  ctx.fillText('SCAN TO VIEW', qrX, qrY + qrSize + 38)
  ctx.fillText('IN 3D & AR', qrX, qrY + qrSize + 62)

  // PATHS wordmark, right-aligned, vertically centered against the QR block.
  const markR = 34
  const markCx = WIDTH - margin - 250
  const markCy = qrY + qrSize / 2 - 20
  drawPathsMark(ctx, markCx, markCy, markR)

  const wmX = markCx + markR + 22
  ctx.textAlign = 'left'
  ctx.font = '800 44px "Space Grotesk", sans-serif'
  ctx.fillStyle = TERRACOTTA
  ctx.fillText('P', wmX, markCy + 15)
  const pWidth = ctx.measureText('P').width
  ctx.fillStyle = INK
  ctx.fillText('ATHS', wmX + pWidth, markCy + 15)

  ctx.font = 'italic 400 21px "Spectral", Georgia, serif'
  ctx.fillStyle = INK_DIM
  ctx.fillText('Design Thinking', wmX, markCy + 46)
  ctx.fillText('by Thinking Design', wmX, markCy + 72)

  ctx.textAlign = 'center'
  ctx.font = '600 20px ui-monospace, "SF Mono", Menlo, monospace'
  ctx.fillStyle = INK_FAINT
  ctx.fillText('DEVELOPED BY FUTURE NEXUS LABS, CENTURION UNIVERSITY', WIDTH / 2, HEIGHT - 10)
  ctx.textAlign = 'left'

  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
}
