import { google } from 'googleapis';

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive';

export function createGoogleDrive(keyFile = '', keyJson = '') {
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
  const auth = credentials
    ? new google.auth.GoogleAuth({ credentials, scopes: [DRIVE_SCOPE] })
    : new google.auth.GoogleAuth({ keyFile, scopes: [DRIVE_SCOPE] });
  return google.drive({ version: 'v3', auth });
}
