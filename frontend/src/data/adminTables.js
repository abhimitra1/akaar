import { supabase } from '../supabaseClient.js'

// Column configs driving components/AdminTable.jsx — one entry per public.* table exposed
// in AdminPage.jsx. Kept as data (not JSX) so the same shape describes both the read-only
// list columns and the create/edit form fields. Field `type` values AdminTable
// understands: 'readonly' | 'text' | 'password' | 'textarea' | 'number' | 'boolean' |
// 'select' | 'json'. Two extra per-field flags: `createOnly` (only shown/sent on create,
// e.g. a password with no matching column) and `hideOnCreate` (opposite — only shown/sent
// once the row already exists). See supabase/schema.sql for the tables these mirror.

export const ADMIN_TABLES = [
  {
    key: 'profiles',
    label: 'Profiles',
    table: 'profiles',
    primaryKey: 'id',
    orderBy: { column: 'created_at', ascending: false },
    allowInsert: true,
    // profiles.id is a foreign key into auth.users, which the anon/authenticated API
    // can't insert into directly — creating a real login-capable user needs the Admin
    // API, which needs the service-role key, which can only live server-side. This calls
    // the admin-create-user Edge Function (supabase/functions/admin-create-user) instead
    // of a plain table insert; that function verifies the caller is a super admin itself
    // (never trust the client-side route guard alone for something this privileged),
    // creates the auth.users row, and lets the existing handle_new_user() trigger create
    // the profiles row exactly as it would for a normal signup (role always starts
    // 'customer' — promote via this table's own Edit afterward, same as any other profile).
    customCreate: async (payload) => {
      const { error } = await supabase.functions.invoke('admin-create-user', { body: payload })
      if (error) throw new Error(error.message || 'Failed to create user')
    },
    listColumns: ['email', 'full_name', 'role', 'artisan_requested_at', 'is_super_admin', 'created_at'],
    fields: [
      { key: 'id', label: 'ID', type: 'readonly' },
      { key: 'email', label: 'Email', type: 'text' },
      { key: 'password', label: 'Password', type: 'password', createOnly: true },
      { key: 'full_name', label: 'Full name', type: 'text' },
      {
        key: 'role',
        label: 'Role',
        type: 'select',
        // The studio role hierarchy (see supabase/migrations/010_role_hierarchy.sql and
        // frontend/src/roles.js) — a super admin can set any of these directly here;
        // studio_admin/studio_manager normally do this instead via /studio/team, which is
        // scoped to only the roles their own can_assign_role() authority covers. Not
        // settable at creation (hideOnCreate) — a brand new user always starts 'customer'
        // via handle_new_user(), same as a normal signup; promote afterward via Edit.
        options: ['customer', 'artisan', 'designer', 'studio_manager', 'studio_admin'],
        optionLabels: {
          customer: 'Customer',
          artisan: 'Artisan',
          designer: 'Designer',
          studio_manager: 'Studio Manager',
          studio_admin: 'Studio Admin',
        },
        hideOnCreate: true,
      },
      {
        key: 'artisan_requested_at',
        label: 'Artisan requested',
        type: 'readonly',
      },
      { key: 'institution', label: 'Institution', type: 'text' },
      { key: 'department', label: 'Department', type: 'text' },
      { key: 'email_verified', label: 'Email verified', type: 'boolean', hideOnCreate: true },
      { key: 'unlimited_creations', label: 'Unlimited creations', type: 'boolean', hideOnCreate: true },
      { key: 'is_super_admin', label: 'Super admin', type: 'boolean', hideOnCreate: true },
      { key: 'terms_accepted_at', label: 'Terms accepted at', type: 'readonly' },
      { key: 'created_at', label: 'Created at', type: 'readonly' },
    ],
  },
  {
    key: 'crafts',
    label: 'Crafts',
    table: 'crafts',
    primaryKey: 'id',
    orderBy: { column: 'created_at', ascending: false },
    allowInsert: true,
    listColumns: ['title', 'craft_type', 'owner_id', 'is_public', 'image_source', 'created_at'],
    fields: [
      { key: 'id', label: 'ID', type: 'readonly' },
      {
        key: 'owner_id',
        label: 'Owner',
        type: 'text',
        lookup: { table: 'public_profiles', labelColumn: 'full_name' },
      },
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'craft_type', label: 'Craft type', type: 'text' },
      { key: 'material', label: 'Material', type: 'text' },
      { key: 'technique', label: 'Technique', type: 'text' },
      { key: 'story', label: 'Story', type: 'textarea' },
      { key: 'dimensions', label: 'Dimensions', type: 'text' },
      { key: 'weight', label: 'Weight', type: 'number' },
      { key: 'height_cm', label: 'Height (cm)', type: 'number' },
      { key: 'location', label: 'Location', type: 'text' },
      { key: 'year', label: 'Year', type: 'number' },
      { key: 'commercial_status', label: 'Commercial status', type: 'text' },
      { key: 'license', label: 'License', type: 'text' },
      { key: 'is_public', label: 'Public', type: 'boolean' },
      {
        key: 'image_source',
        label: 'Image source',
        type: 'select',
        options: ['original', 'ai_generated'],
        optionLabels: { original: 'Original', ai_generated: 'AI Generated' },
      },
      { key: 'photos', label: 'Photos (JSON array of URLs)', type: 'json' },
      { key: 'model_key', label: 'Model key', type: 'text' },
      { key: 'keywords', label: 'Keywords (JSON array)', type: 'json' },
      { key: 'version_history', label: 'Version history (JSON)', type: 'json' },
      { key: 'related_designs', label: 'Related designs (JSON)', type: 'json' },
      { key: 'parent_design_id', label: 'Parent design ID', type: 'number' },
      { key: 'est_build_time', label: 'Est. build time', type: 'text' },
      { key: 'created_at', label: 'Created at', type: 'readonly' },
      { key: 'updated_at', label: 'Updated at', type: 'readonly' },
    ],
  },
  {
    key: 'jobs',
    label: 'Jobs',
    table: 'jobs',
    primaryKey: 'id',
    orderBy: { column: 'created_at', ascending: false },
    allowInsert: true,
    listColumns: ['craft_id', 'job_type', 'status', 'progress', 'error_message', 'created_at'],
    fields: [
      { key: 'id', label: 'ID', type: 'readonly' },
      {
        key: 'craft_id',
        label: 'Craft',
        type: 'number',
        lookup: { table: 'crafts', labelColumn: 'title' },
      },
      {
        key: 'job_type',
        label: 'Job type',
        type: 'select',
        options: ['image_gen', '3d_gen'],
        optionLabels: { image_gen: 'Image Gen', '3d_gen': '3D Gen' },
      },
      {
        key: 'status',
        label: 'Status',
        type: 'select',
        options: ['queued', 'processing', 'completed', 'failed'],
      },
      { key: 'progress', label: 'Progress (0-100)', type: 'number' },
      { key: 'error_message', label: 'Error message', type: 'textarea' },
      { key: 'created_at', label: 'Created at', type: 'readonly' },
      { key: 'completed_at', label: 'Completed at', type: 'text' },
    ],
  },
  {
    key: 'likes',
    label: 'Likes',
    table: 'likes',
    primaryKey: 'id',
    orderBy: { column: 'created_at', ascending: false },
    allowInsert: true,
    listColumns: ['craft_id', 'user_id', 'created_at'],
    fields: [
      { key: 'id', label: 'ID', type: 'readonly' },
      {
        key: 'craft_id',
        label: 'Craft',
        type: 'number',
        lookup: { table: 'crafts', labelColumn: 'title' },
      },
      {
        key: 'user_id',
        label: 'User',
        type: 'text',
        lookup: { table: 'public_profiles', labelColumn: 'full_name' },
      },
      { key: 'created_at', label: 'Created at', type: 'readonly' },
    ],
  },
  {
    key: 'orders',
    label: 'Orders',
    table: 'orders',
    primaryKey: 'id',
    orderBy: { column: 'created_at', ascending: false },
    // No allowInsert — an order is only ever created via CraftPage's "Submit for
    // Production" (guard_order_insert() requires the inserting owner to actually own the
    // craft with a finished 3D model). Super admins can still edit/delete existing rows
    // below; they just can't fabricate a new one that would pass the same trigger a real
    // customer submission does.
    listColumns: ['craft_id', 'customer_id', 'status', 'assigned_designer_id', 'payment_status', 'created_at'],
    fields: [
      { key: 'id', label: 'ID', type: 'readonly' },
      {
        key: 'craft_id',
        label: 'Craft',
        type: 'number',
        lookup: { table: 'crafts', labelColumn: 'title' },
      },
      {
        key: 'customer_id',
        label: 'Customer',
        type: 'text',
        lookup: { table: 'public_profiles', labelColumn: 'full_name' },
      },
      {
        key: 'artisan_id',
        label: 'Artisan',
        type: 'text',
        lookup: { table: 'public_profiles', labelColumn: 'full_name' },
      },
      {
        key: 'assigned_designer_id',
        label: 'Assigned designer',
        type: 'text',
        lookup: { table: 'public_profiles', labelColumn: 'full_name' },
      },
      {
        key: 'status',
        label: 'Status',
        type: 'select',
        options: [
          'pending_manager_review',
          'changes_requested',
          'pending_customer_approval',
          'ratified',
          'in_production',
          'completed',
          'rejected',
          'cancelled',
        ],
      },
      { key: 'price', label: 'Price', type: 'number' },
      { key: 'currency', label: 'Currency', type: 'text' },
      { key: 'payment_status', label: 'Payment status', type: 'text' },
      { key: 'created_at', label: 'Created at', type: 'readonly' },
      { key: 'updated_at', label: 'Updated at', type: 'readonly' },
      { key: 'ratified_at', label: 'Ratified at', type: 'readonly' },
    ],
  },
  {
    key: 'order_reviews',
    label: 'Order Reviews',
    table: 'order_reviews',
    primaryKey: 'id',
    orderBy: { column: 'created_at', ascending: false },
    // Append-only audit trail — written by ManagerReviewPage.jsx, never through here.
    listColumns: ['order_id', 'reviewer_id', 'decision', 'created_at'],
    fields: [
      { key: 'id', label: 'ID', type: 'readonly' },
      {
        key: 'order_id',
        label: 'Order',
        type: 'number',
        lookup: { table: 'orders', labelColumn: 'id' },
      },
      {
        key: 'reviewer_id',
        label: 'Reviewer',
        type: 'text',
        lookup: { table: 'public_profiles', labelColumn: 'full_name' },
      },
      { key: 'decision', label: 'Decision', type: 'select', options: ['changes_requested', 'approved', 'rejected'] },
      { key: 'remarks', label: 'Remarks', type: 'textarea' },
      { key: 'constraint_flags', label: 'Constraint flags (JSON)', type: 'json' },
      { key: 'created_at', label: 'Created at', type: 'readonly' },
    ],
  },
]
