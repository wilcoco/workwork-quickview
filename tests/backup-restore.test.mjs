import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openStore } from '../server/store.mjs';
import { backupDatabase, verifyDatabase } from '../scripts/backup.mjs';

test('backup captures committed WAL records and restores with a consistent independent database',t=>{
  const dir=mkdtempSync(join(tmpdir(),'qv-backup-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const source=join(dir,'source.sqlite'),destination=join(dir,'snapshots','snapshot.sqlite');
  const store=openStore(source);t.after(()=>store.close());
  const company=store.createCompany({name:'Synthetic snapshot company',createdAt:'2026-09-26T00:00:00Z'});
  store.insert(company.id,'questions',{id:'question-snapshot',text:'Synthetic question',status:'live',createdAt:'2026-09-26T00:00:00Z'});
  store.insert(company.id,'actions',{id:'action-snapshot',questionId:'question-snapshot',status:'reported_done',updates:[{note:'Synthetic result'}],createdAt:'2026-09-26T00:00:01Z'});
  const result=backupDatabase(source,destination);
  assert.equal(result.integrity,'ok');assert.equal(result.counts.records,2);assert.equal(statSync(destination).mode & 0o777,0o600);
  store.insert(company.id,'responses',{id:'after-snapshot',text:'Not in snapshot',createdAt:'2026-09-26T00:00:02Z'});
  const restored=new DatabaseSync(destination);t.after(()=>restored.close());
  assert.equal(restored.prepare('SELECT COUNT(*) AS n FROM records').get().n,2);
  const action=JSON.parse(restored.prepare('SELECT payload FROM records WHERE id=?').get('action-snapshot').payload);
  assert.equal(action.status,'reported_done');assert.equal(action.updates[0].note,'Synthetic result');
  assert.equal(verifyDatabase(destination).integrity,'ok');
});
test('backup fails for missing source and refuses to overwrite existing snapshots or the source',t=>{
  const dir=mkdtempSync(join(tmpdir(),'qv-backup-guard-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const source=join(dir,'source.sqlite'),destination=join(dir,'snapshot.sqlite');const store=openStore(source);t.after(()=>store.close());
  assert.throws(()=>backupDatabase(join(dir,'missing.sqlite'),destination),/does not exist/);
  assert.throws(()=>backupDatabase(source,source),/already exists/);
  backupDatabase(source,destination);
  assert.throws(()=>backupDatabase(source,destination),/already exists/);
});
