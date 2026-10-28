// Hämtar näringsvärden (kcal, protein, kolhydrater, fett per 100 g) från Livsmedelsverkets
// öppna Livsmedelsdatabasen och sparar dem som docs/nutrition.json, som appen läser.
// Data: Livsmedelsverket, Livsmedelsdatabasen, licens CC BY 4.0. Källan ska anges.
// Kräver Node 18 eller nyare, inga paket. Ingen nyckel behövs.
//
// Miljövariabler (valfria):
//   LV_BASE   annan bas-adress (standard https://dataportal.livsmedelsverket.se/livsmedel/api/v1)
//   FORCE=1   hämta om även om filen är färskare än 7 dagar
//   DEBUG=1   skriv ut exempel på råa svar

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = (process.env.LV_BASE || 'https://dataportal.livsmedelsverket.se/livsmedel/api/v1').replace(/\/+$/, '');
const OUT = fileURLToPath(new URL('../docs/nutrition.json', import.meta.url));
const OVERRIDES = fileURLToPath(new URL('./nutrition-overrides.json', import.meta.url));

// Hur varje vara i appen hittas i databasen. need = ord som måste finnas, pref = ord som ger plus,
// avoid = ord som ger minus. Torrvaror ska vara okokta, kött och fisk råa.
const SPEC = {
  kyckling:   { need: ['kyckling'], pref: ['bröst', 'filé', 'rå'], avoid: ['stekt', 'grillad', 'panerad', 'lår', 'hel', 'skinn', 'buljong', 'korv', 'pålägg'] },
  notfars:    { need: ['nöt', 'färs'], pref: ['rå', '10', '12'], avoid: ['stekt', 'bland', 'gris'] },
  blandfars:  { need: ['färs'], pref: ['bland', 'rå'], avoid: ['stekt'] },
  kalkonfars: { need: ['kalkon'], pref: ['färs', 'rå'], avoid: ['stekt', 'pålägg'] },
  flaskfile:  { need: ['fläsk'], pref: ['filé', 'rå'], avoid: ['stekt', 'kotlett', 'sida', 'bacon', 'rökt'] },
  lax:        { need: ['lax'], pref: ['odlad', 'rå', 'fryst'], avoid: ['rökt', 'gravad', 'stekt', 'kokt', 'ugn'] },
  torsk:      { need: ['torsk'], pref: ['rå', 'filé'], avoid: ['stekt', 'kokt', 'panerad', 'rom', 'lutfisk', 'torkad'] },
  rakor:      { need: ['räk'], pref: ['kokt', 'skalad'], avoid: ['majonnäs', 'sallad', 'röra', 'konserv'] },
  agg:        { need: ['ägg'], pref: ['rå', 'hel'], avoid: ['gula', 'vita', 'kokt', 'stekt', 'pulver', 'röra'] },
  tofu:       { need: ['tofu'], pref: [], avoid: ['stekt', 'friterad'] },
  keso:       { need: ['keso'], pref: ['naturell'], avoid: ['frukt'] },
  grekyog:    { need: ['yoghurt'], pref: ['grekisk', 'turkisk', '10'], avoid: ['frukt', 'smaksatt', 'vanilj', 'dryck', 'mager'] },
  kvarg:      { need: ['kvarg'], pref: ['naturell', 'mager'], avoid: ['frukt', 'vanilj', 'smaksatt'] },
  feta:       { need: ['feta'], pref: ['ost'], avoid: [] },
  ost:        { need: ['ost'], pref: ['hårdost', 'herrgård', 'grevé', '28'], avoid: ['färskost', 'smält', 'mjukost', 'keso', 'feta', 'kvarg'] },
  mjolk:      { need: ['mjölk'], pref: ['1,5', 'mellan', 'standard'], avoid: ['choklad', 'pulver', 'kondenserad', 'fil', 'havre', 'soja', 'mandel', 'kokos', 'jäst'] },
  gradde:     { need: ['grädde'], pref: ['matlagning', '15'], avoid: ['visp', 'glass', 'fil', 'sås'] },
  vispgradde: { need: ['grädde'], pref: ['visp', '36', '40'], avoid: ['matlagning', 'glass', 'fil'] },
  smor:       { need: ['smör'], pref: ['normalsaltat', '80'], avoid: ['jordnöt', 'mandel', 'kakao', 'smördeg', 'bakverk'] },
  potatis:    { need: ['potatis'], pref: ['rå', 'skalad'], avoid: ['söt', 'mos', 'chips', 'pommes', 'stekt', 'kokt', 'gratäng', 'sallad', 'mjöl'] },
  sotpotatis: { need: ['sötpotatis'], pref: ['rå'], avoid: ['kokt', 'stekt', 'chips'] },
  paprika:    { need: ['paprika'], pref: ['röd', 'rå', 'färsk'], avoid: ['pulver', 'krydda', 'konserv'] },
  lok:        { need: ['lök'], pref: ['gul', 'rå'], avoid: ['vit', 'purjo', 'salladslök', 'stekt', 'pulver', 'rostad'] },
  vitlok:     { need: ['vitlök'], pref: ['rå'], avoid: ['pulver', 'torkad'] },
  morot:      { need: ['morot'], pref: ['rå'], avoid: ['kokt', 'juice', 'kaka'] },
  gurka:      { need: ['gurka'], pref: ['rå', 'slang'], avoid: ['inlagd', 'salt', 'sylt'] },
  tomat:      { need: ['tomat'], pref: ['rå', 'färsk'], avoid: ['krossad', 'puré', 'konserv', 'ketchup', 'soltorkad', 'sås', 'juice', 'soppa'] },
  champinjon: { need: ['champinjon'], pref: ['rå'], avoid: ['konserv', 'stekt'] },
  banan:      { need: ['banan'], pref: [], avoid: ['torkad', 'chips'] },
  brod:       { need: ['bröd'], pref: ['fullkorn', 'mjukt'], avoid: ['knäcke', 'tunn', 'vitt', 'rost', 'smul'] },
  tortilla:   { need: ['tortilla'], pref: ['vete'], avoid: ['chips', 'majs'] },
  broccoli:   { need: ['broccoli'], pref: ['fryst', 'rå'], avoid: ['kokt'] },
  wok:        { need: ['grönsak'], pref: ['wok', 'fryst', 'blandning'], avoid: ['soppa', 'gratäng', 'kokt'] },
  spenat:     { need: ['spenat'], pref: ['fryst', 'rå'], avoid: ['stuvad', 'kokt', 'soppa'] },
  bar:        { need: ['bär'], pref: ['blandade', 'fryst'], avoid: ['sylt', 'saft', 'juice', 'kräm'] },
  kikartor:   { need: ['kikärt'], pref: ['kokt', 'konserv'], avoid: ['torkad', 'mjöl', 'hummus'] },
  bonor:      { need: ['böna'], pref: ['svart', 'kokt', 'konserv'], avoid: ['torkad', 'grön', 'sås', 'brun'] },
  linser:     { need: ['lins'], pref: ['röd', 'torkad', 'okokt'], avoid: ['kokt'] },
  ris:        { need: ['ris'], pref: ['jasmin', 'långkornigt', 'okokt', 'torrt'], avoid: ['kokt', 'gröt', 'kaka', 'mjöl', 'nudlar', 'vild'] },
  pasta:      { need: ['pasta'], pref: ['okokt', 'torr', 'vete'], avoid: ['kokt', 'fullkorn', 'färsk', 'sallad', 'sås'] },
  fkpasta:    { need: ['pasta'], pref: ['fullkorn', 'okokt', 'torr'], avoid: ['kokt', 'färsk'] },
  couscous:   { need: ['couscous'], pref: ['okokt', 'torr'], avoid: ['kokt', 'sallad'] },
  havre:      { need: ['havregryn'], pref: [], avoid: ['gröt', 'kokt'] },
  majs:       { need: ['majs'], pref: ['konserv', 'kärnor'], avoid: ['chips', 'mjöl', 'popcorn', 'stärkelse', 'flingor'] },
  krossad:    { need: ['tomat'], pref: ['krossad', 'konserv'], avoid: ['puré', 'ketchup', 'färsk', 'rå'] },
  olja:       { need: ['olja'], pref: ['oliv', 'raps'], avoid: [] },
  kokos:      { need: ['kokos'], pref: ['mjölk'], avoid: ['flingor', 'riven', 'olja'] },
  soja:       { need: ['soja'], pref: ['sås'], avoid: ['böna', 'dryck', 'mjölk'] },
  puree:      { need: ['tomat'], pref: ['puré'], avoid: ['ketchup', 'krossad'] },
  curry:      { need: ['curry'], pref: ['pasta'], avoid: ['pulver', 'sås', 'rätt'] },
  taco:       { need: ['taco'], pref: ['krydd'], avoid: ['skal', 'sås', 'chips'] },
  salsa:      { need: ['salsa'], pref: [], avoid: ['chips'] },
  jordnot:    { need: ['jordnöt'], pref: ['smör'], avoid: ['rostade', 'salt', 'olja'] },
  notter:     { need: ['mandel'], pref: ['sötmandel', 'naturell'], avoid: ['mjölk', 'dryck', 'massa', 'rostad', 'salt'] },
  mjol:       { need: ['mjöl'], pref: ['vete'], avoid: ['majs', 'potatis', 'råg', 'havre', 'fullkorn'] },
  socker:     { need: ['socker'], pref: ['strö', 'vitt'], avoid: ['flor', 'farin', 'brunt', 'vanilj', 'pärl'] }
};

const norm = s => String(s || '').toLowerCase();
const pick = (o, ...keys) => { for (const k of Object.keys(o || {})) if (keys.includes(k.toLowerCase())) return o[k]; return undefined; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function get(path, params) {
  const url = new URL(BASE + path);
  Object.entries(params || {}).forEach(([k, v]) => url.searchParams.set(k, String(v)));
  const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'veckohandla-hobbyprojekt' } });
  if (!res.ok) throw new Error(`Livsmedelsverket svarade ${res.status} på ${url}`);
  return res.json();
}
function asList(j) {
  if (Array.isArray(j)) return j;
  for (const k of Object.keys(j || {})) if (Array.isArray(j[k])) return j[k];
  return [];
}

async function allFoods() {
  const out = [];
  for (let offset = 0; offset < 10000; offset += 500) {
    let j;
    try { j = await get('/livsmedel', { offset, limit: 500, sprak: 1 }); }
    catch (e) { if (offset === 0) j = await get('/livsmedel', { offset, limit: 500 }); else throw e; }
    const page = asList(j);
    if (process.env.DEBUG && offset === 0) console.log('Exempel på livsmedel:', JSON.stringify(page[0]).slice(0, 400));
    out.push(...page.map(x => ({ nummer: pick(x, 'nummer', 'number', 'id'), namn: String(pick(x, 'namn', 'name') || '') })));
    if (page.length < 500) break;
    await sleep(300);
  }
  return out.filter(x => x.nummer != null && x.namn);
}

function score(name, spec) {
  const n = norm(name);
  if (!spec.need.every(w => n.includes(w))) return -Infinity;
  let s = 0;
  spec.pref.forEach(w => { if (n.includes(w)) s += 2; });
  spec.avoid.forEach(w => { if (n.includes(w)) s -= 5; });
  s -= n.length / 60; // kortare, mer generella namn vinner vid lika poäng
  return s;
}

async function macros(nummer) {
  const j = await get(`/livsmedel/${nummer}/naringsvarden`, { sprak: 1 }).catch(() => get(`/livsmedel/${nummer}/naringsvarden`));
  const rows = asList(j);
  if (process.env.DEBUG && !macros.shown) { macros.shown = true; console.log('Exempel på näringsrad:', JSON.stringify(rows[0]).slice(0, 400)); }
  const val = (code, unit) => {
    const r = rows.find(x => String(pick(x, 'eurofirkod', 'forkortning', 'code') || '').toUpperCase() === code &&
      (!unit || norm(pick(x, 'enhet', 'unit')).includes(unit)));
    const v = r ? Number(String(pick(r, 'varde', 'value')).replace(',', '.')) : NaN;
    return Number.isFinite(v) ? v : null;
  };
  return { k: val('ENERC', 'kcal'), p: val('PROT'), c: val('CHO'), f: val('FAT') };
}

async function main() {
  if (!process.env.FORCE && existsSync(OUT)) {
    try {
      const old = JSON.parse(readFileSync(OUT, 'utf8'));
      if (Date.now() - new Date(old.updated).getTime() < 7 * 864e5) {
        console.log('Näringsvärdena är färskare än 7 dagar, hoppar över. Sätt FORCE=1 för att hämta om.');
        return;
      }
    } catch (e) { /* hämta om */ }
  }
  const overrides = existsSync(OVERRIDES) ? JSON.parse(readFileSync(OVERRIDES, 'utf8')) : {};
  const foods = await allFoods();
  console.log(`Läste ${foods.length} livsmedel från Livsmedelsdatabasen.`);
  if (!foods.length) throw new Error('Inga livsmedel i svaret. Kör med DEBUG=1 för att se hur svaret ser ut.');

  const items = {}, report = [];
  for (const [pid, spec] of Object.entries(SPEC)) {
    let choice = null;
    if (overrides[pid]) choice = foods.find(f => String(f.nummer) === String(overrides[pid])) || { nummer: overrides[pid], namn: '(manuellt vald)' };
    else {
      let best = -Infinity;
      for (const f of foods) { const s = score(f.namn, spec); if (s > best) { best = s; choice = f; } }
      if (best === -Infinity) choice = null;
    }
    if (!choice) { report.push(`${pid}: ingen träff`); continue; }
    const m = await macros(choice.nummer);
    await sleep(250);
    if ([m.k, m.p, m.c, m.f].some(v => v == null)) { report.push(`${pid}: ${choice.namn} saknar värden`); continue; }
    // Rimlighetskontroll: energin ska stämma ungefär med 4p + 4c + 9f
    const calc = 4 * m.p + 4 * m.c + 9 * m.f;
    if (m.k > 20 && Math.abs(calc - m.k) / m.k > 0.35) { report.push(`${pid}: ${choice.namn} energin stämmer inte, hoppar över`); continue; }
    items[pid] = { ...m, nummer: choice.nummer, namn: choice.namn };
    report.push(`${pid}: ${choice.namn} (nr ${choice.nummer}) ${m.k} kcal, P ${m.p}, K ${m.c}, F ${m.f}`);
  }
  console.log(report.join('\n'));
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify({ updated: new Date().toISOString(), source: 'Livsmedelsverket, Livsmedelsdatabasen (CC BY 4.0)', items }, null, 1));
  console.log(`Skrev näringsvärden för ${Object.keys(items).length} av ${Object.keys(SPEC).length} varor till docs/nutrition.json`);
  console.log('Är en vara felmatchad? Lägg in rätt livsmedelsnummer i scripts/nutrition-overrides.json, till exempel {"kyckling": 4410}.');
}

main().catch(e => { console.error('FEL:', e.message); process.exit(1); });
