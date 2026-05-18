#!/usr/bin/env node
// Pretty-printed gist snapshot to tracker/backups/<user>-state.json.
// Run on every code push (assistant convention) AND once daily via the
// .github/workflows/backup-state.yml cron. Git history then provides
// per-day snapshots without any per-day file proliferation.
//
// Usage: node backup-state.mjs           # both users
//        node backup-state.mjs lg eg     # specific users

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const WORKER = 'https://19ff6f4d-3d5b-40e6-88e2-573f647f903f.orangejuice9137.workers.dev';
const DEFAULT_USERS = ['lg', 'eg'];

const __dirname = dirname(fileURLToPath(import.meta.url));
const BACKUP_DIR = resolve(__dirname, 'backups');

async function fetchState(user) {
  const r = await fetch(`${WORKER}/state?user=${encodeURIComponent(user)}`);
  if (!r.ok) throw new Error(`state ${user}: HTTP ${r.status}`);
  const gist = await r.json();
  const file = gist.files && gist.files['tracker-state.json'];
  if (!file || typeof file.content !== 'string') {
    throw new Error(`state ${user}: missing tracker-state.json file in gist response`);
  }
  // The gist file content is itself a JSON string {state, _savedAt}.
  // Parse, then re-serialize pretty so a human (and git diff) can read it.
  const parsed = JSON.parse(file.content);
  return parsed;
}

function saveBackup(user, parsed) {
  // Stable key order in the days bucket helps git diffs stay clean across
  // ops that touch arbitrary days in arbitrary order. Top-level keys we
  // leave in their natural order (small and stable already).
  if (parsed.state && parsed.state.days && typeof parsed.state.days === 'object') {
    const sorted = {};
    for (const k of Object.keys(parsed.state.days).sort()) {
      sorted[k] = parsed.state.days[k];
    }
    parsed.state.days = sorted;
  }
  if (parsed.state && parsed.state.userCatalog && parsed.state.userCatalog.items) {
    const items = parsed.state.userCatalog.items;
    const sorted = {};
    for (const k of Object.keys(items).sort()) {
      sorted[k] = items[k];
    }
    parsed.state.userCatalog.items = sorted;
  }
  // Mark the snapshot timestamp at the top — separate from the gist's own
  // _savedAt so we can see when the backup was taken vs when the gist was
  // last written.
  const wrapper = {
    _backupTakenAt: new Date().toISOString(),
    _gistSavedAt: parsed._savedAt || null,
    user,
    state: parsed.state,
  };
  const json = JSON.stringify(wrapper, null, 2) + '\n';
  const outPath = resolve(BACKUP_DIR, `${user}-state.json`);
  writeFileSync(outPath, json, 'utf8');
  return { outPath, bytes: json.length };
}

async function main() {
  const args = process.argv.slice(2);
  const users = args.length ? args : DEFAULT_USERS;
  mkdirSync(BACKUP_DIR, { recursive: true });
  for (const user of users) {
    try {
      const parsed = await fetchState(user);
      const { outPath, bytes } = saveBackup(user, parsed);
      console.log(`OK ${user}: wrote ${bytes.toLocaleString()} bytes -> ${outPath}`);
    } catch (e) {
      console.error(`FAIL ${user}: ${e.message || e}`);
      process.exitCode = 1;
    }
  }
}

main();
