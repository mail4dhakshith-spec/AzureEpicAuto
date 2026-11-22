import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import path from 'node:path';

export const MAX_EVIDENCE_IMAGE_BYTES = 4 * 1024 * 1024;
export const MAX_EVIDENCE_PDF_BYTES = 10 * 1024 * 1024;
export const MAX_EXCEL_EVIDENCE_BASE64_CHARS = 24 * 1024;

const EVIDENCE_TYPES = {
  'application/pdf': {
    extension: '.pdf',
    acceptedExtensions: ['.pdf'],
    maxBytes: MAX_EVIDENCE_PDF_BYTES,
    matches: (buffer) => buffer.length >= 5 && buffer.toString('ascii', 0, 5) === '%PDF-',
  },
  'image/jpeg': {
    extension: '.jpg',
    acceptedExtensions: ['.jpg', '.jpeg'],
    maxBytes: MAX_EVIDENCE_IMAGE_BYTES,
    matches: (buffer) => buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff,
  },
  'image/png': {
    extension: '.png',
    acceptedExtensions: ['.png'],
    maxBytes: MAX_EVIDENCE_IMAGE_BYTES,
    matches: (buffer) => buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  'image/webp': {
    extension: '.webp',
    acceptedExtensions: ['.webp'],
    maxBytes: MAX_EVIDENCE_IMAGE_BYTES,
    matches: (buffer) => buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP',
  },
};

const LOCAL_EVIDENCE_PATTERN = /^[a-f0-9-]{36}\.(pdf|jpg|png|webp)$/;
const DRIVE_EVIDENCE_PATTERN = /^drive_([A-Za-z0-9_-]+)$/;

export function isEvidenceFilename(filename) {
  return typeof filename === 'string' && LOCAL_EVIDENCE_PATTERN.test(filename);
}

export function isDriveEvidenceReference(filename) {
  return typeof filename === 'string' && DRIVE_EVIDENCE_PATTERN.test(filename);
}

export function isEvidenceDataUri(value) {
  return typeof value === 'string'
    && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]*={0,2}$/.test(value)
    && value.length <= 32767;
}

export function isEvidenceReference(value) {
  return isEvidenceDataUri(value) || isEvidenceFilename(value) || isDriveEvidenceReference(value);
}

function safeEvidenceName(originalName, definition) {
  const basename = String(originalName || '')
    .replace(/\\/g, '/')
    .split('/')
    .pop()
    .replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '_')
    .trim();
  const sourceName = basename || `payment-evidence${definition.extension}`;
  const extension = path.extname(sourceName).toLowerCase();
  if (extension && !definition.acceptedExtensions.includes(extension)) {
    throw new Error('The evidence file name extension does not match its file type.');
  }
  const finalExtension = extension || definition.extension;
  const stem = extension ? sourceName.slice(0, -extension.length) : sourceName;
  return `${stem.slice(0, 120 - finalExtension.length) || 'payment-evidence'}${finalExtension}`;
}

function decodeEvidence({ dataBase64, mediaType, originalName }) {
  const definition = EVIDENCE_TYPES[mediaType];
  if (!definition || typeof dataBase64 !== 'string' || !dataBase64.length
    || !/^[A-Za-z0-9+/]*={0,2}$/.test(dataBase64)) {
    throw new Error('Choose a PDF smaller than 10 MB or a JPEG, PNG, or WebP image smaller than 4 MB.');
  }
  if (dataBase64.length > Math.ceil(definition.maxBytes * 4 / 3) + 4) {
    throw new Error('The evidence file exceeds the allowed size.');
  }
  const file = Buffer.from(dataBase64, 'base64');
  if (!file.length || file.length > definition.maxBytes) {
    throw new Error('The evidence file exceeds the allowed size.');
  }
  if (file.toString('base64') !== dataBase64 || !definition.matches(file)) {
    throw new Error('The evidence file does not match its file type.');
  }
  return { file, mediaType, name: safeEvidenceName(originalName, definition), definition };
}

export async function storePaymentEvidence(upload, directory, drive = null, parentId = '') {
  const { file, mediaType, name, definition } = decodeEvidence(upload || {});
  if (drive) {
    const response = await drive.files.create({
      requestBody: {
        name,
        mimeType: mediaType,
        description: 'SSN Treasury maintenance payment evidence',
        ...(parentId ? { parents: [parentId] } : {}),
      },
      media: { mimeType: mediaType, body: Readable.from([file]) },
      fields: 'id',
      supportsAllDrives: true,
    });
    const fileId = response.data?.id;
    if (!fileId || !/^[A-Za-z0-9_-]+$/.test(fileId)) {
      throw new Error('Google Drive did not return a valid evidence file reference.');
    }
    return { evidenceFile: `drive_${fileId}`, evidenceName: name };
  }

  const dataUri = `data:${mediaType};base64,${upload.dataBase64}`;
  if (mediaType !== 'application/pdf' && dataUri.length <= MAX_EXCEL_EVIDENCE_BASE64_CHARS) {
    return { evidenceFile: dataUri, evidenceName: name };
  }
  const filename = `${randomUUID()}${definition.extension}`;
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, filename), file, { flag: 'wx', mode: 0o600 });
  return { evidenceFile: filename, evidenceName: name };
}

function definitionForFilename(filename) {
  const extension = path.extname(filename).toLowerCase();
  return Object.values(EVIDENCE_TYPES).find((definition) => definition.acceptedExtensions.includes(extension));
}

export async function readPaymentEvidence(filename, directory, drive = null) {
  if (isEvidenceDataUri(filename)) {
    const [, mediaType, encoded] = filename.match(/^data:([^;]+);base64,(.*)$/);
    return { buffer: Buffer.from(encoded, 'base64'), mediaType, filename: '' };
  }
  if (isDriveEvidenceReference(filename)) {
    if (!drive) throw new Error('Google Drive evidence storage is unavailable.');
    const fileId = filename.match(DRIVE_EVIDENCE_PATTERN)[1];
    const metadata = await drive.files.get({
      fileId,
      fields: 'name,mimeType',
      supportsAllDrives: true,
    });
    const response = await drive.files.get(
      { fileId, alt: 'media', supportsAllDrives: true },
      { responseType: 'arraybuffer' },
    );
    const mediaType = metadata.data?.mimeType;
    const definition = EVIDENCE_TYPES[mediaType];
    const buffer = Buffer.from(response.data);
    if (!definition || buffer.length > definition.maxBytes || !definition.matches(buffer)) {
      throw new Error('Evidence file type or content is not supported.');
    }
    return { buffer, mediaType, filename: String(metadata.data?.name || '') };
  }
  if (!isEvidenceFilename(filename)) throw new Error('Evidence file not found.');
  const definition = definitionForFilename(filename);
  const buffer = await readFile(path.join(directory, filename));
  if (!definition || buffer.length > definition.maxBytes || !definition.matches(buffer)) {
    throw new Error('Evidence file type or content is not supported.');
  }
  return {
    buffer,
    mediaType: Object.entries(EVIDENCE_TYPES).find(([, item]) => item === definition)?.[0],
    filename,
  };
}

export async function removePaymentEvidence(filename, directory, drive = null) {
  if (isEvidenceDataUri(filename)) return;
  if (isDriveEvidenceReference(filename)) {
    if (!drive) throw new Error('Google Drive evidence storage is unavailable.');
    await drive.files.delete({
      fileId: filename.match(DRIVE_EVIDENCE_PATTERN)[1],
      supportsAllDrives: true,
    });
    return;
  }
  if (!isEvidenceFilename(filename)) return;
  await rm(path.join(directory, filename), { force: true });
}
