// Regenerates supabase/APPLY_ALL.sql from supabase/migrations/*.sql.
//
// The one-paste bootstrap must never drift from the migrations it claims to
// apply, so it is generated, not hand-edited. `npm run sql:bundle` rebuilds it;
// `npm run verify:integrations` fails if the checked-in copy is stale.
//
// Usage: npx tsx scripts/build-sql.mjs [--check]
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MIG_DIR = join(ROOT, 'supabase', 'migrations');
const OUT = join(ROOT, 'supabase', 'APPLY_ALL.sql');

// Discovered, never hand-listed: a new migration used to be silently omitted
// from the bootstrap bundle unless someone remembered to edit this array.
export const MIGRATIONS = readdirSync(MIG_DIR)
  .filter((f) => /^\d{4}_.+\.sql$/.test(f))
  .sort();

const DESCRIPTIONS = {
  '0001_velora_core.sql': '14 tables, RLS, realtime, triggers',
  '0002_business_registration_role_lock.sql': 'ownership columns + role-lock trigger',
  '0003_rls_tightening.sql': 'removes the permissive anon policies',
  '0004_booking_lifecycle.sql': 'pending status + service-only invoice writes',
  '0005_launch_security_and_booking.sql': 'tenant isolation + transactional bookings',
};

const headerFor = (files) => `-- ============================================================================
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
${files.map((f) => `--     ${f.padEnd(42)} ${DESCRIPTIONS[f] || ''}`.trimEnd()).join('\n')}
--   Order matters: the historical 0001 drops every policy in public. This
--   bundle aborts before DDL when public policies or relations already exist.
--   Do NOT rerun it on an existing or partially migrated project. Back up and
--   apply only the missing incremental migrations after reviewing their impact.
--   Running historical 0001 directly does NOT include the bootstrap guard.
--
-- GENERATED from the migration files by scripts/build-sql.mjs — edit the
-- migrations, not this file (verify:integrations fails if they drift).
-- ============================================================================

`;

// Keep historical migration bytes unchanged while preventing the generated
// fresh-project bootstrap from silently removing policies belonging to another
// app (or custom Velora policies). This intentionally refuses reruns.
const FRESH_PROJECT_GUARD = `do $velora_fresh_project_guard$
begin
  if exists (select 1 from pg_policies where schemaname = 'public') then
    raise exception 'APPLY_ALL.sql requires a fresh project without existing public RLS policies; back up and apply incremental migrations instead';
  end if;
  if exists (
    select 1 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f', 'S')
  ) then
    raise exception 'APPLY_ALL.sql requires a fresh project with an empty public schema; back up and apply incremental migrations instead';
  end if;
end
$velora_fresh_project_guard$;

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
  const parts = [headerFor(MIGRATIONS), FRESH_PROJECT_GUARD];
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
