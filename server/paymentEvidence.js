export const MAX_EVIDENCE_IMAGE_BYTES = 4 * 1024 * 1024;
export const MAX_EXCEL_EVIDENCE_BASE64_CHARS = 24 * 1024;

const IMAGE_TYPES = {
  'image/jpeg': { extension: 'jpg', matches: (buffer) => buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff },
  'image/png': { extension: 'png', matches: (buffer) => buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  'image/webp': { extension: 'webp', matches: (buffer) => buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP' },
};

export function isEvidenceFilename(filename) {
  return typeof filename === 'string' && /^[a-f0-9-]{36}\.(jpg|png|webp)$/.test(filename);
}

export function isEvidenceDataUri(value) {
  return typeof value === 'string' && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]*={0,2}$/.test(value)
    && value.length <= 32767;
}

export async function storePaymentEvidence({ dataBase64, mediaType }) {
  const definition = IMAGE_TYPES[mediaType];
  if (!definition || typeof dataBase64 !== 'string' || !dataBase64.length || dataBase64.length > Math.ceil(MAX_EVIDENCE_IMAGE_BYTES * 4 / 3) + 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(dataBase64)) {
    throw new Error('Choose a JPEG, PNG, or WebP image smaller than 4 MB.');
  }
  const image = Buffer.from(dataBase64, 'base64');
  if (!image.length || image.length > MAX_EVIDENCE_IMAGE_BYTES) throw new Error('Choose a JPEG, PNG, or WebP image smaller than 4 MB.');
  if (image.toString('base64') !== dataBase64 || !definition.matches(image)) {
    throw new Error('The evidence file is not a valid image.');
  }
  const dataUri = `data:${mediaType};base64,${dataBase64}`;
  if (dataUri.length > MAX_EXCEL_EVIDENCE_BASE64_CHARS) {
    throw new Error('Compress the evidence image so its Base64 value is under 24 KB.');
  }
  return dataUri;
}

export async function readPaymentEvidence(filename, directory) {
  if (isEvidenceDataUri(filename)) {
    const encoded = filename.slice(filename.indexOf(',') + 1);
    return Buffer.from(encoded, 'base64');
  }
  if (!isEvidenceFilename(filename)) throw new Error('Evidence image not found.');
  const { readFile } = await import('node:fs/promises');
  const pathModule = await import('node:path');
  return readFile(pathModule.join(directory, filename));
}

export async function removePaymentEvidence(filename, directory) {
  if (isEvidenceDataUri(filename)) return;
  if (!isEvidenceFilename(filename)) return;
  const { rm } = await import('node:fs/promises');
  const pathModule = await import('node:path');
  await rm(pathModule.join(directory, filename), { force: true });
}