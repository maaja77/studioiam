import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,readFileSync,readdirSync,writeFileSync,renameSync,rmSync,existsSync} from 'node:fs';
import path from 'node:path';
export const dataDir=path.resolve(process.env.SALON_DATA_DIR||'data');mkdirSync(dataDir,{recursive:true,mode:0o700});
const db=new DatabaseSync(path.join(dataDir,'salon.sqlite'));db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
db.exec('CREATE TABLE IF NOT EXISTS selfhost_migrations(name TEXT PRIMARY KEY)');
for(const name of readdirSync('drizzle').filter(x=>x.endsWith('.sql')).sort()){if(!db.prepare('SELECT name FROM selfhost_migrations WHERE name=?').get(name)){db.exec('BEGIN');try{db.exec(readFileSync(path.join('drizzle',name),'utf8'));db.prepare('INSERT INTO selfhost_migrations(name) VALUES(?)').run(name);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}}}
class Prepared { sql:string;values:(string|number|null)[]=[];constructor(sql:string){this.sql=sql;}bind(...values:(string|number|null)[]){this.values=values;return this;}first(){return Promise.resolve(db.prepare(this.sql).get(...this.values)||null);}all(){return Promise.resolve({results:db.prepare(this.sql).all(...this.values),success:true});}run(){const r=db.prepare(this.sql).run(...this.values);return Promise.resolve({success:true,meta:{changes:Number(r.changes)}});}}
const DB={prepare:(sql:string)=>new Prepared(sql),async batch(statements:Prepared[]){db.exec('BEGIN');try{const results=[];for(const s of statements){const result=/^\s*SELECT\b/i.test(s.sql)?{results:db.prepare(s.sql).all(...s.values),success:true}:{success:true,meta:{changes:Number(db.prepare(s.sql).run(...s.values).changes)}};results.push(result);}db.exec('COMMIT');return results;}catch(e){db.exec('ROLLBACK');throw e;}}};
const root=path.join(dataDir,'objects');mkdirSync(root,{recursive:true,mode:0o700});
function objectPath(key:string){const p=path.resolve(root,key);if(!p.startsWith(root+path.sep))throw Error('Invalid object key');return p;}
const BUCKET={async put(key:string,bytes:Uint8Array){const p=objectPath(key);mkdirSync(path.dirname(p),{recursive:true,mode:0o700});const temp=p+'.'+crypto.randomUUID()+'.tmp';writeFileSync(temp,bytes,{mode:0o600});renameSync(temp,p);},async get(key:string){const p=objectPath(key);return existsSync(p)?{body:new Uint8Array(readFileSync(p))}:null;},async delete(keys:string|string[]){for(const k of Array.isArray(keys)?keys:[keys])rmSync(objectPath(k),{force:true});}};
export const env={DB,BUCKET};
