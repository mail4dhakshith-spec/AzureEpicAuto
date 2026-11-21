import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import readExcelFile from 'read-excel-file/node';
import writeExcelFile from 'write-excel-file/node';
import { ExcelTreasuryRepository, SHEETS } from './excelRepository.js';
import { GoogleDriveExcelRepository } from './googleDriveExcelRepository.js';

const admin = { id: 'admin-1', app_metadata: { role: 'admin' }, user_metadata: { full_name: 'Treasury Admin' } };

test('downloads the Drive workbook and uploads repository changes', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'ssn-drive-workbook-'));
  const sourcePath = path.join(directory, 'source.xlsx');
  const cachePath = path.join(directory, 'cache.xlsx');
  const source = new ExcelTreasuryRepository(sourcePath);
  await source.initialize();
  let remoteWorkbook = await readFile(sourcePath);
  const drive = {
    files: {
      get: async () => ({ data: remoteWorkbook }),
      update: async ({ media }) => { remoteWorkbook = Buffer.from(media.body); },
    },
  };
  try {
    const repository = new GoogleDriveExcelRepository(cachePath, { drive, fileId: 'drive-file-id' });
    await repository.initialize();
    const owner = await repository.createOwner({
      username: 'drive.owner', password: 'Test-owner-password-1!', name: 'Drive Owner',
      mobileNumber: '+15551000031', email: 'drive@example.invalid', phase: 'Phase 1', plotNumber: 'A-31',
    }, admin);

    await writeFile(sourcePath, remoteWorkbook);
    const sheets = await readExcelFile(sourcePath);
    const ownerRows = sheets.find((sheet) => sheet.sheet === SHEETS.owners.name).data;
    assert.equal(ownerRows[1][0], owner.id);
    assert.equal(ownerRows[1][13], 'Member');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

