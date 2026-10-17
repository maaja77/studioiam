'use client';
// Karta klientky: kauce na míru, označení nespolehlivé klientky a blokace online rezervací.
import {useState} from 'react';
import {AlertTriangle, Ban} from 'lucide-react';
import {parseRule, ruleText, ruleValue, type DepositRule} from '../lib/deposit-rule';

type Props = {client: {blocked?: number; depositRequired?: number; unreliable?: number; depositRule?: string}; salonPercent: number; accountSet: boolean; busy: boolean;
  onSave: (data: {unreliable: boolean; required: boolean; rule: string}, message: string) => void; onBlock: (blocked: boolean) => void};

export default function ClientDeposit({client, salonPercent, accountSet, busy, onSave, onBlock}: Props) {
  const saved = parseRule(client.depositRule), unreliable = client.unreliable === 1, required = unreliable || client.depositRequired === 1;
  const [editing, setEditing] = useState(false), [kind, setKind] = useState<DepositRule['kind']>(saved.kind);
  const [percent, setPercent] = useState(saved.kind === 'percent' ? String(saved.percent) : '50'), [amount, setAmount] = useState(saved.kind === 'fixed' ? String(saved.cents / 100) : '500');
  const rule = (): string | null => {
    if (kind === 'percent') { const n = Number(percent); return Number.isInteger(n) && n >= 1 && n <= 100 ? `p:${n}` : null; }
    if (kind === 'fixed') { const n = Number(amount.replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) && n >= 100 && n <= 1000000 ? `k:${Math.round(n * 100)}` : null; }
    return kind === 'full' ? 'full' : '';
  };
  const save = (data: {unreliable: boolean; required: boolean; rule: string}, message: string) => { onSave(data, message); setEditing(false); };
  if (client.blocked === 1) return <div className="block-row blocked"><span><Ban size={16}/> Online rezervace zablokované. Na webu se tato klientka neobjedná.</span><button className="secondary" disabled={busy} onClick={() => onBlock(false)}>Povolit online rezervace</button></div>;
  const current = ruleValue(saved), next = rule();
  return <div className={'deposit-card' + (unreliable ? ' unreliable' : '')}>
    {unreliable && <p className="unreliable-line"><AlertTriangle size={16}/> Nespolehlivá klientka: při online rezervaci platí kauci vždy. V kalendáři a v přehledu Dnes uvidíte upozornění.</p>}
    <div className="deposit-card-row">
      <span>{required ? <>Kauce u všech rezervací: <b>{ruleText(saved, salonPercent)}</b></> : saved.kind !== 'salon' ? <>Kauce jen u dražších ošetření, výše <b>{ruleText(saved, salonPercent)}</b></> : 'Kauce podle pravidel salonu (jen dražší ošetření).'}
        {!accountSet && <small> Kauci klientky zaplatí, až bude v Nastavení číslo účtu.</small>}</span>
      <span className="block-links">
        <button className="link-button" disabled={busy} onClick={() => setEditing(!editing)}>{editing ? 'Zavřít' : 'Upravit kauci'}</button>
        <button className="link-button" disabled={busy} onClick={() => save({unreliable: !unreliable, required: !unreliable, rule: current}, unreliable ? 'Klientka už není označená jako nespolehlivá.' : 'Klientka je označená jako nespolehlivá, kauci zaplatí vždy.')}><AlertTriangle size={14}/> {unreliable ? 'Zrušit označení nespolehlivá' : 'Označit jako nespolehlivou'}</button>
        <button className="link-button" disabled={busy} onClick={() => onBlock(true)}><Ban size={14}/> Zablokovat online rezervace</button>
      </span>
    </div>
    {editing && <div className="deposit-edit">
      <label className="check"><input type="checkbox" checked={required} disabled={unreliable} onChange={e => save({unreliable, required: e.target.checked, rule: current}, e.target.checked ? 'Klientka bude platit kauci u všech rezervací.' : 'Kauce jen podle pravidel salonu.')}/> Vyžadovat kauci u všech rezervací{unreliable && ' (nespolehlivá klientka ji má vždy)'}</label>
      <div className="segmented-mini" role="radiogroup" aria-label="Výše kauce">{([['salon', `Podle salonu (${salonPercent} %)`], ['percent', 'Vlastní procento'], ['fixed', 'Pevná částka'], ['full', 'Celá cena']] as const).map(([k, l]) =>
        <button type="button" key={k} role="radio" aria-checked={kind === k} className={kind === k ? 'active' : ''} onClick={() => setKind(k)}>{l}</button>)}</div>
      {kind === 'percent' && <label className="field inline"><span>Procento z ceny ošetření</span><input type="number" min={1} max={100} value={percent} onChange={e => setPercent(e.target.value)}/></label>}
      {kind === 'fixed' && <label className="field inline"><span>Částka v Kč (nejvýš do ceny ošetření)</span><input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)}/></label>}
      {next === null && <p className="error-inline">{kind === 'percent' ? 'Zadejte procento 1–100.' : 'Zadejte částku aspoň 100 Kč.'}</p>}
      <div className="form-actions"><button className="primary" disabled={busy || next === null || next === current} onClick={() => save({unreliable, required, rule: next!}, 'Výše kauce u klientky byla uložena.')}>Uložit výši kauce</button></div>
    </div>}
  </div>;
}
