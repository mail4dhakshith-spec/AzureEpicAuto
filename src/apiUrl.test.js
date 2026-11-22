import assert from 'node:assert/strict';
import test from 'node:test';
import { getApiUrl } from './apiUrl.js';

test('uses a same-origin API on Airo production and preview hosts', () => {
  assert.equal(getApiUrl('psa2lrnjxu.c39.airoapp.ai', 'https://api.example.com/api'), '/api');
  assert.equal(getApiUrl('psa2lrnjxu.preview.c39.airoapp.ai', 'https://api.example.com/api'), '/api');
});

test('preserves the configured API URL on non-Airo hosts', () => {
  assert.equal(getApiUrl('ssn-community-finance.pages.dev', 'https://api.example.com/api'), 'https://api.example.com/api');
  assert.equal(getApiUrl('ssn-community-finance.pages.dev'), '/api');
});
