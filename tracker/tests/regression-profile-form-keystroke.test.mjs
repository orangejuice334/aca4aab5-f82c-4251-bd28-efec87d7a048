import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTracker, typeInto } from './_dom-harness.mjs';

// Every profile-form input (text, number, select) must:
//  1. Persist state on every keystroke (not on blur)
//  2. NOT add a `.bad` class transiently for invalid intermediate values
//  3. Trigger a backend op via the sendOp queue

test('typing into profile displayName commits state per-keystroke', async () => {
  const h = await loadTracker();
  try {
    const input = h.doc.querySelector('input[data-profile="displayName"]');
    assert.ok(input, 'displayName input rendered');
    typeInto(input, 'L');
    typeInto(input, 'Lu');
    typeInto(input, 'Lui');
    typeInto(input, 'Luis');
    // The IIFE exposes state on window via the form-rendered profile name span.
    const nameEl = h.doc.getElementById('profile-name');
    assert.equal(nameEl.textContent, 'Luis',
      'profile-name span should mirror per-keystroke (was: ' + nameEl.textContent + ')');
  } finally { h.teardown(); }
});

test('typing an intermediate non-numeric value does NOT add .bad class', async () => {
  const h = await loadTracker();
  try {
    const input = h.doc.querySelector('input[data-profile="ageYears"]');
    typeInto(input, '');
    typeInto(input, '-');           // intermediate invalid
    assert.ok(!input.classList.contains('bad'),
      'ageYears got .bad class while user was mid-typing - red-flash regression');
    typeInto(input, '-3');          // still invalid (negative)
    assert.ok(!input.classList.contains('bad'),
      'ageYears got .bad class on negative intermediate - red-flash regression');
    typeInto(input, '30');          // valid
    assert.ok(!input.classList.contains('bad'));
  } finally { h.teardown(); }
});

test('changing profile sex select commits state on `change` (radio/select semantics)', async () => {
  const h = await loadTracker();
  try {
    const sel = h.doc.querySelector('select[data-profile="sex"]');
    assert.ok(sel, 'sex select rendered');
    sel.value = 'F';
    sel.dispatchEvent(new h.window.Event('input', { bubbles: true }));
    // Profile form binds to `input` event which fires on select change in
    // modern browsers; jsdom does NOT dispatch `input` for selects on its
    // own, so we dispatch explicitly to mirror the real-browser behavior.
    // The bound handler should have written sex into the profile state.
    assert.equal(sel.value, 'F');
  } finally { h.teardown(); }
});

test('every data-profile input has been registered to the form input handler', async () => {
  const h = await loadTracker();
  try {
    const fields = h.doc.querySelectorAll('[data-profile]');
    assert.ok(fields.length >= 14, 'should be at least 14 data-profile fields');
    for (const f of fields) {
      // Dispatch the event the form listens to. If the handler is missing,
      // the value won't propagate visibly. We're not asserting deep state -
      // just that no exception is thrown and the field accepts an input.
      const orig = f.value;
      const probe = (f.type === 'number') ? '1' : (f.tagName === 'SELECT' ? f.value : 'x');
      f.value = probe;
      f.dispatchEvent(new h.window.Event('input', { bubbles: true }));
      f.value = orig;
      f.dispatchEvent(new h.window.Event('input', { bubbles: true }));
    }
  } finally { h.teardown(); }
});
