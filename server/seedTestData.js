import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { ExcelTreasuryRepository } from './excelRepository.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(root, '.env.local') });
dotenv.config();

const workbookPath = process.env.EXCEL_DB_PATH || path.join(root, 'data', 'ssn_treasury.xlsx');
const repository = new ExcelTreasuryRepository(workbookPath);
await repository.initialize();

const ownerId = 'OWN-TEST-0001';
const expenseId = 'EXP-TEST-0001';
const today = new Date().toISOString().slice(0, 10);
const created = await repository.transaction((data) => {
  const result = { owner: false, expense: false, maintenance: false };
  if (!data.owners.some((item) => item.ownerId === ownerId)) {
    data.owners.push({
      ownerId,
      username: 'ssn.test.owner',
      name: 'TEST DATA ONLY - Sample Owner',
      mobileNumber: '+15555550101',
      email: 'owner.test@example.invalid',
      phase: 'Phase 1',
      plotNumber: 'TEST-001',
      address: 'TEST DATA ONLY - sample address',
      secondaryMobileNumber: '',
      secondaryEmail: '',
      createdDate: today,
      createdBy: 'TEST DATA ONLY',
    });
    result.owner = true;
  } else {
    const sampleOwner = data.owners.find((item) => item.ownerId === ownerId);
    if (!sampleOwner.username) {
      sampleOwner.username = 'ssn.test.owner';
      result.ownerUsernameUpdated = true;
    }
  }
  if (!data.expenses.some((item) => item.expenseId === expenseId)) {
    data.expenses.push({
      expenseId,
      title: 'TEST DATA ONLY - Electrical inspection',
      expenseType: 'EB Work',
      description: 'Sample expense for workbook and dashboard testing.',
      comment: 'TEST DATA ONLY - safe to remove.',
      amount: 1250,
      approvedBy: '',
      requestedBy: '+15555550101',
      status: 'Pending',
    });
    result.expense = true;
  }
  if (!data.maintenance.some((item) => item.ownerId === ownerId && item.title === 'TEST DATA ONLY - Quarterly maintenance FY 2026-27' && item.quarter === 'Q1')) {
    data.maintenance.push({
      ownerId,
      ownerName: 'TEST DATA ONLY - Sample Owner',
      title: 'TEST DATA ONLY - Quarterly maintenance FY 2026-27',
      quarter: 'Q1',
      plotNumber: 'TEST-001',
      phaseNumber: '1',
      paymentAmount: 1500,
      status: 'Pending',
      createdDate: today,
      createdBy: 'TEST DATA ONLY',
    });
    result.maintenance = true;
  }
  return result;
});

const data = await repository.read();
const counts = {
  owners: data.owners.filter((item) => item.ownerId === ownerId).length,
  expenses: data.expenses.filter((item) => item.expenseId === expenseId).length,
  maintenance: data.maintenance.filter((item) => item.ownerId === ownerId && item.title.startsWith('TEST DATA ONLY')).length,
};
if (Object.values(counts).some((count) => count !== 1)) throw new Error('Test data verification failed.');
if (data.owners.find((item) => item.ownerId === ownerId)?.username !== 'ssn.test.owner') throw new Error('Test Owner username was not migrated.');
console.log(`Workbook: ${workbookPath}`);
console.log(`Inserted: ${JSON.stringify(created)}`);
console.log('Owner username: ssn.test.owner');
console.log(`Verified one test record per sheet: ${JSON.stringify(counts)}`);