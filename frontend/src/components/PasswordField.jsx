import { useState } from 'react'
import './PasswordField.css'

// Drop-in replacement for the `<label className="field">…<input type="password">…</label>`
// pattern, used identically across SignInPage/SignUpPage/AccountPage (2x) — a show/hide
// toggle is expected on every password field, not just one screen, so this is a shared
// component rather than four copies of the same eye-icon button. All input props
// (name/value/onChange/autoComplete/required/...) pass straight through.
export default function PasswordField({ label, ...inputProps }) {
  const [visible, setVisible] = useState(false)

  return (
    <label className="field">
      <span className="field__label">{label}</span>
      <div className="password-field__wrap">
        <input type={visible ? 'text' : 'password'} {...inputProps} />
        <button
          type="button"
          className="password-field__toggle"
          aria-label={visible ? 'Hide password' : 'Show password'}
          // Keep focus/tab order on the actual form fields — this is a visibility toggle,
          // not a field to tab through.
          tabIndex={-1}
          onClick={() => setVisible((v) => !v)}
        >
          {visible ? (
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a18.42 18.42 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
              <line x1="1" y1="1" x2="23" y2="23" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          )}
        </button>
      </div>
    </label>
  )
}
