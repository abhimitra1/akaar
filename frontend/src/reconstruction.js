import { supabase, STORAGE_BUCKET } from './supabaseClient.js'
import { submitJob, getJobStatus, downloadResult } from './instantMesh.js'
import { clearRecoveryPhoto } from './photoRecovery.js'

// Drives a craft's reconstruction job against the real InstantMesh API (see
// instantMesh.js), mirroring it into our own `jobs` row so ProcessingPage's polling
// stays unchanged. InstantMesh takes a single image — the craft's first photo.
// InstantMesh status -> our jobs.status: queued->queued, working->processing,
// done->completed, error->failed.
//
// InstantMesh reports no real progress or stages while 'working' — just one opaque state
// that can last seconds to a couple minutes. To avoid the UI sitting on one flat message
// the whole time, jobs.progress advances through a fixed schedule based on elapsed time
// since 'working' started; ProcessingPage maps those bands to stage labels (Understanding
// the craft / Cleaning the image / Imagining multiple views / Creating the 3D model). It's
// a simulated sequence, not real per-stage signal — deliberately capped below 100 so it
// never claims completion before InstantMesh's actual 'done' arrives.
const POLL_INTERVAL_MS = 3000
const WORKING_STAGES = [
  { afterMs: 0, progress: 15 },
  { afterMs: 8000, progress: 35 },
  { afterMs: 20000, progress: 60 },
  { afterMs: 35000, progress: 85 },
]

// Once submitJob's own 422 status flows through here (see instantMesh.js), the failed
// craft's row is deleted after this delay rather than left as a permanent Library entry —
// content-moderation policy is that flagged photos don't get to exist in the app at all,
// not even in a "Failed" state (see AGENTS.md AI Usage Policy / §5d). Delayed, not
// immediate: gives ProcessingPage's poll (every 2s) a real chance to read the 'failed'
// status + actual rejection reason at least once before the row disappears under it —
// otherwise the user just sees a generic "connection error", not why it actually failed.
const MODERATION_REJECTION_DELETE_DELAY_MS = 4000

export async function runReconstruction(jobId, craftId, ownerId, imageFile) {
  const setJob = (fields) => supabase.from('jobs').update(fields).eq('id', jobId)

  try {
    const meshJobId = await submitJob(imageFile)

    // Only now — after InstantMesh (and instantmesh-proxy's content moderation ahead of
    // it) has actually accepted the photo — is it safe to store it. A flagged photo never
    // reaches Storage or Library at all; see the catch block below for what happens on
    // rejection instead of this.
    const photoPath = `${ownerId}/${craftId}/photos/0_${imageFile.name}`
    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(photoPath, imageFile, { contentType: imageFile.type || 'application/octet-stream' })
    if (uploadError) throw uploadError
    const { data: pub } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(photoPath)
    const { error: photosError } = await supabase.from('crafts').update({ photos: [pub.publicUrl] }).eq('id', craftId)
    if (photosError) throw photosError

    let workingStartedAt = null

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const status = await getJobStatus(meshJobId)

      if (status.status === 'working') {
        if (workingStartedAt === null) workingStartedAt = Date.now()
        const elapsed = Date.now() - workingStartedAt
        const stage = [...WORKING_STAGES].reverse().find((s) => elapsed >= s.afterMs)
        await setJob({ status: 'processing', progress: stage.progress })
      } else if (status.status === 'done') {
        break
      } else if (status.status === 'error') {
        throw new Error(status.error || 'Reconstruction failed')
      }
      // status.status === 'queued': leave our job at queued/0, keep polling.

      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
    }

    // InstantMesh is done; download/upload/finalize is its own final stretch ("Finishing
    // touches" per ProcessingPage's stage bands) rather than sitting at 85%.
    await setJob({ status: 'processing', progress: 95 })

    const glbBlob = await downloadResult(meshJobId, 'glb')
    const modelPath = `${ownerId}/${craftId}/model.glb`
    const { error: modelUploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(modelPath, glbBlob, { contentType: 'model/gltf-binary', upsert: true })
    if (modelUploadError) throw modelUploadError

    const { error: craftError } = await supabase
      .from('crafts')
      .update({ model_key: modelPath })
      .eq('id', craftId)
    if (craftError) throw craftError

    clearRecoveryPhoto(craftId)
    await setJob({ status: 'completed', progress: 100, completed_at: new Date().toISOString() })
  } catch (err) {
    await setJob({ status: 'failed', error_message: err.message || String(err) })

    if (err.status === 422) {
      clearRecoveryPhoto(craftId)
      setTimeout(() => {
        supabase
          .from('crafts')
          .delete()
          .eq('id', craftId)
          .then(({ error }) => {
            if (error) console.error('Failed to auto-delete flagged craft:', error.message)
          })
      }, MODERATION_REJECTION_DELETE_DELAY_MS)
    }
  }
}
