import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Luis's rule: clicking an input must NOT produce a red (rust-colored)
// border or any "validation flash" outline. The default browser focus
// ring or a neutral ink-soft border is fine; the rust palette color is
// reserved for hover/selected states on non-input UI, never for inputs.

const html = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'track.html'),
  'utf8',
);

// 1. No input/select/textarea focus rule may set border-color: var(--rust).
test('no input/select/textarea :focus rule sets border-color: var(--rust)', () => {
  const ruleRe = /([^{}\n]*:focus[^{}]*)\{([^}]*)\}/g;
  const offenders = [];
  let m;
  while ((m = ruleRe.exec(html)) !== null) {
    const selector = m[1].trim();
    const body = m[2];
    const targetsField = /\binput\b|\bselect\b|\btextarea\b|\.counter-value\b|\.weight-input\b|\.ing-(?:name|num|amount-value|amount-unit)\b|\.recipe-ing-(?:select|amt)\b|\.group-filter\b/.test(selector);
    if (!targetsField) continue;
    if (/border-color\s*:\s*var\(--rust\)/.test(body)) {
      offenders.push(selector);
    }
  }
  assert.deepEqual(offenders, [],
    'these focus rules still apply rust border to a form field:\n  - '
    + offenders.join('\n  - '));
});

// 2. No JS-added "bad" class or rust-bordered validation state.
test('track.html has no classList.add("bad") for validation flash', () => {
  const matches = html.match(/classList\.add\(['"]bad['"]\)/g) || [];
  assert.equal(matches.length, 0,
    `classList.add('bad') still present (${matches.length} occurrences) - removes the red-outline-on-edit flash`);
});

test('track.html has no .profile-field input.bad CSS rule', () => {
  assert.ok(!/\.profile-field\s+input\.bad\s*\{/.test(html),
    '.profile-field input.bad CSS rule still defines a red validation border');
});

// 3. The fullRender path on the edit-panel `change` handler must be gone.
// All save flows should go through `input` event with targeted UI patches.
test('edit-panel save handler no longer relies on fullRender:true gated to change event', () => {
  // The old offender was a `change` listener calling liveSaveEditPanel with
  // fullRender:true so the catalog row only updated on blur. After the fix
  // the keystroke `input` handler performs a targeted row patch and there
  // is no `fullRender: true` literal anywhere in the file.
  assert.ok(!/fullRender\s*:\s*true/.test(html),
    'fullRender:true still present - means some edits wait for blur to update the catalog row');
});

// 4. Targeted catalog row updater must exist - the function that patches
// just one row's name/macros/serving-size in place instead of rebuilding.
test('targeted updateCatalogRowInPlace helper is defined', () => {
  assert.ok(/function\s+updateCatalogRowInPlace\b/.test(html),
    'updateCatalogRowInPlace helper missing - required for keystroke-fast UI updates');
});
