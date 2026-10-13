'use strict';

/* ============ Konstanten ============ */
const STORE_KEY = 'tagesbudget.v1';
const HINT_KEY = 'tagesbudget.hintDismissed';
const DEFAULTS = { daily: 1500, weekend: 5000 }; // alle Beträge in Cent
const CATS = [
  { id: 'essen', label: 'Essen', icon: '🍽️' },
  { id: 'einkauf', label: 'Einkauf', icon: '🛒' },
  { id: 'cafe', label: 'Café', icon: '☕' },
  { id: 'ausgehen', label: 'Ausgehen', icon: '🍻' },
  { id: 'unterwegs', label: 'Unterwegs', icon: '🚌' },
  { id: 'sonstiges', label: 'Sonstiges', icon: '📦' },
];
const CAT = Object.fromEntries(CATS.map(c => [c.id, c]));
const WD_SHORT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const WD_LONG = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

const ICON_PREV = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>';
const ICON_NEXT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>';
const ICON_X = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';

const $ = id => document.getElementById(id);

/* ============ Datum ============ */
const pad = n => String(n).padStart(2, '0');
const keyOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dateOf = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const mondayOf = d => addDays(d, -((d.getDay() + 6) % 7));
const isWeekendDay = d => d.getDay() === 0 || d.getDay() === 6;
const todayKey = () => keyOf(new Date());
const longDate = d => `${WD_LONG[d.getDay()]}, ${d.getDate()}. ${MONTHS[d.getMonth()]}`;

function isoWeek(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t - yearStart) / 86400000 + 1) / 7);
}

function relDay(k) {
  if (k === ui.today) return 'Heute';
  if (k === keyOf(addDays(dateOf(ui.today), -1))) return 'Gestern';
  const d = dateOf(k);
  return `${WD_SHORT[d.getDay()]}, ${d.getDate()}.${d.getMonth() + 1}.`;
}
function relDayLong(k) {
  if (k === ui.today) return 'Heute';
  if (k === keyOf(addDays(dateOf(ui.today), -1))) return 'Gestern';
  return longDate(dateOf(k));
}

/* ============ Geld ============ */
const eurWhole = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 });
const eurCents = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const numWhole = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });
const numCents = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function fmt(c) {
  c = Math.round(c);
  if (c < 0) return '−' + fmt(-c);
  return (c % 100 === 0 ? eurWhole : eurCents).format(c / 100);
}
function num(c) {
  c = Math.round(c);
  if (c < 0) return '−' + num(-c);
  return (c % 100 === 0 ? numWhole : numCents).format(c / 100);
}
const fmtDelta = c => (c > 0 ? '+' : c === 0 ? '±' : '') + fmt(c);
const numDelta = c => (c > 0 ? '+' : c === 0 ? '±' : '') + num(c);

/** "12,50" · "12.5" · "4,50 + 3" → Cent (oder null) */
function parseAmount(raw) {
  const s = String(raw).replace(/[€\s]/g, '').replace(/,/g, '.');
  if (!s) return null;
  let total = 0;
  for (const part of s.split('+')) {
    if (!/^(\d+\.?\d{0,2}|\.\d{1,2})$/.test(part)) return null;
    total += Math.round(parseFloat(part) * 100);
  }
  return total > 0 && total < 10000000 ? total : null;
}

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ============ Speicher ============ */
const validEntry = e => e && typeof e.id === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(e.date) && Number.isInteger(e.amount) && e.amount > 0;

function sanitize(data) {
  const s = data && data.settings || {};
  return {
    settings: {
      daily: Number.isInteger(s.daily) && s.daily > 0 ? s.daily : DEFAULTS.daily,
      weekend: Number.isInteger(s.weekend) && s.weekend >= 0 ? s.weekend : DEFAULTS.weekend,
    },
    entries: Array.isArray(data && data.entries) ? data.entries.filter(validEntry).map(e => ({
      id: e.id, date: e.date, amount: e.amount,
      cat: CAT[e.cat] ? e.cat : 'sonstiges',
      note: typeof e.note === 'string' ? e.note.slice(0, 60) : '',
      ts: Number.isFinite(e.ts) ? e.ts : dateOf(e.date).getTime(),
    })) : [],
    lastCat: data && CAT[data.lastCat] ? data.lastCat : 'essen',
  };
}

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return sanitize(JSON.parse(raw));
  } catch (_) { /* leer starten */ }
  return sanitize(null);
}

function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
  catch (_) { toast('Speichern hat nicht geklappt'); }
}

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

let state = load();
let sums = new Map();

const now0 = new Date();
const ui = {
  view: 'heute',
  today: keyOf(now0),
  weekMonday: mondayOf(now0),
  month: { y: now0.getFullYear(), m: now0.getMonth() },
  monthDay: keyOf(now0),
  addDate: keyOf(now0),
  addCat: state.lastCat,
  editId: null,
  editCat: 'essen',
};

/* ============ Berechnungen ============ */
function daySums() {
  const m = new Map();
  for (const e of state.entries) m.set(e.date, (m.get(e.date) || 0) + e.amount);
  return m;
}
const sumOf = list => list.reduce((a, e) => a + e.amount, 0);
const entriesBetween = (from, to) => state.entries.filter(e => e.date >= from && e.date <= to);
const byNewest = (a, b) => (b.date < a.date ? -1 : b.date > a.date ? 1 : b.ts - a.ts);

/**
 * Woche Mo–So. Jeder Werktag hat das Tagesbudget.
 * Abgeschlossene Werktage (vor heute) geben ihre Differenz ans Wochenende weiter:
 * weniger ausgegeben → Wochenende wird größer, mehr ausgegeben → kleiner.
 */
function weekInfo(monday) {
  const { daily, weekend } = state.settings;
  const today = ui.today;
  const days = [];
  let saved = 0, total = 0;
  for (let i = 0; i < 7; i++) {
    const d = addDays(monday, i), k = keyOf(d), spent = sums.get(k) || 0;
    const day = { d, k, spent, done: k < today, isToday: k === today, future: k > today };
    days.push(day);
    total += spent;
    if (i < 5 && day.done) saved += daily - spent;
  }
  const pool = weekend + saved;
  const weekendSpent = days[5].spent + days[6].spent;
  return {
    monday, days, saved, pool, weekendSpent, total,
    weekendLeft: pool - weekendSpent,
    budget: 5 * daily + weekend,
    past: days[6].k < today,
    current: days[0].k <= today && today <= days[6].k,
  };
}

function monthInfo(y, m) {
  const { daily, weekend } = state.settings;
  const count = new Date(y, m + 1, 0).getDate();
  const days = [];
  let spent = 0, budget = 0, elapsedBudget = 0, elapsedDays = 0;
  for (let i = 1; i <= count; i++) {
    const d = new Date(y, m, i), k = keyOf(d), s = sums.get(k) || 0, we = isWeekendDay(d);
    const b = we ? weekend / 2 : daily;
    spent += s;
    budget += b;
    if (k <= ui.today) { elapsedBudget += b; elapsedDays++; }
    days.push({ d, k, s, we });
  }
  return { days, spent, budget: Math.round(budget), elapsedBudget: Math.round(elapsedBudget), elapsedDays };
}

/* ============ Bausteine ============ */
const chipsHTML = sel => CATS.map(c =>
  `<button type="button" class="chip" role="radio" aria-checked="${c.id === sel}" data-cat="${c.id}"><span>${c.icon}</span>${c.label}</button>`
).join('');

function entryRow(e) {
  const cat = CAT[e.cat] || CAT.sonstiges;
  const t = new Date(e.ts);
  const time = keyOf(t) === e.date ? `${pad(t.getHours())}:${pad(t.getMinutes())}` : '';
  const title = e.note ? esc(e.note) : cat.label;
  const sub = [e.note ? cat.label : '', time].filter(Boolean).join(' · ');
  return `<button type="button" class="entry" data-id="${esc(e.id)}">
    <span class="e-ico">${cat.icon}</span>
    <span class="e-main"><b>${title}</b>${sub ? `<small>${sub}</small>` : ''}</span>
    <span class="e-amt">${fmt(e.amount)}</span>
  </button>`;
}

function groupedHTML(list) {
  if (!list.length) return '<p class="empty">Keine Ausgaben in diesem Zeitraum.</p>';
  const sorted = [...list].sort(byNewest);
  let html = '', current = null;
  for (const e of sorted) {
    if (e.date !== current) {
      current = e.date;
      html += `<div class="day-head"><span>${relDayLong(e.date)}</span><span>${fmt(sums.get(e.date) || 0)}</span></div>`;
    }
    html += entryRow(e);
  }
  return `<div class="list">${html}</div>`;
}

function catsHTML(list) {
  if (!list.length) return '<p class="empty">Noch keine Ausgaben.</p>';
  const totals = new Map();
  for (const e of list) totals.set(e.cat, (totals.get(e.cat) || 0) + e.amount);
  const sum = sumOf(list);
  const rows = [...totals].sort((a, b) => b[1] - a[1]);
  const max = rows[0][1];
  return rows.map(([id, c]) => {
    const cat = CAT[id] || CAT.sonstiges;
    return `<div class="cat-row">
      <span class="cat-ico">${cat.icon}</span>
      <div class="cat-main">
        <div class="cat-top"><span>${cat.label}</span><b>${fmt(c)}</b></div>
        <div class="cat-bar"><span style="width:${(c / max * 100).toFixed(1)}%"></span></div>
      </div>
      <small class="cat-pct">${Math.round(c / sum * 100)} %</small>
    </div>`;
  }).join('');
}

function stripHTML(info) {
  const { daily } = state.settings;
  const cols = info.days.slice(0, 5).map(day => {
    const pct = Math.min(100, day.spent / daily * 100);
    const delta = daily - day.spent;
    let deltaHTML = '<span class="delta">&nbsp;</span>';
    if (day.done) deltaHTML = `<span class="delta ${delta >= 0 ? 'pos' : 'neg'}">${numDelta(delta)}</span>`;
    else if (day.isToday) deltaHTML = '<span class="delta">heute</span>';
    return `<div class="col${day.isToday ? ' is-today' : ''}${day.future ? ' is-future' : ''}">
      <div class="bar"><span class="${day.spent > daily ? 'over' : ''}" style="height:${pct.toFixed(1)}%;${day.spent ? 'min-height:3px' : ''}"></span></div>
      <b>${day.spent ? num(day.spent) : '–'}</b>
      <small>${WD_SHORT[day.d.getDay()]}</small>
      ${deltaHTML}
    </div>`;
  });
  const sat = info.days[5], sun = info.days[6];
  const wePct = info.pool > 0 ? Math.min(100, info.weekendSpent / info.pool * 100) : (info.weekendSpent ? 100 : 0);
  cols.push(`<div class="col we${sat.isToday || sun.isToday ? ' is-today' : ''}${sat.future ? ' is-future' : ''}">
    <div class="bar"><span class="${info.weekendLeft < 0 ? 'over' : ''}" style="height:${wePct.toFixed(1)}%;${info.weekendSpent ? 'min-height:3px' : ''}"></span></div>
    <b>${info.weekendSpent ? num(info.weekendSpent) : '–'}</b>
    <small>Sa + So</small>
    <span class="delta pool">von ${num(info.pool)}</span>
  </div>`);
  return `<div class="strip">${cols.join('')}</div>`;
}

function poolNote(info) {
  const base = fmt(state.settings.weekend);
  if (info.saved > 0) return `${base} + ${fmt(info.saved)} gespart`;
  if (info.saved < 0) return `${base} − ${fmt(-info.saved)} überzogen`;
  return `${base} Basis`;
}

function pagerHTML(title, sub, canNext) {
  return `<div class="pager">
    <button type="button" class="icon-btn" data-nav="-1" aria-label="Zurück">${ICON_PREV}</button>
    <div class="pager-title"><b>${title}</b><small>${sub}</small></div>
    <button type="button" class="icon-btn" data-nav="1" aria-label="Weiter"${canNext ? '' : ' disabled'}>${ICON_NEXT}</button>
  </div>`;
}

/* ============ Ansicht: Heute ============ */
function heroHTML(info) {
  const { daily } = state.settings;
  const today = dateOf(ui.today);

  if (!isWeekendDay(today)) {
    const spent = sums.get(ui.today) || 0;
    const left = daily - spent;
    const over = left < 0;
    const pct = Math.min(100, spent / daily * 100);
    const tail = over ? ' · wird vom Wochenende abgezogen' : left > 0 ? ' · Rest geht aufs Wochenende' : '';
    return `
      <p class="hero-label">${over ? 'Heute überzogen' : 'Heute noch frei'}</p>
      <p class="hero-amount${over ? ' neg' : ''}">${fmt(Math.abs(left))}</p>
      <div class="meter${over ? ' over' : ''}"><span style="width:${pct.toFixed(1)}%"></span></div>
      <p class="hero-sub">${fmt(spent)} von ${fmt(daily)} ausgegeben${tail}</p>
      <div class="hero-split">
        <div class="we"><small>Wochenende bisher</small><b class="${info.pool < 0 ? 'neg' : ''}">${fmt(info.pool)}</b><small>${poolNote(info)}</small></div>
        <div><small>Diese Woche</small><b>${fmt(info.total)}</b><small>von ${fmt(info.budget)}</small></div>
      </div>`;
  }

  const left = info.weekendLeft;
  const over = left < 0;
  const pct = info.pool > 0 ? Math.min(100, info.weekendSpent / info.pool * 100) : (info.weekendSpent ? 100 : 0);
  return `
    <p class="hero-label">${over ? 'Wochenende überzogen' : 'Wochenende noch frei'}</p>
    <p class="hero-amount${over ? ' neg' : ''}">${fmt(Math.abs(left))}</p>
    <div class="meter${over ? ' over' : ''}"><span style="width:${pct.toFixed(1)}%"></span></div>
    <p class="hero-sub">${fmt(info.weekendSpent)} von ${fmt(info.pool)} ausgegeben (Sa + So)</p>
    <div class="hero-split">
      <div class="we"><small>Wochenend-Budget</small><b class="${info.pool < 0 ? 'neg' : ''}">${fmt(info.pool)}</b><small>${poolNote(info)}</small></div>
      <div><small>Diese Woche</small><b>${fmt(info.total)}</b><small>von ${fmt(info.budget)}</small></div>
    </div>`;
}

function renderToday() {
  const info = weekInfo(mondayOf(dateOf(ui.today)));
  const hero = $('hero');
  hero.classList.toggle('is-weekend', isWeekendDay(dateOf(ui.today)));
  hero.innerHTML = heroHTML(info);
  $('todayStrip').innerHTML = stripHTML(info);

  const list = state.entries.filter(e => e.date === ui.today).sort(byNewest);
  $('todayTotal').textContent = list.length ? fmt(sumOf(list)) : '';
  $('todayList').innerHTML = list.length ? list.map(entryRow).join('') : '<p class="empty">Heute noch keine Ausgaben.</p>';

  $('catChips').innerHTML = chipsHTML(ui.addCat);
  $('dateInput').max = ui.today;
  $('dateInput').value = ui.addDate;
  $('dateChipLabel').textContent = relDay(ui.addDate);
  $('dateChip').classList.toggle('active', ui.addDate !== ui.today);
  renderInstallHint();
}

/* ============ Ansicht: Woche ============ */
function renderWeek() {
  const info = weekInfo(ui.weekMonday);
  const { daily, weekend } = state.settings;
  const mon = info.monday, sun = info.days[6].d;
  const range = mon.getMonth() === sun.getMonth()
    ? `${mon.getDate()}.–${sun.getDate()}. ${MONTHS[sun.getMonth()]}`
    : `${mon.getDate()}. ${MONTHS[mon.getMonth()].slice(0, 3)}. – ${sun.getDate()}. ${MONTHS[sun.getMonth()].slice(0, 3)}.`;
  const left = info.budget - info.total;
  const leftLabel = left < 0 ? 'Überzogen' : info.past ? 'Gespart' : 'Noch frei';
  const list = entriesBetween(info.days[0].k, info.days[6].k);

  const calcRows = info.days.slice(0, 5).map(day => {
    const name = WD_LONG[day.d.getDay()];
    if (!day.done) {
      return `<div class="calc-row muted"><span>${name}</span><span>${day.isToday ? 'läuft noch' : 'kommt noch'}</span></div>`;
    }
    const delta = daily - day.spent;
    return `<div class="calc-row"><span>${name} <small>· ${fmt(day.spent)} ausgegeben</small></span><b class="${delta >= 0 ? 'pos' : 'neg'}">${fmtDelta(delta)}</b></div>`;
  }).join('');

  $('view-woche').innerHTML = `
    ${pagerHTML(`KW ${isoWeek(mon)}`, range, !info.current)}
    ${info.current ? '' : '<button type="button" class="link back-now" data-now>Zur aktuellen Woche</button>'}
    <div class="tiles">
      <div class="tile"><small>Ausgegeben</small><b>${fmt(info.total)}</b><small>von ${fmt(info.budget)}</small></div>
      <div class="tile ${left < 0 ? 'bad' : 'good'}"><small>${leftLabel}</small><b>${fmt(Math.abs(left))}</b><small>${info.budget ? Math.round(info.total / info.budget * 100) : 0} % verbraucht</small></div>
    </div>
    <section class="card">
      <div class="card-head"><h2>Tage</h2><span>in €</span></div>
      ${stripHTML(info)}
    </section>
    <section class="card">
      <div class="card-head"><h2>Wochenend-Rechnung</h2></div>
      <div class="calc-row"><span>Basis</span><b>${fmt(weekend)}</b></div>
      ${calcRows}
      <div class="calc-row total"><span>Wochenend-Budget</span><b>${fmt(info.pool)}</b></div>
      <div class="calc-row"><span>Ausgegeben Sa + So</span><b>${fmt(info.weekendSpent)}</b></div>
      <div class="calc-row total"><span>${info.weekendLeft < 0 ? 'Überzogen' : 'Übrig'}</span><b class="${info.weekendLeft < 0 ? 'neg' : 'pos'}">${fmt(Math.abs(info.weekendLeft))}</b></div>
    </section>
    <section class="card">
      <div class="card-head"><h2>Wofür?</h2></div>
      ${catsHTML(list)}
    </section>
    <section class="card">
      <div class="card-head"><h2>Alle Ausgaben</h2><span>${list.length ? list.length + (list.length === 1 ? ' Eintrag' : ' Einträge') : ''}</span></div>
      ${groupedHTML(list)}
    </section>`;
}

/* ============ Ansicht: Monat ============ */
function renderMonth() {
  const { y, m } = ui.month;
  const info = monthInfo(y, m);
  const { daily } = state.settings;
  const first = new Date(y, m, 1);
  const isCurrent = keyOf(first).slice(0, 7) === ui.today.slice(0, 7);
  const prefix = `${y}-${pad(m + 1)}`;
  const list = state.entries.filter(e => e.date.startsWith(prefix));
  const saved = info.elapsedBudget - info.spent;
  const avg = info.elapsedDays ? info.spent / info.elapsedDays : 0;

  const lead = (first.getDay() + 6) % 7;
  let cells = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map(w => `<div class="cal-wd">${w}</div>`).join('');
  cells += '<div></div>'.repeat(lead);
  for (const day of info.days) {
    const future = day.k > ui.today;
    let cls = '';
    if (day.s > 0) cls = day.we ? 'we' : day.s > daily ? 'over' : 'ok';
    if (day.k === ui.today) cls += ' today';
    if (day.k === ui.monthDay) cls += ' sel';
    const label = day.s > 0 ? (day.s < 100 ? '<1' : numWhole.format(Math.round(day.s / 100))) : '';
    cells += `<button type="button" class="cal-day ${cls}" data-day="${day.k}"${future ? ' disabled' : ''}><span>${day.d.getDate()}</span><small>${label}</small></button>`;
  }

  let dayCard;
  if (ui.monthDay && ui.monthDay.startsWith(prefix)) {
    const dayList = list.filter(e => e.date === ui.monthDay).sort(byNewest);
    dayCard = `<section class="card">
      <div class="card-head"><h2>${relDayLong(ui.monthDay)}</h2><span>${dayList.length ? fmt(sumOf(dayList)) : ''}</span></div>
      ${dayList.length ? `<div class="list">${dayList.map(entryRow).join('')}</div>` : '<p class="empty">An diesem Tag nichts ausgegeben.</p>'}
    </section>`;
  } else {
    dayCard = '<section class="card"><p class="empty">Tippe auf einen Tag, um die Ausgaben zu sehen.</p></section>';
  }

  $('view-monat').innerHTML = `
    ${pagerHTML(`${MONTHS[m]} ${y}`, `${list.length} ${list.length === 1 ? 'Eintrag' : 'Einträge'}`, !isCurrent)}
    ${isCurrent ? '' : '<button type="button" class="link back-now" data-now>Zum aktuellen Monat</button>'}
    <div class="tiles">
      <div class="tile"><small>Ausgegeben</small><b>${fmt(info.spent)}</b><small>von ${fmt(info.budget)} Budget</small></div>
      <div class="tile ${saved < 0 ? 'bad' : 'good'}"><small>${saved < 0 ? 'Überzogen' : 'Gespart'}</small><b>${fmt(Math.abs(saved))}</b><small>${isCurrent ? 'bis heute' : 'im ganzen Monat'}</small></div>
      <div class="tile"><small>Ø pro Tag</small><b>${fmt(Math.round(avg))}</b><small>über ${info.elapsedDays} ${info.elapsedDays === 1 ? 'Tag' : 'Tage'}</small></div>
      <div class="tile"><small>Noch frei im Monat</small><b class="${info.budget - info.spent < 0 ? 'neg' : ''}">${fmt(info.budget - info.spent)}</b><small>${isCurrent ? `${info.days.length - info.elapsedDays} Tage übrig` : 'abgeschlossen'}</small></div>
    </div>
    <section class="card">
      <div class="cal">${cells}</div>
      <div class="legend">
        <span><i style="background:var(--accent)"></i>im Budget</span>
        <span><i style="background:var(--over)"></i>über ${fmt(daily)}</span>
        <span><i style="background:var(--we)"></i>Wochenende</span>
      </div>
    </section>
    ${dayCard}
    <section class="card">
      <div class="card-head"><h2>Wofür?</h2><span>${list.length ? fmt(sumOf(list)) : ''}</span></div>
      ${catsHTML(list)}
    </section>`;
}

/* ============ Rendern ============ */
const TITLES = { heute: 'Heute', woche: 'Woche', monat: 'Monat' };

function render() {
  sums = daySums();
  $('topDate').textContent = longDate(dateOf(ui.today));
  $('topTitle').textContent = TITLES[ui.view];
  for (const v of Object.keys(TITLES)) $('view-' + v).hidden = ui.view !== v;
  document.querySelectorAll('.tab').forEach(b => b.setAttribute('aria-current', b.dataset.view === ui.view ? 'page' : 'false'));
  if (ui.view === 'heute') renderToday();
  else if (ui.view === 'woche') renderWeek();
  else renderMonth();
}

function go(view) {
  if (view === ui.view) return;
  ui.view = view;
  render();
  window.scrollTo(0, 0);
}

/* ============ Toast ============ */
let toastTimer;
function toast(msg, undo) {
  const t = $('toast');
  t.innerHTML = `<span>${esc(msg)}</span>${undo ? '<button type="button">Rückgängig</button>' : ''}`;
  if (undo) t.querySelector('button').onclick = () => { undo(); hideToast(); };
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, undo ? 5000 : 2800);
}
function hideToast() { $('toast').classList.remove('show'); }

function shake(el) {
  el.classList.remove('shake');
  void el.offsetWidth;
  el.classList.add('shake');
}

/* ============ Eintragen ============ */
$('catChips').addEventListener('click', e => {
  const chip = e.target.closest('[data-cat]');
  if (!chip) return;
  ui.addCat = chip.dataset.cat;
  $('catChips').innerHTML = chipsHTML(ui.addCat);
});

$('dateInput').addEventListener('click', () => {
  try { $('dateInput').showPicker(); } catch (_) { /* iOS öffnet den Picker selbst */ }
});
$('dateInput').addEventListener('change', () => {
  const v = $('dateInput').value;
  ui.addDate = v && v <= ui.today ? v : ui.today;
  render();
});

$('addForm').addEventListener('submit', e => {
  e.preventDefault();
  const amount = parseAmount($('amountInput').value);
  if (amount == null) {
    shake($('amountField'));
    $('amountInput').focus();
    return;
  }
  const entry = { id: uid(), date: ui.addDate, amount, cat: ui.addCat, note: $('noteInput').value.trim(), ts: Date.now() };
  state.entries.push(entry);
  state.lastCat = ui.addCat;
  save();
  $('amountInput').value = '';
  $('noteInput').value = '';
  if (document.activeElement) document.activeElement.blur();
  const when = entry.date === ui.today ? '' : ` (${relDay(entry.date)})`;
  ui.addDate = ui.today;
  render();
  toast(`${fmt(amount)} eingetragen${when}`, () => {
    state.entries = state.entries.filter(x => x.id !== entry.id);
    save();
    render();
  });
});

/* ============ Bearbeiten ============ */
function openEdit(id) {
  const entry = state.entries.find(e => e.id === id);
  if (!entry) return;
  ui.editId = id;
  ui.editCat = entry.cat;
  $('editAmount').value = num(entry.amount).replace(/\./g, '');
  $('editChips').innerHTML = chipsHTML(ui.editCat);
  $('editNote').value = entry.note || '';
  $('editDate').max = ui.today;
  $('editDate').value = entry.date;
  $('editSheet').showModal();
}

$('editChips').addEventListener('click', e => {
  const chip = e.target.closest('[data-cat]');
  if (!chip) return;
  ui.editCat = chip.dataset.cat;
  $('editChips').innerHTML = chipsHTML(ui.editCat);
});

$('editForm').addEventListener('submit', e => {
  e.preventDefault();
  const entry = state.entries.find(x => x.id === ui.editId);
  if (!entry) { $('editSheet').close(); return; }
  const amount = parseAmount($('editAmount').value);
  if (amount == null) { shake($('editAmountField')); return; }
  const date = $('editDate').value;
  entry.amount = amount;
  entry.cat = ui.editCat;
  entry.note = $('editNote').value.trim().slice(0, 60);
  if (/^\d{4}-\d{2}-\d{2}$/.test(date) && date <= ui.today) entry.date = date;
  save();
  $('editSheet').close();
  render();
  toast('Gespeichert');
});

$('btnDelete').addEventListener('click', () => {
  const idx = state.entries.findIndex(x => x.id === ui.editId);
  if (idx < 0) return;
  const [removed] = state.entries.splice(idx, 1);
  save();
  $('editSheet').close();
  render();
  toast(`${fmt(removed.amount)} gelöscht`, () => {
    state.entries.push(removed);
    save();
    render();
  });
});

/* ============ Navigation ============ */
document.querySelector('.tabs').addEventListener('click', e => {
  const tab = e.target.closest('.tab');
  if (tab) go(tab.dataset.view);
});

document.querySelector('main').addEventListener('click', e => {
  const entry = e.target.closest('.entry');
  if (entry) return openEdit(entry.dataset.id);

  const goBtn = e.target.closest('[data-go]');
  if (goBtn) return go(goBtn.dataset.go);

  const nav = e.target.closest('[data-nav]');
  if (nav) {
    const dir = Number(nav.dataset.nav);
    if (ui.view === 'woche') {
      ui.weekMonday = addDays(ui.weekMonday, 7 * dir);
    } else {
      const d = new Date(ui.month.y, ui.month.m + dir, 1);
      ui.month = { y: d.getFullYear(), m: d.getMonth() };
      ui.monthDay = keyOf(d).slice(0, 7) === ui.today.slice(0, 7) ? ui.today : null;
    }
    return render();
  }

  if (e.target.closest('[data-now]')) {
    const t = dateOf(ui.today);
    ui.weekMonday = mondayOf(t);
    ui.month = { y: t.getFullYear(), m: t.getMonth() };
    ui.monthDay = ui.today;
    return render();
  }

  const day = e.target.closest('[data-day]');
  if (day) {
    ui.monthDay = day.dataset.day;
    render();
  }
});

/* ============ Einstellungen & Daten ============ */
function fillSettings() {
  $('setDaily').value = num(state.settings.daily).replace(/\./g, '');
  $('setWeekend').value = num(state.settings.weekend).replace(/\./g, '');
}

$('btnSettings').addEventListener('click', () => {
  fillSettings();
  $('settingsSheet').showModal();
});

function bindSetting(id, keyName, allowZero) {
  $(id).addEventListener('change', () => {
    const raw = $(id).value.trim();
    const v = allowZero && /^0+([.,]0*)?$/.test(raw) ? 0 : parseAmount(raw);
    if (v == null) { fillSettings(); toast('Bitte einen gültigen Betrag eingeben'); return; }
    state.settings[keyName] = v;
    save();
    fillSettings();
    render();
    toast('Budget angepasst');
  });
}
bindSetting('setDaily', 'daily', false);
bindSetting('setWeekend', 'weekend', true);

async function shareOrDownload(filename, text, mime) {
  const file = new File([text], filename, { type: mime });
  const touch = matchMedia('(pointer: coarse)').matches;
  if (touch && navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: filename }); return; }
    catch (err) { if (err && err.name === 'AbortError') return; }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

$('btnExport').addEventListener('click', () => {
  const data = { app: 'tagesbudget', version: 1, exportedAt: new Date().toISOString(), ...state };
  shareOrDownload(`tagesbudget-backup-${ui.today}.json`, JSON.stringify(data, null, 2), 'application/json');
});

$('btnImport').addEventListener('click', () => $('importFile').click());
$('importFile').addEventListener('change', async () => {
  const input = $('importFile');
  const f = input.files && input.files[0];
  if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    if (!data || !Array.isArray(data.entries)) throw new Error('kein Backup');
    const next = sanitize(data);
    if (!confirm(`Backup mit ${next.entries.length} Einträgen laden?\nDie aktuellen Daten auf diesem Gerät werden ersetzt.`)) return;
    state = next;
    ui.addCat = state.lastCat;
    save();
    fillSettings();
    render();
    toast('Backup geladen');
  } catch (_) {
    toast('Datei ist kein gültiges Backup');
  } finally {
    input.value = '';
  }
});

$('btnCsv').addEventListener('click', () => {
  const cell = v => {
    let s = String(v);
    if (/^[=+\-@]/.test(s)) s = "'" + s;
    return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = [['Datum', 'Wochentag', 'Kategorie', 'Notiz', 'Betrag (EUR)']];
  for (const e of [...state.entries].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.ts - b.ts))) {
    const d = dateOf(e.date);
    rows.push([`${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`, WD_LONG[d.getDay()], (CAT[e.cat] || CAT.sonstiges).label, e.note || '', (e.amount / 100).toFixed(2).replace('.', ',')]);
  }
  const csv = '﻿' + rows.map(r => r.map(cell).join(';')).join('\r\n');
  shareOrDownload(`tagesbudget-${ui.today}.csv`, csv, 'text/csv');
});

$('btnReset').addEventListener('click', () => {
  if (!confirm('Wirklich alle Ausgaben und Einstellungen auf diesem Gerät löschen?\nDas lässt sich nicht rückgängig machen.')) return;
  state = sanitize(null);
  ui.addCat = state.lastCat;
  save();
  fillSettings();
  $('settingsSheet').close();
  render();
  toast('Alle Daten gelöscht');
});

/* Sheets: Schließen-Knopf und Tippen auf den Hintergrund */
for (const dlg of document.querySelectorAll('dialog.sheet')) {
  dlg.addEventListener('click', e => {
    if (e.target === dlg || e.target.closest('[data-close]')) dlg.close();
  });
}

/* ============ Installations-Hinweis ============ */
let installPrompt = null;
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
function hintDismissed() { try { return !!localStorage.getItem(HINT_KEY); } catch (_) { return false; } }

function renderInstallHint() {
  const box = $('installHint');
  let html = '';
  if (!isStandalone() && !hintDismissed()) {
    if (installPrompt) {
      html = `<p><b>Als App installieren?</b> Dann startet das Budget direkt vom Home-Bildschirm.<br><button type="button" class="install" data-install>Installieren</button></p>`;
    } else if (isIOS) {
      html = `<p><b>Tipp:</b> Teilen → <b>„Zum Home-Bildschirm“</b>. Dann läuft’s wie eine App und deine Daten bleiben sicher.</p>`;
    }
  }
  box.innerHTML = html ? `<div class="banner">${html}<button type="button" class="x" data-dismiss aria-label="Hinweis schließen">${ICON_X}</button></div>` : '';
}

$('installHint').addEventListener('click', async e => {
  if (e.target.closest('[data-dismiss]')) {
    try { localStorage.setItem(HINT_KEY, '1'); } catch (_) { /* egal */ }
    renderInstallHint();
  } else if (e.target.closest('[data-install]') && installPrompt) {
    installPrompt.prompt();
    await installPrompt.userChoice.catch(() => null);
    installPrompt = null;
    renderInstallHint();
  }
});

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  installPrompt = e;
  if (ui.view === 'heute') renderInstallHint();
});

/* ============ Tageswechsel & Sync zwischen Tabs ============ */
function checkNewDay() {
  const t = todayKey();
  if (t === ui.today) return;
  const old = dateOf(ui.today);
  const followWeek = keyOf(ui.weekMonday) === keyOf(mondayOf(old));
  const followMonth = ui.month.y === old.getFullYear() && ui.month.m === old.getMonth();
  ui.today = t;
  ui.addDate = t;
  const nd = dateOf(t);
  if (followWeek) ui.weekMonday = mondayOf(nd);
  if (followMonth) { ui.month = { y: nd.getFullYear(), m: nd.getMonth() }; ui.monthDay = t; }
  render();
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkNewDay(); });
window.addEventListener('focus', checkNewDay);
setInterval(checkNewDay, 60 * 1000);

window.addEventListener('storage', e => {
  if (e.key === STORE_KEY) { state = load(); render(); }
});

/* ============ Start ============ */
render();

if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
