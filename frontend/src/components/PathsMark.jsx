// The "Wheel Rings" mark: a potter's wheel seen from above — a clay core, a thrown ring of
// terracotta, and an outer dashed ring (the 3D scan traced around the object). Source:
// Claude Design project "PATHS logo directions" / PATHS Logo - Wheel Rings.dc.html — the
// stroke weights/dasharray here match that file's small-size ("Horizontal lockup") rendition,
// since every use in the app is at icon scale, not the large standalone-icon scale.
//
// Colors are fixed brand values, not theme tokens — a logo mark reproduces exact brand
// colors regardless of surrounding UI (same reasoning as favicon.svg / the downloadable
// assets in public/brand/, which use these same hex values).
const INK = '#2A241F'
const CREAM = '#F6EFE4'
const RING = '#C1662E'

export default function PathsMark({ variant = 'ink', size = 28, className }) {
  const strokeColor = variant === 'onDark' ? CREAM : INK
  return (
    <svg
      viewBox="8 8 84 84"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="50" cy="50" r="34" fill="none" stroke={strokeColor} strokeWidth="4" strokeDasharray="5 5" />
      <circle cx="50" cy="50" r="24" fill="none" stroke={RING} strokeWidth="10" />
      <circle cx="50" cy="50" r="9" fill={strokeColor} />
    </svg>
  )
}
