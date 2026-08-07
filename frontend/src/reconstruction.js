import { supabase, STORAGE_BUCKET } from './supabaseClient.js'
import { submitJob, getJobStatus, downloadResult } from './instantMesh.js'

// Drives a craft's reconstruction job against the real InstantMesh API (see
// instantMesh.js), mirroring it into our own `jobs` row so ProcessingPage's polling
// stays unchanged. InstantMesh takes a single image — the craft's first photo.
// InstantMesh status -> our jobs.status: queued->queued, working->processing,
// done->completed, error->failed. InstantMesh has no numeric progress; 0/50/100 stand
// in for queued/working/done.
const POLL_INTERVAL_MS = 3000

export async function runReconstruction(jobId, craftId, ownerId, imageFile) {
  const setJob = (fields) => supabase.from('jobs').update(fields).eq('id', jobId)

  try {
    const meshJobId = await submitJob(imageFile)

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const status = await getJobStatus(meshJobId)

      if (status.status === 'working') {
        await setJob({ status: 'processing', progress: 50 })
      } else if (status.status === 'done') {
        break
      } else if (status.status === 'error') {
        throw new Error(status.error || 'Reconstruction failed')
      }
      // status.status === 'queued': leave our job at queued/0, keep polling.

      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
    }

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
