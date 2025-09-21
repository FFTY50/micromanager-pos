/*
 * Simple Frigate explore tester.
 * Loads env, picks BASE from FRIGATE_BASE/FRIGATE_URL, calls /api/events/explore.
 */

/* eslint-disable no-console */
const { requestJson } = require('../src/http/client');

// Load .env files if present
try { require('dotenv').config(); } catch (_) {}
try { require('dotenv').config({ path: '.env.local' }); } catch (_) {}

async function main() {
  const base = (process.env.FRIGATE_BASE || process.env.FRIGATE_URL || 'http://127.0.0.1:5000').replace(/\/$/, '');
  const limit = Number(process.argv[2] || process.env.FRIGATE_TEST_LIMIT || 5);
  const camera = process.env.FRIGATE_CAMERA_NAME || process.env.FRIGATE_CAMERA || '';
  const label = process.env.FRIGATE_LABEL || '';

  const params = new URLSearchParams();
  if (limit) params.set('limit', String(limit));
  if (camera) params.set('camera', camera);
  if (label) params.set('label', label);

  const url = `${base}/api/events/explore?${params.toString()}`;
  console.log('Requesting:', url);
  const res = await requestJson(url);
  let data = [];
  try { data = JSON.parse(res.body); } catch (_) {}

  console.log('Status:', res.status);
  console.log('Count:', Array.isArray(data) ? data.length : 0);
  if (Array.isArray(data) && data.length) {
    const first = data[0];
    console.log('First event id:', first.id);
    console.log('First camera/label:', first.camera, first.label);
  }
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exitCode = 1;
});

