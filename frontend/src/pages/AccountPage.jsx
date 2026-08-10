import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient.js'
import { useAuth } from '../context/AuthContext.jsx'
import AppNav from '../components/AppNav.jsx'
import PasswordField from '../components/PasswordField.jsx'
import '../pages/Home.css'
import '../pages/Create.css'
import './Account.css'

// Account Center (AGENTS.md §3 Phase 6, logged in only): profile view/edit + change
// password + sign out. Avatar upload, active sessions, 2FA, notification prefs, and
// delete-account are phase 2 / need an admin API this backendless app doesn't have
// (§9) — not built.
export default function AccountPage() {
  const navigate = useNavigate()
  const { user, logout } = useAuth()

  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({
    full_name: user?.full_name || '',
    institution: user?.institution || '',
    department: user?.department || '',
  })
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileError, setProfileError] = useState('')
  const [profileSaved, setProfileSaved] = useState(false)

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)
  const [passwordError, setPasswordError] = useState('')
  const [passwordSaved, setPasswordSaved] = useState(false)

  const handleChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }))

  const handleSaveProfile = async () => {
    setProfileError('')
    setProfileSaved(false)
    setSavingProfile(true)
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: form.full_name.trim(),
          institution: form.institution || null,
          department: form.department || null,
        })
        .eq('id', user.id)
      if (error) throw new Error(error.message)
      setProfileSaved(true)
      setEditing(false)
    } catch (err) {
      setProfileError(err.message || 'Failed to save profile')
    } finally {
      setSavingProfile(false)
    }
  }

  const handleChangePassword = async () => {
    setPasswordError('')
    setPasswordSaved(false)
    if (newPassword.length < 6) {
      setPasswordError('Password must be at least 6 characters')
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match')
      return
    }
    setChangingPassword(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw new Error(error.message)
      setPasswordSaved(true)
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      setPasswordError(err.message || 'Failed to change password')
    } finally {
      setChangingPassword(false)
    }
  }

  const handleSignOut = async () => {
    await logout()
    navigate('/welcome')
  }

  if (!user) return null

  return (
    <div className="home">
      <AppNav active="account" />

      <section className="home__content">
        <h1 className="home__title">Profile</h1>

        <div className="account__card">
          <div className="account__avatar">{(user.full_name || user.email || '?')[0].toUpperCase()}</div>

          {!editing ? (
            <>
              <div className="account__row">
                <span className="account__label">Name</span>
                <span className="account__value">{user.full_name || '—'}</span>
              </div>
              <div className="account__row">
                <span className="account__label">Email</span>
                <span className="account__value">{user.email}</span>
              </div>
              <div className="account__row">
                <span className="account__label">Role</span>
                <span className="account__value account__value--badge">{user.role || 'visitor'}</span>
              </div>
              <div className="account__row">
                <span className="account__label">Institution</span>
                <span className="account__value">{user.institution || '—'}</span>
              </div>
              <div className="account__row">
                <span className="account__label">Department</span>
                <span className="account__value">{user.department || '—'}</span>
              </div>
              {user.created_at && (
                <div className="account__row">
                  <span className="account__label">Joined</span>
                  <span className="account__value">{new Date(user.created_at).toLocaleDateString()}</span>
                </div>
              )}

              {profileSaved && <p className="account__success">Profile updated.</p>}

              <button type="button" className="create__submit account__btn" onClick={() => setEditing(true)}>
                Edit profile
              </button>
            </>
          ) : (
            <>
              {profileError && <div className="create__error" role="alert">{profileError}</div>}

              <label className="field">
                <span className="field__label">Full name</span>
                <input name="full_name" value={form.full_name} onChange={handleChange} />
              </label>
              <label className="field">
                <span className="field__label">Institution</span>
                <input name="institution" value={form.institution} onChange={handleChange} />
              </label>
              <label className="field">
                <span className="field__label">Department</span>
                <input name="department" value={form.department} onChange={handleChange} />
              </label>

              <div className="account__edit-actions">
                <button
                  type="button"
                  className="create__submit account__btn"
                  disabled={savingProfile}
                  onClick={handleSaveProfile}
                >
                  {savingProfile ? 'Saving…' : 'Save'}
                </button>
                <button
                  type="button"
                  className="craft__btn craft__btn--ghost account__btn"
                  onClick={() => setEditing(false)}
                >
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>

        <div className="account__card">
          <h2 className="account__section-title">Change password</h2>
          {passwordError && <div className="create__error" role="alert">{passwordError}</div>}
          {passwordSaved && <p className="account__success">Password changed.</p>}

          <PasswordField
            label="New password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
          />
          <PasswordField
            label="Confirm new password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
          />

          <button
            type="button"
            className="create__submit account__btn"
            disabled={changingPassword}
            onClick={handleChangePassword}
          >
            {changingPassword ? 'Changing…' : 'Change password'}
          </button>
        </div>

        <Link to="/about" className="craft__btn craft__btn--ghost account__btn">
          About PATHS
        </Link>

        <Link to="/policy" className="craft__btn craft__btn--ghost account__btn">
          Privacy &amp; AI Policy
        </Link>

        <Link to="/terms" className="craft__btn craft__btn--ghost account__btn">
          Terms &amp; Conditions
        </Link>

        <button type="button" className="craft__btn craft__btn--ghost account__btn account__signout" onClick={handleSignOut}>
          Sign out
        </button>
      </section>
    </div>
  )
}
