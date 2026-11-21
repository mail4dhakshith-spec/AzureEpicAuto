const DEFAULT_SPREADSHEET_ID = '1UlZyYdeJN-qrLw2PZS8SxwuMO-qAYvDG';
const SHEETS = {
  users: { name: 'Users', headers: ['mobile', 'role', 'ownerId', 'status'] },
  owners: { name: 'Owners', headers: ['id', 'createdAt', 'name', 'email', 'phone', 'bank', 'account', 'status'] },
  expenses: { name: 'Expenses', headers: ['id', 'createdAt', 'updatedAt', 'ownerId', 'owner', 'category', 'description', 'amount', 'submittedAt', 'dueDate', 'status', 'attachmentName', 'attachmentUrl', 'reviewedBy', 'reviewedAt'] },
  payments: { name: 'Payments', headers: ['id', 'createdAt', 'ownerId', 'owner', 'amount', 'date', 'method', 'reference', 'expenseId', 'attachmentName', 'attachmentUrl'] },
};

function doPost(event) {
  try {
    const body = JSON.parse(event.postData.contents || '{}');
    const result = dispatch_(body);
    return json_({ ok: true, ...result });
  } catch (error) {
    return json_({ ok: false, error: error.message || String(error) });
  }
}

function doGet() {
  return json_({ ok: false, error: 'Use an authenticated POST request.' });
}

function dispatch_(body) {
  const user = verifyAccessToken_(body.accessToken);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    switch (body.action) {
      case 'bootstrap':
        return { data: user.app_metadata.role === 'admin' ? loadData_() : loadOwnerData_(user.app_metadata.ownerId) };
      case 'createOwner':
        requireAdmin_(user);
        return { owner: saveRecord_('owners', body.owner) };
      case 'importOwners':
        requireAdmin_(user);
        return { owners: (body.owners || []).map(function (owner) { return saveRecord_('owners', owner); }) };
      case 'createExpense':
        return { expense: createExpense_(body.expense, user) };
      case 'createPayment':
        requireAdmin_(user);
        return { payment: createPayment_(body.payment) };
      case 'updateExpenseStatus':
        requireAdmin_(user);
        return { expense: updateExpenseStatus_(body.id, body.status) };
      default:
        throw new Error('Unsupported action.');
    }
  } finally {
    lock.releaseLock();
  }
}

function loadData_() {
  return {
    owners: readRecords_('owners'),
    expenses: readRecords_('expenses'),
    payments: readRecords_('payments'),
  };
}

function loadOwnerData_(ownerId) {
  if (!ownerId) throw new Error('Owner account is missing its owner record link.');
  const data = loadData_();
  const owner = data.owners.find(function (record) { return String(record.id) === String(ownerId); });
  if (!owner) throw new Error('The owner account is not linked to an owner record.');
  return {
    owners: [owner],
    expenses: data.expenses.filter(function (record) { return String(record.ownerId) === String(ownerId); }),
    payments: data.payments.filter(function (record) { return String(record.ownerId) === String(ownerId); }),
  };
}

function createExpense_(input, user) {
  if (!input || !input.id) throw new Error('An expense request ID is required.');
  const ownerId = user.app_metadata.role === 'owner' ? user.app_metadata.ownerId : input.ownerId;
  if (!ownerId) throw new Error('Select an owner for this request.');
  const ownerSheet = getSheet_('owners');
  const ownerRow = findRow_(ownerSheet, ownerId);
  if (!ownerRow) throw new Error('Owner record not found.');
  const owner = rowToRecord_('owners', ownerSheet, ownerRow);
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Enter a valid expense amount.');
  const expense = {
    id: String(input.id), ownerId: owner.id, owner: owner.name,
    category: String(input.category || '').slice(0, 80),
    description: String(input.description || '').trim().slice(0, 120),
    amount: amount, submittedAt: new Date().toISOString().slice(0, 10),
    dueDate: String(input.dueDate || '').slice(0, 10), status: 'Pending',
    attachmentName: String(input.attachmentName || ''), attachment: input.attachment || null,
  };
  if (!expense.category || !expense.description) throw new Error('Category and description are required.');
  return saveRecord_('expenses', expense);
}

function saveRecord_(collection, record) {
  if (!record || !record.id) throw new Error('A record ID is required.');
  const saved = Object.assign({}, record);
  if (saved.attachment && saved.attachment.data) {
    const attachment = saveAttachment_(saved.attachment);
    saved.attachmentName = attachment.name;
    saved.attachmentUrl = attachment.url;
    delete saved.attachment;
  }
  const sheet = getSheet_(collection);
  const now = new Date().toISOString();
  if (!saved.createdAt) saved.createdAt = now;
  const config = SHEETS[collection];
  sheet.appendRow(config.headers.map(function (header) { return saved[header] === undefined ? '' : saved[header]; }));
  return saved;
}

function updateExpenseStatus_(id, status) {
  if (['Approved', 'Rejected'].indexOf(status) < 0) throw new Error('Invalid expense status.');
  const sheet = getSheet_('expenses');
  const row = findRow_(sheet, id);
  if (!row) throw new Error('Expense request not found.');
  const record = rowToRecord_('expenses', sheet, row);
  if (record.status !== 'Pending') throw new Error('Only pending requests can be approved or rejected.');
  record.status = status;
  record.updatedAt = new Date().toISOString();
  record.reviewedAt = record.updatedAt;
  record.reviewedBy = Session.getActiveUser().getEmail();
  writeRecord_(sheet, 'expenses', row, record);
  return record;
}

function readRecords_(collection) {
  const sheet = getSheet_(collection);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet.getRange(2, 1, lastRow - 1, SHEETS[collection].headers.length).getValues()
    .map(function (row) { return rowToRecord_(collection, sheet, row); })
    .reverse();
}

function createPayment_(payment) {
  if (payment && payment.expenseId) {
    const sheet = getSheet_('expenses');
    const row = findRow_(sheet, payment.expenseId);
    if (!row) throw new Error('Linked expense request not found.');
    const expense = rowToRecord_('expenses', sheet, row);
    if (expense.status !== 'Approved') throw new Error('Only approved requests can proceed to payment.');
    const saved = saveRecord_('payments', payment);
    expense.status = 'Paid';
    expense.updatedAt = new Date().toISOString();
    writeRecord_(sheet, 'expenses', row, expense);
    return saved;
  }
  return saveRecord_('payments', payment);
}

function findRow_(sheet, id) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (let index = 0; index < ids.length; index += 1) {
    if (String(ids[index][0]) === String(id)) return index + 2;
  }
  return 0;
}

function rowToRecord_(collection, sheet, row) {
  const headers = SHEETS[collection].headers;
  const values = Array.isArray(row) ? row : sheet.getRange(row, 1, 1, headers.length).getValues()[0];
  return headers.reduce(function (record, header, index) {
    record[header] = values[index] === undefined || values[index] === '' ? '' : values[index];
    return record;
  }, {});
}

function writeRecord_(sheet, collection, row, record) {
  const values = SHEETS[collection].headers.map(function (header) { return record[header] === undefined ? '' : record[header]; });
  sheet.getRange(row, 1, 1, values.length).setValues([values]);
}

function getSheet_(collection) {
  const config = SHEETS[collection];
  if (!config) throw new Error('Unknown record collection.');
  const properties = PropertiesService.getScriptProperties();
  const spreadsheetId = properties.getProperty('SPREADSHEET_ID') || DEFAULT_SPREADSHEET_ID;
  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  let sheet = spreadsheet.getSheetByName(config.name);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(config.name);
    sheet.appendRow(config.headers);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function saveAttachment_(attachment) {
  const bytes = Utilities.base64Decode(attachment.data);
  const blob = Utilities.newBlob(bytes, attachment.type || 'application/octet-stream', attachment.name || 'attachment');
  const folder = getDriveFolder_();
  const file = folder.createFile(blob);
  return { name: file.getName(), url: file.getUrl() };
}

function getDriveFolder_() {
  const properties = PropertiesService.getScriptProperties();
  const folderId = properties.getProperty('DRIVE_FOLDER_ID');
  if (folderId) return DriveApp.getFolderById(folderId);
  const folder = DriveApp.createFolder('Ledgerline Treasury Documents');
  properties.setProperty('DRIVE_FOLDER_ID', folder.getId());
  return folder;
}

function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}

function verifyAccessToken_(accessToken) {
  if (!accessToken) throw new Error('Sign in to continue.');
  const properties = PropertiesService.getScriptProperties();
  const projectUrl = (properties.getProperty('SUPABASE_URL') || '').replace(/\/$/, '');
  const publishableKey = properties.getProperty('SUPABASE_ANON_KEY');
  if (!projectUrl || !publishableKey) throw new Error('Supabase verification is not configured in Apps Script.');
  const response = UrlFetchApp.fetch(projectUrl + '/auth/v1/user', {
    method: 'get',
    headers: { apikey: publishableKey, Authorization: 'Bearer ' + accessToken },
    muteHttpExceptions: true,
  });
  if (response.getResponseCode() !== 200) throw new Error('Your session is invalid or expired. Sign in again.');
  const user = JSON.parse(response.getContentText());
  const metadata = user.app_metadata || {};
  if (!user.id || ['owner', 'admin'].indexOf(metadata.role) < 0) throw new Error('This account does not have an authorized treasury role.');
  const phone = normalizePhone_(user.phone);
  const matchingAccounts = readRecords_('users').filter(function (account) { return normalizePhone_(account.mobile) === phone; });
  if (matchingAccounts.length !== 1) throw new Error('This mobile number is not registered for treasury access.');
  const account = matchingAccounts[0];
  const role = String(account.role || '').trim().toLowerCase();
  if (String(account.status || '').trim().toLowerCase() !== 'active') throw new Error('This treasury account is inactive. Contact an administrator.');
  if (role !== metadata.role) throw new Error('The account role in Google Sheets does not match its authentication account.');
  if (role === 'owner') {
    if (!account.ownerId) throw new Error('Owner account is missing its owner record link.');
    if (!findRow_(getSheet_('owners'), account.ownerId)) throw new Error('Owner record not found for this account.');
    user.app_metadata.ownerId = String(account.ownerId);
  }
  return user;
}

function normalizePhone_(value) {
  return String(value || '').replace(/[\s()-]/g, '');
}

function requireAdmin_(user) {
  if (user.app_metadata.role !== 'admin') throw new Error('Administrator access is required for this action.');
}