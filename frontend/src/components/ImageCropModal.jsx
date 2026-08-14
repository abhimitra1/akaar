import { useCallback, useEffect, useRef, useState } from 'react'
import './ImageCropModal.css'

const MIN_ZOOM = 1
const MAX_ZOOM = 3
const OUTPUT_QUALITY = 0.92
const MAX_OUTPUT_DIMENSION = 2000 // compressImage() downsizes further anyway (see imageCompression.js)

// Scale at which the image just covers a square frame (zoom=1), times the user's zoom.
function coverScale(naturalSize, frameSize, zoomLevel) {
  if (!naturalSize || !frameSize) return 0
  return (frameSize / Math.min(naturalSize.width, naturalSize.height)) * zoomLevel
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

// Shown right after a photo is picked (camera or gallery) — pan/zoom the photo behind a
// fixed square frame, same pattern as most mobile avatar croppers. Chosen over freeform
// resize handles because it's simplest to get right with touch + mouse via a single set
// of Pointer Events, and a square, centered frame is what single-image 3D reconstruction
// (InstantMesh) wants most: the craft centered with minimal background clutter.
export default function ImageCropModal({ file, onCancel, onCropped }) {
  const [imageUrl, setImageUrl] = useState(null)
  const [naturalSize, setNaturalSize] = useState(null) // { width, height }
  const [frameSize, setFrameSize] = useState(0)
  const [zoom, setZoom] = useState(MIN_ZOOM)
  const [offset, setOffset] = useState({ x: 0, y: 0 }) // image top-left, frame-relative px
  const [processing, setProcessing] = useState(false)

  const frameRef = useRef(null)
  const dragRef = useRef(null) // { pointerId, startX, startY, startOffset }

  // New file picked -> reset crop state and load it for display. `file` has already been
  // through normalizeHeic() (see CreatePage's handleFile) by the time it gets here, so it's
  // always a format every browser can put straight in an <img> — this modal doesn't need to
  // know anything about HEIC itself. The object URL is only for the on-screen preview; the
  // actual crop render below re-reads `file` directly so it can re-apply EXIF orientation
  // the same way imageCompression.js does.
  useEffect(() => {
    if (!file) {
      setImageUrl(null)
      setNaturalSize(null)
      return undefined
    }
    const url = URL.createObjectURL(file)
    setImageUrl(url)
    setZoom(MIN_ZOOM)
    setOffset({ x: 0, y: 0 })
    return () => URL.revokeObjectURL(url)
  }, [file])

  // Frame is a CSS-sized square, independent of the image having loaded — measure it as
  // soon as it's mounted, and again on resize, so all pan/zoom math below can work in
  // real on-screen pixels instead of a virtual unit.
  useEffect(() => {
    if (!imageUrl) return undefined
    const measure = () => setFrameSize(frameRef.current?.clientWidth || 0)
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [imageUrl])

  const clampOffset = useCallback(
    (next, zoomLevel = zoom) => {
      const scale = coverScale(naturalSize, frameSize, zoomLevel)
      if (!scale) return next
      const dw = naturalSize.width * scale
      const dh = naturalSize.height * scale
      return {
        x: clamp(next.x, frameSize - dw, 0),
        y: clamp(next.y, frameSize - dh, 0),
      }
    },
    [naturalSize, frameSize, zoom]
  )

  // Re-clamp (not recenter) whenever the frame's on-screen size changes after the image
  // has already loaded — e.g. a window resize mid-crop — so the pan the user set up stays
  // as close as possible instead of being reset.
  useEffect(() => {
    if (!naturalSize || !frameSize) return
    setOffset((prev) => clampOffset(prev))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameSize])

  const handleImageLoad = (e) => {
    const size = { width: e.target.naturalWidth, height: e.target.naturalHeight }
    setNaturalSize(size)
    const scale = coverScale(size, frameSize, MIN_ZOOM)
    setOffset(scale ? { x: (frameSize - size.width * scale) / 2, y: (frameSize - size.height * scale) / 2 } : { x: 0, y: 0 })
  }

  const handleZoomChange = (e) => {
    const nextZoom = Number(e.target.value)
    setZoom(nextZoom)
    setOffset((prev) => clampOffset(prev, nextZoom))
  }

  const handlePointerDown = (e) => {
    if (!naturalSize) return
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, startOffset: offset }
  }

  const handlePointerMove = (e) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== e.pointerId) return
    setOffset(
      clampOffset({
        x: drag.startOffset.x + (e.clientX - drag.startX),
        y: drag.startOffset.y + (e.clientY - drag.startY),
      })
    )
  }

  const handlePointerUp = (e) => {
    if (dragRef.current?.pointerId === e.pointerId) dragRef.current = null
  }

  useEffect(() => {
    if (!file) return undefined
    const handleKey = (e) => {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [file, onCancel])

  const handleConfirm = async () => {
    if (!naturalSize || !frameSize || processing) return
    setProcessing(true)
    try {
      const scale = coverScale(naturalSize, frameSize, zoom)
      const sourceSize = frameSize / scale
      const sourceX = clamp(-offset.x / scale, 0, naturalSize.width - sourceSize)
      const sourceY = clamp(-offset.y / scale, 0, naturalSize.height - sourceSize)

      // Same orientation fix imageCompression.js applies — the <img> preview above already
      // renders right-side-up (browsers honor EXIF there), but a raw canvas draw doesn't
      // unless asked, so without this a portrait photo could crop out sideways.
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
      const outSize = Math.min(Math.round(sourceSize), MAX_OUTPUT_DIMENSION)
      const canvas = document.createElement('canvas')
      canvas.width = outSize
      canvas.height = outSize
      canvas.getContext('2d').drawImage(bitmap, sourceX, sourceY, sourceSize, sourceSize, 0, 0, outSize, outSize)
      bitmap.close?.()

      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', OUTPUT_QUALITY))
      if (!blob) throw new Error('crop failed')
      const name = file.name.replace(/\.\w+$/, '') + '.jpg'
      onCropped(new File([blob], name, { type: 'image/jpeg' }))
    } catch {
      // Canvas/codec failure on this device — fall back to the untouched original rather
      // than trapping the user on a modal that can't proceed.
      onCropped(file)
    } finally {
      setProcessing(false)
    }
  }

  if (!file) return null

  const scale = coverScale(naturalSize, frameSize, zoom)

  return (
    <div className="image-crop__backdrop" onClick={onCancel}>
      <div
        className="image-crop__card"
        role="dialog"
        aria-modal="true"
        aria-label="Crop photo"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="image-crop__title">Crop Photo</h2>
        <p className="image-crop__hint">Drag to reposition, use the slider to zoom</p>

        <div className="image-crop__frame" ref={frameRef}>
          {imageUrl && (
            <img
              src={imageUrl}
              alt=""
              className="image-crop__image"
              draggable={false}
              onLoad={handleImageLoad}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              style={
                naturalSize
                  ? {
                      width: naturalSize.width * scale,
                      height: naturalSize.height * scale,
                      transform: `translate(${offset.x}px, ${offset.y}px)`,
                    }
                  : { opacity: 0 }
              }
            />
          )}
          <div className="image-crop__grid" aria-hidden="true">
            <span className="image-crop__grid-line image-crop__grid-line--v1" />
            <span className="image-crop__grid-line image-crop__grid-line--v2" />
            <span className="image-crop__grid-line image-crop__grid-line--h1" />
            <span className="image-crop__grid-line image-crop__grid-line--h2" />
          </div>
        </div>

        <input
          type="range"
          className="image-crop__zoom"
          min={MIN_ZOOM}
          max={MAX_ZOOM}
          step={0.01}
          value={zoom}
          onChange={handleZoomChange}
          disabled={!naturalSize}
          aria-label="Zoom"
        />

        <div className="image-crop__actions">
          <button
            type="button"
            className="image-crop__btn image-crop__btn--ghost"
            onClick={onCancel}
            disabled={processing}
          >
            Cancel
          </button>
          <button
            type="button"
            className="image-crop__btn image-crop__btn--primary"
            onClick={handleConfirm}
            disabled={!naturalSize || processing}
          >
            {processing ? 'Cropping…' : 'Use Photo'}
          </button>
        </div>
      </div>
    </div>
  )
}
