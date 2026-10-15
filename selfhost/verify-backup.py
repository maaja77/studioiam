#!/usr/bin/env python3
import pathlib,sys,json,sqlite3,hashlib
root=pathlib.Path(sys.argv[1] if len(sys.argv)>1 else '../backup');manifest=json.loads((root/'manifest.json').read_text());records=json.loads((root/'records.json').read_text())['tables']
assert hashlib.sha256((root/'salon.sqlite').read_bytes()).hexdigest()==manifest['database_sha256'],'Database checksum mismatch'
db=sqlite3.connect('file:'+str((root/'salon.sqlite').resolve())+'?mode=ro',uri=True);db.row_factory=sqlite3.Row
assert db.execute('PRAGMA integrity_check').fetchone()[0]=='ok';assert not db.execute('PRAGMA foreign_key_check').fetchall()
for table,data in records.items():
 rows=[dict(r) for r in db.execute('SELECT * FROM "'+table+'"')];cols=data['columns'];actual=sorted([{c:r[c] for c in cols} for r in rows],key=lambda r:r['id']);expected=sorted(data['rows'],key=lambda r:r['id']);assert actual==expected,'Row mismatch: '+table;assert len(rows)==manifest['counts'][table]
assert db.execute('SELECT COALESCE(SUM(revenue_cents),0) FROM visits').fetchone()[0]==manifest['revenue_cents']
for photo in manifest['photos']:
 file=root/'objects'/photo['key'];content=file.read_bytes();assert len(content)==photo['bytes'];assert hashlib.sha256(content).hexdigest()==photo['sha256'],'Photo checksum mismatch'
print('OK: all database values, record counts, relationships, revenue and photo checksums match.')
