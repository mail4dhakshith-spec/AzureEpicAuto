import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { isExpenseAttachmentFilename, MAX_EXPENSE_ATTACHMENT_BYTES, removeExpenseAttachment, storeExpenseAttachment } from './expenseAttachments.js';

test('stores supported expense attachments under generated safe filenames', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'ssn-expense-attachments-'));
  const pdf = Buffer.from('%PDF-1.7\nEvidence file');
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
  try {
    const filename = await storeExpenseAttachment({ dataBase64: pdf.toString('base64'), mediaType: 'application/pdf' }, directory);
    assert.equal(isExpenseAttachmentFilename(filename), true);
    assert.deepEqual(await readFile(path.join(directory, filename)), pdf);
    await removeExpenseAttachment(filename, directory);
    await assert.rejects(readFile(path.join(directory, filename)), { code: 'ENOENT' });

    const pngFilename = await storeExpenseAttachment({ dataBase64: png.toString('base64'), mediaType: 'image/png' }, directory);
    assert.match(pngFilename, /\.png$/);
    assert.deepEqual(await readFile(path.join(directory, pngFilename)), png);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('rejects unsupported, mismatched, oversized, and unsafe expense attachments', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'ssn-expense-attachments-invalid-'));
  const pdf = Buffer.from('%PDF-1.7\nEvidence file');
  try {
    await assert.rejects(storeExpenseAttachment({ dataBase64: pdf.toString('base64'), mediaType: 'text/plain' }, directory), /PDF, JPEG, PNG, or WebP/);
    await assert.rejects(storeExpenseAttachment({ dataBase64: pdf.toString('base64'), mediaType: 'image/png' }, directory), /does not match/);
    await assert.rejects(storeExpenseAttachment({ dataBase64: Buffer.alloc(MAX_EXPENSE_ATTACHMENT_BYTES + 1).toString('base64'), mediaType: 'application/pdf' }, directory), /smaller than 10 MB/);
    assert.equal(isExpenseAttachmentFilename('../secret.pdf'), false);
    await removeExpenseAttachment('../secret.pdf', directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});