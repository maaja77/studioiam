// Vstupní dotazník klientky (zdravotní stav před ošetřením) a souhlas se zpracováním osobních údajů.
import {salonName, type BookingSettings} from './booking';

export type IntakeQuestion = {id: string; text: string; detail: string};
/** Otázky s odpovědí ano/ne; u „ano“ klientka doplní podrobnosti. */
export const INTAKE_QUESTIONS: IntakeQuestion[] = [
  {id: 'allergy', text: 'Máte nějakou alergii (léky, kosmetika, latex, náplasti, potraviny)?', detail: 'Na co?'},
  {id: 'medication', text: 'Užíváte pravidelně léky (např. na ředění krve, hormony, isotretinoin/Roaccutane, antibiotika)?', detail: 'Jaké?'},
  {id: 'pregnancy', text: 'Jste těhotná nebo kojíte?', detail: 'Případně v kolikátém měsíci'},
  {id: 'skin', text: 'Máte kožní onemocnění (ekzém, lupénka, rosacea, akné, opary)?', detail: 'Jaké a kde?'},
  {id: 'illness', text: 'Léčíte se s cukrovkou, epilepsií, srdcem, autoimunitním nebo onkologickým onemocněním, nebo máte poruchu srážlivosti krve?', detail: 'S čím?'},
  {id: 'implant', text: 'Máte kardiostimulátor, kovové implantáty nebo piercing v ošetřované oblasti?', detail: 'Jaké a kde?'},
  {id: 'procedures', text: 'Měla jste za posledních 6 měsíců botox, výplně, laser, chemický peeling nebo operaci v obličeji?', detail: 'Co a kdy?'},
  {id: 'sun', text: 'Opalovala jste se nebo byla v soláriu za poslední 2 týdny?', detail: ''},
  {id: 'scars', text: 'Máte sklon k jizvení nebo k pigmentovým skvrnám po zánětu?', detail: ''},
  {id: 'lenses', text: 'Nosíte kontaktní čočky?', detail: ''},
];

export type IntakeAnswers = Record<string, {yes: boolean; detail: string}> & {other?: {yes: boolean; detail: string}};
export type IntakeForm = {id: string; clientId: string | null; bookingId: string | null; token: string; status: 'sent' | 'done' | 'withdrawn';
  answers: IntakeAnswers | null; birthDate: string; consentHealth: number; consentPhotos: number; signedName: string; signature: string;
  consentText: string; submittedAt: string | null; withdrawnAt: string | null; created: string};

/** Text souhlasu s údaji salonu; ukládá se k vyplněnému dotazníku, aby zůstal i po pozdější změně. */
export function consentText(s: BookingSettings) {
  const who = [salonName(s), s.businessOwner, s.businessId && `IČO ${s.businessId}`, s.businessAddress].filter(Boolean).join(', ');
  const contact = [s.businessPhone && `tel. ${s.businessPhone}`, s.businessEmail].filter(Boolean).join(', ');
  return [
    `Správce osobních údajů: ${who}${contact ? ` (${contact})` : ''}.`,
    'Souhlasím, aby správce zpracovával mé osobní údaje (jméno, kontakty, datum narození) a údaje o mém zdravotním stavu uvedené v tomto dotazníku za účelem bezpečného provedení kosmetických ošetření a vedení mé karty klientky. Údaje o zdraví jsou zvláštní kategorií osobních údajů a zpracovávají se na základě mého výslovného souhlasu (čl. 9 odst. 2 písm. a) GDPR).',
    'Údaje se uchovávají po dobu, kdy na ošetření chodím, a poté nejdéle 3 roky od poslední návštěvy. Nikomu dalšímu se nepředávají; jsou uložené zabezpečeně na serveru salonu a v šifrované záloze.',
    'Souhlas mohu kdykoli odvolat osobně, telefonicky nebo e-mailem; odvolání se netýká zpracování, které proběhlo před ním. Mám právo na přístup ke svým údajům, jejich opravu, výmaz, omezení zpracování a přenositelnost a právo podat stížnost u Úřadu pro ochranu osobních údajů (www.uoou.cz).',
  ].join('\n\n');
}
export const PHOTO_CONSENT = 'Souhlasím s pořizováním fotografií ošetřované oblasti pro sledování průběhu ošetření. Fotografie slouží jen do mé karty a nezveřejňují se.';
export const TRUTH_CONFIRMATION = 'Potvrzuji, že jsem odpověděla pravdivě, a změny zdravotního stavu oznámím před dalším ošetřením.';

/** Odpovědi „ano“ jako krátké upozornění pro kosmetičku. */
export function intakeWarnings(answers: IntakeAnswers | null) {
  if (!answers) return [];
  const out = INTAKE_QUESTIONS.filter(q => answers[q.id]?.yes).map(q => ({id: q.id, text: q.text, detail: answers[q.id].detail}));
  if (answers.other?.detail) out.push({id: 'other', text: 'Další informace', detail: answers.other.detail});
  return out;
}
