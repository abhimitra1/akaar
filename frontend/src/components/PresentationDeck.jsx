import { useCallback, useEffect, useRef, useState } from 'react'
import './PresentationDeck.css'

const fullscreenSupported =
  typeof document !== 'undefined' && Boolean(document.fullscreenEnabled || document.webkitFullscreenEnabled)

function getFullscreenElement() {
  return document.fullscreenElement || document.webkitFullscreenElement || null
}

function requestFullscreen(el) {
  const fn = el.requestFullscreen || el.webkitRequestFullscreen
  fn?.call(el)
}

function exitFullscreen() {
  const fn = document.exitFullscreen || document.webkitExitFullscreen
  fn?.call(document)
}

function CardSlide({ slide }) {
  return (
    <div className="pdeck__slide">
      <p className="pdeck__eyebrow">{slide.eyebrow}</p>
      <h2 className="pdeck__title">{slide.title}</h2>
      {slide.intro && <p className="pdeck__intro">{slide.intro}</p>}
      <div className={`pdeck__cards pdeck__cards--cols-${slide.columns || 2}`}>
        {slide.cards.map((card) => (
          <div className="pdeck__card" key={card.title}>
            <h3>{card.title}</h3>
            <p>{card.desc}</p>
            {card.tag && <span className="pdeck__card-tag">{card.tag}</span>}
          </div>
        ))}
      </div>
      {slide.kind === 'table' && slide.table && (
        <div className="pdeck__table-wrap">
          <table className="pdeck__table">
            <caption>{slide.table.caption}</caption>
            <thead>
              <tr>
                {slide.table.headers.map((h, i) => (
                  <th key={i}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {slide.table.rows.map((row) => (
                <tr key={row[0]}>
                  {row.map((cell, i) => (
                    <td key={i}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {slide.note && <p className="pdeck__note">{slide.note}</p>}
    </div>
  )
}

function CoverSlide({ slide }) {
  return (
    <div className="pdeck__slide pdeck__slide--dark pdeck__slide--cover">
      <p className="pdeck__eyebrow pdeck__eyebrow--dark">{slide.eyebrow}</p>
      <h2 className="pdeck__cover-title">{slide.title}</h2>
      <p className="pdeck__cover-body">{slide.body}</p>
      {slide.flow && (
        <div className="pdeck__flow">
          {slide.flow.map((step, i) => (
            <div className="pdeck__flow-item" key={i}>
              <div className="pdeck__flow-step">
                <span className="pdeck__flow-label">{step.label}</span>
                <p>{step.desc}</p>
              </div>
              {i < slide.flow.length - 1 && (
                <span className="pdeck__flow-arrow" aria-hidden="true">
                  →
                </span>
              )}
            </div>
          ))}
        </div>
      )}
      {slide.footer && <p className="pdeck__cover-footer">{slide.footer}</p>}
      {slide.credit && <p className="pdeck__cover-credit">{slide.credit}</p>}
    </div>
  )
}

function TeamSlide({ slide }) {
  return (
    <div className="pdeck__slide pdeck__slide--dark">
      <p className="pdeck__eyebrow pdeck__eyebrow--dark">{slide.eyebrow}</p>
      <h2 className="pdeck__cover-title pdeck__cover-title--team">{slide.title}</h2>
      {slide.intro && <p className="pdeck__cover-body">{slide.intro}</p>}
      <ul className="pdeck__team">
        {slide.team.map((member) => (
          <li key={member.name}>
            <span className="pdeck__team-name">{member.name}</span>
            <span className="pdeck__team-role">{member.role}</span>
          </li>
        ))}
      </ul>
      {slide.credit && <p className="pdeck__cover-credit">{slide.credit}</p>}
    </div>
  )
}

// Full-screen slide viewer for the About page's "Presentation" section (see PresentationSlides
// data). Controlled component — AboutPage owns `open`. Renders its own dark theater chrome
// (top/bottom bars, progress line) around each slide; light slides ('cards'/'table') float as
// a bright card on that dark ground, while 'cover'/'team' slides sit flush against it, the way
// title/closing slides do in most presentation tools.
export default function PresentationDeck({ open, onClose, slides }) {
  const [index, setIndex] = useState(0)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const overlayRef = useRef(null)
  const touchStartX = useRef(null)

  useEffect(() => {
    if (open) setIndex(0)
  }, [open])

  const goTo = useCallback(
    (next) => {
      setIndex((i) => Math.min(Math.max(next, 0), slides.length - 1))
    },
    [slides.length],
  )

  const handleClose = useCallback(() => {
    if (getFullscreenElement()) exitFullscreen()
    onClose()
  }, [onClose])

  useEffect(() => {
    if (!open) return

    const handleKey = (e) => {
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') {
        e.preventDefault()
        goTo(index + 1)
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault()
        goTo(index - 1)
      } else if (e.key === 'Escape') {
        // Whether a fullscreen browser exits fullscreen before or after this handler runs is
        // inconsistent across engines, so don't try to special-case "just exited fullscreen" —
        // Escape always leaves the presentation entirely, same as Keynote/Slides. handleClose()
        // exits fullscreen too if it's still active.
        handleClose()
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, index, goTo, handleClose])

  useEffect(() => {
    if (!open) return
    const handleFullscreenChange = () => setIsFullscreen(Boolean(getFullscreenElement()))
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange)
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prevOverflow
    }
  }, [open])

  useEffect(() => {
    return () => {
      if (getFullscreenElement()) exitFullscreen()
    }
  }, [])

  if (!open) return null

  const slide = slides[index]
  const toggleFullscreen = () => {
    if (getFullscreenElement()) exitFullscreen()
    else requestFullscreen(overlayRef.current)
  }

  const handleTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX
  }
  const handleTouchEnd = (e) => {
    if (touchStartX.current === null) return
    const delta = e.changedTouches[0].clientX - touchStartX.current
    if (delta < -50) goTo(index + 1)
    else if (delta > 50) goTo(index - 1)
    touchStartX.current = null
  }

  return (
    <div
      className="pdeck__overlay"
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-label="PATHS concept presentation"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div className="pdeck__progress" style={{ width: `${((index + 1) / slides.length) * 100}%` }} />

      <div className="pdeck__topbar">
        <button type="button" className="pdeck__icon-btn" aria-label="Close presentation" onClick={handleClose}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
        <span className="pdeck__counter">
          {String(index + 1).padStart(2, '0')} / {String(slides.length).padStart(2, '0')}
        </span>
        {fullscreenSupported && (
          <button
            type="button"
            className="pdeck__icon-btn"
            aria-label={isFullscreen ? 'Exit full screen' : 'Enter full screen'}
            onClick={toggleFullscreen}
          >
            {isFullscreen ? (
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 4v4a1 1 0 0 1-1 1H4M20 9h-4a1 1 0 0 1-1-1V4M15 20v-4a1 1 0 0 1 1-1h4M4 15h4a1 1 0 0 1 1 1v4" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4" />
              </svg>
            )}
          </button>
        )}
      </div>

      <div className="pdeck__stage">
        {slide.kind === 'cover' && <CoverSlide slide={slide} />}
        {slide.kind === 'team' && <TeamSlide slide={slide} />}
        {(slide.kind === 'cards' || slide.kind === 'table') && <CardSlide slide={slide} />}
      </div>

      <div className="pdeck__bottombar">
        <button
          type="button"
          className="pdeck__nav-btn"
          onClick={() => goTo(index - 1)}
          disabled={index === 0}
          aria-label="Previous slide"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <div className="pdeck__dots">
          {slides.map((s, i) => (
            <button
              key={s.key}
              type="button"
              className={`pdeck__dot ${i === index ? 'pdeck__dot--active' : ''}`}
              aria-label={`Go to slide ${i + 1}`}
              aria-current={i === index}
              onClick={() => goTo(i)}
            />
          ))}
        </div>
        <button
          type="button"
          className="pdeck__nav-btn"
          onClick={() => goTo(index + 1)}
          disabled={index === slides.length - 1}
          aria-label="Next slide"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
      </div>
    </div>
  )
}
