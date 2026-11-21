import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ExcelTreasuryRepository } from './excelRepository.js';

const XLSX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export class GoogleDriveExcelRepository extends ExcelTreasuryRepository {
  constructor(filePath, { drive, fileId }) {
    super(filePath);
    this.drive = drive;
    this.fileId = fileId;
    this.downloadPath = `${this.filePath}.drive-download`;
    this.preserveCacheDuringInitialize = false;
  }

  async initialize() {
    await this.downloadFromDrive();
    this.preserveCacheDuringInitialize = true;
    try {
      return await super.initialize();
    } finally {
      this.preserveCacheDuringInitialize = false;
      await this.cleanupCache();
    }
  }

  async readFile() {
    await this.downloadFromDrive();
    try {
      return await super.readFile();
    } finally {
      if (!this.preserveCacheDuringInitialize) await this.cleanupCache();
    }
  }

  async writeFile(data) {
    await this.downloadFromDrive();
    const previousFile = await readFile(this.filePath);
    try {
      await super.writeFile(data);
      await this.drive.files.update({
        fileId: this.fileId,
        supportsAllDrives: true,
        media: { mimeType: XLSX_MIME_TYPE, body: await readFile(this.filePath) },
      });
    } catch (error) {
      await writeFile(this.filePath, previousFile).catch(() => undefined);
      throw new Error(`Could not save the Excel database to Google Drive: ${error.message}`);
    } finally {
      if (!this.preserveCacheDuringInitialize) await this.cleanupCache();
    }
  }

  async cleanupCache() {
    await Promise.all([
      rm(this.filePath, { force: true }).catch(() => undefined),
      rm(this.backupPath, { force: true }).catch(() => undefined),
      rm(this.tempPath, { force: true }).catch(() => undefined),
      rm(this.downloadPath, { force: true }).catch(() => undefined),
    ]);
  }

  async downloadFromDrive() {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    try {
      const response = await this.drive.files.get(
        { fileId: this.fileId, alt: 'media', supportsAllDrives: true },
        { responseType: 'arraybuffer' },
      );
      await writeFile(this.downloadPath, Buffer.from(response.data), { mode: 0o600 });
      await copyFile(this.downloadPath, this.filePath);
    } catch (error) {
      throw new Error(`Could not load the Excel database from Google Drive: ${error.message}`);
    } finally {
      await rm(this.downloadPath, { force: true });
    }
  }
}