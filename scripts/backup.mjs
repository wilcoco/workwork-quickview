import { DatabaseSync } from 'node:sqlite';
import { chmodSync, existsSync, mkdirSync, realpathSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// VACUUM INTO reads a consistent SQLite snapshot, including committed WAL content.
// Never copy only the main file of a running WAL database.
export function backupDatabase(sourcePath, destinationPath) {
  if (!sourcePath || !destinationPath) throw new Error('Provide both source and destination database paths.');
  const source = resolve(sourcePath), destination = resolve(destinationPath);
  if (!existsSync(source) || !statSync(source).isFile()) throw new Error('Source database does not exist.');
  if (existsSync(destination)) throw new Error('Destination already exists; backups never overwrite a file.');
  mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
  if (realpathSync(source) === resolve(realpathSync(dirname(destination)), destination.split('/').at(-1))) throw new Error('Source and destination must differ.');
  const previousMask = process.umask(0o077);
  let db;
  try {
    db = new DatabaseSync(source, { readOnly: true });
    db.exec('PRAGMA busy_timeout = 5000;');
    const integrity = db.prepare('PRAGMA integrity_check').get();
    if (Object.values(integrity)[0] !== 'ok') throw new Error('Source integrity check failed. Preserve the source for diagnosis.');
    db.prepare('VACUUM INTO ?').run(destination);
    chmodSync(destination, 0o600);
  } finally { db?.close(); process.umask(previousMask); }
  const verification = verifyDatabase(destination);
  return { destination, ...verification };
}

export function verifyDatabase(path) {
  const db = new DatabaseSync(resolve(path), { readOnly: true });
  try {
    if (Object.values(db.prepare('PRAGMA integrity_check').get())[0] !== 'ok') throw new Error('Backup integrity check failed.');
    const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map(row => row.name));
    const counts = Object.fromEntries(['companies','users','records','sessions'].filter(table => tables.has(table)).map(table => [table, db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count]));
    return { integrity:'ok', counts };
  } finally { db.close(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.length !== 4 || args[0] !== '--source' || args[2] !== '--destination') throw new Error('Usage: node scripts/backup.mjs --source DATABASE --destination NEW_BACKUP_PATH');
    console.log(JSON.stringify(backupDatabase(args[1],args[3])));
  } catch (error) { console.error(error.message); process.exitCode=1; }
}
