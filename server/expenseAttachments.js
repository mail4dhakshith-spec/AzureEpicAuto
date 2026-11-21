import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export const MAX_EXPENSE_ATTACHMENT_BYTES = 10 * 1024 * 1024;

const ATTACHMENT_TYPES = {
  'application/pdf': { extension: 'pdf', matches: (buffer) => buffer.length >= 5 && buffer.toString('ascii', 0, 5) === '%PDF-' },
  'image/jpeg': { extension: 'jpg', matches: (buffer) => buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff },
  'image/png': { extension: 'png', matches: (buffer) => buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  'image/webp': { extension: 'webp', matches: (buffer) => buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP' },
};

export function isExpenseAttachmentFilename(filename) {
  return typeof filename === 'string' && /^[a-f0-9-]{36}\.(pdf|jpg|png|webp)$/.test(filename);
}

export async function storeExpenseAttachment({ dataBase64, mediaType }, directory) {
  const definition = ATTACHMENT_TYPES[mediaType];
  if (!definition || typeof dataBase64 !== 'string' || !dataBase64.length || dataBase64.length > Math.ceil(MAX_EXPENSE_ATTACHMENT_BYTES * 4 / 3) + 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(dataBase64)) {
    throw new Error('Choose a PDF, JPEG, PNG, or WebP attachment smaller than 10 MB.');
  }
  const attachment = Buffer.from(dataBase64, 'base64');
  if (!attachment.length || attachment.length > MAX_EXPENSE_ATTACHMENT_BYTES) throw new Error('Choose an attachment smaller than 10 MB.');
  if (attachment.toString('base64') !== dataBase64 || !definition.matches(attachment)) throw new Error('The attachment file does not match its file type.');
  const filename = `${randomUUID()}.${definition.extension}`;
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, filename), attachment, { flag: 'wx', mode: 0o600 });
  return filename;
}

export async function readExpenseAttachment(filename, directory) {
  if (!isExpenseAttachmentFilename(filename)) throw new Error('Attachment not found.');
  return readFile(path.join(directory, filename));
}

export async function removeExpenseAttachment(filename, directory) {
  if (!isExpenseAttachmentFilename(filename)) return;
  await rm(path.join(directory, filename), { force: true });
}