import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  isEvidenceFilename,
  MAX_EVIDENCE_IMAGE_BYTES,
  readPaymentEvidence,
  removePaymentEvidence,
  storePaymentEvidence,
} from './paymentEvidence.js';

test('stores supported image evidence as a compact Excel Base64 data URI', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'ssn-payment-evidence-'));
  const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  try {
    const pngBuffer = Buffer.concat([pngSignature, Buffer.alloc(100)]);
    const result = await storePaymentEvidence({
      originalName: 'receipt.png',
      dataBase64: pngBuffer.toString('base64'),
      mediaType: 'image/png',
    }, directory);
    assert.match(result.evidenceFile, /^data:image\/png;base64,/);
    assert.equal(result.evidenceName, 'receipt.png');
    assert.equal(isEvidenceFilename(result.evidenceFile), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('rejects unsupported, mismatched, oversized, and unsafe evidence files', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'ssn-payment-evidence-invalid-'));
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  try {
    await assert.rejects(storePaymentEvidence({ dataBase64: png.toString('base64'), mediaType: 'image/svg+xml' }, directory), /JPEG, PNG, or WebP/);
    await assert.rejects(storePaymentEvidence({ dataBase64: png.toString('base64'), mediaType: 'image/jpeg' }, directory), /does not match its file type/);
    const oversized = Buffer.alloc(MAX_EVIDENCE_IMAGE_BYTES + 1);
    await assert.rejects(storePaymentEvidence({ dataBase64: oversized.toString('base64'), mediaType: 'image/png' }, directory), /allowed size/);
    assert.equal(isEvidenceFilename('../secret.png'), false);
    await removePaymentEvidence('../secret.png', directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('stores, reads, and removes validated PDF evidence locally', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'ssn-payment-evidence-pdf-'));
  const pdf = Buffer.from('%PDF-1.7\nPayment evidence\n%%EOF', 'ascii');
  try {
    const stored = await storePaymentEvidence({
      originalName: 'payment-proof.pdf',
      mediaType: 'application/pdf',
      dataBase64: pdf.toString('base64'),
    }, directory);
    assert.equal(stored.evidenceName, 'payment-proof.pdf');
    assert.match(stored.evidenceFile, /^[a-f0-9-]{36}\.pdf$/);

    const evidence = await readPaymentEvidence(stored.evidenceFile, directory);
    assert.equal(evidence.mediaType, 'application/pdf');
    assert.deepEqual(evidence.buffer, pdf);

    await removePaymentEvidence(stored.evidenceFile, directory);
    await assert.rejects(readPaymentEvidence(stored.evidenceFile, directory));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('stores and reads Drive evidence using authenticated Drive references', async () => {
  const pdf = Buffer.from('%PDF-1.7\nPayment evidence\n%%EOF', 'ascii');
  let uploadedMetadata;
  let deletedFileId;
  const drive = {
    files: {
      create: async (request) => {
        uploadedMetadata = request.requestBody;
        return { data: { id: 'drive_file_123' } };
      },
      get: async (request) => request.alt === 'media'
        ? { data: pdf }
        : { data: { name: 'payment-proof.pdf', mimeType: 'application/pdf' } },
      delete: async (request) => { deletedFileId = request.fileId; },
    },
  };
  const stored = await storePaymentEvidence({
    originalName: 'payment-proof.pdf',
    mediaType: 'application/pdf',
    dataBase64: pdf.toString('base64'),
  }, '', drive, 'workbook_parent');
  assert.equal(stored.evidenceFile, 'drive_drive_file_123');
  assert.deepEqual(uploadedMetadata.parents, ['workbook_parent']);

  const evidence = await readPaymentEvidence(stored.evidenceFile, '', drive);
  assert.equal(evidence.filename, 'payment-proof.pdf');
  assert.equal(evidence.mediaType, 'application/pdf');
  assert.deepEqual(evidence.buffer, pdf);

  await removePaymentEvidence(stored.evidenceFile, '', drive);
  assert.equal(deletedFileId, 'drive_file_123');
});