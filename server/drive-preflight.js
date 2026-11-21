import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { createGoogleDrive } from './googleDrive.js';

const root = path.resolve(import.meta.dirname, '..');
dotenv.config({ path: path.join(root, '.env.local') });

const fileId = process.env.GOOGLE_DRIVE_FILE_ID || '';
const keyFile = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE || '';
const keyJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_JSON || '';

if (!fileId) throw new Error('GOOGLE_DRIVE_FILE_ID is missing.');
if (!keyFile && !keyJson) throw new Error('Set GOOGLE_SERVICE_ACCOUNT_KEY_FILE or GOOGLE_SERVICE_ACCOUNT_KEY_JSON.');

const drive = createGoogleDrive(keyFile ? path.resolve(root, keyFile) : '', keyJson);
try {
  const result = await drive.files.get({ fileId, fields: 'id,name,mimeType,capabilities/canEdit', supportsAllDrives: true });
  if (!result.data.capabilities?.canEdit) throw new Error('The service account can read but cannot edit the workbook.');
  console.log(JSON.stringify({ ok: true, id: result.data.id, name: result.data.name, mimeType: result.data.mimeType, canEdit: true }));
} catch (error) {
  const message = error.response?.data?.error?.message || error.message || String(error);
  throw new Error(`Google Drive preflight failed: ${message}`);
}
