import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bereken, vanRdw, formatteerKenteken, normaliseerKenteken, zoekKenteken, STANDAARD_INSTELLINGEN,
} from '../calc.js';

const jaarGeleden = (n) => `${new Date().getFullYear() - n}-06-01`;
const golf = {
  merk: 'VOLKSWAGEN', model: 'GOLF', brandstof: 'benzine', gewicht: 1250,
  catalogusprijs: 32000, datumToelating: jaarGeleden(3), verbruikLiter: 5.5, overschrijf: {},
};

test('kenteken normaliseren en formatteren', () => {
  assert.equal(normaliseerKenteken('gz-123-x'), 'GZ123X');
  assert.equal(formatteerKenteken('gz123x'), 'GZ-123-X');
  assert.equal(formatteerKenteken('1KBB23'), '1-KBB-23');
  assert.equal(formatteerKenteken('AB1234'), 'AB-12-34');
});

test('totaal is de som van de posten en in een realistische bandbreedte', () => {
  const r = bereken(golf, STANDAARD_INSTELLINGEN);
  const som = Object.values(r.posten).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(som - r.totaal) < 0.05);
  assert.ok(r.totaal > 400 && r.totaal < 900, `totaal ${r.totaal}`);
  assert.ok(r.posten.brandstof > 100 && r.posten.brandstof < 160);
});

test('diesel betaalt meer wegenbelasting, elektrisch minder', () => {
  const mrb = (brandstof) => bereken({ ...golf, brandstof }).posten.mrb;
  assert.ok(mrb('diesel') > mrb('benzine'));
  assert.ok(mrb('elektrisch') < mrb('benzine'));
});

test('meer kilometers geeft hogere variabele kosten', () => {
  const laag = bereken(golf, { ...STANDAARD_INSTELLINGEN, kmPerJaar: 10000 });
  const hoog = bereken(golf, { ...STANDAARD_INSTELLINGEN, kmPerJaar: 30000 });
  assert.ok(hoog.variabel > laag.variabel);
  assert.ok(hoog.perKm < laag.perKm);
});

test('handmatige bedragen overschrijven schattingen', () => {
  const r = bereken({ ...golf, overschrijf: { verzekering: 99, aankoopprijs: 20000 } });
  assert.equal(r.posten.verzekering, 99);
  assert.equal(r.aankoop, 20000);
});

test('oldtimer betaalt geen wegenbelasting', () => {
  assert.equal(bereken({ ...golf, datumToelating: '1980-01-01' }).posten.mrb, 0);
});

test('RDW-records omzetten', () => {
  const v = { kenteken: 'AB123C', merk: 'TESLA', handelsbenaming: 'MODEL 3', massa_ledig_voertuig: '1750',
    catalogusprijs: '49990', datum_eerste_toelating: '20220315' };
  const ev = vanRdw(v, [{ brandstof_omschrijving: 'Elektriciteit', elektrisch_verbruik_enkel_elektrisch_wltp: '144', nettomaximumvermogen: '208' }]);
  assert.equal(ev.brandstof, 'elektrisch');
  assert.equal(ev.verbruikKwh, 14.4);
  assert.equal(ev.datumToelating, '2022-03-15');
  assert.equal(ev.gewicht, 1750);

  assert.equal(vanRdw(v, [{ brandstof_omschrijving: 'Diesel' }]).brandstof, 'diesel');
  assert.equal(vanRdw(v, [{ brandstof_omschrijving: 'Benzine' }, { brandstof_omschrijving: 'Elektriciteit' }]).brandstof, 'hybride');
  assert.equal(vanRdw(v, [{ brandstof_omschrijving: 'Benzine' },
    { brandstof_omschrijving: 'Elektriciteit', actie_radius_extern_opladen_wltp: '60' }]).brandstof, 'phev');
  const viaCo2 = vanRdw(v, [{ brandstof_omschrijving: 'Benzine', co2_uitstoot_gecombineerd: '118' }]);
  assert.equal(viaCo2.verbruikLiter, 5);
});

test('zoekKenteken vraagt beide RDW-datasets op en meldt onbekende kentekens', async () => {
  const urls = [];
  const nep = (data) => async (url) => { urls.push(url); return { ok: true, json: async () => (url.includes('m9d7') ? data : []) }; };
  const auto = await zoekKenteken('ab-123-c', nep([{ kenteken: 'AB123C', merk: 'FIAT' }]));
  assert.equal(auto.merk, 'FIAT');
  assert.ok(urls.some((u) => u.includes('m9d7-ebf2.json?kenteken=AB123C')));
  assert.ok(urls.some((u) => u.includes('8ys7-d773.json?kenteken=AB123C')));
  await assert.rejects(zoekKenteken('XX999X', nep([])), /niet gevonden/);
});
