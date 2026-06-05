#!/usr/bin/env node
// Convenience runner. Equivalent to `node --test tracker/tests/*.test.mjs`
// but Node 24 needs each file passed explicitly (--test on a directory
// path fails with MODULE_NOT_FOUND), so this script globs and spawns.
//
// Usage:
//   node tracker/tests/run-tests.mjs
//
// CI / scripts call this exact path. Returns non-zero exit code on any
// failure so the surrounding workflow can gate commits on green tests.

import { spawnSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const files = readdirSync(here)
  .filter(f => f.endsWith('.test.mjs'))
  .map(f => join(here, f))
  .filter(p => statSync(p).isFile());

if (files.length === 0) {
  console.error('No .test.mjs files found in', here);
  process.exit(2);
}

const res = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });
process.exit(res.status == null ? 1 : res.status);
