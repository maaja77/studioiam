// Domácí péče po ošetření: výchozí text a zpráva pro klientku.

export type CareProduct = {name: string; priceCents: number | null; note: string};

export const DEFAULT_CARE_TEXT = [
  'Prvních 24 hodin prosím nepoužívejte make-up, nechoďte do sauny, na solárium ani do bazénu.',
  '- Pleť ráno a večer jemně čistěte a poté hydratujte.',
  '- Přes den používejte krém s ochranným faktorem SPF 50.',
  '- Nemněte a neškrábejte ošetřená místa.',
  'Pokud by se objevilo cokoli neobvyklého, ozvěte se mi prosím.',
].join('\n');

/** SMS se odkazem na doporučení (bez zdravotních údajů, jen odkaz). */
export const careSms = (salon: string, link: string) =>
  `Dobrý den, posílám doporučení domácí péče po ošetření a vhodné přípravky: ${link}${salon ? ' ' + salon : ''}`;
