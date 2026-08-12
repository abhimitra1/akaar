// Creates a real login-capable user on a super admin's behalf — the one thing the admin
// panel (frontend/src/pages/AdminPage.jsx) can't do with the anon key alone, since
// `profiles.id` is a foreign key into `auth.users`, and auth.users is only writable
// through Supabase's Admin API, which requires the service-role key. That key must never
// reach the browser, so this function is the only place it's allowed to exist — it holds
// it as a server-side secret (SUPABASE_SERVICE_ROLE_KEY, set via `supabase secrets set`,
// never committed to this repo) and does nothing else with it beyond this one call.
//
// Deploy: supabase functions deploy admin-create-user
// Secret: supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<service_role key from the
//         Supabase dashboard's Project Settings -> API> — SUPABASE_URL is already
//         provided automatically to every Edge Function, no need to set it.
//
// Call from the frontend: supabase.functions.invoke('admin-create-user', { body: {...} })
// — supabase-js automatically forwards the caller's session JWT in the Authorization
// header, which is what getUser() below verifies.
//
// After auth.admin.createUser() inserts the new auth.users row, the existing
// handle_new_user() trigger (schema.sql) fires exactly as it does for a normal signup and
// creates the matching profiles row with role='visitor' — this function does not, and
// cannot, set role directly (see the note near admin.createUser below). Promote the new
// profile to 'artisan' afterward via the admin panel's own Edit button, same as any other
// profile — that path already goes through the caller's own JWT, not the service role, so
// guard_profile_privileges()'s is_super_admin(auth.uid()) check passes normally there.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: 'Server misconfigured: SUPABASE_SERVICE_ROLE_KEY not set' }, 500)
  }

  const authHeader = req.headers.get('Authorization') ?? ''
  const callerToken = authHeader.replace(/^Bearer\s+/i, '')
  if (!callerToken) return json({ error: 'Missing Authorization header' }, 401)

  // Service-role client: bypasses RLS entirely, used only for (a) resolving who's
  // calling and (b) the actual privileged writes below. Never constructed from anything
  // other than this function's own environment secret.
  const admin = createClient(supabaseUrl, serviceRoleKey)

  // Verifies the caller's JWT is genuine (not just decoded/trusted blindly) and pulls
  // their user id from it.
  const { data: callerUser, error: callerError } = await admin.auth.getUser(callerToken)
  if (callerError || !callerUser?.user) return json({ error: 'Invalid session' }, 401)

  const { data: callerProfile, error: profileError } = await admin
    .from('profiles')
    .select('is_super_admin')
    .eq('id', callerUser.user.id)
    .single()
  if (profileError || !callerProfile?.is_super_admin) {
    return json({ error: 'Only a super admin can create users' }, 403)
  }

  let payload: { email?: string; password?: string; full_name?: string; institution?: string; department?: string }
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const { email, password, full_name, institution, department } = payload
  if (!email || !password) return json({ error: 'email and password are required' }, 400)
  if (password.length < 6) return json({ error: 'Password must be at least 6 characters' }, 400)

  // NOT setting `role` here even though user_metadata could carry it — handle_new_user()
  // (schema.sql) ignores any role in metadata by design and always inserts 'visitor',
  // exactly like a normal signup. Keeping this function's only special privilege scoped to
  // "create the auth user" (the one thing that truly requires the service role) rather
  // than also reimplementing role assignment here, which already has a correct, narrower
  // path through the admin panel's own Edit button.
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: full_name || '', institution: institution || null, department: department || null },
  })
  if (createError) return json({ error: createError.message }, 400)

  return json({ id: created.user?.id, email: created.user?.email })
})
