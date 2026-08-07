import { supabase, STORAGE_BUCKET } from './supabaseClient.js'
import { submitJob, getJobStatus, downloadResult } from './instantMesh.js'

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

export async function runReconstruction(jobId, craftId, ownerId, imageFile) {
  const setJob = (fields) => supabase.from('jobs').update(fields).eq('id', jobId)

  try {
    const meshJobId = await submitJob(imageFile)
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
    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(modelPath, glbBlob, { contentType: 'model/gltf-binary', upsert: true })
    if (uploadError) throw uploadError

    const { error: craftError } = await supabase
      .from('crafts')
      .update({ model_key: modelPath })
      .eq('id', craftId)
    if (craftError) throw craftError

    await setJob({ status: 'completed', progress: 100, completed_at: new Date().toISOString() })
  } catch (err) {
    await setJob({ status: 'failed', error_message: err.message || String(err) })
  }
}
