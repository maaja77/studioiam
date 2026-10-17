// Narozeniny klientek: nejbližší narozeniny a kolik let klientka slaví (29. 2. se v nepřestupném roce slaví 28. 2.).
const leap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const utc = (d: string) => Date.parse(d + 'T12:00:00Z');

/** Datum narozenin v daném roce. */
export function birthdayIn(birthDate: string, year: number) {
  const md = birthDate.slice(5, 10);
  return `${year}-${md === '02-29' && !leap(year) ? '02-28' : md}`;
}

/** Nejbližší narozeniny kolem dneška: dny (záporné = nedávno), datum a věk. Hledá v rozmezí od `back` dní zpět. */
export function nearestBirthday(birthDate: string, today: string, back = 0) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return null;
  const y = Number(today.slice(0, 4));
  for (const year of [y - 1, y, y + 1]) {
    const date = birthdayIn(birthDate, year), days = Math.round((utc(date) - utc(today)) / 86400000);
    if (days >= -back) return {date, days, age: year - Number(birthDate.slice(0, 4))};
  }
  return null;
}

/** Výchozí přání k narozeninám. Bez nabídky slevy není obchodním sdělením; když přidáte dárek nebo slevu, nechte v textu možnost zprávy odmítnout. */
export const DEFAULT_BIRTHDAY_TEXT = 'Dobrý den, všechno nejlepší k narozeninám! Přejeme Vám hodně zdraví, radosti a krásnou pleť. {salon}';

export const fillBirthday = (text: string, name: string, salon: string) =>
  text.replace(/\{jmeno\}/g, name.trim().split(/\s+/)[0] || '').replace(/\{salon\}/g, salon || '').replace(/\s+([,.!])/g, '$1').replace(/,\s*,/g, ',').replace(/ {2,}/g, ' ').trim();
