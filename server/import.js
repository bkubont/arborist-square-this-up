import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { openDatabase, migrate } from './db.js';
import { emailSchema } from './security.js';
import { saveRecord, schemas, JOB_DOCUMENT_ENTITIES } from './domain.js';

// Offline import only: never fetch arbitrary URLs from an uploaded export.
// Base44 exports can be normalized to { Client: [], Job: [], TimelineEntry: [], files: [] }.
// Files use { id, mime, content: base64, source_url? }; source_url maps old photo URLs.
// Dependency order, not JOB_DOCUMENT_ENTITIES' display order: a WorkOrder can carry
// related_estimate_id, and materialOrderSync links a MaterialOrder back to its WorkOrder via
// related_work_order_id, so both referenced entities must be imported first or the id lookup
// below throws "references a missing work order" on an otherwise-valid backup.
const IMPORT_ORDER = ['Client', 'Job', 'CompanyProfile', 'Estimate', 'WorkOrder', 'MaterialOrder', 'ChangeOrder', 'Invoice', 'Payment', 'Expense', 'TimelineEntry'];

export async function importData(db, email, input) {
  const [user] = await db.all('SELECT id FROM users WHERE email = ?', [emailSchema.parse(email)]);
  if (!user) throw new Error('Create the destination account before importing');
  const records = input.version === 1 ? input.records : Object.keys(schemas).flatMap(entity => (input[entity] || []).map(row => ({ ...row, entity })));
  if (!Array.isArray(records) || !records.length) throw new Error('No records found in the import');
  const files = input.files || [];
  if (!Array.isArray(files)) throw new Error('Invalid file collection');
  await db.transaction(async tx => {
    await tx.all('SELECT id FROM users WHERE id = ?' + (db.dialect === 'mysql' ? ' FOR UPDATE' : ''), [user.id]);
    const existingRecords = await tx.all('SELECT id, entity FROM records WHERE owner_id = ?', [user.id]);
    const existingFiles = await tx.all('SELECT id FROM files WHERE owner_id = ?', [user.id]);
    // Invite registration seeds CompanyProfile with sales tax; treat that alone as empty.
    const onlySeedProfile = existingRecords.length > 0
      && existingRecords.every((row) => row.entity === 'CompanyProfile')
      && existingFiles.length === 0;
    if (onlySeedProfile) {
      await tx.run('DELETE FROM records WHERE owner_id = ? AND entity = ?', [user.id, 'CompanyProfile']);
    } else if (existingRecords.length || existingFiles.length) {
      throw new Error('Import requires an empty account to prevent duplicate or overwritten data');
    }
    const fileMap = new Map();
    let total = 0;
    for (const file of files) {
      if (!['image/jpeg','image/png','image/webp'].includes(file.mime) || typeof file.content !== 'string') throw new Error('Unsupported imported file');
      const bytes = Buffer.from(file.content, 'base64');
      total += bytes.length;
      if (bytes.length > 4 * 1024 * 1024 || total > Number(process.env.ACCOUNT_STORAGE_MB || 100) * 1024 * 1024) throw new Error('Imported photos exceed the storage limit');
      const id = randomUUID();
      await tx.run('INSERT INTO files (id, owner_id, mime, content, size) VALUES (?, ?, ?, ?, ?)', [id, user.id, file.mime, bytes, bytes.length]);
      fileMap.set(`/api/files/${file.id}`, `/api/files/${id}`);
      if (file.source_url) fileMap.set(file.source_url, `/api/files/${id}`);
    }
    const ids = new Map();
    for (const entity of IMPORT_ORDER) {
      for (const record of records.filter(row => row.entity === entity)) {
        if (typeof record.id !== 'string' || ids.has(`${entity}:${record.id}`)) throw new Error('Missing or duplicate source ID');
        const data = { ...record };
        if (entity === 'Job') {
          data.client_id = ids.get(`Client:${record.client_id}`);
          if (!data.client_id) throw new Error('Job references a missing client');
        }
        if (entity === 'TimelineEntry' || entity === 'Payment' || JOB_DOCUMENT_ENTITIES.includes(entity)) {
          data.job_id = ids.get(`Job:${record.job_id}`);
          if (!data.job_id) throw new Error(`${entity} references a missing job`);
        }
        if (entity === 'Expense' && record.job_id) {
          data.job_id = ids.get(`Job:${record.job_id}`);
          if (!data.job_id) throw new Error('Expense references a missing job');
        }
        if (entity === 'Payment' && record.invoice_id) {
          data.invoice_id = ids.get(`Invoice:${record.invoice_id}`);
          if (!data.invoice_id) throw new Error('Payment references a missing invoice');
        }
        if (record.related_estimate_id) {
          data.related_estimate_id = ids.get(`Estimate:${record.related_estimate_id}`);
          if (!data.related_estimate_id) throw new Error(`${entity} references a missing estimate`);
        }
        if (record.related_work_order_id) {
          data.related_work_order_id = ids.get(`WorkOrder:${record.related_work_order_id}`);
          if (!data.related_work_order_id) throw new Error(`${entity} references a missing work order`);
        }
        if (Array.isArray(record.billed_change_order_ids)) {
          data.billed_change_order_ids = record.billed_change_order_ids.map(sourceId => {
            const mapped = ids.get(`ChangeOrder:${sourceId}`);
            if (!mapped) throw new Error('Invoice references a missing change order');
            return mapped;
          });
        }
        for (const field of ['photo_url', 'signature_file_url', 'logo_url']) {
          if (!data[field]) continue;
          data[field] = fileMap.get(record[field]);
          if (!data[field]) throw new Error('A photo is missing. Add its bytes and source_url to the files collection before importing.');
        }
        const saved = await saveRecord(tx, user.id, entity, data, undefined, { skipClientAddressCheck: true });
        ids.set(`${entity}:${record.id}`, saved.id);
        if (record.created_date) {
          const created = new Date(record.created_date);
          const updated = new Date(record.updated_date || record.created_date);
          if (isNaN(created.getTime()) || isNaN(updated.getTime())) throw new Error('Invalid source timestamp');
          await tx.run('UPDATE records SET created_date = ?, updated_date = ? WHERE id = ? AND owner_id = ?', [created.toISOString(), updated.toISOString(), saved.id, user.id]);
        }
      }
    }
    if (records.some(row => !Object.hasOwn(schemas, row.entity))) throw new Error('Unknown entity in import');
  });
  return records.length;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [email, filename] = process.argv.slice(2);
  if (!email || !filename) throw new Error('Usage: npm run data:import -- user@example.com path/to/export.json');
  const db = await openDatabase();
  try { await migrate(db); const count = await importData(db, email, JSON.parse(await readFile(filename, 'utf8'))); console.log(`Imported ${count} records.`); }
  finally { await db.close(); }
}
