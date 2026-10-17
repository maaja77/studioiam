// Barevný motiv administrace: jedna hlavní barva, ze které CSS odvodí odstíny pozadí, rámečků a textu.
export const DEFAULT_THEME = '#126b66';
export const THEMES: [string, string][] = [['Tyrkysová', DEFAULT_THEME], ['Zlatá', '#8a6d3f'], ['Pudrová', '#a0506e'], ['Levandulová', '#6b5b9a'], ['Šalvějová', '#4f6e4b'], ['Modrá', '#2f5f8f'], ['Vínová', '#7d2f45'], ['Grafitová', '#4a5559']];

const channel = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
/** Kontrast barvy s bílým textem (WCAG); tlačítka mají bílý text, proto aspoň 4,5. */
export function whiteContrast(hex: string) {
  const n = parseInt(hex.slice(1), 16), l = 0.2126 * channel(n >> 16 & 255) + 0.7152 * channel(n >> 8 & 255) + 0.0722 * channel(n & 255);
  return 1.05 / (l + 0.05);
}
/** Prázdná hodnota = výchozí barva; jinak #rrggbb dost tmavá pro bílý text. Vrací chybu jako text. */
export function checkTheme(value: string): string | null {
  if (!value) return null;
  if (!/^#[0-9a-f]{6}$/i.test(value)) return 'Barvu zadejte jako #rrggbb.';
  return whiteContrast(value) < 4.5 ? 'Vybraná barva je moc světlá, bílý text na tlačítkách by nebyl čitelný. Zvolte tmavší odstín.' : null;
}
const STORE_KEY = 'salon-theme';
/** Nastaví barvu motivu celé stránce (CSS proměnná --accent) a zapamatuje ji v prohlížeči, ať se po načtení neukáže na chvíli výchozí barva. */
export function applyTheme(value: string | undefined) {
  if (typeof document === 'undefined') return;
  const ok = !!value && !checkTheme(value);
  if (ok) document.documentElement.style.setProperty('--accent', value!); else document.documentElement.style.removeProperty('--accent');
  try { if (ok) localStorage.setItem(STORE_KEY, value!); else localStorage.removeItem(STORE_KEY); } catch { /* bez úložiště jen bez zapamatování */ }
}
/** Barva zapamatovaná z minula (před načtením nastavení ze serveru). */
export function restoreTheme() {
  try { const v = localStorage.getItem(STORE_KEY); if (v && !checkTheme(v)) document.documentElement.style.setProperty('--accent', v); } catch { /* nic */ }
}
