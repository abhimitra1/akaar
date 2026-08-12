import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, STORAGE_BUCKET } from '../supabaseClient.js'
import { useAuth } from '../context/AuthContext.jsx'
import AppNav from '../components/AppNav.jsx'
import AiGeneratedBadge from '../components/AiGeneratedBadge.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import LoadingScreen from '../components/LoadingScreen.jsx'
import '../pages/Home.css'
import './Library.css'

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'processing', label: 'Processing' },
  { key: 'completed', label: 'Completed' },
  { key: 'failed', label: 'Failed' },
  { key: 'published', label: 'Published' },
]

// crafts.photos stores full public URLs (getPublicUrl output), but Storage's remove()
// wants bucket-relative paths — recover the path from the URL rather than reconstructing
// it (keeps this working even if the upload path shape ever changes).
function storagePathFromPublicUrl(url) {
  const marker = `/object/public/${STORAGE_BUCKET}/`
  const idx = url.indexOf(marker)
  return idx === -1 ? null : url.slice(idx + marker.length)
}

function statusOf(craft, latestJobByCraft) {
  return latestJobByCraft[craft.id]?.status || null
}

function StatusBadge({ craft, latestJobByCraft }) {
  const status = statusOf(craft, latestJobByCraft)
  if (craft.is_public) return <span className="library__badge library__badge--published">Published</span>
  if (status === 'completed') return <span className="library__badge library__badge--completed">Completed</span>
  if (status === 'failed') return <span className="library__badge library__badge--failed">Failed</span>
  if (status === 'queued' || status === 'processing') {
    return <span className="library__badge library__badge--processing">Processing</span>
  }
  return null
}

// My Library (AGENTS.md §3 Phase 5, logged in only): tabs All/Processing/Completed/
// Failed/Published. Pull-to-refresh, infinite scroll, long-press menu are phase 2 (§9).
export default function LibraryPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [crafts, setCrafts] = useState([])
  const [latestJobByCraft, setLatestJobByCraft] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState('all')
  const [deletingId, setDeletingId] = useState(null)
  const [pendingDelete, setPendingDelete] = useState(null) // craft awaiting confirm, or null

  useEffect(() => {
    if (!user) return
    const load = async () => {
      try {
        const { data: ownCrafts, error: craftsError } = await supabase
          .from('crafts')
          .select('*')
          .eq('owner_id', user.id)
          .order('created_at', { ascending: false })
        if (craftsError) throw new Error(craftsError.message)
        setCrafts(ownCrafts)

        const craftIds = ownCrafts.map((c) => c.id)
        if (craftIds.length > 0) {
          const { data: jobs } = await supabase
            .from('jobs')
            .select('*')
            .in('craft_id', craftIds)
            .order('created_at', { ascending: false })
          if (jobs) {
            const latest = {}
            for (const job of jobs) {
              if (!(job.craft_id in latest)) latest[job.craft_id] = job
            }
            setLatestJobByCraft(latest)
          }
        }
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [user])

  const getCraftThumbnail = (craft) =>
    craft.photos && craft.photos.length > 0 ? craft.photos[0] : null

  const visibleCrafts = crafts.filter((craft) => {
    const status = statusOf(craft, latestJobByCraft)
    switch (activeTab) {
      case 'processing':
        return status === 'queued' || status === 'processing'
      case 'completed':
        return status === 'completed'
      case 'failed':
        return status === 'failed'
      case 'published':
        return craft.is_public === true
      default:
        return true
    }
  })

  const handleDeleteClick = (e, craft) => {
    e.stopPropagation()
    if (deletingId) return
    setPendingDelete(craft)
  }

  // Storage cleanup (photos + model.glb) is best-effort — logged, not fatal, since the
  // craft row disappearing from Library is the part the user actually asked for; a leaked
  // Storage object with no DB row pointing at it isn't visible or reachable to anyone.
  const handleConfirmDelete = async () => {
    const craft = pendingDelete
    setPendingDelete(null)
    if (!craft) return

    setDeletingId(craft.id)
    setError('')
    try {
      const photoPaths = (craft.photos || []).map(storagePathFromPublicUrl).filter(Boolean)
      const paths = craft.model_key ? [...photoPaths, craft.model_key] : photoPaths
      if (paths.length > 0) {
        const { error: storageError } = await supabase.storage.from(STORAGE_BUCKET).remove(paths)
        if (storageError) console.error('Failed to remove storage files:', storageError.message)
      }

      const { error: deleteError } = await supabase.from('crafts').delete().eq('id', craft.id)
      if (deleteError) throw new Error(deleteError.message)

      setCrafts((prev) => prev.filter((c) => c.id !== craft.id))
    } catch (err) {
      setError(err.message || 'Failed to delete')
    } finally {
      setDeletingId(null)
    }
  }

  const handleOpen = (craft) => {
    const job = latestJobByCraft[craft.id]
    if (job && (job.status === 'queued' || job.status === 'processing')) {
      navigate(`/processing/${job.id}`)
    } else {
      navigate(`/craft/${craft.id}`)
    }
  }

  return (
    <div className="home">
      <AppNav active="library" />

      <section className="home__content">
        <h1 className="home__title">My Library</h1>

        {loading ? (
          <LoadingScreen message="Loading your library..." inline />
        ) : (
          <>
            {error && <p className="explore__error">{error}</p>}

            <div className="home__filters">
              <div className="home__filter-row">
                {TABS.map((tab) => (
                  <button
                    key={tab.key}
                    className={`home__chip ${activeTab === tab.key ? 'home__chip--active' : ''}`}
                    onClick={() => setActiveTab(tab.key)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {visibleCrafts.length > 0 ? (
              <div className="home__recent-list">
                {visibleCrafts.map((craft) => (
                  <article key={craft.id} className="home__recent-row" onClick={() => handleOpen(craft)}>
                    <div className="home__recent-thumbnail-wrapper">
                      {getCraftThumbnail(craft) ? (
                        <img src={getCraftThumbnail(craft)} alt={craft.title || 'Untitled'} className="home__recent-thumbnail" loading="lazy" />
                      ) : (
                        <div className="home__recent-placeholder" />
                      )}
                      {craft.image_source === 'ai_generated' && <AiGeneratedBadge />}
                    </div>
                    <div className="home__recent-body">
                      <h3 className="home__recent-title">{craft.title || 'Untitled'}</h3>
                      <p className="home__recent-subtitle">
                        {craft.craft_type || 'Craft'} · {new Date(craft.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <StatusBadge craft={craft} latestJobByCraft={latestJobByCraft} />
                    <button
                      type="button"
                      className="library__edit"
                      aria-label="Edit details"
                      onClick={(e) => {
                        e.stopPropagation()
                        navigate(`/craft/${craft.id}/metadata`)
                      }}
                    >
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      className="library__delete"
                      aria-label="Delete"
                      disabled={deletingId === craft.id}
                      onClick={(e) => handleDeleteClick(e, craft)}
                    >
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        <line x1="10" y1="11" x2="10" y2="17" />
                        <line x1="14" y1="11" x2="14" y2="17" />
                      </svg>
                    </button>
                  </article>
                ))}
              </div>
            ) : (
              <div className="home__empty-state">
                <p className="home__empty-title">No models here yet.</p>
                <p className="home__empty-sub">Create your first digital twin!</p>
              </div>
            )}
          </>
        )}
      </section>

      <ConfirmDialog
        open={pendingDelete !== null}
        title={`Delete "${pendingDelete?.title || 'Untitled'}"?`}
        message="This permanently removes its photo, 3D model, and all details. This can't be undone."
        confirmLabel="Delete"
        danger
        onConfirm={handleConfirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  )
}
