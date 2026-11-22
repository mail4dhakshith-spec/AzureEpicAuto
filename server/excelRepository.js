import { access, mkdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { hashPassword, verifyPassword } from './auth.js';
import { isExpenseAttachmentFilename } from './expenseAttachments.js';
import { isEvidenceDataUri, isEvidenceFilename, isDriveEvidenceReference } from './paymentEvidence.js';
import readExcelFile from 'read-excel-file/node';
import writeExcelFile from 'write-excel-file/node';

export const QUARTERLY_MAINTENANCE_AMOUNT = 1500;
export const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4'];
export const STATUSES = ['Pending', 'Pending Approval', 'Approved', 'Rejected', 'Paid'];
export const EXPENSE_TYPES = ['Phase 1 Park', 'Phase 2 Park', 'Road', 'Phase 3 Park', 'Mandabam', 'EB Work', 'Security Payment'];

export const SHEETS = {
  owners: {
    name: 'Owner Details',
    headers: ['Owner ID', 'User Name', 'Password', 'Name', 'Mobile Number', 'Email', 'Phase', 'Plot Number', 'Address', 'Secondary Mobile Number', 'Secondary Email', 'Created Date', 'Created By', 'Role', 'Move-In Date'],
    fields: ['ownerId', 'username', 'password', 'name', 'mobileNumber', 'email', 'phase', 'plotNumber', 'address', 'secondaryMobileNumber', 'secondaryEmail', 'createdDate', 'createdBy', 'role', 'moveInDate'],
  },
  expenses: {
    name: 'Expense Details',
    headers: ['Expense ID', 'Title', 'Description', 'Comment', 'Amount', 'Approved By', 'Requested By', 'Status', 'Attachment Name', 'Attachment File', 'Expense Type', 'Evidence Name', 'Evidence File', 'Financial Year'],
    fields: ['expenseId', 'title', 'description', 'comment', 'amount', 'approvedBy', 'requestedBy', 'status', 'attachmentName', 'attachmentFile', 'expenseType', 'evidenceName', 'evidenceFile', 'financialYear'],
  },
  maintenance: {
    name: 'Maintenance Payment Details',
    headers: ['Owner ID', 'Owner Name', 'Title', 'Quarter', 'Plot Number', 'Phase Number', 'Payment Amount', 'Status', 'Created Date', 'Created By', 'Payment Date', 'Payment Method', 'Reference', 'Evidence Name', 'Evidence File', 'Financial Year', 'Paid Amount', 'Remarks'],
    fields: ['ownerId', 'ownerName', 'title', 'quarter', 'plotNumber', 'phaseNumber', 'paymentAmount', 'status', 'createdDate', 'createdBy', 'paymentDate', 'paymentMethod', 'reference', 'evidenceName', 'evidenceFile', 'financialYear', 'paidAmount', 'remarks'],
  },
  income: {
    name: 'Income Details',
    headers: ['Income ID', 'Income Title', 'Description', 'Income Amount', 'Income Date', 'Financial Year', 'Income Status', 'Requested By', 'Approved By', 'Approved Date', 'Created Date', 'Comments', 'Evidence Name', 'Evidence File'],
    fields: ['incomeId', 'title', 'description', 'amount', 'incomeDate', 'financialYear', 'status', 'requestedBy', 'approvedBy', 'approvedDate', 'createdDate', 'comments', 'evidenceName', 'evidenceFile'],
  },
  financialYears: {
    name: 'Financial Year Configuration',
    headers: ['Financial Year', 'Start Date', 'End Date', 'Quarterly Amount', 'Status', 'Created Date', 'Created By'],
    fields: ['financialYear', 'startDate', 'endDate', 'quarterlyAmount', 'status', 'createdDate', 'createdBy'],
  },
};

const PHASES = ['Phase 1', 'Phase 2', 'Phase 3'];

function normalizedPhone(value) {
  return String(value || '').replace(/[\s()+-]/g, '').replace(/^91(?=\d{10}$)/, '');
}

function normalizedText(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizedRole(value) {
  return normalizedText(value) === 'admin' ? 'Admin' : 'Member';
}

function clean(value, maxLength = 500) {
  return String(value ?? '').trim().slice(0, maxLength);
}

function isoDate(value = new Date()) {
  return new Date(value).toISOString().slice(0, 10);
}

function financialYearFromDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || '').trim())) return '';
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getUTCMonth() >= 3 ? date.getUTCFullYear() : date.getUTCFullYear() - 1;
  return `${year}-${String(year + 1).slice(-2)}`;
}

function maintenanceFinancialYear(record) {
  const financialYear = String(record.financialYear || '').trim();
  if (financialYear) return financialYear;
  const titleFinancialYear = String(record.title || '').match(/FY\s+(\d{4}-\d{2})/i)?.[1];
  return titleFinancialYear || financialYearFromDate(record.paymentDate || record.createdDate);
}

function maintenanceMatchesFinancialYear(record, selectedFinancialYear) {
  return !selectedFinancialYear || maintenanceFinancialYear(record) === selectedFinancialYear;
}

function actorName(user) {
  return clean(user.user_metadata?.full_name || user.user_metadata?.name || user.phone || user.id, 100);
}

function storeOwnerPassword(password) {
  if (!password) throw new Error('Set a password for this Owner.');
  return hashPassword(password);
}

function authenticatedOwnerId(user) {
  if (!['owner', 'admin'].includes(user?.app_metadata?.role)) {
    throw Object.assign(new Error('Owner or Admin access is required.'), { status: 403 });
  }
  const ownerId = String(user.app_metadata.ownerId || user.id || '');
  if (!ownerId) throw Object.assign(new Error('No Owner ID is linked to this account.'), { status: 403 });
  return ownerId;
}

function publicOwner(owner) {
  return {
    ...Object.fromEntries(Object.entries(owner).filter(([key]) => key !== 'password')),
    id: owner.ownerId,
    phone: owner.mobileNumber,
    secondaryPhone: owner.secondaryMobileNumber,
    passwordConfigured: Boolean(owner.password),
  };
}

function cellsToRecords(definition, rows) {
  const [headerRow = []] = rows;
  const actualHeaders = headerRow.map((cell) => String(cell ?? '').trim());
  const ownerSheet = definition.name === 'Owner Details';
  const maintenanceSheet = definition.name === 'Maintenance Payment Details';
  const expenseSheet = definition.name === 'Expense Details';
  const ownerHeadersForLegacyVariant = ownerSheet ? definition.headers.slice(0, -1) : [];
  const legacyHeaders = ownerSheet ? ownerHeadersForLegacyVariant.filter((header) => !['User Name', 'Password'].includes(header)) : [];
  const headersWithoutPassword = ownerSheet ? ownerHeadersForLegacyVariant.filter((header) => header !== 'Password') : [];
  const priorUsernameHeaders = headersWithoutPassword.map((header) => header === 'User Name' ? 'Username' : header);
  const headersWithoutRole = ownerSheet ? ownerHeadersForLegacyVariant.filter((header) => header !== 'Role') : [];
  const headersWithoutPasswordOrRole = ownerSheet ? ownerHeadersForLegacyVariant.filter((header) => !['Password', 'Role'].includes(header)) : [];
  const priorUsernameHeadersWithoutRole = headersWithoutPasswordOrRole.map((header) => header === 'User Name' ? 'Username' : header);
  const legacyMaintenanceHeaders = maintenanceSheet ? definition.headers.slice(0, 10) : [];
  const maintenanceHeadersWithoutPaymentDetails = maintenanceSheet ? definition.headers.slice(0, -2) : [];
  const maintenanceHeadersWithPaidAmount = maintenanceSheet ? definition.headers.slice(0, -1) : [];
  const maintenanceHeadersWithoutFinancialYear = maintenanceSheet ? definition.headers.slice(0, 15) : [];
  const legacyExpenseHeaders = expenseSheet ? definition.headers.slice(0, 8) : [];
  const expenseHeadersWithAttachments = expenseSheet ? definition.headers.slice(0, 10) : [];
  const expenseHeadersCurrent = expenseSheet ? definition.headers.slice(0, 11) : [];
  const expenseHeadersWithEvidence = expenseSheet ? definition.headers.slice(0, -1) : [];
  const incomeSheet = definition.name === 'Income Details';
  const legacyIncomeHeaders = incomeSheet ? definition.headers.slice(0, 12) : [];
  const headerVariants = ownerSheet ? [ownerHeadersForLegacyVariant, legacyHeaders, headersWithoutPassword, priorUsernameHeaders, headersWithoutRole, headersWithoutPasswordOrRole, priorUsernameHeadersWithoutRole] : maintenanceSheet ? [legacyMaintenanceHeaders, maintenanceHeadersWithoutFinancialYear, maintenanceHeadersWithoutPaymentDetails, maintenanceHeadersWithPaidAmount] : expenseSheet ? [legacyExpenseHeaders, expenseHeadersWithAttachments, expenseHeadersCurrent, expenseHeadersWithEvidence] : incomeSheet ? [legacyIncomeHeaders] : [];
  const matchingHeaders = headerVariants.find((headers) => headers.length === actualHeaders.length && headers.every((header, index) => actualHeaders[index] === header));
  const expectedHeaders = matchingHeaders || definition.headers;
  const fields = matchingHeaders ? expectedHeaders.map((header) => definition.headers.indexOf(header === 'Username' ? 'User Name' : header)).map((index) => definition.fields[index]) : definition.fields;
  if (expectedHeaders.some((header, index) => actualHeaders[index] !== header) || actualHeaders.length !== expectedHeaders.length) {
    throw new Error(`The "${definition.name}" worksheet has unexpected columns. Keep the template headers unchanged.`);
  }
  return rows.slice(1).filter((row) => row.some((cell) => cell !== null && cell !== undefined && String(cell).trim() !== '')).map((row) => (
    Object.fromEntries(fields.map((field, index) => [field, row[index] instanceof Date ? isoDate(row[index]) : row[index] ?? '']))
  ));
}

function recordsToSheet(definition, records) {
  return [definition.headers, ...records.map((record) => definition.fields.map((field) => record[field] ?? ''))];
}

function nextId(prefix, key, records) {
  const max = records.reduce((value, row) => Math.max(value, Number(String(row[key] || '').match(/(\d+)$/)?.[1]) || 0), 0);
  return `${prefix}-${String(max + 1).padStart(5, '0')}`;
}

function publicExpense(record) {
  return {
    ...record,
    id: record.expenseId,
    description: record.title,
    owner: record.requestedBy,
    submittedAt: record.createdDate || '',
    status: record.status === 'Pending' && /^Rejected by:/i.test(record.approvedBy) ? 'Rejected' : record.status,
  };
}

function publicMaintenance(record) {
  return {
    ...record,
    id: `${record.ownerId}:${record.title}:${record.quarter}`,
    owner: record.ownerName,
    amount: Number(record.paymentAmount) || 0,
    date: record.createdDate,
    method: 'Maintenance',
    reference: record.reference || '',
    evidenceFile: record.evidenceFile || '',
  };
}

export class ExcelTreasuryRepository {
  constructor(filePath) {
    this.filePath = path.resolve(filePath);
    this.backupPath = `${this.filePath}.bak`;
    this.tempPath = `${this.filePath}.tmp.xlsx`;
    this.queue = Promise.resolve();
  }

  runExclusive(operation) {
    const result = this.queue.then(operation, operation);
    this.queue = result.then(() => undefined, () => undefined);
    return result;
  }

  async initialize() {
    return this.runExclusive(async () => {
      await mkdir(path.dirname(this.filePath), { recursive: true });
      try {
        await access(this.filePath);
      } catch {
        try {
          await rename(this.backupPath, this.filePath);
        } catch {
          await this.writeFile({ owners: [], expenses: [], maintenance: [], financialYears: [], income: [] });
        }
      }
      await rm(this.tempPath, { force: true });
      const data = await this.readFile();
      const workbook = await readExcelFile(this.filePath);
      const ownerHeaders = (workbook.find((sheet) => sheet.sheet === SHEETS.owners.name)?.data[0] || []).map((value) => String(value ?? '').trim());
      const maintenanceHeaders = (workbook.find((sheet) => sheet.sheet === SHEETS.maintenance.name)?.data[0] || []).map((value) => String(value ?? '').trim());
      const expenseHeaders = (workbook.find((sheet) => sheet.sheet === SHEETS.expenses.name)?.data[0] || []).map((value) => String(value ?? '').trim());
      const financialYearHeaders = (workbook.find((sheet) => sheet.sheet === SHEETS.financialYears.name)?.data[0] || []).map((value) => String(value ?? '').trim());
      const incomeHeaders = (workbook.find((sheet) => sheet.sheet === SHEETS.income.name)?.data[0] || []).map((value) => String(value ?? '').trim());
      for (const owner of data.owners) {
        owner.role = String(owner.role || '').trim().toLowerCase() === 'admin' ? 'Admin' : 'Member';
      }
      for (const expense of data.expenses) {
        expense.financialYear = String(expense.financialYear || '').trim() || financialYearFromDate(expense.createdDate);
      }
      for (const payment of data.maintenance) {
        payment.financialYear = maintenanceFinancialYear(payment);
        payment.evidenceName = String(payment.evidenceName || '').trim();
        payment.paidAmount = payment.paidAmount ?? '';
        payment.remarks = String(payment.remarks || '').trim();
      }
      for (const income of data.income || []) {
        income.evidenceName = String(income.evidenceName || '').trim();
        income.evidenceFile = String(income.evidenceFile || '').trim();
      }
      const schemaChanged = !SHEETS.owners.headers.every((header, index) => ownerHeaders[index] === header) || ownerHeaders.length !== SHEETS.owners.headers.length;
      const maintenanceSchemaChanged = !SHEETS.maintenance.headers.every((header, index) => maintenanceHeaders[index] === header) || maintenanceHeaders.length !== SHEETS.maintenance.headers.length;
      const expenseSchemaChanged = !SHEETS.expenses.headers.every((header, index) => expenseHeaders[index] === header) || expenseHeaders.length !== SHEETS.expenses.headers.length;
      const financialYearSchemaChanged = financialYearHeaders.length !== SHEETS.financialYears.headers.length || !SHEETS.financialYears.headers.every((header, index) => financialYearHeaders[index] === header);
      const incomeSchemaChanged = incomeHeaders.length !== SHEETS.income.headers.length || !SHEETS.income.headers.every((header, index) => incomeHeaders[index] === header);
      if (schemaChanged || maintenanceSchemaChanged || expenseSchemaChanged || financialYearSchemaChanged || incomeSchemaChanged) await this.writeFile(data);
      return data;
    });
  }

  async readFile() {
    const sheets = await readExcelFile(this.filePath);
    const byName = new Map(sheets.map((sheet) => [sheet.sheet, sheet.data]));
    const result = {};
    for (const [key, definition] of Object.entries(SHEETS)) {
      const rows = byName.get(definition.name);
      if (!rows) {
        if (key === 'financialYears' || key === 'income') {
          result[key] = [];
          continue;
        }
        throw new Error(`Required worksheet "${definition.name}" is missing.`);
      }
      result[key] = cellsToRecords(definition, rows);
    }
    for (const owner of result.owners) {
      owner.role = normalizedRole(owner.role);
    }
    if (!SHEETS.owners.name || !SHEETS.expenses.name || !SHEETS.maintenance.name) throw new Error('Required treasury worksheets are missing.');
    return result;
  }

  async writeFile(data) {
    const sheets = Object.entries(SHEETS).map(([key, definition]) => ({
      sheet: definition.name,
      data: recordsToSheet(definition, Array.isArray(data[key]) ? data[key] : []),
      stickyRowsCount: 1,
    }));
    await writeExcelFile(sheets).toFile(this.tempPath);
    try {
      await rename(this.filePath, this.backupPath);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    try {
      await rename(this.tempPath, this.filePath);
      await rm(this.backupPath, { force: true });
    } catch (error) {
      try {
        await rename(this.backupPath, this.filePath);
      } catch {
        throw new Error(`Workbook replacement failed. Recovery copy is at ${this.backupPath}.`);
      }
      throw error;
    }
  }

  async read() {
    return this.runExclusive(() => this.readFile());
  }

  async transaction(update) {
    return this.runExclusive(async () => {
      const data = await this.readFile();
      const result = await update(data);
      await this.writeFile(data);
      return result;
    });
  }

  async getData(user, selectedFinancialYear = '') {
    const data = await this.read();
    const memberOwners = data.owners;
    const filteredMaintenance = data.maintenance.filter((item) => maintenanceMatchesFinancialYear(item, selectedFinancialYear));
    const filteredExpenses = selectedFinancialYear
      ? data.expenses.filter((item) => String(item.financialYear || '').trim() === selectedFinancialYear || (!item.financialYear && financialYearFromDate(item.createdDate || item.submittedAt) === selectedFinancialYear))
      : data.expenses;
    const memberData = { ...data, owners: memberOwners, maintenance: filteredMaintenance, expenses: filteredExpenses };
    const overview = this.toOverviewData(memberData);
    if (selectedFinancialYear) {
      overview.openingBalance = 0;
      overview.approvedIncome = (data.income || []).filter((item) => item.status === 'Approved' && item.financialYear === selectedFinancialYear).reduce((sum, item) => sum + Number(item.amount), 0);
      const previousStart = Number(selectedFinancialYear.slice(0, 4)) - 1;
      const previousFY = `${previousStart}-${String(previousStart + 1).slice(-2)}`;
      const previousMaintenance = data.maintenance.filter((item) => (item.financialYear || '').trim() === previousFY && item.status === 'Paid').reduce((sum, item) => sum + Number(item.paymentAmount), 0);
      overview.previousClosingBalance = (data.income || []).filter((item) => item.status === 'Approved' && item.financialYear === previousFY).reduce((sum, item) => sum + Number(item.amount), 0)
        + previousMaintenance
        - data.expenses.filter((item) => item.financialYear === previousFY && item.status === 'Paid').reduce((sum, item) => sum + Number(item.amount), 0);
      overview.openingBalance = overview.previousClosingBalance;
    }
    if (user.app_metadata.role === 'admin') {
      return { ...this.toClientData(memberData), adminAccounts: [], ownerCount: memberOwners.length, financialYears: data.financialYears || [], overview };
    }
    const ownerId = String(user.app_metadata.ownerId || '');
    const ownRecord = memberOwners.find((owner) => String(owner.ownerId) === ownerId);
    if (!ownRecord) throw new Error('No Owner Details row is linked to this account.');
    const maintenance = data.maintenance.filter((item) => String(item.ownerId) === ownerId && maintenanceMatchesFinancialYear(item, selectedFinancialYear));
    const clientData = this.toClientData({ owners: memberOwners, expenses: [], maintenance });
    return {
      ...clientData,
      overview,
      owners: clientData.owners.map(({ id, name, phase, plotNumber }) => ({ id, name, phase, plotNumber })),
    };
  }

  toOverviewData(data) {
    const clientData = this.toClientData(data);
    const maintenance = clientData.maintenance.map(({ id, ownerId, owner, title, quarter, phaseNumber, createdDate, status, paymentAmount, amount, date, method, reference }) => ({
      id, ownerId, owner, title, quarter, phaseNumber, createdDate, status, paymentAmount, amount, date, method, reference,
    }));
    return {
      ownerCount: data.owners.length,
      expenses: clientData.expenses.map(({ id, title, description, expenseType, submittedAt, status, amount, owner }) => ({
        id, title, description, expenseType, submittedAt, status, amount, owner,
      })),
      maintenance,
      payments: maintenance,
    };
  }

  toClientData(data) {
    const owners = data.owners.map((owner) => ({
      ...Object.fromEntries(Object.entries(owner).filter(([key]) => key !== 'password')),
      id: owner.ownerId,
      username: owner.username,
      phone: owner.mobileNumber,
      secondaryPhone: owner.secondaryMobileNumber,
      passwordConfigured: Boolean(owner.password),
    }));
    const expenses = data.expenses.map((record) => {
      const owner = owners.find((item) => normalizedPhone(item.phone) === normalizedPhone(record.requestedBy));
      return { ...publicExpense(record), owner: owner?.name || record.requestedBy };
    });
    const maintenance = data.maintenance.map(publicMaintenance);
    return { owners, expenses, maintenance, payments: maintenance };
  }

  async createOwner(input, user) {
    return this.transaction(async (data) => {
      const password = storeOwnerPassword(input.password);
      const owner = {
        ownerId: nextId('OWN', 'ownerId', data.owners),
        username: clean(input.username, 32).toLowerCase(),
        password,
        name: clean(input.name, 120),
        mobileNumber: clean(input.mobileNumber, 24),
        email: clean(input.email, 160),
        phase: clean(input.phase, 20),
        plotNumber: clean(input.plotNumber, 40),
        address: clean(input.address, 300),
        secondaryMobileNumber: clean(input.secondaryMobileNumber, 24),
        secondaryEmail: clean(input.secondaryEmail, 160),
        moveInDate: clean(input.moveInDate, 10),
        createdDate: isoDate(),
        createdBy: actorName(user),
        role: 'Member',
      };
      this.validateOwner(owner, data.owners);
      data.owners.push(owner);
      return publicOwner(owner);
    });
  }

  async updateOwner(ownerId, input) {
    return this.transaction(async (data) => {
      const index = data.owners.findIndex((owner) => owner.ownerId === String(ownerId));
      if (index < 0) throw new Error('Owner not found.');
      const current = data.owners[index];
      const updated = {
        ...current,
        username: clean(input.username, 32).toLowerCase(),
        name: clean(input.name, 120),
        mobileNumber: clean(input.mobileNumber, 24),
        email: clean(input.email, 160),
        phase: clean(input.phase, 20),
        plotNumber: clean(input.plotNumber, 40),
        address: clean(input.address, 300),
        secondaryMobileNumber: clean(input.secondaryMobileNumber, 24),
        secondaryEmail: clean(input.secondaryEmail, 160),
        moveInDate: clean(input.moveInDate, 10),
      };
      if (input.password) updated.password = storeOwnerPassword(input.password);
      this.validateOwner(updated, data.owners.filter((owner) => owner.ownerId !== current.ownerId));
      data.owners[index] = updated;
      return publicOwner(updated);
    });
  }

  async getMyProfile(user) {
    const ownerId = authenticatedOwnerId(user);
    const data = await this.read();
    const owner = data.owners.find((item) => item.ownerId === ownerId);
    if (!owner) throw Object.assign(new Error('Owner profile not found.'), { status: 404 });
    return publicOwner(owner);
  }

  async updateMyProfile(input, user) {
    const ownerId = authenticatedOwnerId(user);
    return this.transaction((data) => {
      const index = data.owners.findIndex((owner) => owner.ownerId === ownerId);
      if (index < 0) throw Object.assign(new Error('Owner profile not found.'), { status: 404 });
      const current = data.owners[index];
      const updated = {
        ...current,
        name: input.name === undefined ? current.name : clean(input.name, 120),
        mobileNumber: input.mobileNumber === undefined ? current.mobileNumber : clean(input.mobileNumber, 24),
        secondaryMobileNumber: input.secondaryMobileNumber === undefined ? current.secondaryMobileNumber : clean(input.secondaryMobileNumber, 24),
        email: input.email === undefined ? current.email : clean(input.email, 160),
        secondaryEmail: input.secondaryEmail === undefined ? current.secondaryEmail : clean(input.secondaryEmail, 160),
        address: input.address === undefined ? current.address : clean(input.address, 300),
      };
      this.validateOwner(updated, data.owners.filter((owner) => owner.ownerId !== ownerId));
      data.owners[index] = updated;
      for (const payment of data.maintenance) {
        if (payment.ownerId === ownerId) payment.ownerName = updated.name;
      }
      return publicOwner(updated);
    });
  }

  async changeMyPassword({ currentPassword, newPassword, confirmPassword }, user) {
    const ownerId = authenticatedOwnerId(user);
    return this.transaction(async (data) => {
      const owner = data.owners.find((item) => item.ownerId === ownerId);
      if (!owner) throw Object.assign(new Error('Owner profile not found.'), { status: 404 });
      if (!await verifyPassword(currentPassword, owner.password)) throw new Error('Current password is incorrect.');
      if (newPassword !== confirmPassword) throw new Error('New password and confirmation do not match.');
      if (await verifyPassword(newPassword, owner.password)) throw new Error('New password must be different from the current password.');
      owner.password = hashPassword(newPassword);
      return { passwordUpdated: true };
    });
  }

  async deleteOwner(ownerId) {
    return this.transaction((data) => {
      const index = data.owners.findIndex((owner) => owner.ownerId === String(ownerId));
      if (index < 0) throw new Error('Owner not found.');
      if (data.owners[index].role === 'Admin' && data.owners.filter((item) => item.role === 'Admin').length === 1) throw new Error('Admin accounts cannot be deleted as Owners. The last Admin account cannot be deleted.');
      const [owner] = data.owners.splice(index, 1);
      const mobileNumber = normalizedPhone(owner.mobileNumber);
      const expenseCount = data.expenses.length;
      const maintenanceCount = data.maintenance.length;
      const deletedExpenseFiles = data.expenses
        .filter((item) => normalizedPhone(item.requestedBy) === mobileNumber && item.attachmentFile)
        .map((item) => item.attachmentFile);
      const deletedEvidenceFiles = data.maintenance
        .filter((item) => String(item.ownerId) === String(owner.ownerId) && item.evidenceFile)
        .map((item) => item.evidenceFile);
      data.expenses = data.expenses.filter((item) => normalizedPhone(item.requestedBy) !== mobileNumber);
      data.maintenance = data.maintenance.filter((item) => String(item.ownerId) !== String(owner.ownerId));
      return {
        owner: { id: owner.ownerId, name: owner.name },
        deletedExpenses: expenseCount - data.expenses.length,
        deletedExpenseFiles,
        deletedMaintenance: maintenanceCount - data.maintenance.length,
        deletedEvidenceFiles,
      };
    });
  }

  async importOwners(inputs, user) {
    return this.transaction(async (data) => {
      if (!Array.isArray(inputs) || !inputs.length) throw new Error('The workbook contains no owner rows.');
      const imported = [];
      for (const input of inputs) {
        const password = input.password ? storeOwnerPassword(input.password) : '';
        const owner = {
          ownerId: nextId('OWN', 'ownerId', data.owners),
          username: clean(input.username, 32).toLowerCase(),
          password,
          name: clean(input.name, 120),
          mobileNumber: clean(input.mobileNumber, 24),
          email: clean(input.email, 160),
          phase: clean(input.phase, 20),
          plotNumber: clean(input.plotNumber, 40),
          address: clean(input.address, 300),
          secondaryMobileNumber: clean(input.secondaryMobileNumber, 24),
          secondaryEmail: clean(input.secondaryEmail, 160),
          moveInDate: clean(input.moveInDate, 10),
          createdDate: isoDate(),
          createdBy: actorName(user),
          role: 'Member',
        };
        this.validateOwner(owner, data.owners);
        data.owners.push(owner);
        imported.push(publicOwner(owner));
      }
      return imported;
    });
  }

  validateOwner(owner, others) {
    if (!owner.username || !owner.name || !owner.mobileNumber || !owner.phase || !owner.plotNumber) throw new Error('Username, name, mobile, phase, and plot number are required.');
    if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(owner.username)) throw new Error('Username must be 3–32 letters, numbers, dots, underscores, or hyphens.');
    if (!PHASES.includes(owner.phase)) throw new Error('Choose Phase 1, Phase 2, or Phase 3.');
    if (!/^\+?[\d\s()-]{8,24}$/.test(owner.mobileNumber)) throw new Error('Enter a valid mobile number.');
    if (owner.secondaryMobileNumber && !/^\+?[\d\s()-]{8,24}$/.test(owner.secondaryMobileNumber)) throw new Error('Enter a valid secondary mobile number.');
    if (owner.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(owner.email)) throw new Error('Enter a valid email address.');
    if (owner.secondaryEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(owner.secondaryEmail)) throw new Error('Enter a valid secondary email address.');
    const mobile = normalizedPhone(owner.mobileNumber);
    if (others.some((item) => normalizedText(item.username) === owner.username)) throw new Error('That username is already assigned to an Owner.');
    if (others.some((item) => normalizedPhone(item.mobileNumber) === mobile)) throw new Error('That mobile number is already assigned to an Owner.');
    const plot = `${normalizedText(owner.phase)}:${normalizedText(owner.plotNumber)}`;
    if (others.some((item) => `${normalizedText(item.phase)}:${normalizedText(item.plotNumber)}` === plot)) throw new Error('That plot already has an Owner record.');
  }

  async findAccountByUsername(username, role) {
    const data = await this.read();
    const lookup = normalizedText(username);
    const expectedRole = role === 'admin' ? 'Admin' : 'Member';
    const accounts = data.owners.filter((owner) => owner.role === expectedRole && normalizedText(owner.username) === lookup);
    return accounts.length === 1 ? accounts[0] : null;
  }

  async findOwnerByUsername(username) {
    const data = await this.read();
    const lookup = normalizedText(username);
    const accounts = data.owners.filter((owner) => normalizedText(owner.username) === lookup);
    return accounts.length === 1 ? accounts[0] : null;
  }

  requireAdmin(user) {
    if (user?.app_metadata?.role !== 'admin') throw Object.assign(new Error('Administrator access is required.'), { status: 403 });
  }

  async saveFinancialYear(input, user) {
    this.requireAdmin(user);
    return this.transaction((data) => {
      const financialYear = clean(input.financialYear, 9);
      const startDate = clean(input.startDate, 10);
      const endDate = clean(input.endDate, 10);
      const quarterlyAmount = Number(input.quarterlyAmount);
      if (!/^\d{4}-\d{2}$/.test(financialYear)) throw new Error('Enter the financial year as YYYY-YY.');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) throw new Error('Enter valid financial year start and end dates.');
      if (!Number.isFinite(quarterlyAmount) || quarterlyAmount <= 0) throw new Error('Enter a valid quarterly maintenance amount.');
      const status = input.status === 'Inactive' ? 'Inactive' : 'Active';
      if (status === 'Active') for (const item of data.financialYears || []) item.status = 'Inactive';
      const existing = (data.financialYears || []).find((item) => item.financialYear === financialYear);
      const record = { financialYear, startDate, endDate, quarterlyAmount, status, createdDate: existing?.createdDate || isoDate(), createdBy: actorName(user) };
      data.financialYears = data.financialYears || [];
      if (existing) Object.assign(existing, record);
      else data.financialYears.push(record);
      return record;
    });
  }

  async getMyMaintenance(user, selectedFinancialYear = '') {
    const ownerId = String(user?.app_metadata?.ownerId || user?.id || '');
    if (!ownerId) throw Object.assign(new Error('No Owner ID is linked to this account.'), { status: 403 });
    const data = await this.read();
    const maintenance = data.maintenance.filter((item) => String(item.ownerId) === ownerId
      && maintenanceMatchesFinancialYear(item, selectedFinancialYear));
    return maintenance.map(publicMaintenance);
  }

  async getOwnersMaintenance(selectedFinancialYear = '') {
    const data = await this.read();
    const maintenance = data.maintenance.filter((item) => maintenanceMatchesFinancialYear(item, selectedFinancialYear));
    return maintenance.map(publicMaintenance);
  }

  async getIncome(user, selectedFinancialYear = '') {
    const data = await this.read();
    const income = data.income.filter((item) => (!selectedFinancialYear || item.financialYear === selectedFinancialYear)
      && (user.app_metadata.role === 'admin' || item.requestedBy === String(user.app_metadata.ownerId || user.id)));
    return income.map((item) => ({ ...item, id: item.incomeId }));
  }

  async createIncome(input, user) {
    return this.transaction((data) => {
      data.income = data.income || [];
      const title = clean(input.title, 120);
      const amount = Number(input.amount);
      const incomeDate = clean(input.incomeDate, 10);
      const financialYear = clean(input.financialYear, 9);
      if (!title || !Number.isFinite(amount) || amount <= 0) throw new Error('Enter a title and income amount greater than zero.');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(incomeDate)) throw new Error('Enter a valid income date.');
      if (!/^\d{4}-\d{2}$/.test(financialYear)) throw new Error('Enter a valid financial year.');
      const record = {
        incomeId: nextId('INC', 'incomeId', data.income),
        title,
        description: clean(input.description, 1000),
        amount,
        incomeDate,
        financialYear,
        status: 'Pending',
        requestedBy: String(user.app_metadata.ownerId || user.id || ''),
        approvedBy: '',
        approvedDate: '',
        createdDate: isoDate(),
        comments: clean(input.comments, 1000),
        evidenceName: clean(input.evidenceName, 160),
        evidenceFile: clean(input.evidenceFile, 50),
      };
      data.income.push(record);
      return { ...record, id: record.incomeId };
    });
  }

  async updateIncome(incomeId, input, user) {
    return this.transaction((data) => {
      const record = (data.income || []).find((item) => item.incomeId === String(incomeId));
      if (!record) throw new Error('Income record not found.');
      if (record.status !== 'Pending') throw new Error('Only pending income records can be edited.');
      if (user.app_metadata.role !== 'admin' && record.requestedBy !== String(user.app_metadata.ownerId || user.id)) throw new Error('You can edit only your own income requests.');
      record.title = clean(input.title, 120);
      record.description = clean(input.description, 1000);
      record.amount = Number(input.amount);
      record.incomeDate = clean(input.incomeDate, 10);
      record.financialYear = clean(input.financialYear, 9);
      record.comments = clean(input.comments, 1000);
      if (input.evidenceName !== undefined) record.evidenceName = clean(input.evidenceName, 160);
      if (input.evidenceFile !== undefined) record.evidenceFile = clean(input.evidenceFile, 50);
      if (!record.title || !Number.isFinite(record.amount) || record.amount <= 0) throw new Error('Enter a title and income amount greater than zero.');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(record.incomeDate) || !/^\d{4}-\d{2}$/.test(record.financialYear)) throw new Error('Enter a valid income date and financial year.');
      return { ...record, id: record.incomeId };
    });
  }

  async canAccessIncomeAttachment(filename, user) {
    if (!isExpenseAttachmentFilename(filename)) return false;
    const data = await this.read();
    const record = data.income.find((item) => item.evidenceFile === filename);
    if (!record) return false;
    return user.app_metadata.role === 'admin' || String(record.requestedBy) === String(user.app_metadata.ownerId || user.id);
  }

  async updateIncomeStatus(incomeId, status, comments, user) {
    this.requireAdmin(user);
    return this.transaction((data) => {
      const record = (data.income || []).find((item) => item.incomeId === String(incomeId));
      if (!record) throw new Error('Income record not found.');
      if (!['Approved', 'Rejected'].includes(status)) throw new Error('Choose Approved or Rejected.');
      if (record.requestedBy === String(user.app_metadata.ownerId || user.id)) throw new Error('You cannot approve or reject your own income request.');
      record.status = status;
      record.approvedBy = actorName(user);
      record.approvedDate = isoDate();
      record.comments = clean(comments, 1000);
      return { ...record, id: record.incomeId };
    });
  }

  async findAccountByMobileNumber(mobileNumber) {
    const data = await this.read();
    const lookup = normalizedPhone(mobileNumber);
    const accounts = data.owners.filter((owner) => normalizedPhone(owner.mobileNumber) === lookup);
    return accounts.length === 1 ? accounts[0] : null;
  }

  async createExpense(input, user) {
    return this.transaction((data) => {
      const owner = user.app_metadata.role === 'owner'
        ? data.owners.find((item) => item.ownerId === String(user.app_metadata.ownerId))
        : data.owners.find((item) => item.ownerId === String(input.ownerId));
      if (!owner) throw new Error('Select a valid Owner.');
      const expenseType = clean(input.expenseType, 40);
      if (!EXPENSE_TYPES.includes(expenseType)) throw new Error('Choose a valid Expense Type.');
      const amount = Number(input.amount);
      const title = clean(input.title, 120);
      if (!title || !Number.isFinite(amount) || amount <= 0) throw new Error('Enter a title and an amount greater than zero.');
      const recordFinancialYear = clean(input.financialYear, 9) || financialYearFromDate(isoDate());
      if (!/^\d{4}-\d{2}$/.test(recordFinancialYear)) throw new Error('Enter a valid financial year.');
      const expense = {
        expenseId: nextId('EXP', 'expenseId', data.expenses),
        title,
        description: clean(input.description, 1000),
        comment: clean(input.comment, 1000),
        amount,
        approvedBy: '',
        requestedBy: normalizedPhone(owner.mobileNumber),
        status: 'Pending',
        attachmentName: clean(input.attachmentName, 160),
        attachmentFile: clean(input.attachmentFile, 50),
        evidenceName: clean(input.attachmentName || input.evidenceName, 160),
        evidenceFile: clean(input.attachmentFile || input.evidenceFile, 50),
        financialYear: recordFinancialYear,
        expenseType,
      };
      if (expense.attachmentFile && !isExpenseAttachmentFilename(expense.attachmentFile)) throw new Error('The attachment file is invalid.');
      data.expenses.push(expense);
      return publicExpense(expense);
    });
  }

  async updateExpenseStatus(expenseId, status, comment, user) {
    return this.transaction((data) => {
      const expense = data.expenses.find((item) => item.expenseId === String(expenseId));
      if (!expense) throw new Error('Expense request not found.');
      const actor = actorName(user);
      if (status === 'Paid' && expense.status === 'Approved') {
        expense.status = 'Paid';
        return publicExpense(expense);
      }
      if (publicExpense(expense).status !== 'Pending') throw new Error('Only pending expenses can be decided.');
      if (!['Approved', 'Rejected'].includes(status)) throw new Error('Choose Approved, Rejected, or Paid for an approved expense.');
      if (status === 'Rejected') {
        expense.approvedBy = `Rejected by: ${actor}`;
        if (clean(comment, 1000)) expense.comment = clean(comment, 1000);
      } else {
        expense.approvedBy = actor;
        expense.status = 'Approved';
      }
      return publicExpense(expense);
    });
  }

  async deleteExpense(expenseId) {
    return this.transaction((data) => {
      const index = data.expenses.findIndex((item) => item.expenseId === String(expenseId));
      if (index < 0) throw new Error('Expense request not found.');
      const [expense] = data.expenses.splice(index, 1);
      return { id: expense.expenseId, title: expense.title, attachmentFile: expense.attachmentFile || '' };
    });
  }

  async canAccessExpenseAttachment(attachmentFile, user) {
    if (user.app_metadata.role !== 'admin') return false;
    const data = await this.read();
    return data.expenses.some((item) => item.attachmentFile === attachmentFile);
  }

  async generateQuarterlyMaintenance({ ownerIds, ownerId, phase, quarter, financialYear, quarterlyAmount }, user) {
    this.requireAdmin(user);
    return this.transaction((data) => {
      if (!QUARTERS.includes(quarter)) throw new Error('Choose Q1, Q2, Q3, or Q4.');
      const fy = clean(financialYear, 9);
      if (!/^\d{4}-\d{2}$/.test(fy)) throw new Error('Enter the financial year as YYYY-YY.');
      const configured = (data.financialYears || []).find((item) => item.financialYear === fy && item.status === 'Active');
      const amount = Number(configured?.quarterlyAmount || quarterlyAmount || QUARTERLY_MAINTENANCE_AMOUNT);
      if (!Number.isFinite(amount) || amount <= 0) throw new Error('Enter a valid quarterly maintenance amount.');
      let selected = data.owners;
      if (ownerId) {
        const individual = selected.find((item) => String(item.ownerId) === String(ownerId));
        if (!individual) throw new Error('Select a valid Owner.');
        if (phase && ['Phase 1', 'Phase 2', 'Phase 3'].includes(phase) && individual.phase !== phase) throw new Error('Selected phase does not match this Owner.');
      }
      if (Array.isArray(ownerIds) && ownerIds.length) {
        selected = selected.filter((item) => ownerIds.map(String).includes(String(item.ownerId)));
      } else if (ownerId) {
        selected = selected.filter((item) => String(item.ownerId) === String(ownerId));
      }
      if (phase && phase !== 'All phases') selected = selected.filter((item) => item.phase === phase);
      if (!selected.length) throw new Error('Select a valid Owner.');
      const title = `Quarterly maintenance FY ${fy}`;
      const created = [];
      let skipped = 0;
      for (const owner of selected) {
        const exists = data.maintenance.some((item) => item.ownerId === owner.ownerId && item.title === title && item.quarter === quarter);
        if (exists) { skipped += 1; continue; }
        const phaseMatch = owner.phase.match(/\d+/);
        const record = {
          ownerId: owner.ownerId,
          ownerName: owner.name,
          title,
          quarter,
          plotNumber: owner.plotNumber,
          phaseNumber: phaseMatch ? phaseMatch[0] : owner.phase,
          paymentAmount: amount,
          status: 'Pending',
          createdDate: isoDate(),
          createdBy: actorName(user),
          paymentDate: '',
          paymentMethod: '',
          reference: '',
          evidenceName: '',
          evidenceFile: '',
          financialYear: fy,
          paidAmount: '',
          remarks: '',
        };
        data.maintenance.push(record);
        created.push(publicMaintenance(record));
      }
      return { created, skipped, quarterlyAmount: amount };
    });
  }

  async updateMaintenanceStatus({ ownerId, title, quarter, status }, user) {
    this.requireAdmin(user);
    return this.transaction((data) => {
      if (!STATUSES.includes(status)) throw new Error('Choose Pending, Pending Approval, Approved, Rejected, or Paid.');
      const record = data.maintenance.find((item) => item.ownerId === String(ownerId) && item.title === String(title) && item.quarter === String(quarter));
      if (!record) throw new Error('Maintenance record not found.');
      const adminOwnerId = String(user.app_metadata.ownerId || user.id || '');
      if (adminOwnerId && record.ownerId === adminOwnerId) {
        throw Object.assign(new Error('You cannot approve or reject your own maintenance payment.'), { status: 403 });
      }
      record.status = status;
      return publicMaintenance(record);
    });
  }

  async updateOwnerMaintenanceDetails({ title, quarter, paymentDate, paymentMethod, paidAmount, reference, remarks, evidenceFile, evidenceName }, user) {
    return this.transaction((data) => {
      const ownerId = String(user.app_metadata.ownerId || user.id || '');
      if (!ownerId) throw Object.assign(new Error('No Owner ID is linked to this account.'), { status: 403 });
      const record = data.maintenance.find((item) => item.ownerId === ownerId && item.title === String(title) && item.quarter === String(quarter));
      if (!record) throw new Error('Maintenance record not found for this Owner.');
      if (record.status === 'Pending Approval') {
        throw Object.assign(new Error('This maintenance payment is awaiting Admin approval. Duplicate submissions are not allowed.'), { status: 409 });
      }
      if (!['Pending', 'Rejected'].includes(record.status)) throw new Error('Only pending or rejected maintenance records can be submitted.');
      const normalizedDate = clean(paymentDate, 10);
      const parsedDate = new Date(`${normalizedDate}T00:00:00Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDate) || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== normalizedDate) {
        throw new Error('Enter a valid payment date.');
      }
      if (!['UPI', 'Bank transfer', 'Cash', 'Other'].includes(paymentMethod)) throw new Error('Choose a valid payment method.');
      const amountInCents = Math.round(Number(paidAmount) * 100);
      const dueInCents = Math.round(Number(record.paymentAmount) * 100);
      if (!Number.isSafeInteger(amountInCents) || amountInCents <= 0 || amountInCents !== dueInCents) {
        throw new Error('Paid amount must equal the full maintenance amount due.');
      }
      if (!evidenceFile || (!isEvidenceDataUri(evidenceFile) && !isEvidenceFilename(evidenceFile) && !isDriveEvidenceReference(evidenceFile))) {
        throw new Error('Upload valid JPG, PNG, or PDF payment evidence before submitting.');
      }
      const previousEvidenceFile = record.evidenceFile || '';
      record.paymentDate = normalizedDate;
      record.paymentMethod = paymentMethod;
      record.reference = clean(reference, 120);
      record.paidAmount = amountInCents / 100;
      record.remarks = clean(remarks, 500);
      if (evidenceFile) record.evidenceFile = evidenceFile;
      record.evidenceName = clean(evidenceName, 120);
      record.status = 'Pending Approval';
      return { payment: publicMaintenance(record), previousEvidenceFile };
    });
  }

  async canAccessMaintenanceEvidence(evidenceFile, user) {
    const data = await this.read();
    return data.maintenance.some((item) => item.evidenceFile === evidenceFile
      && (user.app_metadata.role === 'admin' || String(item.ownerId) === String(user.app_metadata.ownerId)));
  }

  async deleteMaintenance({ ownerId, title, quarter }, user) {
    this.requireAdmin(user);
    return this.transaction((data) => {
      const index = data.maintenance.findIndex((item) => item.ownerId === String(ownerId) && item.title === String(title) && item.quarter === String(quarter));
      if (index < 0) throw new Error('Maintenance record not found.');
      const [record] = data.maintenance.splice(index, 1);
      return publicMaintenance(record);
    });
  }
}