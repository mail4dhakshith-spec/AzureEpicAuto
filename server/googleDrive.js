import { google } from 'googleapis';

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive';

export function createGoogleDrive(keyFile = '', keyJson = '') {
  let credentials;
  if (keyJson) {
    try {
      credentials = JSON.parse(keyJson);
    } catch {
      throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY_JSON must contain valid JSON.');
    }
  }
  const auth = credentials
    ? new google.auth.GoogleAuth({ credentials, scopes: [DRIVE_SCOPE] })
    : new google.auth.GoogleAuth({ keyFile, scopes: [DRIVE_SCOPE] });
  return google.drive({ version: 'v3', auth });
}
