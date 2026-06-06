import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EDIT_PANEL_SCRATCH_SELECTORS,
  isEditPanelScratchTarget,
} from '../lib/tracker-core.mjs';

// Reproduces the bug: when the user picks an option from the
// "Add ingredient" dropdown inside a recipe item's edit panel, the
// change event was triggering a full panel rebuild that wiped the
// user's selection. The select had to be in the scratch-selectors
// list so the change handler bails before invoking liveSaveEditPanel.

// Tiny mock element factory. Mimics the parts of Element used by the
// production handler: target.closest(selector).
function mkEl(matches) {
  return {
    closest(sel) {
      return matches.includes(sel) ? this : null;
    },
  };
}

test('EDIT_PANEL_SCRATCH_SELECTORS includes the add-ingredient picker', () => {
  assert.ok(EDIT_PANEL_SCRATCH_SELECTORS.includes('[data-ing-add-picker]'),
    'add-ingredient picker MUST be a scratch input so its change events skip the save flow');
});

test('EDIT_PANEL_SCRATCH_SELECTORS keeps the variant-custom-add scratch entry', () => {
  assert.ok(EDIT_PANEL_SCRATCH_SELECTORS.includes('[data-variant-custom-add]'),
    'variant scratch row must remain in the scratch list');
});

test('isEditPanelScratchTarget returns true for the add-ingredient picker descendant (select)', () => {
  const target = mkEl(['[data-ing-add-picker]']); // imagine a select inside the picker
  const result = isEditPanelScratchTarget(target, target.closest);
  assert.equal(result, true);
});

test('isEditPanelScratchTarget returns true for the Add button inside the picker', () => {
  const target = mkEl(['[data-ing-add-picker]']);
  assert.equal(isEditPanelScratchTarget(target, target.closest), true);
});

test('isEditPanelScratchTarget returns true for the variant-custom-add scratch row', () => {
  const target = mkEl(['[data-variant-custom-add]']);
  assert.equal(isEditPanelScratchTarget(target, target.closest), true);
});

test('isEditPanelScratchTarget returns false for a regular panel input', () => {
  const target = mkEl(['[data-edit-panel]']); // belongs to panel but not a scratch
  assert.equal(isEditPanelScratchTarget(target, target.closest), false);
});

test('isEditPanelScratchTarget returns false for null target / null closestFn', () => {
  assert.equal(isEditPanelScratchTarget(null, () => true), false);
  assert.equal(isEditPanelScratchTarget(mkEl([]), null), false);
});

test('isEditPanelScratchTarget covers an element that matches MULTIPLE scratch selectors', () => {
  const target = mkEl(['[data-variant-custom-add]', '[data-ing-add-picker]']);
  assert.equal(isEditPanelScratchTarget(target, target.closest), true);
});

test('regression: a change event on the ing-add-source select would have triggered a save before the fix', () => {
  // Simulate the old behavior: production change handler called
  // liveSaveEditPanel without checking ing-add-picker. The new
  // behavior must short-circuit BEFORE liveSaveEditPanel runs.
  const target = mkEl(['[data-ing-add-picker]']);
  let liveSaveCalled = false;
  function fakeChangeHandler(t) {
    if (isEditPanelScratchTarget(t, t.closest)) return;
    liveSaveCalled = true;
  }
  fakeChangeHandler(target);
  assert.equal(liveSaveCalled, false,
    'liveSave must NOT fire for events on the add-ingredient picker');
});

test('regression: a regular edit-panel input still triggers save (other code paths unchanged)', () => {
  const target = mkEl(['[data-edit-panel]']);
  let liveSaveCalled = false;
  function fakeChangeHandler(t) {
    if (isEditPanelScratchTarget(t, t.closest)) return;
    liveSaveCalled = true;
  }
  fakeChangeHandler(target);
  assert.equal(liveSaveCalled, true);
});
