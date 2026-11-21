import fs from 'node:fs';
import path from 'node:path';
import { google } from 'googleapis';
import { GoogleAuth, JWT } from 'google-auth-library';

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive';

export function createGoogleDrive(keyFile = '', keyJson = '', workspaceRoot = process.cwd()) {
  let credentials;
  if (keyJson) {
    try {
      credentials = JSON.parse(keyJson);
    } catch {
      throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY_JSON must contain valid JSON. Paste the complete service-account JSON without escaping it or wrapping it in quotes.');
    }
    if (!credentials.client_email || !credentials.private_key || !credentials.project_id) {
      throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY_JSON is missing type, client_email, private_key, or project_id.');
    }
    credentials.private_key = credentials.private_key.replace(/\\n/g, '\n').replace(/\r\n/g, '\n');
  }
  if (!credentials && keyFile) {
    const resolvedKeyFile = path.resolve(workspaceRoot, keyFile);
    if (!fs.existsSync(resolvedKeyFile)) {
      throw new Error(`Google service-account credential file was not found: ${keyFile}`);
    }
    try {
      credentials = JSON.parse(fs.readFileSync(resolvedKeyFile, 'utf8'));
    } catch (error) {
      throw new Error(`Google service-account credential file is invalid: ${keyFile}`);
    }
  }
  if (!credentials) {
    throw new Error('A Google service-account credential is required. Set GOOGLE_SERVICE_ACCOUNT_KEY_JSON or GOOGLE_SERVICE_ACCOUNT_KEY_FILE.');
  }
  if (!credentials.client_email || !credentials.private_key || !credentials.project_id) {
    throw new Error('Google service-account credential is missing client_email, private_key, or project_id.');
  }
  credentials.private_key = credentials.private_key.replace(/\\n/g, '\n').replace(/\r\n/g, '\n');
  const jwt = new JWT({ email: credentials.client_email, key: credentials.private_key, scopes: [DRIVE_SCOPE] });
  const auth = new GoogleAuth({ authClient: jwt, scopes: [DRIVE_SCOPE] });
  return google.drive({ version: 'v3', auth });
}
