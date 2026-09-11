// Regenerates supabase/APPLY_ALL.sql from supabase/migrations/*.sql.
//
// The one-paste bootstrap must never drift from the migrations it claims to
// apply, so it is generated, not hand-edited. `npm run sql:bundle` rebuilds it;
// `npm run verify:integrations` fails if the checked-in copy is stale.
//
// Usage: npx tsx scripts/build-sql.mjs [--check]
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MIG_DIR = join(ROOT, 'supabase', 'migrations');
const OUT = join(ROOT, 'supabase', 'APPLY_ALL.sql');

export const MIGRATIONS = [
  '0001_velora_core.sql',
  '0002_business_registration_role_lock.sql',
  '0003_rls_tightening.sql',
];

const HEADER = `-- ============================================================================
-- Velora AI OS — APPLY_ALL.sql
-- One-paste database bootstrap for a FRESH Supabase project.
--
-- HOW TO RUN
--   1. Supabase dashboard -> your project -> SQL Editor -> New query
--   2. Paste this ENTIRE file and press RUN
--   3. Expected result: "Success. No rows returned"
--   4. Then run supabase/PROMOTE_ADMIN.sql (change the email, press RUN)
--
-- WHAT IT DOES
--   Applies every migration in supabase/migrations/ in order:
--     0001_velora_core.sql                     14 tables, RLS, realtime, triggers
--     0002_business_registration_role_lock.sql ownership columns + role-lock trigger
--     0003_rls_tightening.sql                  removes the permissive anon policies
--   Order matters: 0001 drops and recreates every policy in public, so 0003
--   MUST run after it or the tightening is lost.
--
-- Idempotent: safe to re-run, and safe against a partially-migrated project.
-- GENERATED from the migration files by scripts/build-sql.mjs — edit the
-- migrations, not this file (verify:integrations fails if they drift).
-- ============================================================================

`;

const FOOTER = `
-- ============================================================================
-- Post-apply sanity check (read-only). Should return 14 tables.
-- ============================================================================
select count(*) as velora_tables
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'profiles','businesses','business_services','business_staff','bookings',
    'booking_meta','booking_history','reminders','notifications','recently_viewed',
    'email_log','audit_logs','idempotency_keys','invoices'
  );
`;

export function renderApplyAll() {
  const parts = [HEADER];
  for (const file of MIGRATIONS) {
    const body = readFileSync(join(MIG_DIR, file), 'utf8').trimEnd();
    parts.push(`-- ============================================================================\n-- >>> ${file}\n-- ============================================================================\n\n${body}\n\n`);
  }
  parts.push(FOOTER);
  return parts.join('');
}

const rendered = renderApplyAll();

if (process.argv.includes('--check')) {
  let current = '';
  try { current = readFileSync(OUT, 'utf8'); } catch { current = ''; }
  if (current !== rendered) {
    console.error('supabase/APPLY_ALL.sql is stale — run `npm run sql:bundle` and commit the result.');
    process.exit(1);
  }
  console.log('supabase/APPLY_ALL.sql is in sync with supabase/migrations/');
} else {
  writeFileSync(OUT, rendered);
  console.log(`Wrote ${OUT} (${rendered.length} bytes, ${MIGRATIONS.length} migrations)`);
}
