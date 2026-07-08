import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTracker, waitMs, typeInto } from './_dom-harness.mjs';
import { mkCatalog } from './_mocks.mjs';

// The hard contract: after a sequence of counter taps, the DOM must look
// EXACTLY like a fresh page load with the same final state.counters. This
// catches any drift between the fast-path (renderCounterDelta) and the
// full render() — a single missed DOM patch shows up as a mismatched
// signature.
//
// Strategy: boot two trackers
//   A) seed empty, fire 3 +1 taps on string_cheese
//   B) seed string_cheese counter = 21 * 3 = 63 grams up-front (full reload)
// Wait past the 800ms heavy-refresh debounce, then compare critical DOM
// signatures: totals values, kcal/p goal line, bar widths, today-log
// content, catalog counter triplet for the tapped item.

function baseSeed(extraDay = {}) {
  const d = new Date();
  const today = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  return {
    state: {
      days: { [today]: Object.assign({ counters: {}, customs: [], toggles: {}, counterMeta: {} }, extraDay) },
      activeDate: today,
      counters: extraDay.counters || {},
      customs: [],
      profile: { sex: 'M', ageYears: 35, heightCm: 175 },
      userCatalog: {
        items: mkCatalog(),
        categories: [
          { key: 'items',          label: 'Items' },
          { key: 'liquids',        label: 'Liquids' },
          { key: 'supplements',    label: 'Supplements' },
          { key: 'recipes',        label: 'Recipes' },
        ],
      },
      toggles: {},
    },
  };
}

function signature(doc) {
  // Picks the user-visible bits that the counter fast path is responsible
  // for keeping in sync. NOT a full innerHTML diff (that pulls in stuff
  // like the rust-color CSS variable rendering inside <style>) - just the
  // concrete content elements.
  const sig = {};
  // Totals strip - one entry per displayed nutrient.
  doc.querySelectorAll('[data-total]').forEach(el => {
    sig['total:' + el.getAttribute('data-total')] = (el.textContent || '').trim();
  });
  // Bars: width + background color.
  doc.querySelectorAll('[data-bar]').forEach(el => {
    const k = 'bar:' + el.getAttribute('data-bar');
    sig[k + ':width'] = el.style.width || '';
    sig[k + ':bg'] = el.style.backgroundColor || '';
  });
  // Percent / remaining text per nutrient.
  doc.querySelectorAll('[data-pct]').forEach(el => {
    sig['pct:' + el.getAttribute('data-pct')] = (el.textContent || '').trim();
  });
  // kcal/p goal line.
  doc.querySelectorAll('[data-goal-line]').forEach(el => {
    sig['goal:' + el.getAttribute('data-goal-line')] = (el.textContent || '').trim();
  });
  // Catalog row counter input values (the displayed servings number).
  doc.querySelectorAll('input.counter-value[data-value]').forEach(el => {
    sig['counterVal:' + el.getAttribute('data-value') + '|' + (el.dataset.servingSize || '')] = el.value || '';
  });
  // dec/inc disabled state.
  doc.querySelectorAll('.counter-btn[data-key]').forEach(el => {
    sig['counterBtn:' + el.getAttribute('data-key') + ':' + el.getAttribute('data-action')] = el.disabled ? 'disabled' : 'enabled';
  });
  // Today log: row count + concatenated keys (order matters).
  const logRows = doc.querySelectorAll('#today-log-rows .today-log-row');
  sig['today-log:rowCount'] = String(logRows.length);
  sig['today-log:rowKeys'] = [...logRows].map(r => r.dataset.key || '').join(',');
  return sig;
}

function diffSigs(a, b) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const diffs = [];
  for (const k of keys) {
    if (a[k] !== b[k]) diffs.push(`${k}: A="${a[k]}" vs B="${b[k]}"`);
  }
  return diffs;
}

test('equivalence: 3 taps on string_cheese ≡ fresh boot with counters.string_cheese=63', async () => {
  // Boot A: empty, then fire 3 +1 taps via real click events.
  const A = await loadTracker({ seedState: baseSeed() });
  try {
    const incBtn = A.doc.querySelector('.checkout-row[data-key="string_cheese"] .counter-btn[data-action="inc"]');
    assert.ok(incBtn, 'A: inc button must exist');
    for (let i = 0; i < 3; i++) {
      incBtn.dispatchEvent(new A.window.MouseEvent('click', { bubbles: true }));
    }
    // Wait past the 800ms heavy-refresh debounce so history + warnings
    // settle before we snapshot.
    await waitMs(1100);
    const sigA = signature(A.doc);

    // Boot B: same final state up-front, no taps fired.
    const B = await loadTracker({
      seedState: baseSeed({
        counters: { string_cheese: 63 },
        counterMeta: { string_cheese: new Date().toISOString() },
      }),
    });
    try {
      // Let B's initial render() settle.
      await waitMs(200);
      const sigB = signature(B.doc);

      const diffs = diffSigs(sigA, sigB);
      assert.deepEqual(diffs, [],
        'fast-path DOM signature must match full-boot DOM signature; mismatches:\n  - '
        + diffs.join('\n  - '));
    } finally { B.teardown(); }
  } finally { A.teardown(); }
});

test('equivalence: typing-into-counter ≡ fresh boot with same final value', async () => {
  // Boot A: empty, then TYPE 5 into the counter input via input event.
  const A = await loadTracker({ seedState: baseSeed() });
  try {
    const valInput = A.doc.querySelector('.checkout-row[data-key="string_cheese"] input.counter-value');
    assert.ok(valInput, 'A: counter input must exist');
    typeInto(valInput, '5');
    await waitMs(1100);
    const sigA = signature(A.doc);

    // Boot B: seed counter at 5 servings of 21g = 105g.
    const servingSize = parseFloat(valInput.dataset.servingSize) || 21;
    const B = await loadTracker({
      seedState: baseSeed({
        counters: { string_cheese: Math.round(5 * servingSize * 10000) / 10000 },
        counterMeta: { string_cheese: new Date().toISOString() },
      }),
    });
    try {
      await waitMs(200);
      const sigB = signature(B.doc);
      const diffs = diffSigs(sigA, sigB);
      assert.deepEqual(diffs, [],
        'typing fast-path DOM signature must match full-boot DOM signature; mismatches:\n  - '
        + diffs.join('\n  - '));
    } finally { B.teardown(); }
  } finally { A.teardown(); }
});

test('equivalence: -1 tap ≡ fresh boot with counter=0', async () => {
  // Boot A: start with counter at 21 (1 serving), tap dec once → 0.
  const A = await loadTracker({
    seedState: baseSeed({
      counters: { string_cheese: 21 },
      counterMeta: { string_cheese: new Date().toISOString() },
    }),
  });
  try {
    // Let initial render() settle.
    await waitMs(100);
    const decBtn = A.doc.querySelector('.checkout-row[data-key="string_cheese"] .counter-btn[data-action="dec"]');
    assert.ok(decBtn, 'A: dec button must exist');
    decBtn.dispatchEvent(new A.window.MouseEvent('click', { bubbles: true }));
    await waitMs(1100);
    const sigA = signature(A.doc);

    const B = await loadTracker({ seedState: baseSeed() });
    try {
      await waitMs(200);
      const sigB = signature(B.doc);
      const diffs = diffSigs(sigA, sigB);
      assert.deepEqual(diffs, [],
        'dec-to-zero fast path must match fresh-boot-with-zero; mismatches:\n  - '
        + diffs.join('\n  - '));
    } finally { B.teardown(); }
  } finally { A.teardown(); }
});
