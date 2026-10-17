// Ukázkové prostředí pro náhled v prohlížeči: stejné API jako selfhost/runtime.ts,
// ale databáze běží přes sql.js v paměti a ukládá se jen do localStorage prohlížeče.
import initSqlJs from 'sql.js/dist/sql-asm.js';
import {seedDemo} from './seed';

type Value = string | number | null;
const DB_KEY = 'studioiam-demo-db-v17', PHOTO_KEY = 'studioiam-demo-photos-v17';
const migrations = import.meta.glob('../../drizzle/*.sql', {query: '?raw', import: 'default', eager: true}) as Record<string, string>;

function toBase64(bytes: Uint8Array) { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); }
function fromBase64(text: string) { return Uint8Array.from(atob(text), c => c.charCodeAt(0)); }
function load(key: string) { try { return localStorage.getItem(key); } catch { return null; } }
function store(key: string, value: string) { try { localStorage.setItem(key, value); } catch { /* jen v paměti */ } }

const objects = new Map<string, Uint8Array>();
try { for (const [k, v] of Object.entries(JSON.parse(load(PHOTO_KEY) || '{}') as Record<string, string>)) objects.set(k, fromBase64(v)); } catch { objects.clear(); }
function savePhotos() { const out: Record<string, string> = {}; for (const [k, v] of objects) out[k] = toBase64(v); store(PHOTO_KEY, JSON.stringify(out)); }

const ready = initSqlJs().then(async SQL => {
  const saved = load(DB_KEY);
  let db = saved ? new SQL.Database(fromBase64(saved)) : null;
  if (!db) {
    db = new SQL.Database();
    for (const name of Object.keys(migrations).sort()) db.exec(migrations[name]);
    db.exec('PRAGMA foreign_keys=ON');
    await seedDemo((sql, values) => db!.run(sql, values), (key, bytes) => objects.set(key, bytes));
    savePhotos();
  }
  db.exec('PRAGMA foreign_keys=ON');
  return db;
});

async function persist() { const db = await ready; store(DB_KEY, toBase64(db.export())); db.exec('PRAGMA foreign_keys=ON'); }

function rows(db: Awaited<typeof ready>, sql: string, values: Value[]) {
  const stmt = db.prepare(sql); stmt.bind(values); const out: Record<string, unknown>[] = [];
  while (stmt.step()) out.push(stmt.getAsObject()); stmt.free(); return out;
}

class Prepared {
  sql: string; values: Value[] = [];
  constructor(sql: string) { this.sql = sql; }
  bind(...values: Value[]) { this.values = values; return this; }
  async first<T = Record<string, unknown>>() { return (rows(await ready, this.sql, this.values)[0] as T) || null; }
  async all<T = Record<string, unknown>>() { return {results: rows(await ready, this.sql, this.values) as T[], success: true}; }
  async run() { const db = await ready; db.run(this.sql, this.values); const changes = db.getRowsModified(); await persist(); return {success: true, meta: {changes}}; }
}

const DB = {
  prepare: (sql: string) => new Prepared(sql),
  async batch(statements: Prepared[]) {
    const db = await ready; db.exec('BEGIN');
    try {
      const results = statements.map(s => /^\s*SELECT\b/i.test(s.sql) ? {results: rows(db, s.sql, s.values), success: true} : (db.run(s.sql, s.values), {success: true, meta: {changes: db.getRowsModified()}}));
      db.exec('COMMIT'); await persist(); return results;
    } catch (e) { db.exec('ROLLBACK'); throw e; }
  },
};

const BUCKET = {
  async put(key: string, bytes: Uint8Array) { objects.set(key, bytes); savePhotos(); },
  async get(key: string) { const body = objects.get(key); return body ? {body} : null; },
  async delete(keys: string | string[]) { for (const k of Array.isArray(keys) ? keys : [keys]) objects.delete(k); savePhotos(); },
};

// V ukázce se e-mail neposílá, jen se zobrazí jeho předmět v horní liště.
const NOTIFY = async (subject: string, _text: string, to?: string) => { window.dispatchEvent(new CustomEvent('demo-mail', {detail: to ? `e-mail klientce (${to}): ${subject}` : subject})); };

// Náhled ukazuje instalaci Studia I AM (ceník z MyFoxu, program Čistá pleť, vlastní logo).
const SMS = async (phone: string, text: string) => { window.dispatchEvent(new CustomEvent('demo-mail', {detail: `SMS na ${phone}: ${text}`})); };
export const env = {DB, BUCKET, NOTIFY, PROFILE: 'studioiam', SMS, SMS_NAME: 'ukázka (SMS se jen zobrazí, neodešlou)'};

export function resetDemo() { try { localStorage.removeItem(DB_KEY); localStorage.removeItem(PHOTO_KEY); } catch { /* nic */ } location.reload(); }
