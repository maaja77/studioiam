// Profil instalace. Studio I AM má vlastní údaje, logo, ceník z MyFoxu a program Čistá pleť;
// každý další salon začíná s prázdnými údaji a vyplní si je v Nastavení.
import type {DatabaseSync} from 'node:sqlite';

export type Profile = 'studioiam' | 'generic';

/** Údaje Studia I AM; při prvním spuštění s profilem se doplní do polí, která jsou v nastavení prázdná. */
const STUDIO_IAM = {
  businessName: 'STUDIO I AM', businessOwner: 'Andrea Marešová', businessAddress: 'Nerudova 884/11, 500 02 Hradec Králové',
  businessId: '73975052', businessPhone: '775 963 462', account: '331122037/0300', accountName: 'STUDIO I AM',
};

/**
 * Zjistí profil a uloží ho do databáze, aby se po restartu neměnil.
 * Pořadí: SALON_PROFILE v .env, dříve uložený profil, jinak stávající instalace s klientkami = Studio I AM
 * (instalace z doby před profily) a nová prázdná databáze = jiný salon.
 */
export function applyProfile(db: DatabaseSync, wanted = process.env.SALON_PROFILE): Profile {
  if (wanted && wanted !== 'studioiam' && wanted !== 'generic') throw Error('SALON_PROFILE must be studioiam or generic.');
  const stored = (db.prepare("SELECT value FROM settings WHERE key='profile'").get() as {value?: string} | undefined)?.value;
  const existing = Number((db.prepare('SELECT count(*) AS n FROM clients').get() as {n: number}).n) > 0;
  const profile = (wanted || stored || (existing ? 'studioiam' : 'generic')) as Profile;
  db.prepare("INSERT INTO settings (key,value) VALUES ('profile',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(profile);
  // Doplňuje se jen jednou, aby pole, které salon později sám vymaže, zůstalo prázdné.
  if (profile === 'studioiam' && !stored) {
    const raw = (db.prepare("SELECT value FROM settings WHERE key='booking'").get() as {value?: string} | undefined)?.value;
    let saved: Record<string, unknown> = {};
    try { saved = JSON.parse(raw || '{}'); } catch { saved = {}; }
    const filled: Record<string, unknown> = {...saved};
    for (const [k, v] of Object.entries(STUDIO_IAM)) if (typeof saved[k] !== 'string' || !(saved[k] as string).trim()) filled[k] = v;
    if (saved.programEnabled === undefined) filled.programEnabled = true;
    // Programy Studia I AM (u instalace, která je už měla, je doplnila migrace 0024).
    const now = new Date().toISOString();
    db.prepare("INSERT OR IGNORE INTO programs (id,name,treatment,price_cents,discounts,interval_days,active,sort,created) VALUES ('clean-skin','Čistá pleť','A-QS Hacker',129000,'[0,5,10]',28,1,0,?),('hydration','Hydratovaná pleť','Derma Collage',179000,'[0,5,10]',28,1,1,?)").run(now, now);
    if (JSON.stringify(filled) !== JSON.stringify(saved)) db.prepare("INSERT INTO settings (key,value) VALUES ('booking',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify(filled));
  }
  return profile;
}
