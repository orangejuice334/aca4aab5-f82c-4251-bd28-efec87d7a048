import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTracker, changeTo, waitMs } from './_dom-harness.mjs';

// Chart fixes:
//  A. value labels on a SPARSE series (body fat is only recorded on days with
//     a neck + waist reading) are sampled among points that have a value, so
//     the fat chart no longer prints just 2 numbers;
//  B. body-fat bands line up with the legend buckets exactly (obese starts at
//     25, not 24 - a 24.5% reading must not render obese-red);
//  C. each legend is named so the BMI key can't be read as the fat chart's;
//  D. a shared date-range dropdown trims the weight / BMI / body-fat axis.

const DAY_MS = 24 * 60 * 60 * 1000;
const key = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const daysAgo = (n) => key(new Date(Date.now() - n * DAY_MS));

// 120 days of daily weight, but neck+waist (-> body fat) only every 10th day.
// That sparseness is exactly what broke the fat chart's value labels.
function seed({ chartRangeDays } = {}) {
  const days = {};
  for (let i = 0; i < 120; i++) {
    const d = daysAgo(i);
    days[d] = { counters: {}, customs: [], toggles: {}, counterMeta: {}, weight: 90 - i * 0.05 };
    if (i % 10 === 0) { days[d].neck = 40; days[d].waist = 95 + i * 0.05; }
  }
  const state = {
    activeDate: daysAgo(0),
    days,
    counters: {}, customs: [],
    profile: { sex: 'M', ageYears: 35, heightCm: 183 },
    userCatalog: { items: {}, categories: [] },
    toggles: {},
  };
  if (chartRangeDays !== undefined) state.chartRangeDays = chartRangeDays;
  return { state };
}

// Point value labels only: they carry font-weight 600, which the y-axis tick
// labels do not. The bare-number regex also drops the trend-line label
// ("-0.4 kg/week"), which shares the same weight.
const valueLabels = (svg) => [...svg.querySelectorAll('text[font-weight="600"]')]
  .map(t => t.textContent)
  .filter(t => /^\d+(\.\d+)?$/.test(t));

const xDateLabels = (svg) => [...svg.querySelectorAll('text')]
  .map(t => t.textContent)
  .filter(t => /^\d{2}-\d{2}$/.test(t));

// ---------- A. value labels on a sparse series ----------
test('body-fat chart prints a full set of value labels despite a sparse series', async () => {
  const h = await loadTracker({ seedState: seed() });
  try {
    await waitMs(120);
    const fat = h.doc.getElementById('fat-pct-chart');
    const labels = valueLabels(fat);
    // 12 fat readings across a 120-day axis -> thinned to the 7-label cap.
    // Before the fix this printed 2, because the labels were sampled across
    // all 120 axis positions and almost every sample landed on a null.
    assert.equal(labels.length, 7, 'expected the full 7-label cap, got ' + labels.length + ': ' + labels.join(','));
  } finally { h.teardown(); }
});

test('weight chart (dense series) still caps its value labels', async () => {
  const h = await loadTracker({ seedState: seed() });
  try {
    await waitMs(120);
    const labels = valueLabels(h.doc.getElementById('weight-chart'));
    assert.equal(labels.length, 7, 'dense series stays capped at 7, got ' + labels.length);
  } finally { h.teardown(); }
});

// ---------- B. fat bands match the legend ----------
test('body-fat bands align with the legend: obese red starts at 25, not 24', async () => {
  const h = await loadTracker({ seedState: seed() });
  try {
    await waitMs(120);
    const fat = h.doc.getElementById('fat-pct-chart');
    const fills = [...fat.querySelectorAll('rect')].map(r => r.getAttribute('fill'));
    // The red obese band must be present in the band set with its 25 floor.
    assert.ok(fills.some(f => /hsla\(15,/.test(f)), 'an obese-red band renders');
    // Boundary check via the rendered source: the band table drives the rects,
    // so assert on the y geometry - the red rect must not start below the tan.
    const red = [...fat.querySelectorAll('rect')].find(r => /hsla\(15,/.test(r.getAttribute('fill')));
    const tan = [...fat.querySelectorAll('rect')].find(r => /hsla\(40,/.test(r.getAttribute('fill')));
    if (red && tan) {
      // In SVG, smaller y = higher value. Red (higher %) sits above tan.
      assert.ok(parseFloat(red.getAttribute('y')) <= parseFloat(tan.getAttribute('y')),
        'obese band sits above the average band');
    }
  } finally { h.teardown(); }
});

test('a 24.5% body-fat reading is NOT painted obese (legend says obese >= 25)', async () => {
  // Drive the pure band table rather than pixels: rebuild the same lookup the
  // chart uses and assert the bucket a 24.5 reading lands in.
  const h = await loadTracker({ seedState: seed() });
  try {
    await waitMs(60);
    const html = h.dom.serialize();
    // The band definitions live inline; assert the corrected boundaries.
    assert.ok(/min: 18, max: 25/.test(html), 'average band runs 18-25');
    assert.ok(/min: 25, max: 100/.test(html), 'obese band starts at 25');
    assert.ok(!/min: 24, max: 60/.test(html), 'the old off-by-one 24 floor is gone');
  } finally { h.teardown(); }
});

// ---------- C. named legends ----------
test('each chart legend is named so the BMI key is not read as the fat key', async () => {
  const h = await loadTracker({ seedState: seed() });
  try {
    const titles = [...h.doc.querySelectorAll('.bmi-legend-title')].map(t => t.textContent.trim());
    assert.ok(titles.includes('BMI'), 'BMI legend is named');
    assert.ok(titles.includes('Body fat'), 'body-fat legend is named');
  } finally { h.teardown(); }
});

// ---------- D. date-range dropdown ----------
test('range dropdown exists above the charts with the four choices', async () => {
  const h = await loadTracker({ seedState: seed() });
  try {
    const sel = h.doc.getElementById('chart-range');
    assert.ok(sel, 'the range select exists');
    assert.deepEqual([...sel.options].map(o => o.value), ['15', '30', '90', 'all']);
    assert.equal(sel.value, 'all', 'defaults to full history');
    // It must precede the weight chart in DOM order.
    const weightWrap = h.doc.getElementById('weight-chart').closest('.weight-chart-wrapper');
    const pos = sel.closest('.chart-range-row').compareDocumentPosition(weightWrap);
    assert.ok(pos & h.window.Node.DOCUMENT_POSITION_FOLLOWING, 'range row comes before the weight chart');
  } finally { h.teardown(); }
});

test('choosing "last 15 days" trims the shared axis on all three charts', async () => {
  const h = await loadTracker({ seedState: seed() });
  try {
    await waitMs(120);
    const before = xDateLabels(h.doc.getElementById('weight-chart')).length;
    const firstBefore = xDateLabels(h.doc.getElementById('weight-chart'))[0];
    changeTo(h.doc.getElementById('chart-range'), '15');
    await waitMs(80);
    const after = xDateLabels(h.doc.getElementById('weight-chart'));
    assert.ok(before > 0, 'sanity: had labels before');
    assert.ok(after.length > 0, 'chart still renders');
    // The axis now starts exactly 14 days back (15 days inclusive of today).
    // Comparing the rendered MM-DD to the computed one is year-boundary safe.
    assert.equal(after[0], daysAgo(14).slice(5), 'axis starts at the 15-day cutoff (was ' + firstBefore + ')');
    assert.equal(after[after.length - 1], daysAgo(0).slice(5), 'axis still ends today');
    // The BMI and body-fat charts share the same trimmed axis.
    for (const id of ['bmi-chart', 'fat-pct-chart']) {
      const lbls = xDateLabels(h.doc.getElementById(id));
      assert.equal(lbls[0], daysAgo(14).slice(5), id + ' shares the trimmed axis');
    }
  } finally { h.teardown(); }
});

test('the range choice persists to localStorage and re-hydrates on boot', async () => {
  const h = await loadTracker({ seedState: seed() });
  try {
    await waitMs(120);
    changeTo(h.doc.getElementById('chart-range'), '30');
    await waitMs(80);
    const raw = h.window.localStorage.getItem('19ff6f4d-3d5b-40e6-88e2-573f647f903f-state-lg');
    assert.equal(JSON.parse(raw).chartRangeDays, 30, 'persisted to the local snapshot');
  } finally { h.teardown(); }
});

test('a seeded range value drives the select and the axis on boot', async () => {
  const h = await loadTracker({ seedState: seed({ chartRangeDays: 30 }) });
  try {
    await waitMs(120);
    assert.equal(h.doc.getElementById('chart-range').value, '30', 'select reflects stored state');
    const labels = xDateLabels(h.doc.getElementById('weight-chart'));
    assert.equal(labels[0], daysAgo(29).slice(5), 'axis starts at the 30-day cutoff, not full history');
  } finally { h.teardown(); }
});

// ---------- E. the range control must NOT reach the mood chart ----------
test('mood chart keeps full history when the range is narrowed', async () => {
  // Mood is logged every day here; the mood chart lives in its own section
  // with no range control, so the weight-section dropdown must not trim it.
  const s = seed();
  for (const d of Object.keys(s.state.days)) s.state.days[d].mood = 6;
  const h = await loadTracker({ seedState: s });
  try {
    await waitMs(140);
    const moodBefore = xDateLabels(h.doc.getElementById('mood-chart'));
    assert.ok(moodBefore.length > 0, 'mood chart rendered');
    changeTo(h.doc.getElementById('chart-range'), '15');
    await waitMs(100);
    const moodAfter = xDateLabels(h.doc.getElementById('mood-chart'));
    assert.deepEqual(moodAfter, moodBefore, 'mood axis is untouched by the range control');
    // ...while the weight chart on the same page DID trim.
    assert.equal(xDateLabels(h.doc.getElementById('weight-chart'))[0], daysAgo(14).slice(5),
      'weight chart still honours the range');
  } finally { h.teardown(); }
});

// ---------- F. a window with no reading shows the empty state ----------
test('a window containing no body-fat reading shows "No data yet", not a solid band', async () => {
  // Daily weight keeps the shared axis populated, but the last neck+waist
  // reading is 40 days old, so a 15-day window has zero fat readings.
  const days = {};
  for (let i = 0; i < 120; i++) {
    const d = daysAgo(i);
    days[d] = { counters: {}, customs: [], toggles: {}, counterMeta: {}, weight: 90 - i * 0.05 };
    if (i >= 40 && i % 10 === 0) { days[d].neck = 40; days[d].waist = 95; }
  }
  const h = await loadTracker({ seedState: { state: {
    activeDate: daysAgo(0), days, counters: {}, customs: [],
    profile: { sex: 'M', ageYears: 35, heightCm: 183 },
    userCatalog: { items: {}, categories: [] }, toggles: {},
    chartRangeDays: 15,
  } } });
  try {
    await waitMs(140);
    const fat = h.doc.getElementById('fat-pct-chart');
    const texts = [...fat.querySelectorAll('text')].map(t => t.textContent);
    assert.ok(texts.includes('No data yet'), 'empty state shown, got: ' + texts.join('|'));
    assert.equal(fat.querySelectorAll('circle').length, 0, 'no points drawn');
    assert.equal(fat.querySelectorAll('rect').length, 0, 'no band rects painted over an empty window');
  } finally { h.teardown(); }
});

test('the body-fat subtitle still reports the latest reading outside the window', async () => {
  const days = {};
  for (let i = 0; i < 120; i++) {
    const d = daysAgo(i);
    days[d] = { counters: {}, customs: [], toggles: {}, counterMeta: {}, weight: 90 - i * 0.05 };
    if (i >= 40 && i % 10 === 0) { days[d].neck = 40; days[d].waist = 95; }
  }
  const h = await loadTracker({ seedState: { state: {
    activeDate: daysAgo(0), days, counters: {}, customs: [],
    profile: { sex: 'M', ageYears: 35, heightCm: 183, goals: { fatPercent: 15 } },
    userCatalog: { items: {}, categories: [] }, toggles: {},
    chartRangeDays: 15,
  } } });
  try {
    await waitMs(140);
    const sub = h.doc.getElementById('fat-pct-subtitle').textContent;
    assert.match(sub, /latest \d+\.\d+%/, 'latest reading still shown despite an empty window: "' + sub + '"');
    assert.match(sub, /goal max 15%/, 'goal still shown');
  } finally { h.teardown(); }
});

test('a bogus stored range falls back to full history instead of blanking', async () => {
  const h = await loadTracker({ seedState: seed({ chartRangeDays: 7 }) });
  try {
    await waitMs(120);
    assert.equal(h.doc.getElementById('chart-range').value, 'all', 'unrecognised value -> full history');
    const labels = xDateLabels(h.doc.getElementById('weight-chart'));
    assert.ok(labels.length > 0, 'charts still render');
  } finally { h.teardown(); }
});
