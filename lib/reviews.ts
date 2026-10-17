// Prosba o hodnocení po ošetření: doplnění textu zprávy.
export const fillReview = (text: string, name: string, salon: string, link: string) =>
  text.replace(/\{jmeno\}/g, name.trim().split(/\s+/)[0] || '').replace(/\{salon\}/g, salon || 'salonu').replace(/\{odkaz\}/g, link).replace(/\s+([,.])/g, '$1').replace(/ {2,}/g, ' ').trim();
