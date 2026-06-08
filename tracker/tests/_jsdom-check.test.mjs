import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTracker } from './_dom-harness.mjs';

test('jsdom harness can boot track.html and read the page title', async () => {
  const h = await loadTracker();
  try {
    assert.ok(h.doc, 'document exists');
    const title = h.doc.getElementById('page-title');
    assert.ok(title, 'page-title element rendered');
    // Profile form is one of the static sections; if it rendered, the IIFE ran.
    const profileForm = h.doc.getElementById('profile-form');
    assert.ok(profileForm, 'profile-form rendered');
  } finally {
    h.teardown();
  }
});
