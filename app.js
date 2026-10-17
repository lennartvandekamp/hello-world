import {
  BRANDSTOFFEN, PROVINCIES, STANDAARD_INSTELLINGEN, KOSTENPOSTEN,
  bereken, zoekKenteken, formatteerKenteken, normaliseerKenteken, leeftijd,
} from './calc.js';

const MAX_VERGELIJK = 4;
const $ = (sel) => document.querySelector(sel);

// ---- opslag ----

function lees(sleutel, standaard) {
  try {
    const v = JSON.parse(localStorage.getItem(sleutel));
    return v ?? standaard;
  } catch {
    return standaard;
  }
}

function schrijf(sleutel, waarde) {
  try {
    localStorage.setItem(sleutel, JSON.stringify(waarde));
  } catch {
    // Opslag niet beschikbaar (privévenster); de tool werkt dan zonder geheugen.
  }
}

const state = {
  instellingen: { ...STANDAARD_INSTELLINGEN, ...lees('akv-instellingen', {}) },
  autos: lees('akv-autos', []),
  selectie: new Set(lees('akv-selectie', [])),
  huidig: null,
};

function bewaar() {
  schrijf('akv-instellingen', state.instellingen);
  schrijf('akv-autos', state.autos);
  schrijf('akv-selectie', [...state.selectie]);
}

// ---- opmaak ----

const euro = (x, d = 0) =>
  new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: d, minimumFractionDigits: d }).format(x);
const getal = (x, d = 0) => new Intl.NumberFormat('nl-NL', { maximumFractionDigits: d }).format(x);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const naam = (auto) => [auto.merk, auto.model].filter(Boolean).join(' ') || 'Onbekende auto';
const bouwjaar = (auto) => (auto.datumToelating ? auto.datumToelating.slice(0, 4) : '–');
const isOpgeslagen = (auto) => state.autos.some((a) => a.id === auto?.id);

function plaat(auto) {
  return auto.kenteken
    ? `<span class="mini-plaat">${esc(formatteerKenteken(auto.kenteken))}</span>`
    : '<span class="mini-plaat leeg">handmatig</span>';
}

function verbruikTekst(r) {
  const delen = [];
  if (r.verbruik.liter) delen.push(`${getal(r.verbruik.liter, 1)} l/100 km`);
  if (r.verbruik.kwh) delen.push(`${getal(r.verbruik.kwh, 1)} kWh/100 km`);
  return delen.join(' + ');
}

// ---- melding ----

function meld(tekst, soort = 'fout') {
  const el = $('#melding');
  el.hidden = !tekst;
  el.textContent = tekst || '';
  el.dataset.soort = soort;
}

// ---- instellingen ----

const INSTELLING_VELDEN = [
  ['kmPerJaar', 'Kilometers per jaar', { min: 1000, max: 100000, step: 1000 }],
  ['jaren', 'Hoe lang houd je de auto (jaren)', { min: 1, max: 15, step: 1 }],
  ['provincie', 'Provincie (wegenbelasting)', 'provincie'],
  ['prijsBenzine', 'Benzineprijs (€/l)', { min: 0, step: 0.01 }],
  ['prijsDiesel', 'Dieselprijs (€/l)', { min: 0, step: 0.01 }],
  ['prijsLpg', 'LPG-prijs (€/l)', { min: 0, step: 0.01 }],
  ['prijsStroom', 'Stroomprijs laden (€/kWh)', { min: 0, step: 0.01 }],
  ['elektrischAandeelPhev', 'Plug-in hybride: % km elektrisch', { min: 0, max: 100, step: 5 }],
  ['rente', 'Rente op aankoopbedrag (%)', { min: 0, max: 15, step: 0.5 }],
];

function tekenInstellingen() {
  const i = state.instellingen;
  $('#instellingen-velden').innerHTML = INSTELLING_VELDEN.map(([k, label, opt]) => {
    if (opt === 'provincie') {
      const opties = Object.keys(PROVINCIES).map((p) =>
        `<option value="${p}" ${p === i.provincie ? 'selected' : ''}>${p[0].toUpperCase() + p.slice(1)}</option>`).join('');
      return `<label>${label}<select data-instelling="${k}">${opties}</select></label>`;
    }
    const attrs = Object.entries(opt).map(([a, v]) => `${a}="${v}"`).join(' ');
    return `<label>${label}<input type="number" inputmode="decimal" data-instelling="${k}" value="${i[k]}" ${attrs}></label>`;
  }).join('');
  $('#instellingen-samenvatting').textContent =
    `${getal(i.kmPerJaar)} km/jaar · ${i.jaren} jaar · ${i.provincie[0].toUpperCase() + i.provincie.slice(1)}`;
}

$('#instellingen-velden').addEventListener('change', (e) => {
  const k = e.target.dataset.instelling;
  if (!k) return;
  const v = k === 'provincie' ? e.target.value : parseFloat(e.target.value);
  if (k !== 'provincie' && !Number.isFinite(v)) return;
  state.instellingen[k] = v;
  bewaar();
  tekenAlles();
});

$('#reset-instellingen').addEventListener('click', () => {
  state.instellingen = { ...STANDAARD_INSTELLINGEN };
  bewaar();
  tekenAlles();
});

// ---- resultaat ----

const AUTO_VELDEN = [
  ['brandstof', 'Brandstof', 'brandstof'],
  ['datumToelating', 'Datum eerste toelating', 'date'],
  ['gewicht', 'Leeg gewicht (kg)', 'number'],
  ['catalogusprijs', 'Catalogusprijs nieuw (€)', 'number'],
  ['verbruikLiter', 'Fabrieksverbruik (l/100 km)', 'number'],
  ['verbruikKwh', 'Fabrieksverbruik (kWh/100 km)', 'number'],
];
const OVERSCHRIJF_VELDEN = [
  ['aankoopprijs', 'Aankoopprijs (€)'],
  ['verzekering', 'Verzekering (€/mnd)'],
  ['mrb', 'Wegenbelasting (€/mnd)'],
  ['brandstof', 'Brandstof/laden (€/mnd)'],
  ['onderhoud', 'Onderhoud (€/mnd)'],
  ['banden', 'Banden (€/mnd)'],
];

function staafjes(r) {
  const max = Math.max(...Object.values(r.posten), 1);
  return KOSTENPOSTEN.map(([k, label]) => `
    <div class="post">
      <span class="post-naam"><i class="stip c-${k}"></i>${label}</span>
      <span class="post-balk"><span class="c-${k}" style="width:${(r.posten[k] / max) * 100}%"></span></span>
      <span class="post-bedrag">${euro(r.posten[k])}</span>
    </div>`).join('');
}

function tekenResultaat() {
  const el = $('#resultaat');
  const auto = state.huidig;
  el.hidden = !auto;
  if (!auto) return;
  const r = bereken(auto, state.instellingen);
  const opgeslagen = isOpgeslagen(auto);
  const jaar = leeftijd(auto.datumToelating);
  const o = auto.overschrijf || {};

  el.innerHTML = `
    <div class="kaart-kop">
      <div>
        ${plaat(auto)}
        <h2 class="autonaam">${esc(naam(auto))}</h2>
        <p class="specs">${esc(BRANDSTOFFEN[auto.brandstof])} · bouwjaar ${bouwjaar(auto)} (${getal(jaar, 1)} jaar)
          · ${getal(auto.gewicht)} kg${auto.vermogenKw ? ` · ${getal(auto.vermogenKw)} kW` : ''}
          · cataloguswaarde ${auto.catalogusprijs ? euro(auto.catalogusprijs) : 'onbekend (geschat)'}</p>
      </div>
      <button type="button" class="knop ${opgeslagen ? '' : 'primair'}" id="opslaan" ${opgeslagen ? 'disabled' : ''}>
        ${opgeslagen ? 'Opgeslagen ✓' : 'Opslaan'}</button>
    </div>

    <div class="totaal">
      <div><span class="label">Totaal per maand</span><strong>${euro(r.totaal)}</strong></div>
      <div><span class="label">Per kilometer</span><strong>${euro(r.perKm, 2)}</strong></div>
      <div><span class="label">Vaste lasten</span><strong>${euro(r.vast)}</strong></div>
      <div><span class="label">Variabele kosten</span><strong>${euro(r.variabel)}</strong></div>
    </div>

    <div class="posten">${staafjes(r)}</div>

    <p class="hint">Uitgangspunt: aankoop ${euro(r.aankoop)}, na ${state.instellingen.jaren} jaar nog ca.
      ${euro(r.verkoop)} waard. Praktijkverbruik ${verbruikTekst(r)}.</p>

    <details class="aanpassen">
      <summary>Gegevens aanpassen</summary>
      <form id="autoform" class="raster">
        <label>Merk<input name="merk" value="${esc(auto.merk)}"></label>
        <label>Model<input name="model" value="${esc(auto.model)}"></label>
        ${AUTO_VELDEN.map(([k, label, type]) => type === 'brandstof'
          ? `<label>${label}<select name="${k}">${Object.entries(BRANDSTOFFEN).map(([v, t]) =>
              `<option value="${v}" ${v === auto.brandstof ? 'selected' : ''}>${t}</option>`).join('')}</select></label>`
          : `<label>${label}<input name="${k}" type="${type}" ${type === 'number' ? 'step="any" min="0" inputmode="decimal"' : ''}
               value="${esc(auto[k] ?? '')}" placeholder="onbekend"></label>`).join('')}
        <p class="subkop">Eigen bedragen (leeg = schatting)</p>
        ${OVERSCHRIJF_VELDEN.map(([k, label]) =>
          `<label>${label}<input name="o_${k}" type="number" step="any" min="0" inputmode="decimal"
             value="${o[k] ?? ''}" placeholder="${k === 'aankoopprijs' ? getal(r.aankoop) : getal(r.posten[k], 2)}"></label>`).join('')}
      </form>
    </details>`;

  $('#opslaan').addEventListener('click', () => {
    if (!state.huidig.id) state.huidig.id = crypto.randomUUID?.() ?? String(Date.now());
    state.autos.push(state.huidig);
    if (state.selectie.size < MAX_VERGELIJK) state.selectie.add(state.huidig.id);
    bewaar();
    tekenAlles();
  });

  $('#autoform').addEventListener('change', (e) => {
    const { name, value, type } = e.target;
    const leeg = value.trim() === '';
    if (name.startsWith('o_')) {
      const k = name.slice(2);
      auto.overschrijf ||= {};
      if (leeg) delete auto.overschrijf[k];
      else auto.overschrijf[k] = parseFloat(value);
    } else if (type === 'number') {
      auto[name] = leeg ? undefined : parseFloat(value);
    } else {
      auto[name] = value || undefined;
    }
    bewaar();
    const open = el.querySelector('details.aanpassen').open;
    tekenAlles();
    el.querySelector('details.aanpassen').open = open;
  });
}

// ---- opgeslagen lijst ----

function tekenOpgeslagen() {
  const el = $('#opgeslagen');
  $('#opgeslagen-aantal').textContent = state.autos.length
    ? `Vink maximaal ${MAX_VERGELIJK} auto's aan om te vergelijken` : '';
  if (!state.autos.length) {
    el.innerHTML = '<p class="leeg">Nog geen auto\'s opgeslagen. Zoek een kenteken en klik op <b>Opslaan</b>.</p>';
    return;
  }
  el.innerHTML = state.autos.map((a) => {
    const r = bereken(a, state.instellingen);
    const gekozen = state.selectie.has(a.id);
    const vol = !gekozen && state.selectie.size >= MAX_VERGELIJK;
    return `
      <article class="item ${state.huidig?.id === a.id ? 'actief' : ''}">
        <label class="vink" title="Vergelijken">
          <input type="checkbox" data-vergelijk="${a.id}" ${gekozen ? 'checked' : ''} ${vol ? 'disabled' : ''}>
        </label>
        <button type="button" class="item-info" data-bekijk="${a.id}">
          ${plaat(a)}
          <span class="item-naam">${esc(naam(a))}</span>
          <span class="item-meta">${esc(BRANDSTOFFEN[a.brandstof])} · ${bouwjaar(a)}</span>
        </button>
        <span class="item-prijs">${euro(r.totaal)}<small>/mnd</small></span>
        <button type="button" class="verwijder" data-verwijder="${a.id}" aria-label="Verwijder ${esc(naam(a))}">×</button>
      </article>`;
  }).join('');
}

$('#opgeslagen').addEventListener('click', (e) => {
  const bekijk = e.target.closest('[data-bekijk]')?.dataset.bekijk;
  const weg = e.target.closest('[data-verwijder]')?.dataset.verwijder;
  if (bekijk) {
    state.huidig = state.autos.find((a) => a.id === bekijk);
    tekenAlles();
    $('#resultaat').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  if (weg) {
    state.autos = state.autos.filter((a) => a.id !== weg);
    state.selectie.delete(weg);
    if (state.huidig?.id === weg) state.huidig = null;
    bewaar();
    tekenAlles();
  }
});

$('#opgeslagen').addEventListener('change', (e) => {
  const id = e.target.dataset.vergelijk;
  if (!id) return;
  if (e.target.checked) state.selectie.add(id);
  else state.selectie.delete(id);
  bewaar();
  tekenAlles();
});

// ---- vergelijking ----

function tekenVergelijking() {
  const autos = state.autos.filter((a) => state.selectie.has(a.id));
  const el = $('#vergelijking');
  el.hidden = autos.length < 2;
  if (autos.length < 2) return;
  const rs = autos.map((a) => bereken(a, state.instellingen));
  const goedkoopste = Math.min(...rs.map((r) => r.totaal));
  const maxTotaal = Math.max(...rs.map((r) => r.totaal));

  const rij = (label, waarden, opmaak, laagsteBeste = true, klasse = '') => {
    const best = laagsteBeste ? Math.min(...waarden) : null;
    return `<tr class="${klasse}"><th scope="row">${label}</th>${waarden.map((w) =>
      `<td class="${laagsteBeste && w === best && waarden.length > 1 ? 'best' : ''}">${opmaak(w)}</td>`).join('')}</tr>`;
  };

  el.querySelector('#vergelijk-inhoud').innerHTML = `
    <div class="stapels">
      ${autos.map((a, i) => `
        <div class="stapel-rij">
          <span class="stapel-naam">${esc(naam(a))}</span>
          <span class="stapel">${KOSTENPOSTEN.map(([k, label]) =>
            `<span class="c-${k}" style="width:${(rs[i].posten[k] / maxTotaal) * 100}%" title="${label}: ${euro(rs[i].posten[k])}"></span>`).join('')}</span>
          <span class="stapel-bedrag ${rs[i].totaal === goedkoopste ? 'best' : ''}">${euro(rs[i].totaal)}</span>
        </div>`).join('')}
      <div class="legenda">${KOSTENPOSTEN.map(([k, label]) => `<span><i class="stip c-${k}"></i>${label}</span>`).join('')}</div>
    </div>
    <div class="tabel-wrap">
      <table>
        <thead><tr><th></th>${autos.map((a) => `<th scope="col">${plaat(a)}<br>${esc(naam(a))}</th>`).join('')}</tr></thead>
        <tbody>
          ${rij('Brandstof', autos.map((a) => BRANDSTOFFEN[a.brandstof]), esc, false)}
          ${rij('Bouwjaar', autos.map(bouwjaar), esc, false)}
          ${rij('Gewicht', autos.map((a) => a.gewicht), (w) => `${getal(w)} kg`, false)}
          ${rij('Aankoopprijs', rs.map((r) => r.aankoop), (w) => euro(w))}
          ${KOSTENPOSTEN.map(([k, label]) => rij(label, rs.map((r) => r.posten[k]), (w) => euro(w))).join('')}
          ${rij('Per kilometer', rs.map((r) => r.perKm), (w) => euro(w, 2))}
          ${rij('Totaal per maand', rs.map((r) => r.totaal), (w) => euro(w), true, 'som')}
          ${rij('Totaal over ' + state.instellingen.jaren + ' jaar', rs.map((r) => r.totaal * 12 * state.instellingen.jaren), (w) => euro(w))}
        </tbody>
      </table>
    </div>
    <p class="hint">Groen = laagste waarde. Verschil goedkoopste en duurste: ${euro(maxTotaal - goedkoopste)} per maand.</p>`;
}

// ---- zoeken ----

$('#zoekform').addEventListener('submit', async (e) => {
  e.preventDefault();
  const invoer = $('#kenteken').value;
  const k = normaliseerKenteken(invoer);
  const bestaand = state.autos.find((a) => a.kenteken === k);
  meld('');
  if (bestaand) {
    state.huidig = bestaand;
    meld(`${formatteerKenteken(k)} staat al in je opgeslagen auto's.`, 'info');
    tekenAlles();
    return;
  }
  const knop = $('#zoekknop');
  knop.disabled = true;
  knop.textContent = 'Zoeken…';
  try {
    state.huidig = await zoekKenteken(invoer);
    $('#kenteken').value = formatteerKenteken(k);
    tekenAlles();
  } catch (err) {
    meld(err instanceof TypeError
      ? 'De RDW is niet bereikbaar. Controleer je verbinding of voer de auto handmatig in.'
      : err.message);
  } finally {
    knop.disabled = false;
    knop.textContent = 'Bereken kosten';
  }
});

$('#kenteken').addEventListener('input', (e) => {
  e.target.value = e.target.value.toUpperCase();
});

$('#handmatig').addEventListener('click', () => {
  state.huidig = {
    kenteken: '', merk: '', model: 'Eigen auto', brandstof: 'benzine', gewicht: 1200,
    catalogusprijs: 30000, datumToelating: `${new Date().getFullYear() - 3}-01-01`, overschrijf: {},
  };
  meld('');
  tekenAlles();
  $('#resultaat details.aanpassen').open = true;
  $('#resultaat').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

function tekenAlles() {
  tekenInstellingen();
  tekenResultaat();
  tekenOpgeslagen();
  tekenVergelijking();
}

tekenAlles();
