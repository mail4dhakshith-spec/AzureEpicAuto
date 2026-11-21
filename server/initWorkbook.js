import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ExcelTreasuryRepository } from './excelRepository.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workbookPath = process.env.EXCEL_DB_PATH || path.join(root, 'data', 'ssn_treasury.xlsx');
const repository = new ExcelTreasuryRepository(workbookPath);
await repository.initialize();
const data = await repository.read();
const summary = Object.fromEntries(Object.entries(data).map(([sheet, rows]) => [sheet, rows.length]));
console.log(`Initialized ${workbookPath}`);
console.log(JSON.stringify(summary));