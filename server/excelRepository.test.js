import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import readExcelFile from 'read-excel-file/node';
import writeExcelFile from 'write-excel-file/node';
import { verifyPassword } from './auth.js';
import { ExcelTreasuryRepository, QUARTERLY_MAINTENANCE_AMOUNT, SHEETS } from './excelRepository.js';

const admin = { id: 'admin-1', phone: '+15550000001', app_metadata: { role: 'admin' }, user_metadata: { full_name: 'Treasury Admin' } };

async function withRepository(run) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'ssn-treasury-'));
  const repository = new ExcelTreasuryRepository(path.join(directory, 'treasury.xlsx'));
  try {
    await repository.initialize();
    await run(repository, repository.filePath);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function ownerInput(name, mobileNumber, phase, plotNumber) {
  return { username: name.toLowerCase().replace(/\s+/g, '.'), password: 'Test-owner-password-1!', name, mobileNumber, email: `${name.split(' ')[0].toLowerCase()}@example.com`, phase, plotNumber, address: 'Community Road', moveInDate: '2026-11-21' };
}

test('creates exactly the required three worksheets and headers', async () => {
  await withRepository(async (repository, filePath) => {
    const sheets = await readExcelFile(filePath);
    assert.deepEqual(sheets.map((sheet) => sheet.sheet), Object.values(SHEETS).map((sheet) => sheet.name));
    for (const [key, definition] of Object.entries(SHEETS)) {
      assert.deepEqual(sheets.find((sheet) => sheet.sheet === definition.name).data[0], definition.headers);
      assert.deepEqual((await repository.read())[key], []);
    }
    assert.ok(SHEETS.owners.headers.some((header) => header === 'Password'));
  });
});

test('validates duplicate owners and serializes concurrent inserts', async () => {
  await withRepository(async (repository) => {
    const first = await repository.createOwner(ownerInput('Sam Lee', '+1 555 100 0001', 'Phase 1', 'A-01'), admin);
    await assert.rejects(repository.createOwner(ownerInput('Sam Other', '+15551000001', 'Phase 2', 'B-01'), admin), /mobile number is already assigned/);
    await assert.rejects(repository.createOwner({ ...ownerInput('Sam Lee', '+15551000009', 'Phase 2', 'B-09'), name: 'Sam Duplicate', username: 'sam.lee' }, admin), /username is already assigned/);
    await assert.rejects(repository.createOwner(ownerInput('Duplicate Plot', '+15551000002', 'Phase 1', 'A-01'), admin), /plot already has an Owner/);
    const concurrent = await Promise.all([
      repository.createOwner(ownerInput('Rae North', '+15551000003', 'Phase 2', 'B-02'), admin),
      repository.createOwner(ownerInput('Kai West', '+15551000004', 'Phase 3', 'C-03'), admin),
    ]);
    const allOwners = await repository.read();
    assert.equal(allOwners.owners.length, 3);
    assert.equal(new Set(allOwners.owners.map((owner) => owner.ownerId)).size, 3);
    assert.equal(first.createdBy, 'Treasury Admin');
    assert.equal('password' in first, false);
    assert.equal(await verifyPassword('Test-owner-password-1!', allOwners.owners[0].password), true);
    assert.equal(allOwners.owners[0].moveInDate, '2026-11-21');
    assert.equal((await repository.findAccountByMobileNumber('+1 555 100 0001'))?.ownerId, first.id);
    assert.equal('password' in (await repository.getData(admin)).owners[0], false);
    assert.equal((await repository.findOwnerByUsername('SAM.LEE'))?.ownerId, first.id);
    assert.equal(concurrent.length, 2);
  });
});

test('loads and updates only the authenticated owner profile without changing linked records', async () => {
  await withRepository(async (repository) => {
    const owner = await repository.createOwner(ownerInput('Nia Roe', '+15551000041', 'Phase 2', 'B-41'), admin);
    const otherOwner = await repository.createOwner(ownerInput('Omar Roe', '+15551000042', 'Phase 3', 'C-42'), admin);
    await repository.transaction((data) => {
      data.owners.find((item) => item.ownerId === otherOwner.id).role = 'Admin';
    });
    const ownerSession = { id: owner.id, app_metadata: { role: 'owner', ownerId: owner.id } };
    const [payment] = (await repository.generateQuarterlyMaintenance({
      ownerId: owner.id, phase: owner.phase, quarter: 'Q1', financialYear: '2026-27',
    }, admin)).created;
    await repository.createExpense({ ownerId: owner.id, title: 'Profile-linked expense', amount: 100, expenseType: 'Road' }, ownerSession);
    const expensesBefore = (await repository.read()).expenses;

    const loaded = await repository.getMyProfile(ownerSession);
    assert.equal(loaded.id, owner.id);
    assert.equal('password' in loaded, false);

    const updated = await repository.updateMyProfile({
      ownerId: otherOwner.id,
      role: 'Admin',
      phase: 'Phase 3',
      plotNumber: 'C-99',
      name: 'Nia Updated',
      mobileNumber: '+15551000043',
      secondaryMobileNumber: '+15551000044',
      email: 'nia.updated@example.com',
      secondaryEmail: 'nia.secondary@example.com',
      address: 'Updated Community Road',
    }, ownerSession);

    assert.equal(updated.id, owner.id);
    assert.equal(updated.name, 'Nia Updated');
    assert.equal(updated.phase, 'Phase 2');
    assert.equal(updated.plotNumber, 'B-41');
    assert.equal(updated.role, 'Member');
    assert.equal(updated.mobileNumber, '+15551000043');
    assert.equal(updated.secondaryMobileNumber, '+15551000044');
    assert.equal(updated.address, 'Updated Community Road');
    const data = await repository.read();
    assert.equal(data.owners.find((item) => item.ownerId === otherOwner.id).name, 'Omar Roe');
    assert.equal(data.maintenance[0].ownerName, 'Nia Updated');
    assert.equal(data.maintenance[0].status, payment.status);
    assert.equal(data.maintenance[0].paymentAmount, payment.paymentAmount);
    assert.deepEqual(data.expenses, expensesBefore);
    await assert.rejects(repository.getMyProfile({ id: owner.id, app_metadata: { role: 'viewer', ownerId: owner.id } }), /Owner or Admin access/);
    const updatedAdminProfile = await repository.updateMyProfile({
      name: 'Omar Admin',
      mobileNumber: '+15551000045',
    }, { id: otherOwner.id, app_metadata: { role: 'admin', ownerId: otherOwner.id } });
    assert.equal(updatedAdminProfile.name, 'Omar Admin');
    assert.equal((await repository.getMyProfile(ownerSession)).name, 'Nia Updated');
    await assert.rejects(repository.updateMyProfile({ mobileNumber: 'bad' }, ownerSession), /valid mobile number/);
    await assert.rejects(repository.updateMyProfile({ secondaryMobileNumber: 'bad' }, ownerSession), /valid secondary mobile number/);
    await assert.rejects(repository.updateMyProfile({ email: 'not-an-email' }, ownerSession), /valid email address/);
  });
});

test('allows an owner or admin to change only their own password after current-password verification', async () => {
  await withRepository(async (repository) => {
    const owner = await repository.createOwner(ownerInput('Password Owner', '+15551000046', 'Phase 1', 'A-46'), admin);
    const adminOwner = await repository.createOwner(ownerInput('Profile Admin', '+15551000047', 'Phase 2', 'B-47'), admin);
    await repository.transaction((data) => {
      data.owners.find((item) => item.ownerId === adminOwner.id).role = 'Admin';
    });
    const ownerSession = { id: owner.id, app_metadata: { role: 'owner', ownerId: owner.id } };
    const adminSession = { id: adminOwner.id, app_metadata: { role: 'admin', ownerId: adminOwner.id } };
    const originalPassword = 'Test-owner-password-1!';
    const newPassword = 'My replacement password 2!';

    await assert.rejects(repository.changeMyPassword({
      currentPassword: 'incorrect password',
      newPassword,
      confirmPassword: newPassword,
    }, ownerSession), /Current password is incorrect/);
    await assert.rejects(repository.changeMyPassword({
      currentPassword: originalPassword,
      newPassword,
      confirmPassword: 'different replacement password',
    }, ownerSession), /do not match/);
    await repository.changeMyPassword({
      currentPassword: originalPassword,
      newPassword,
      confirmPassword: newPassword,
    }, ownerSession);
    const storedOwner = (await repository.read()).owners.find((item) => item.ownerId === owner.id);
    assert.match(storedOwner.password, /^scrypt\$/);
    assert.equal(await verifyPassword(originalPassword, storedOwner.password), false);
    assert.equal(await verifyPassword(newPassword, storedOwner.password), true);

    const adminPassword = 'Admin replacement password 3!';
    await repository.changeMyPassword({
      currentPassword: originalPassword,
      newPassword: adminPassword,
      confirmPassword: adminPassword,
    }, adminSession);
    const storedAdmin = (await repository.read()).owners.find((item) => item.ownerId === adminOwner.id);
    assert.equal(await verifyPassword(adminPassword, storedAdmin.password), true);
    await assert.rejects(repository.changeMyPassword({
      currentPassword: originalPassword,
      newPassword,
      confirmPassword: newPassword,
    }, { id: 'missing-owner', app_metadata: { role: 'owner', ownerId: 'missing-owner' } }), /Owner profile not found/);
  });
});

test('creates unique expenses and records approvals, rejection history, and payment status', async () => {
  await withRepository(async (repository) => {
    const owner = await repository.createOwner(ownerInput('Ari Nair', '+15551000010', 'Phase 1', 'A-10'), admin);
    const ownerSession = { id: owner.id, app_metadata: { role: 'owner', ownerId: owner.id } };
    const attachmentFile = '123e4567-e89b-12d3-a456-426614174000.pdf';
    await assert.rejects(repository.createExpense({ ownerId: owner.id, title: 'Water pump repair', amount: 100, expenseType: 'Other' }, ownerSession), /valid Expense Type/);
    const expense = await repository.createExpense({ ownerId: owner.id, title: 'Water pump repair', description: 'Replace motor', amount: 12500, expenseType: 'Phase 1 Park', attachmentName: 'invoice.pdf', attachmentFile }, ownerSession);
    assert.match(expense.id, /^EXP-/);
    assert.equal(expense.status, 'Pending');
    assert.equal(expense.attachmentName, 'invoice.pdf');
    assert.equal(expense.evidenceName, 'invoice.pdf');
    assert.equal(expense.evidenceFile, attachmentFile);
    assert.equal(await repository.canAccessExpenseAttachment(attachmentFile, admin), true);
    assert.equal(await repository.canAccessExpenseAttachment(attachmentFile, { app_metadata: { role: 'owner', ownerId: owner.id } }), false);
    const rejected = await repository.updateExpenseStatus(expense.id, 'Rejected', 'Missing invoice', admin);
    assert.equal(rejected.status, 'Rejected');
    assert.match(rejected.approvedBy, /^Rejected by:/);
    const next = await repository.createExpense({ ownerId: owner.id, title: 'Gate repair', amount: 3000, expenseType: 'Road' }, ownerSession);
    await repository.updateExpenseStatus(next.id, 'Approved', '', admin);
    const paid = await repository.updateExpenseStatus(next.id, 'Paid', '', admin);
    assert.equal(paid.status, 'Paid');
    assert.equal((await repository.read()).expenses.length, 2);
  });
});

test('associates an Admin-created expense with the logged-in Admin profile', async () => {
  await withRepository(async (repository) => {
    const adminOwner = await repository.createOwner(ownerInput('Expense Admin', '+15551000048', 'Phase 1', 'A-48'), admin);
    const otherOwner = await repository.createOwner(ownerInput('Other Owner', '+15551000049', 'Phase 2', 'B-49'), admin);
    await repository.transaction((data) => {
      data.owners.find((item) => item.ownerId === adminOwner.id).role = 'Admin';
    });
    const adminSession = { id: adminOwner.id, app_metadata: { role: 'admin', ownerId: adminOwner.id } };
    const expense = await repository.createExpense({
      ownerId: otherOwner.id,
      title: 'Admin office expense',
      amount: 900,
      expenseType: 'Road',
    }, adminSession);

    assert.equal(expense.requestedBy, '15551000048');
    assert.notEqual(expense.requestedBy, otherOwner.mobileNumber.replace(/\D/g, ''));
  });
});

test('deletes an Owner and their linked expenses and maintenance records', async () => {
  await withRepository(async (repository) => {
    const owner = await repository.createOwner(ownerInput('Lee Park', '+15551000030', 'Phase 1', 'A-30'), admin);
    await repository.createExpense({ ownerId: owner.id, title: 'Water filter', amount: 800, expenseType: 'EB Work' }, { id: owner.id, app_metadata: { role: 'owner', ownerId: owner.id } });
    await repository.generateQuarterlyMaintenance({ ownerId: owner.id, phase: owner.phase, quarter: 'Q3', financialYear: '2026-27' }, admin);
    const deleted = await repository.deleteOwner(owner.id);
    assert.deepEqual(deleted, { owner: { id: owner.id, name: owner.name }, deletedExpenses: 1, deletedExpenseFiles: [], deletedMaintenance: 1, deletedEvidenceFiles: [] });
    const remaining = await repository.read();
    assert.equal(remaining.owners.length, 0);
    assert.equal(remaining.expenses.length, 0);
    assert.equal(remaining.maintenance.length, 0);
    await assert.rejects(repository.deleteOwner(owner.id), /Owner not found/);
  });
});

test('deletes individual expense and maintenance records by identifier', async () => {
  await withRepository(async (repository) => {
    const owner = await repository.createOwner(ownerInput('Ari Cole', '+15551000031', 'Phase 2', 'B-31'), admin);
    const expense = await repository.createExpense({ ownerId: owner.id, title: 'Gate repair', amount: 1800, expenseType: 'Road' }, { id: owner.id, app_metadata: { role: 'owner', ownerId: owner.id } });
    const { created } = await repository.generateQuarterlyMaintenance({ ownerId: owner.id, phase: owner.phase, quarter: 'Q4', financialYear: '2026-27' }, admin);
    assert.equal((await repository.deleteExpense(expense.id)).id, expense.id);
    assert.equal((await repository.deleteMaintenance({ ownerId: owner.id, title: created[0].title, quarter: 'Q4' }, admin)).ownerId, owner.id);
    assert.equal((await repository.read()).expenses.length, 0);
    assert.equal((await repository.read()).maintenance.length, 0);
    await assert.rejects(repository.deleteExpense(expense.id), /Expense request not found/);
    await assert.rejects(repository.deleteMaintenance({ ownerId: owner.id, title: created[0].title, quarter: 'Q4' }, admin), /Maintenance record not found/);
  });
});

test('includes Admin-role users in owner counts and quarterly generation', async () => {
  await withRepository(async (repository) => {
    await repository.transaction((data) => {
      data.owners.push({ ownerId: 'ADM-OWNER-0001', username: 'admin.owner', password: 'Test-owner-password-1!', name: 'Admin Owner', mobileNumber: '+15551000022', email: 'admin.owner@example.invalid', phase: 'Phase 1', plotNumber: 'A-22', address: 'Community Road', secondaryMobileNumber: '', secondaryEmail: '', createdDate: '2026-11-21', createdBy: 'Treasury Admin', role: 'Admin', moveInDate: '2026-11-21' });
    });
    const adminOwner = (await repository.read()).owners.find((item) => item.ownerId === 'ADM-OWNER-0001');
    assert.equal(adminOwner.role, 'Admin');
    const adminData = await repository.getData(admin);
    assert.equal(adminData.owners.length, 1);
    assert.equal(adminData.ownerCount, 1);
    const generated = await repository.generateQuarterlyMaintenance({ ownerIds: [adminOwner.ownerId], phase: 'Phase 1', quarter: 'Q1', financialYear: '2026-27' }, admin);
    assert.equal(generated.created.length, 1);
    assert.equal(generated.created[0].ownerId, adminOwner.ownerId);
  });
});

test('denies quarterly management mutations to Owner sessions', async () => {
  await withRepository(async (repository) => {
    const owner = await repository.createOwner(ownerInput('Denied Owner', '+15551000021', 'Phase 1', 'D-21'), admin);
    const ownerSession = { id: owner.id, app_metadata: { role: 'owner', ownerId: owner.id }, user_metadata: { full_name: owner.name } };
    await assert.rejects(repository.saveFinancialYear({ financialYear: '2026-27', startDate: '2026-04-01', endDate: '2027-03-31', quarterlyAmount: 1500, status: 'Active' }, ownerSession), /Administrator access is required/);
    await assert.rejects(repository.generateQuarterlyMaintenance({ ownerId: owner.id, phase: 'Phase 1', quarter: 'Q1', financialYear: '2026-27' }, ownerSession), /Administrator access is required/);
  });
});

test('generates one ₹1,500 quarterly maintenance record for the selected Owner and scopes Owner data', async () => {
  await withRepository(async (repository) => {
    const mia = await repository.createOwner(ownerInput('Mia Park', '+15551000020', 'Phase 1', 'A-20'), admin);
    await repository.createOwner(ownerInput('Noah Ives', '+15551000021', 'Phase 3', 'C-21'), admin);
    const request = { ownerId: mia.id, phase: mia.phase, quarter: 'Q2', financialYear: '2026-27' };
    const first = await repository.generateQuarterlyMaintenance(request, admin);
    const duplicate = await repository.generateQuarterlyMaintenance(request, admin);
    assert.equal(first.created.length, 1);
    assert.equal(first.created[0].ownerId, mia.id);
    assert.equal(first.created[0].paymentAmount, QUARTERLY_MAINTENANCE_AMOUNT);
    assert.equal(first.quarterlyAmount, 1500);
    assert.equal(duplicate.created.length, 0);
    assert.equal(duplicate.skipped, 1);
    await assert.rejects(repository.generateQuarterlyMaintenance({ ...request, ownerId: 'OWN-99999' }, admin), /Select a valid Owner/);
    await assert.rejects(repository.generateQuarterlyMaintenance({ ...request, phase: 'Phase 2' }, admin), /Selected phase does not match/);
    const noah = (await repository.read()).owners.find((owner) => owner.name === 'Noah Ives');
    const secondOwnerRecord = await repository.generateQuarterlyMaintenance({ ...request, ownerId: noah.ownerId, phase: noah.phase }, admin);
    assert.equal(secondOwnerRecord.created[0].ownerId, noah.ownerId);
    await repository.updateMaintenanceStatus({ ownerId: first.created[0].ownerId, title: first.created[0].title, quarter: 'Q2', status: 'Paid' }, admin);
    const paidRecord = (await repository.read()).maintenance.find((item) => item.ownerId === mia.id && item.quarter === 'Q2');
    assert.equal(paidRecord.status, 'Paid');
    assert.equal(paidRecord.paidAmount, paidRecord.paymentAmount);
    const miaSession = {
      id: mia.id,
      phone: mia.phone,
      app_metadata: { role: 'owner', ownerId: mia.id },
      user_metadata: { full_name: mia.name },
    };
    await repository.createExpense({ ownerId: mia.id, title: 'Owner submitted expense', amount: 125, expenseType: 'Security Payment' }, miaSession);
    const ownerData = await repository.getData(miaSession);
    const adminData = await repository.getData(admin);
    assert.equal(adminData.owners.length, 2);
    assert.equal(adminData.maintenance.length, 2);
    assert.equal(adminData.expenses.length, 1);
    assert.deepEqual(ownerData.owners.map((item) => item.id), [mia.id, noah.ownerId]);
    assert.equal(ownerData.owners.every((item) => Object.keys(item).sort().join(',') === 'id,name,phase,plotNumber'), true);
    assert.deepEqual(ownerData.expenses, []);
    assert.equal(ownerData.maintenance.length, 1);
    assert.equal(ownerData.maintenance[0].paymentAmount, QUARTERLY_MAINTENANCE_AMOUNT);
    assert.equal(ownerData.maintenance[0].status, 'Paid');
    assert.deepEqual(ownerData.overview, adminData.overview);
    assert.equal(ownerData.overview.ownerCount, 2);
    assert.equal(ownerData.overview.maintenance.length, 2);
    assert.equal(ownerData.overview.expenses.length, 1);
    assert.equal('requestedBy' in ownerData.overview.expenses[0], false);
    assert.equal('evidenceFile' in ownerData.overview.maintenance[0], false);
  });
});

test('allows Admins to approve or reject their own income requests', async () => {
  await withRepository(async (repository) => {
    const adminSession = {
      id: admin.id,
      app_metadata: { role: 'admin', ownerId: admin.id },
      user_metadata: { full_name: 'Treasury Admin' },
    };
    const approvedIncome = await repository.createIncome({
      title: 'Hall rental', description: 'Community hall booking', amount: 5000,
      incomeDate: '2026-11-21', financialYear: '2026-27', comments: 'October booking',
    }, adminSession);
    assert.equal(approvedIncome.status, 'Pending');
    const approved = await repository.updateIncomeStatus(approvedIncome.id, 'Approved', '', adminSession);
    assert.equal(approved.status, 'Approved');
    assert.equal(approved.approvedBy, 'Treasury Admin');

    const rejectedIncome = await repository.createIncome({
      title: 'Event proceeds', amount: 2500, incomeDate: '2026-11-22', financialYear: '2026-27',
    }, adminSession);
    const rejected = await repository.updateIncomeStatus(rejectedIncome.id, 'Rejected', 'Missing receipt', adminSession);
    assert.equal(rejected.status, 'Rejected');
    assert.equal(rejected.comments, 'Missing receipt');

    const owner = await repository.createOwner(ownerInput('Income Owner', '+15551000025', 'Phase 1', 'A-25'), admin);
    const ownerSession = { id: owner.id, app_metadata: { role: 'owner', ownerId: owner.id } };
    await assert.rejects(repository.updateIncomeStatus(approvedIncome.id, 'Rejected', '', ownerSession), /Administrator access is required/);
  });
});

test('migrates legacy 12-column Income Details rows and preserves values', async () => {
  await withRepository(async (repository, filePath) => {
    const workbook = await readExcelFile(filePath);
    const incomeData = workbook.find((sheet) => sheet.sheet === 'Income Details');
    void incomeData;
  });

  const directory = await mkdtemp(path.join(os.tmpdir(), 'ssn-income-migration-'));
  const filePath = path.join(directory, 'treasury.xlsx');
  try {
    await writeExcelFile([
      { sheet: SHEETS.owners.name, data: [SHEETS.owners.headers] },
      { sheet: SHEETS.expenses.name, data: [SHEETS.expenses.headers] },
      { sheet: SHEETS.maintenance.name, data: [SHEETS.maintenance.headers] },
      { sheet: SHEETS.financialYears.name, data: [SHEETS.financialYears.headers] },
      { sheet: SHEETS.income.name, data: [SHEETS.income.headers.slice(0, 12), ['INC-00001', 'Legacy income', 'Old record', 5000, '2026-11-21', '2026-27', 'Pending', 'OWN-00001', '', '', '2026-11-21', 'Legacy note']] },
    ]).toFile(filePath);
    const repository = new ExcelTreasuryRepository(filePath);
    await repository.initialize();
    const income = (await repository.read()).income;
    assert.equal(income.length, 1);
    assert.equal(income[0].title, 'Legacy income');
    assert.equal(income[0].evidenceName, '');
    const workbook = await readExcelFile(filePath);
    assert.equal(workbook.find((sheet) => sheet.sheet === SHEETS.income.name).data[0].length, 14);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('recognizes existing Admin-role accounts without bootstrapping credentials', async () => {
  await withRepository(async (repository) => {
    const member = await repository.createOwner(ownerInput('Mia Park', '+15551000020', 'Phase 1', 'A-20'), admin);
    const password = 'Admin-Test-Password-01!';
    await repository.transaction((data) => {
      data.owners.push({
        ownerId: 'ADM-00001', username: 'treasury.admin', password,
        name: 'Treasury Admin', mobileNumber: '', email: '', phase: '', plotNumber: '',
        address: '', secondaryMobileNumber: '', secondaryEmail: '', createdDate: '2026-11-21',
        createdBy: 'Database', role: ' admin ',
      });
    });
    const stored = (await repository.read()).owners.find((account) => account.role === 'Admin');

    assert.equal(stored.username, 'treasury.admin');
    assert.equal(await verifyPassword(password, stored.password), true);
    assert.equal((await repository.findAccountByUsername('treasury.admin', 'admin')).ownerId, 'ADM-00001');
    assert.equal((await repository.findOwnerByUsername('treasury.admin'))?.ownerId, 'ADM-00001');
    await assert.rejects(repository.deleteOwner('ADM-00001'), /Admin accounts cannot be deleted/);

    const adminData = await repository.getData({ id: 'ADM-00001', app_metadata: { role: 'admin' }, user_metadata: { full_name: 'Treasury Admin' } });
    assert.equal(adminData.owners.length, 2);
    assert.equal(adminData.ownerCount, 2);
    assert.equal(adminData.adminAccounts.length, 0);
    assert.equal(adminData.overview.ownerCount, 2);
    assert.equal(adminData.owners[0].id, member.id);
  });
});

test('shows Admin-role owner maintenance through the FY title fallback', async () => {
  await withRepository(async (repository) => {
    await repository.transaction((data) => {
      data.owners.push({ ownerId: 'ADM-OWNER-0002', username: 'admin.owner2', password: 'Test-owner-password-1!', name: 'Admin Owner Two', mobileNumber: '+15551000023', email: 'admin.owner2@example.invalid', phase: 'Phase 2', plotNumber: 'A-23', address: 'Community Road', secondaryMobileNumber: '', secondaryEmail: '', createdDate: '2026-11-21', createdBy: 'Treasury Admin', role: 'Admin', moveInDate: '2026-11-21' });
      data.maintenance.push({ ownerId: 'ADM-OWNER-0002', ownerName: 'Admin Owner Two', title: 'Quarterly maintenance FY 2026-27', quarter: 'Q1', plotNumber: 'A-23', phaseNumber: '2', paymentAmount: 1500, status: 'Pending', createdDate: '2026-11-21', createdBy: 'Treasury Admin', paymentDate: '', paymentMethod: '', reference: '', evidenceFile: '', financialYear: '' });
    });
    const result = await repository.getData({ id: 'ADM-OWNER-0002', app_metadata: { role: 'admin', ownerId: 'ADM-OWNER-0002' }, user_metadata: { full_name: 'Admin Owner Two' } }, '2026-27');
    assert.equal(result.maintenance.length, 1);
    assert.equal(result.maintenance[0].ownerId, 'ADM-OWNER-0002');
  });
});

test('separates My Maintenance and Owners Maintenance API scopes', async () => {
  await withRepository(async (repository) => {
    const owner = await repository.createOwner(ownerInput('Scoped Owner', '+15551000024', 'Phase 1', 'A-24'), admin);
    await repository.generateQuarterlyMaintenance({ ownerId: owner.id, phase: 'Phase 1', quarter: 'Q1', financialYear: '2026-27' }, admin);
    await repository.generateQuarterlyMaintenance({ ownerId: owner.id, phase: 'Phase 1', quarter: 'Q2', financialYear: '2022-23' }, admin);
    const ownerSession = { id: owner.id, app_metadata: { role: 'owner', ownerId: owner.id }, user_metadata: { full_name: owner.name } };
    const mine = await repository.getMyMaintenance(ownerSession, '2026-27');
    assert.equal(mine.length, 1);
    assert.equal(mine[0].ownerId, owner.id);
    assert.equal((await repository.getMyMaintenance(ownerSession)).length, 2);
    const all = await repository.getOwnersMaintenance('2026-27');
    assert.equal(all.length >= 1, true);

    const adminOwner = await repository.createOwner(ownerInput('Admin Owner', '+15551000034', 'Phase 2', 'B-34'), admin);
    await repository.transaction((data) => {
      data.owners.find((item) => item.ownerId === adminOwner.id).role = 'Admin';
    });
    await repository.generateQuarterlyMaintenance({ ownerId: adminOwner.id, phase: adminOwner.phase, quarter: 'Q3', financialYear: '2026-27' }, admin);
    const adminOwnerSession = { id: adminOwner.id, app_metadata: { role: 'admin', ownerId: adminOwner.id } };
    const adminMine = await repository.getMyMaintenance(adminOwnerSession);
    assert.equal(adminMine.length, 1);
    assert.equal(adminMine[0].ownerId, adminOwner.id);
  });
});

test('allows an Owner to edit their pending payment details with evidence only for their own record', async () => {
  await withRepository(async (repository) => {
    const owner = await repository.createOwner(ownerInput('Nia Roe', '+15551000041', 'Phase 2', 'B-41'), admin);
    const otherOwner = await repository.createOwner(ownerInput('Omar Roe', '+15551000042', 'Phase 3', 'C-42'), admin);
    const generated = await repository.generateQuarterlyMaintenance({ ownerId: owner.id, phase: owner.phase, quarter: 'Q1', financialYear: '2026-27' }, admin);
    const payment = generated.created[0];
    const ownerSession = { id: owner.id, phone: owner.phone, app_metadata: { role: 'owner', ownerId: owner.id }, user_metadata: { full_name: owner.name } };
    const evidenceFile = '123e4567-e89b-12d3-a456-426614174000.jpg';
    await assert.rejects(repository.updateOwnerMaintenanceDetails({ title: payment.title, quarter: payment.quarter, paymentDate: '2026-11-09', paymentMethod: 'UPI', paidAmount: 1500 }, ownerSession), /Upload valid JPG, PNG, or PDF/);
    const updated = await repository.updateOwnerMaintenanceDetails({
      title: payment.title,
      quarter: payment.quarter,
      paymentDate: '2026-11-09',
      paymentMethod: 'UPI',
      paidAmount: 1500,
      reference: 'UPI-00041',
      remarks: 'Quarterly maintenance payment',
      evidenceFile,
      evidenceName: 'payment-proof.jpg',
    }, ownerSession);
    assert.equal(updated.payment.evidenceFile, evidenceFile);
    assert.equal(updated.payment.evidenceName, 'payment-proof.jpg');
    assert.equal(updated.payment.paymentDate, '2026-11-09');
    assert.equal(updated.payment.paymentMethod, 'UPI');
    assert.equal(updated.payment.paidAmount, 1500);
    assert.equal(updated.payment.remarks, 'Quarterly maintenance payment');
    assert.equal(updated.payment.status, 'Pending Approval');
    await assert.rejects(repository.updateOwnerMaintenanceDetails({
      title: payment.title,
      quarter: payment.quarter,
      paymentDate: '2026-11-09',
      paymentMethod: 'UPI',
      paidAmount: 1500,
      evidenceFile,
    }, ownerSession), /awaiting Admin approval/);
    assert.equal(await repository.canAccessMaintenanceEvidence(evidenceFile, ownerSession), true);
    assert.equal(await repository.canAccessMaintenanceEvidence(evidenceFile, admin), true);
    assert.equal(await repository.canAccessMaintenanceEvidence(evidenceFile, {
      app_metadata: { role: 'owner', ownerId: otherOwner.id },
    }), false);
    await assert.rejects(repository.updateOwnerMaintenanceDetails({
      title: payment.title,
      quarter: payment.quarter,
      paymentDate: '2026-11-09',
      paymentMethod: 'UPI',
      paidAmount: 1500,
      evidenceFile,
    }, { app_metadata: { role: 'owner', ownerId: otherOwner.id } }), /not found for this Owner/);
    await repository.updateMaintenanceStatus({ ownerId: owner.id, title: payment.title, quarter: payment.quarter, status: 'Paid' }, admin);
    await assert.rejects(repository.updateOwnerMaintenanceDetails({
      title: payment.title,
      quarter: payment.quarter,
      paymentDate: '2026-11-10',
      paymentMethod: 'UPI',
      paidAmount: 1500,
      evidenceFile,
    }, ownerSession), /Only pending/);
  });
});

test('allows an Admin to edit payment details and evidence while marking an unpaid record Paid', async () => {
  await withRepository(async (repository) => {
    const owner = await repository.createOwner(ownerInput('Asha Dev', '+15551000045', 'Phase 1', 'A-45'), admin);
    const payment = (await repository.generateQuarterlyMaintenance({
      ownerId: owner.id, phase: owner.phase, quarter: 'Q1', financialYear: '2026-27',
    }, admin)).created[0];
    const evidenceFile = '123e4567-e89b-12d3-a456-426614174003.jpg';
    const details = {
      ownerId: owner.id,
      title: payment.title,
      quarter: payment.quarter,
      paymentDate: '2026-11-12',
      paymentMethod: 'UPI',
      paidAmount: 1500,
      reference: 'UPI-00045',
      remarks: 'Verified by Admin',
    };

    await assert.rejects(repository.updateAdminMaintenanceDetails(details, {
      app_metadata: { role: 'owner', ownerId: owner.id },
    }), /Administrator access is required/);
    await assert.rejects(repository.updateAdminMaintenanceDetails(details, admin), /Upload valid JPG, PNG, or PDF/);

    const updated = await repository.updateAdminMaintenanceDetails({
      ...details,
      evidenceFile,
      evidenceName: 'admin-payment-proof.jpg',
    }, admin);
    assert.equal(updated.previousEvidenceFile, '');
    assert.equal(updated.payment.evidenceFile, evidenceFile);
    assert.equal(updated.payment.evidenceName, 'admin-payment-proof.jpg');
    assert.equal(updated.payment.paymentDate, '2026-11-12');
    assert.equal(updated.payment.paymentMethod, 'UPI');
    assert.equal(updated.payment.paidAmount, 1500);
    assert.equal(updated.payment.reference, 'UPI-00045');
    assert.equal(updated.payment.remarks, 'Verified by Admin');
    assert.equal(updated.payment.status, 'Paid');
    await assert.rejects(repository.updateAdminMaintenanceDetails(details, admin), /Paid maintenance records are read-only/);
  });
});

test('allows an owner to resubmit rejected evidence but prevents updates after approval', async () => {
  await withRepository(async (repository) => {
    const owner = await repository.createOwner(ownerInput('Nora Kim', '+15551000043', 'Phase 1', 'A-43'), admin);
    const ownerSession = { id: owner.id, app_metadata: { role: 'owner', ownerId: owner.id } };
    const [payment] = (await repository.generateQuarterlyMaintenance({
      ownerId: owner.id, phase: owner.phase, quarter: 'Q2', financialYear: '2026-27',
    }, admin)).created;
    const firstEvidence = '123e4567-e89b-12d3-a456-426614174000.jpg';
    const submission = {
      title: payment.title,
      quarter: payment.quarter,
      paymentDate: '2026-11-10',
      paymentMethod: 'Bank transfer',
      paidAmount: 1500,
      evidenceFile: firstEvidence,
      evidenceName: 'first-proof.jpg',
    };
    await repository.updateOwnerMaintenanceDetails(submission, ownerSession);
    await repository.updateMaintenanceStatus({
      ownerId: owner.id, title: payment.title, quarter: payment.quarter, status: 'Rejected',
    }, admin);
    const secondEvidence = '123e4567-e89b-12d3-a456-426614174001.pdf';
    const resubmitted = await repository.updateOwnerMaintenanceDetails({
      ...submission, evidenceFile: secondEvidence, evidenceName: 'updated-proof.pdf',
    }, ownerSession);
    assert.equal(resubmitted.previousEvidenceFile, firstEvidence);
    assert.equal(resubmitted.payment.status, 'Pending Approval');
    await repository.updateMaintenanceStatus({
      ownerId: owner.id, title: payment.title, quarter: payment.quarter, status: 'Paid',
    }, admin);
    await assert.rejects(repository.updateOwnerMaintenanceDetails({
      ...submission, evidenceFile: '123e4567-e89b-12d3-a456-426614174002.jpg',
    }, ownerSession), /Only pending or rejected/);
  });
});

test('allows an Admin to submit only their own maintenance payment and prevents self-approval', async () => {
  await withRepository(async (repository) => {
    const adminOwner = await repository.createOwner(ownerInput('Admin Payment Owner', '+15551000044', 'Phase 1', 'A-44'), admin);
    await repository.transaction((data) => {
      data.owners.find((item) => item.ownerId === adminOwner.id).role = 'Admin';
    });
    const ownerPayment = (await repository.generateQuarterlyMaintenance({
      ownerId: adminOwner.id,
      phase: adminOwner.phase,
      quarter: 'Q1',
      financialYear: '2026-27',
    }, admin)).created[0];
    const otherOwner = await repository.createOwner(ownerInput('Other Payment Owner', '+15551000045', 'Phase 2', 'B-45'), admin);
    const otherPayment = (await repository.generateQuarterlyMaintenance({
      ownerId: otherOwner.id,
      phase: otherOwner.phase,
      quarter: 'Q2',
      financialYear: '2026-27',
    }, admin)).created[0];
    const adminOwnerSession = {
      id: adminOwner.id,
      app_metadata: { role: 'admin', ownerId: adminOwner.id },
    };
    const submission = {
      title: ownerPayment.title,
      quarter: ownerPayment.quarter,
      paymentDate: '2026-11-10',
      paymentMethod: 'UPI',
      paidAmount: 1500,
      evidenceFile: '123e4567-e89b-12d3-a456-426614174003.jpg',
      evidenceName: 'admin-payment-proof.jpg',
    };
    const updated = await repository.updateOwnerMaintenanceDetails(submission, adminOwnerSession);
    assert.equal(updated.payment.status, 'Pending Approval');
    await assert.rejects(repository.updateOwnerMaintenanceDetails({
      ...submission,
      title: otherPayment.title,
      quarter: otherPayment.quarter,
    }, adminOwnerSession), /not found for this Owner/);
    await assert.rejects(repository.updateMaintenanceStatus({
      ownerId: adminOwner.id,
      title: ownerPayment.title,
      quarter: ownerPayment.quarter,
      status: 'Paid',
    }, adminOwnerSession), /cannot approve or reject your own/);
  });
});

test('adds the Username column to existing workbooks without losing Owner rows', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'ssn-treasury-legacy-'));
  const filePath = path.join(directory, 'treasury.xlsx');
  const oldHeaders = SHEETS.owners.headers.slice(0, -1).filter((header) => !['User Name', 'Password'].includes(header));
  const legacyOwner = ['OWN-00007', 'Legacy Owner', '+15551000007', 'legacy@example.invalid', 'Phase 2', 'B-07', 'Old road', '', '', '2026-01-02', 'Admin'];
  try {
    await writeExcelFile([
      { sheet: 'Owner Details', data: [oldHeaders, legacyOwner] },
      { sheet: SHEETS.expenses.name, data: [SHEETS.expenses.headers] },
      { sheet: SHEETS.maintenance.name, data: [SHEETS.maintenance.headers] },
    ]).toFile(filePath);
    const repository = new ExcelTreasuryRepository(filePath);
    await repository.initialize();
    const workbook = await readExcelFile(filePath);
    const ownerSheet = workbook.find((sheet) => sheet.sheet === SHEETS.owners.name);
    assert.deepEqual(ownerSheet.data[0], SHEETS.owners.headers);
    assert.equal((await repository.read()).owners[0].ownerId, 'OWN-00007');
    assert.equal((await repository.read()).owners[0].username, '');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('renames the intermediate Username header to User Name and preserves its value', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'ssn-treasury-user-name-'));
  const filePath = path.join(directory, 'treasury.xlsx');
  const previousHeaders = SHEETS.owners.headers.slice(0, -1).filter((header) => header !== 'Password').map((header) => header === 'User Name' ? 'Username' : header);
  const ownerRow = ['OWN-00008', 'legacy.login', 'Prior Username Owner', '+15551000008', 'prior@example.invalid', 'Phase 3', 'C-08', 'Old road', '', '', '2026-01-03', 'Admin'];
  try {
    await writeExcelFile([
      { sheet: 'Owner Details', data: [previousHeaders, ownerRow] },
      { sheet: SHEETS.expenses.name, data: [SHEETS.expenses.headers] },
      { sheet: SHEETS.maintenance.name, data: [SHEETS.maintenance.headers] },
    ]).toFile(filePath);
    const repository = new ExcelTreasuryRepository(filePath);
    await repository.initialize();
    const workbook = await readExcelFile(filePath);
    assert.deepEqual(workbook.find((sheet) => sheet.sheet === SHEETS.owners.name).data[0], SHEETS.owners.headers);
    assert.equal((await repository.findOwnerByUsername('LEGACY.LOGIN'))?.ownerId, 'OWN-00008');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('adds the Role column to existing workbooks and defaults existing accounts to Member', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'ssn-treasury-role-migration-'));
  const filePath = path.join(directory, 'treasury.xlsx');
  const previousHeaders = SHEETS.owners.headers.slice(0, -1).filter((header) => header !== 'Role');
  const ownerRow = ['OWN-00009', 'legacy.member', '', 'Legacy Member', '+15551000009', 'member@example.invalid', 'Phase 1', 'A-09', 'Old road', '', '', '2026-01-04', 'Admin'];
  try {
    await writeExcelFile([
      { sheet: 'Owner Details', data: [previousHeaders, ownerRow] },
      { sheet: SHEETS.expenses.name, data: [SHEETS.expenses.headers] },
      { sheet: SHEETS.maintenance.name, data: [SHEETS.maintenance.headers] },
    ]).toFile(filePath);
    const repository = new ExcelTreasuryRepository(filePath);
    await repository.initialize();
    const workbook = await readExcelFile(filePath);
    assert.deepEqual(workbook.find((sheet) => sheet.sheet === SHEETS.owners.name).data[0], SHEETS.owners.headers);
    assert.equal((await repository.read()).owners[0].role, 'Member');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('adds Owner payment detail columns to existing Maintenance sheets without losing records', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'ssn-treasury-maintenance-migration-'));
  const filePath = path.join(directory, 'treasury.xlsx');
  const legacyHeaders = SHEETS.maintenance.headers.slice(0, 10);
  const paymentRow = ['OWN-00010', 'Legacy Payment Owner', 'Quarterly maintenance FY 2026-27', 'Q1', 'A-10', '1', 1500, 'Pending', '2026-04-01', 'Admin'];
  try {
    await writeExcelFile([
      { sheet: SHEETS.owners.name, data: [SHEETS.owners.headers] },
      { sheet: SHEETS.expenses.name, data: [SHEETS.expenses.headers] },
      { sheet: SHEETS.maintenance.name, data: [legacyHeaders, paymentRow] },
    ]).toFile(filePath);
    const repository = new ExcelTreasuryRepository(filePath);
    await repository.initialize();
    const workbook = await readExcelFile(filePath);
    const maintenanceSheet = workbook.find((sheet) => sheet.sheet === SHEETS.maintenance.name);
    assert.deepEqual(maintenanceSheet.data[0], SHEETS.maintenance.headers);
    const migratedPayment = (await repository.read()).maintenance[0];
    assert.equal(migratedPayment.ownerId, 'OWN-00010');
    assert.equal(migratedPayment.paymentAmount, 1500);
    assert.equal(migratedPayment.paymentDate, '');
    assert.equal(migratedPayment.evidenceFile, '');
    assert.equal(migratedPayment.paidAmount, '');
    assert.equal(migratedPayment.remarks, '');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('preserves maintenance evidence names and references in the current workbook schema', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'ssn-treasury-maintenance-evidence-schema-'));
  const filePath = path.join(directory, 'treasury.xlsx');
  const maintenanceHeaders = [
    'Owner ID', 'Owner Name', 'Title', 'Quarter', 'Plot Number', 'Phase Number', 'Payment Amount', 'Status',
    'Created Date', 'Created By', 'Payment Date', 'Payment Method', 'Reference', 'Evidence Name', 'Evidence File', 'Financial Year',
  ];
  const maintenanceRow = [
    'OWN-00010', 'Payment Owner', 'Quarterly maintenance FY 2026-27', 'Q1', 'A-10', '1', 1500, 'Pending Approval',
    '2026-04-01', 'Admin', '2026-04-02', 'UPI', 'UPI-00010', 'payment-proof.jpg',
    'data:image/jpeg;base64,/9j/2Q==', '2026-27',
  ];
  try {
    await writeExcelFile([
      { sheet: SHEETS.owners.name, data: [SHEETS.owners.headers] },
      { sheet: SHEETS.expenses.name, data: [SHEETS.expenses.headers] },
      { sheet: SHEETS.maintenance.name, data: [maintenanceHeaders, maintenanceRow] },
      { sheet: SHEETS.income.name, data: [SHEETS.income.headers] },
      { sheet: SHEETS.financialYears.name, data: [SHEETS.financialYears.headers] },
    ]).toFile(filePath);
    const repository = new ExcelTreasuryRepository(filePath);
    await repository.initialize();
    const payment = (await repository.read()).maintenance[0];
    assert.equal(payment.evidenceName, 'payment-proof.jpg');
    assert.equal(payment.evidenceFile, 'data:image/jpeg;base64,/9j/2Q==');
    assert.equal(payment.financialYear, '2026-27');
    assert.equal(payment.paidAmount, '');
    assert.equal(payment.remarks, '');
    const workbook = await readExcelFile(filePath);
    assert.deepEqual(workbook.find((sheet) => sheet.sheet === SHEETS.maintenance.name).data[0], SHEETS.maintenance.headers);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('preserves existing plain-text Owner passwords in the Excel database', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'ssn-treasury-password-migration-'));
  const filePath = path.join(directory, 'treasury.xlsx');
  const password = 'legacy-pass';
  const ownerRow = ['OWN-00009', 'legacy.owner', password, 'Legacy Owner', '+15551000009', 'legacy@example.invalid', 'Phase 1', 'A-09', 'Old road', '', '', '2026-01-03', 'Admin'];
  try {
    await writeExcelFile([
      { sheet: SHEETS.owners.name, data: [SHEETS.owners.headers, ownerRow] },
      { sheet: SHEETS.expenses.name, data: [SHEETS.expenses.headers] },
      { sheet: SHEETS.maintenance.name, data: [SHEETS.maintenance.headers] },
    ]).toFile(filePath);
    const repository = new ExcelTreasuryRepository(filePath);
    await repository.initialize();
    const migratedOwner = (await repository.read()).owners[0];
    assert.equal(await verifyPassword(password, migratedOwner.password), true);
    assert.equal(migratedOwner.password, password);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('adds Expense attachment columns to existing Expense sheets without losing records', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'ssn-treasury-expense-migration-'));
  const filePath = path.join(directory, 'treasury.xlsx');
  const legacyHeaders = SHEETS.expenses.headers.slice(0, 8);
  const expenseRow = ['EXP-00010', 'Legacy expense', 'Legacy description', '', 900, '', '+15551000010', 'Pending'];
  try {
    await writeExcelFile([
      { sheet: SHEETS.owners.name, data: [SHEETS.owners.headers] },
      { sheet: SHEETS.expenses.name, data: [legacyHeaders, expenseRow] },
      { sheet: SHEETS.maintenance.name, data: [SHEETS.maintenance.headers] },
    ]).toFile(filePath);
    const repository = new ExcelTreasuryRepository(filePath);
    await repository.initialize();
    const workbook = await readExcelFile(filePath);
    assert.deepEqual(workbook.find((sheet) => sheet.sheet === SHEETS.expenses.name).data[0], SHEETS.expenses.headers);
    const migratedExpense = (await repository.read()).expenses[0];
    assert.equal(migratedExpense.expenseId, 'EXP-00010');
    assert.equal(migratedExpense.title, 'Legacy expense');
    assert.equal(migratedExpense.attachmentName, '');
    assert.equal(migratedExpense.attachmentFile, '');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('adds Expense Type to attachment-enabled Expense sheets without losing attachments', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'ssn-treasury-expense-type-migration-'));
  const filePath = path.join(directory, 'treasury.xlsx');
  const priorHeaders = SHEETS.expenses.headers.slice(0, 10);
  const attachmentFile = '123e4567-e89b-12d3-a456-426614174000.pdf';
  const expenseRow = ['EXP-00011', 'Existing expense', 'Invoice review', '', 450, '', '+15551000011', 'Pending', 'invoice.pdf', attachmentFile];
  try {
    await writeExcelFile([
      { sheet: SHEETS.owners.name, data: [SHEETS.owners.headers] },
      { sheet: SHEETS.expenses.name, data: [priorHeaders, expenseRow] },
      { sheet: SHEETS.maintenance.name, data: [SHEETS.maintenance.headers] },
    ]).toFile(filePath);
    const repository = new ExcelTreasuryRepository(filePath);
    await repository.initialize();
    const workbook = await readExcelFile(filePath);
    assert.deepEqual(workbook.find((sheet) => sheet.sheet === SHEETS.expenses.name).data[0], SHEETS.expenses.headers);
    const migratedExpense = (await repository.read()).expenses[0];
    assert.equal(migratedExpense.expenseId, 'EXP-00011');
    assert.equal(migratedExpense.attachmentName, 'invoice.pdf');
    assert.equal(migratedExpense.attachmentFile, attachmentFile);
    assert.equal(migratedExpense.expenseType, '');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});