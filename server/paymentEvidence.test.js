import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { isEvidenceFilename, MAX_EVIDENCE_IMAGE_BYTES, removePaymentEvidence, storePaymentEvidence } from './paymentEvidence.js';

test('stores supported image evidence as a compact Excel Base64 data URI', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'ssn-payment-evidence-'));
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  try {
    const pngBuffer = Buffer.concat([png, Buffer.alloc(100)]);
    const dataUri = await storePaymentEvidence({ dataBase64: pngBuffer.toString('base64'), mediaType: 'image/png' }, directory);
    assert.match(dataUri, /^data:image\/png;base64,/);
    assert.equal(isEvidenceFilename(dataUri), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('rejects unsupported, mismatched, oversized, and unsafe evidence files', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'ssn-payment-evidence-invalid-'));
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  try {
    await assert.rejects(storePaymentEvidence({ dataBase64: png.toString('base64'), mediaType: 'image/svg+xml' }, directory), /JPEG, PNG, or WebP/);
    await assert.rejects(storePaymentEvidence({ dataBase64: png.toString('base64'), mediaType: 'image/jpeg' }, directory), /valid image/);
    const oversized = Buffer.alloc(MAX_EVIDENCE_IMAGE_BYTES + 1);
    await assert.rejects(storePaymentEvidence({ dataBase64: oversized.toString('base64'), mediaType: 'image/png' }, directory), /JPEG, PNG, or WebP/);
    assert.equal(isEvidenceFilename('../secret.png'), false);
    await removePaymentEvidence('../secret.png', directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});