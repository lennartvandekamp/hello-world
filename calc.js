// Kostenmodel voor de autokosten vergelijker.
// Alle bedragen in euro's. Waarden zijn indicaties, net als bij de ANWB:
// elke geschatte waarde kan per auto worden overschreven.

export const BRANDSTOFFEN = {
  benzine: 'Benzine',
  diesel: 'Diesel',
  lpg: 'LPG',
  hybride: 'Hybride (benzine)',
  phev: 'Plug-in hybride',
  elektrisch: 'Elektrisch',
};

export const PROVINCIES = {
  'drenthe': 1.04, 'flevoland': 1.00, 'friesland': 1.02, 'gelderland': 1.03,
  'groningen': 1.06, 'limburg': 1.01, 'noord-brabant': 0.98, 'noord-holland': 0.93,
  'overijssel': 1.01, 'utrecht': 0.97, 'zeeland': 1.03, 'zuid-holland': 1.05,
};

export const STANDAARD_INSTELLINGEN = {
  kmPerJaar: 15000,
  jaren: 5,
  provincie: 'utrecht',
  prijsBenzine: 1.95,
  prijsDiesel: 1.70,
  prijsLpg: 0.85,
  prijsStroom: 0.35,
  elektrischAandeelPhev: 40,
  rente: 3,
};

const KOSTENPOSTEN = [
  ['afschrijving', 'Afschrijving'],
  ['rente', 'Rentederving'],
  ['verzekering', 'Verzekering'],
  ['mrb', 'Motorrijtuigenbelasting'],
  ['brandstof', 'Brandstof / laden'],
  ['onderhoud', 'Onderhoud & reparatie'],
  ['banden', 'Banden'],
];
export { KOSTENPOSTEN };

const rond = (x, d = 2) => Math.round(x * 10 ** d) / 10 ** d;

// Leeftijd in jaren (decimaal) op peildatum.
export function leeftijd(datumToelating, peildatum = new Date()) {
  if (!datumToelating) return 0;
  const d = new Date(datumToelating);
  if (Number.isNaN(d.getTime())) return 0;
  return Math.max(0, (peildatum - d) / (365.25 * 24 * 3600 * 1000));
}

// Restwaarde als fractie van de catalogusprijs: ~20% verlies in jaar 1,
// daarna ~12% per jaar, met een bodem van 8%.
export function restwaardeFactor(jaren) {
  const f = jaren <= 1 ? 1 - 0.2 * jaren : 0.8 * 0.88 ** (jaren - 1);
  return Math.max(0.08, f);
}

export function geschatteDagwaarde(auto, peildatum) {
  const cat = auto.catalogusprijs || geschatteCatalogusprijs(auto);
  return Math.max(1000, cat * restwaardeFactor(leeftijd(auto.datumToelating, peildatum)));
}

export function geschatteCatalogusprijs(auto) {
  const basis = (auto.gewicht || 1200) * 25;
  return auto.brandstof === 'elektrisch' ? basis * 1.3 : basis;
}

// Verbruik per 100 km: liters (of kWh voor elektrisch). Fabrieksopgave wordt
// met een praktijkfactor verhoogd; ontbreekt die, dan schatten we op gewicht.
export function verbruik(auto) {
  const m = auto.gewicht || 1200;
  const benzineSchatting = 2.0 + 0.0035 * m;
  switch (auto.brandstof) {
    case 'elektrisch':
      return { kwh: auto.verbruikKwh ? auto.verbruikKwh * 1.2 : 6 + 0.008 * m };
    case 'phev':
      return {
        liter: benzineSchatting * 0.9,
        kwh: auto.verbruikKwh ? auto.verbruikKwh * 1.2 : 6 + 0.008 * m,
      };
    case 'diesel':
      return { liter: auto.verbruikLiter ? auto.verbruikLiter * 1.15 : benzineSchatting * 0.85 };
    case 'lpg':
      return { liter: auto.verbruikLiter ? auto.verbruikLiter * 1.15 : benzineSchatting * 1.25 };
    case 'hybride':
      return { liter: auto.verbruikLiter ? auto.verbruikLiter * 1.15 : benzineSchatting * 0.75 };
    default:
      return { liter: auto.verbruikLiter ? auto.verbruikLiter * 1.15 : benzineSchatting };
  }
}

// Motorrijtuigenbelasting per maand (benadering van de 2026-tarieven,
// inclusief provinciale opcenten). Gewicht wordt naar boven afgerond op 100 kg.
export function mrbPerMaand(auto, instellingen) {
  if (leeftijd(auto.datumToelating) >= 40) return 0; // oldtimer
  let gewicht = auto.gewicht || 1200;
  if (auto.brandstof === 'elektrisch' || auto.brandstof === 'phev') gewicht -= 125; // accucorrectie
  gewicht = Math.ceil(gewicht / 100) * 100;
  let kwartaal = Math.max(20, 0.14 * gewicht - 2);
  if (auto.brandstof === 'diesel') kwartaal += 0.12 * gewicht;
  if (auto.brandstof === 'lpg') kwartaal += 0.13 * gewicht;
  if (auto.brandstof === 'elektrisch') kwartaal *= 0.75; // 25% korting in 2026
  kwartaal *= PROVINCIES[instellingen.provincie] ?? 1;
  return kwartaal / 3;
}

// Verzekering per maand: WA + (beperkt) casco afhankelijk van de leeftijd.
export function verzekeringPerMaand(auto, dagwaarde) {
  const jaren = leeftijd(auto.datumToelating);
  let maand = 30; // WA
  if (jaren < 5) maand += dagwaarde * 0.03 / 12; // allrisk
  else if (jaren < 10) maand += 8 + dagwaarde * 0.012 / 12; // beperkt casco
  if (auto.brandstof === 'elektrisch') maand *= 1.1;
  return maand;
}

export function onderhoudPerMaand(auto, instellingen) {
  const jaren = leeftijd(auto.datumToelating);
  const km = instellingen.kmPerJaar;
  let jaar = 350 + 18 * Math.min(jaren, 20) + 0.025 * km + 0.15 * ((auto.gewicht || 1200) - 1000);
  if (auto.brandstof === 'elektrisch') jaar *= 0.7;
  if (auto.brandstof === 'diesel' || auto.brandstof === 'lpg') jaar *= 1.1;
  return Math.max(25, jaar / 12);
}

export function bandenPerMaand(auto, instellingen) {
  const perKm = auto.brandstof === 'elektrisch' ? 0.015 : 0.011;
  const gewichtFactor = (auto.gewicht || 1200) / 1200;
  return (perKm * gewichtFactor * instellingen.kmPerJaar) / 12;
}

export function brandstofPerMaand(auto, instellingen) {
  const v = verbruik(auto);
  const km = instellingen.kmPerJaar / 12;
  const literPrijs = {
    diesel: instellingen.prijsDiesel,
    lpg: instellingen.prijsLpg,
  }[auto.brandstof] ?? instellingen.prijsBenzine;
  if (auto.brandstof === 'elektrisch') return (km / 100) * v.kwh * instellingen.prijsStroom;
  if (auto.brandstof === 'phev') {
    const e = instellingen.elektrischAandeelPhev / 100;
    return (km / 100) * (e * v.kwh * instellingen.prijsStroom + (1 - e) * v.liter * literPrijs);
  }
  return (km / 100) * v.liter * literPrijs;
}

// Berekent alle kostenposten per maand. Handmatige waarden in
// auto.overschrijf (per maand, of aankoopprijs) gaan voor de schatting.
export function bereken(auto, instellingen = STANDAARD_INSTELLINGEN) {
  const o = auto.overschrijf || {};
  const nu = new Date();
  const aankoop = o.aankoopprijs ?? geschatteDagwaarde(auto, nu);
  const eind = new Date(nu);
  eind.setFullYear(eind.getFullYear() + instellingen.jaren);
  const verkoop = aankoop * (geschatteDagwaarde(auto, eind) / geschatteDagwaarde(auto, nu));
  const maanden = instellingen.jaren * 12;
  const gemiddeldeWaarde = (aankoop + verkoop) / 2;

  const posten = {
    afschrijving: (aankoop - verkoop) / maanden,
    rente: (gemiddeldeWaarde * instellingen.rente) / 100 / 12,
    verzekering: o.verzekering ?? verzekeringPerMaand(auto, gemiddeldeWaarde),
    mrb: o.mrb ?? mrbPerMaand(auto, instellingen),
    brandstof: o.brandstof ?? brandstofPerMaand(auto, instellingen),
    onderhoud: o.onderhoud ?? onderhoudPerMaand(auto, instellingen),
    banden: o.banden ?? bandenPerMaand(auto, instellingen),
  };
  for (const k of Object.keys(posten)) posten[k] = rond(posten[k]);
  const totaal = rond(Object.values(posten).reduce((a, b) => a + b, 0));
  const vast = rond(posten.afschrijving + posten.rente + posten.verzekering + posten.mrb);
  return {
    posten,
    totaal,
    vast,
    variabel: rond(totaal - vast),
    perKm: rond((totaal * 12) / instellingen.kmPerJaar, 3),
    aankoop: rond(aankoop, 0),
    verkoop: rond(verkoop, 0),
    verbruik: verbruik(auto),
  };
}

// ---- RDW ----

export function normaliseerKenteken(k) {
  return String(k || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// Zet streepjes tussen letter- en cijfergroepen (bijv. GZ123X -> GZ-123-X).
export function formatteerKenteken(k) {
  const groepen = normaliseerKenteken(k).match(/[A-Z]+|[0-9]+/g) || [];
  if (groepen.length === 2) {
    const i = groepen.findIndex((g) => g.length === 4);
    if (i >= 0) groepen.splice(i, 1, groepen[i].slice(0, 2), groepen[i].slice(2));
  }
  return groepen.join('-');
}

const getal = (obj, ...sleutels) => {
  for (const s of sleutels) {
    const v = parseFloat(obj?.[s]);
    if (Number.isFinite(v) && v > 0) return v;
  }
  return undefined;
};

const rdwDatum = (s) =>
  /^\d{8}$/.test(s || '') ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : undefined;

// Zet RDW-records (gekentekende voertuigen + brandstof) om naar ons automodel.
export function vanRdw(voertuig, brandstofRijen = []) {
  const soorten = brandstofRijen.map((r) => (r.brandstof_omschrijving || '').toLowerCase());
  const heeftStroom = soorten.includes('elektriciteit');
  const fossiel = brandstofRijen.find((r) => r.brandstof_omschrijving?.toLowerCase() !== 'elektriciteit');
  const stroom = brandstofRijen.find((r) => r.brandstof_omschrijving?.toLowerCase() === 'elektriciteit');
  const bereik = getal(stroom, 'actie_radius_extern_opladen_wltp', 'actie_radius_enkel_elektrisch_wltp')
    ?? getal(fossiel, 'actie_radius_extern_opladen_wltp', 'actie_radius_enkel_elektrisch_wltp');

  let brandstof = 'benzine';
  if (heeftStroom && !fossiel) brandstof = 'elektrisch';
  else if (heeftStroom) brandstof = bereik ? 'phev' : 'hybride';
  else if (soorten.includes('diesel')) brandstof = 'diesel';
  else if (soorten.some((s) => s.includes('lpg'))) brandstof = 'lpg';

  let verbruikLiter = getal(fossiel,
    'brandstof_verbruik_gecombineerd_wltp', 'brandstofverbruik_gecombineerd_wltp', 'brandstofverbruik_gecombineerd');
  const co2 = getal(fossiel, 'emissie_co2_gecombineerd_wltp', 'co2_uitstoot_gecombineerd');
  if (!verbruikLiter && co2 && brandstof !== 'phev') verbruikLiter = co2 / (brandstof === 'diesel' ? 26.4 : 23.7);
  const whPerKm = getal(stroom ?? fossiel,
    'elektrisch_verbruik_enkel_elektrisch_wltp', 'elektrisch_verbruik_extern_opladen_wltp');

  return {
    kenteken: normaliseerKenteken(voertuig.kenteken),
    merk: voertuig.merk || '',
    model: voertuig.handelsbenaming || '',
    brandstof,
    gewicht: getal(voertuig, 'massa_ledig_voertuig') ?? (getal(voertuig, 'massa_rijklaar') ?? 1300) - 100,
    catalogusprijs: getal(voertuig, 'catalogusprijs'),
    datumToelating: rdwDatum(voertuig.datum_eerste_toelating),
    vermogenKw: getal(fossiel ?? stroom, 'nettomaximumvermogen'),
    verbruikLiter: brandstof === 'elektrisch' ? undefined : verbruikLiter && rond(verbruikLiter, 1),
    verbruikKwh: whPerKm ? rond(whPerKm / 10, 1) : undefined,
    kleur: voertuig.eerste_kleur,
    inrichting: voertuig.inrichting,
    overschrijf: {},
  };
}

const RDW = 'https://opendata.rdw.nl/resource';

export async function zoekKenteken(kenteken, fetchFn = fetch) {
  const k = normaliseerKenteken(kenteken);
  if (k.length < 4 || k.length > 8) throw new Error('Ongeldig kenteken.');
  const [voertuigen, brandstof] = await Promise.all([
    fetchFn(`${RDW}/m9d7-ebf2.json?kenteken=${k}`).then((r) => {
      if (!r.ok) throw new Error(`RDW gaf een fout (${r.status}).`);
      return r.json();
    }),
    fetchFn(`${RDW}/8ys7-d773.json?kenteken=${k}`).then((r) => (r.ok ? r.json() : [])),
  ]);
  if (!voertuigen.length) throw new Error(`Kenteken ${formatteerKenteken(k)} niet gevonden bij de RDW.`);
  return vanRdw(voertuigen[0], brandstof);
}
