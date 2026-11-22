import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import { access, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { ExcelTreasuryRepository } from './excelRepository.js';
import { createGoogleDrive } from './googleDrive.js';
import { GoogleDriveExcelRepository } from './googleDriveExcelRepository.js';
import { createSessionToken, verifyPassword, verifySessionToken } from './auth.js';
import { isEvidenceDataUri, isEvidenceFilename, readPaymentEvidence, removePaymentEvidence, storePaymentEvidence } from './paymentEvidence.js';
import { isExpenseAttachmentFilename, readExpenseAttachment, removeExpenseAttachment, storeExpenseAttachment } from './expenseAttachments.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(root, '.env.local') });
dotenv.config();

const port = Number(process.env.PORT || process.env.API_PORT || 8787);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid TCP port.');
const authSecret = process.env.AUTH_SECRET || '';
const driveFileId = process.env.GOOGLE_DRIVE_FILE_ID || '';
const driveKeyFile = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE || '';
const driveKeyJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_JSON || '';
const workbookPath = driveFileId
  ? path.join(os.tmpdir(), `ssn-treasury-${process.pid}.xlsx`)
  : (process.env.EXCEL_DB_PATH || path.join(root, 'data', 'ssn_treasury.xlsx'));
const evidenceDirectory = path.join(path.dirname(path.resolve(workbookPath)), 'payment-evidence');
const expenseAttachmentDirectory = path.join(path.dirname(path.resolve(workbookPath)), 'expense-attachments');
const incomeAttachmentDirectory = path.join(path.dirname(path.resolve(workbookPath)), 'income-attachments');
const distPath = path.join(root, 'dist');
if (process.env.NODE_ENV === 'production' && (!driveFileId || (!driveKeyFile && !driveKeyJson))) {
  throw new Error('Production requires GOOGLE_DRIVE_FILE_ID and GOOGLE_SERVICE_ACCOUNT_KEY_JSON or GOOGLE_SERVICE_ACCOUNT_KEY_FILE.');
}
if (Boolean(driveFileId) !== Boolean(driveKeyFile || driveKeyJson)) throw new Error('Set GOOGLE_DRIVE_FILE_ID and GOOGLE_SERVICE_ACCOUNT_KEY_FILE or GOOGLE_SERVICE_ACCOUNT_KEY_JSON to enable Google Drive storage.');
const drive = driveFileId
  ? createGoogleDrive(driveKeyFile, driveKeyJson, root)
  : null;
const repository = drive
  ? new GoogleDriveExcelRepository(workbookPath, { drive, fileId: driveFileId })
  : new ExcelTreasuryRepository(workbookPath);
let repositoryReady = false;
const ownerLoginAttempts = new Map();
const allowedOrigins = new Set((process.env.ALLOWED_ORIGINS || process.env.FRONTEND_URL || 'http://localhost:5173,http://127.0.0.1:5173,https://ssn-community-finance.pages.dev')
  .split(',').map((origin) => origin.trim()).filter(Boolean));

function applyCors(request, response) {
  const origin = String(request.headers.origin || '').trim();
  if (allowedOrigins.has(origin)) {
    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Vary', 'Origin');
  }
  response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
}

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_ATTEMPT_LIMIT = 8;

if (authSecret.length < 32) throw new Error('Set AUTH_SECRET to a random value of at least 32 characters in .env.local.');

function sendJson(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  let text = '';
  for await (const chunk of request) {
    text += chunk;
    if (text.length > 14 * 1024 * 1024) throw new Error('Request body is too large.');
  }
  return text ? JSON.parse(text) : {};
}

async function verifyUser(request) {
  const token = request.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) {
    const error = new Error('Sign in to continue.');
    error.status = 401;
    throw error;
  }
  const user = verifySessionToken(token, authSecret);
  if (!user) {
    const error = new Error('Your session is invalid or expired. Sign in again.');
    error.status = 401;
    throw error;
  }
  return user;
}

function requireAdmin(user) {
  if (user.app_metadata.role !== 'admin') {
    const error = new Error('Administrator access is required for this action.');
    error.status = 403;
    throw error;
  }
}

function allowOwnerLogin(request, username) {
  const now = Date.now();
  const address = request.socket.remoteAddress || 'local';
  const key = `${address}:${username.toLowerCase()}`;
  const recent = (ownerLoginAttempts.get(key) || []).filter((attempt) => now - attempt < LOGIN_WINDOW_MS);
  if (recent.length >= LOGIN_ATTEMPT_LIMIT) return false;
  recent.push(now);
  ownerLoginAttempts.set(key, recent);
  return true;
}

async function signIn(request, response) {
  if (request.method !== 'POST') return sendJson(response, 404, { error: 'Route not found.' });
  try {
    const body = await readJson(request);
    const mobileNumber = String(body.mobileNumber || '').trim();
    const password = String(body.password || '');
    if (!/^\+?[\d\s()-]{8,24}$/.test(mobileNumber) || !password || password.length > 256) {
      return sendJson(response, 401, { error: 'Mobile number or password is incorrect.' });
    }
    const limitKey = `login:${mobileNumber.replace(/[^\d+]/g, '')}`;
    if (!allowOwnerLogin(request, limitKey)) return sendJson(response, 429, { error: 'Too many sign-in attempts. Try again later.' });
    const storedAccount = await repository.findAccountByMobileNumber(mobileNumber);
    if (!storedAccount || !await verifyPassword(password, storedAccount.password)) return sendJson(response, 401, { error: 'Mobile number or password is incorrect.' });
    const role = String(storedAccount.role || '').trim().toLowerCase() === 'admin' ? 'admin' : 'owner';
    const account = {
      id: storedAccount.ownerId,
      username: storedAccount.username,
      role,
      ownerId: storedAccount.ownerId,
      name: storedAccount.name,
      phone: storedAccount.mobileNumber,
    };
    const token = createSessionToken(account, authSecret);
    ownerLoginAttempts.delete(`${request.socket.remoteAddress || 'local'}:${limitKey}`);
    return sendJson(response, 200, {
      ok: true,
      token,
      user: {
        id: account.id,
        username: account.username,
        role: account.role,
        user_metadata: { full_name: account.name },
      },
    });
  } catch (error) {
    return sendJson(response, error.status || 400, { error: error.message || 'Sign-in could not be completed.' });
  }
}

async function forgotPassword(request, response) {
  if (request.method !== 'POST') return sendJson(response, 404, { error: 'Route not found.' });
  try {
    const body = await readJson(request);
    const mobileNumber = String(body.mobileNumber || '').trim();
    if (/^\+?[\d\s()-]{8,24}$/.test(mobileNumber)) {
      await repository.findAccountByMobileNumber(mobileNumber);
    }
    return sendJson(response, 200, { ok: true, message: 'If this mobile number is registered, contact the administrator to reset or recover the password.' });
  } catch (error) {
    return sendJson(response, 400, { error: error.message || 'Password recovery could not be completed.' });
  }
}

async function authSession(request, response) {
  if (request.method !== 'GET') return sendJson(response, 404, { error: 'Route not found.' });
  try {
    const user = await verifyUser(request);
    return sendJson(response, 200, {
      ok: true,
      user: { id: user.id, username: user.username, role: user.app_metadata.role, user_metadata: user.user_metadata },
    });
  } catch (error) {
    return sendJson(response, error.status || 401, { error: error.message || 'Your session is invalid or expired.' });
  }
}

async function servePaymentEvidence(request, response) {
  if (request.method !== 'GET') return sendJson(response, 404, { error: 'Route not found.' });
  const filename = request.url?.match(/^\/api\/maintenance\/evidence\/([^/?]+)$/)?.[1] || '';
  if (!isEvidenceFilename(filename) && !isEvidenceDataUri(filename)) return sendJson(response, 404, { error: 'Evidence image not found.' });
  try {
    const user = await verifyUser(request);
    if (!await repository.canAccessMaintenanceEvidence(filename, user)) return sendJson(response, 404, { error: 'Evidence image not found.' });
    const image = await readPaymentEvidence(filename, evidenceDirectory);
    const mediaType = filename.endsWith('.jpg') ? 'image/jpeg' : filename.endsWith('.png') ? 'image/png' : 'image/webp';
    response.writeHead(200, {
      'Content-Type': mediaType,
      'Content-Length': image.length,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    return response.end(image);
  } catch (error) {
    return sendJson(response, error.status || 404, { error: error.status ? error.message : 'Evidence image not found.' });
  }
}

async function serveIncomeAttachment(request, response) {
  if (request.method !== 'GET') return sendJson(response, 404, { error: 'Route not found.' });
  const filename = request.url?.match(/^\/api\/income\/attachments\/([^/?]+)$/)?.[1] || '';
  if (!isExpenseAttachmentFilename(filename)) return sendJson(response, 404, { error: 'Attachment not found.' });
  try {
    const user = await verifyUser(request);
    if (!await repository.canAccessIncomeAttachment(filename, user)) return sendJson(response, 404, { error: 'Attachment not found.' });
    const attachment = await readExpenseAttachment(filename, incomeAttachmentDirectory);
    const mediaType = filename.endsWith('.pdf') ? 'application/pdf' : filename.endsWith('.jpg') ? 'image/jpeg' : filename.endsWith('.png') ? 'image/png' : 'image/webp';
    response.writeHead(200, { 'Content-Type': mediaType, 'Content-Length': attachment.length, 'Content-Disposition': `inline; filename="${filename}"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
    return response.end(attachment);
  } catch (error) {
    return sendJson(response, error.status || 404, { error: error.status ? error.message : 'Attachment not found.' });
  }
}

async function serveExpenseAttachment(request, response) {
  if (request.method !== 'GET') return sendJson(response, 404, { error: 'Route not found.' });
  const filename = request.url?.match(/^\/api\/expenses\/attachments\/([^/?]+)$/)?.[1] || '';
  if (!isExpenseAttachmentFilename(filename)) return sendJson(response, 404, { error: 'Attachment not found.' });
  try {
    const user = await verifyUser(request);
    if (user.app_metadata.role !== 'admin' || !await repository.canAccessExpenseAttachment(filename, user)) {
      return sendJson(response, 404, { error: 'Attachment not found.' });
    }
    const attachment = await readExpenseAttachment(filename, expenseAttachmentDirectory);
    const mediaType = filename.endsWith('.pdf') ? 'application/pdf' : filename.endsWith('.jpg') ? 'image/jpeg' : filename.endsWith('.png') ? 'image/png' : 'image/webp';
    response.writeHead(200, {
      'Content-Type': mediaType,
      'Content-Length': attachment.length,
      'Content-Disposition': `inline; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    return response.end(attachment);
  } catch (error) {
    return sendJson(response, error.status || 404, { error: error.status ? error.message : 'Attachment not found.' });
  }
}

async function api(request, response) {
  if (request.method === 'GET' && request.url === '/api/health') {
    const data = await repository.read().catch(() => null);
    const adminConfigured = Boolean(data?.owners?.some((owner) => owner.role === 'Admin'));
    return sendJson(response, 200, { ok: true, storage: driveFileId ? 'google-drive' : 'excel', workbook: driveFileId ? 'Google Drive: ssn_treasury.xlsx' : path.basename(workbookPath), adminConfigured });
  }
  if (request.method !== 'POST' || request.url !== '/api') {
    return sendJson(response, 404, { error: 'API route not found.' });
  }
  try {
    const user = await verifyUser(request);
    const body = await readJson(request);
    let result;
    switch (body.action) {
      case 'bootstrap':
        result = { data: await repository.getData(user, body.financialYear || '') };
        break;
      case 'getMyMaintenance':
        result = { maintenance: await repository.getMyMaintenance(user, body.financialYear || '') };
        break;
      case 'getIncome':
        result = { income: await repository.getIncome(user, body.financialYear || '') };
        break;
      case 'createIncome':
      {
        const evidenceFile = body.attachment ? await storeExpenseAttachment(body.attachment, incomeAttachmentDirectory) : '';
        try {
          result = { income: await repository.createIncome({ ...(body.income || {}), evidenceName: body.attachment?.originalName || '', evidenceFile }, user) };
        } catch (error) {
          if (evidenceFile) await removeExpenseAttachment(evidenceFile, incomeAttachmentDirectory);
          throw error;
        }
        break;
      }
      case 'updateIncome':
      {
        const evidenceFile = body.attachment ? await storeExpenseAttachment(body.attachment, incomeAttachmentDirectory) : body.income?.evidenceFile || '';
        try {
          result = { income: await repository.updateIncome(body.id, { ...(body.income || {}), evidenceName: body.attachment?.originalName || body.income?.evidenceName || '', evidenceFile }, user) };
        } catch (error) {
          if (body.attachment && evidenceFile) await removeExpenseAttachment(evidenceFile, incomeAttachmentDirectory);
          throw error;
        }
        break;
      }
      case 'updateIncomeStatus':
        requireAdmin(user);
        result = { income: await repository.updateIncomeStatus(body.id, body.status, body.comments, user) };
        break;
      case 'getOwnersMaintenance':
        requireAdmin(user);
        result = { maintenance: await repository.getOwnersMaintenance(body.financialYear || '') };
        break;
      case 'createOwner':
        requireAdmin(user);
        result = { owner: await repository.createOwner(body.owner || {}, user) };
        break;
      case 'importOwners':
        requireAdmin(user);
        result = { owners: await repository.importOwners(body.owners || [], user) };
        break;
      case 'updateOwner':
        requireAdmin(user);
        result = { owner: await repository.updateOwner(body.id, body.owner || {}) };
        break;
      case 'deleteOwner':
        requireAdmin(user);
        result = await repository.deleteOwner(body.id);
        await Promise.all(result.deletedEvidenceFiles.map((filename) => removePaymentEvidence(filename, evidenceDirectory)));
        await Promise.all(result.deletedExpenseFiles.map((filename) => removeExpenseAttachment(filename, expenseAttachmentDirectory)));
        delete result.deletedEvidenceFiles;
        delete result.deletedExpenseFiles;
        break;
      case 'createExpense':
      {
        const attachmentFile = body.attachment ? await storeExpenseAttachment(body.attachment, expenseAttachmentDirectory) : '';
        try {
          result = { expense: await repository.createExpense({
            ...(body.expense || {}),
            attachmentName: body.attachment?.originalName || '',
            attachmentFile,
          }, user) };
        } catch (error) {
          if (attachmentFile) await removeExpenseAttachment(attachmentFile, expenseAttachmentDirectory);
          throw error;
        }
        break;
      }
      case 'updateExpenseStatus':
        requireAdmin(user);
        result = { expense: await repository.updateExpenseStatus(body.id, body.status, body.comment, user) };
        break;
      case 'deleteExpense':
        requireAdmin(user);
        result = { deletedExpense: await repository.deleteExpense(body.id) };
        await removeExpenseAttachment(result.deletedExpense.attachmentFile, expenseAttachmentDirectory);
        delete result.deletedExpense.attachmentFile;
        break;
      case 'saveFinancialYear':
        requireAdmin(user);
        result = { financialYear: await repository.saveFinancialYear(body, user) };
        break;
      case 'generateQuarterlyMaintenance':
        requireAdmin(user);
        result = await repository.generateQuarterlyMaintenance(body, user);
        break;
      case 'updateOwnerMaintenanceDetails': {
        if (user.app_metadata.role !== 'owner') {
          const error = new Error('Owner access is required to submit payment details.');
          error.status = 403;
          throw error;
        }
        const evidenceFile = body.evidence ? await storePaymentEvidence(body.evidence, evidenceDirectory) : '';
        try {
          const update = await repository.updateOwnerMaintenanceDetails({ ...body, evidenceFile }, user);
          if (update.previousEvidenceFile && update.previousEvidenceFile !== update.payment.evidenceFile) {
            await removePaymentEvidence(update.previousEvidenceFile, evidenceDirectory);
          }
          result = { payment: update.payment };
        } catch (error) {
          if (evidenceFile) await removePaymentEvidence(evidenceFile, evidenceDirectory);
          throw error;
        }
        break;
      }
      case 'updateMaintenanceStatus':
        requireAdmin(user);
        result = { payment: await repository.updateMaintenanceStatus(body, user) };
        break;
      case 'deleteMaintenance':
        requireAdmin(user);
        result = { deletedMaintenance: await repository.deleteMaintenance(body, user) };
        await removePaymentEvidence(result.deletedMaintenance.evidenceFile, evidenceDirectory);
        delete result.deletedMaintenance.evidenceFile;
        break;
      default: {
        const error = new Error('Unsupported treasury action.');
        error.status = 400;
        throw error;
      }
    }
    return sendJson(response, 200, { ok: true, ...result });
  } catch (error) {
    return sendJson(response, error.status || 400, { ok: false, error: error.message || 'The request could not be completed.' });
  }
}

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

async function staticFile(request, response) {
  let distAvailable = true;
  try {
    await access(path.join(distPath, 'index.html'));
  } catch {
    distAvailable = false;
  }
  if (!distAvailable) return sendJson(response, 404, { error: 'Build the React app or use the Vite dev server.' });
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  const requestedFile = path.resolve(distPath, pathname === '/' ? './index.html' : `.${pathname}`);
  if (!requestedFile.startsWith(distPath + path.sep) && requestedFile !== path.join(distPath, 'index.html')) {
    return sendJson(response, 403, { error: 'Invalid path.' });
  }
  let filePath = requestedFile;
  try {
    const file = await readFile(filePath);
    response.writeHead(200, { 'Content-Type': MIME_TYPES[path.extname(filePath)] || 'application/octet-stream' });
    return response.end(file);
  } catch {
    filePath = path.join(distPath, 'index.html');
    const file = await readFile(filePath);
    response.writeHead(200, { 'Content-Type': MIME_TYPES['.html'] });
    return response.end(file);
  }
}

const server = http.createServer((request, response) => {
  applyCors(request, response);
  if (request.method === 'OPTIONS') {
    const originAllowed = allowedOrigins.has(String(request.headers.origin || '').trim());
    response.writeHead(originAllowed ? 204 : 403);
    response.end();
    return;
  }
  const requestPath = request.url ? new URL(request.url, 'http://localhost').pathname : '/';
  if ((request.method === 'GET' || request.method === 'HEAD') && (requestPath === '/health' || requestPath === '/healthz')) {
    response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    return response.end(request.method === 'HEAD' ? undefined : JSON.stringify({ ok: true }));
  }
  if (request.url?.startsWith('/api/') && !repositoryReady) {
    return sendJson(response, 503, { ok: false, error: 'Treasury storage is initializing.' });
  }
  if (request.url === '/api/auth/signin') return signIn(request, response);
  if (request.url === '/api/auth/forgot-password') return forgotPassword(request, response);
  if (request.url === '/api/auth/session') return authSession(request, response);
  if (request.url?.startsWith('/api/maintenance/evidence/')) return servePaymentEvidence(request, response);
  if (request.url?.startsWith('/api/expenses/attachments/')) return serveExpenseAttachment(request, response);
  if (request.url?.startsWith('/api/income/attachments/')) return serveIncomeAttachment(request, response);
  if (request.url?.startsWith('/api/')) return api(request, response);
  if (request.url === '/api') return api(request, response);
  if (request.method === 'HEAD' && requestPath === '/') {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    return response.end();
  }
  if (request.method === 'GET') return staticFile(request, response);
  return sendJson(response, 404, { error: 'Route not found.' });
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Treasury API listening on port ${port}/api`);
  console.log(driveFileId ? `Google Drive workbook: ${driveFileId} (OS-temp cache only)` : `Excel database: ${workbookPath}`);
});

repository.initialize()
  .then(async () => {
    const adminAccount = (await repository.read()).owners.find((owner) => owner.role === 'Admin');
    if (!adminAccount) console.warn('No Admin account exists. Add a row with Role=Admin to the Google Sheet Owner Details before Admin login or owner-related approval actions.');
    repositoryReady = true;
  })
  .catch((error) => {
    console.error(`Treasury storage initialization failed: ${error.message}`);
  });