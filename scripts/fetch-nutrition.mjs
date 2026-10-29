// Hämtar näringsvärden (kcal, protein, kolhydrater, fett per 100 g) från Livsmedelsverkets
// öppna Livsmedelsdatabasen och sparar dem som docs/nutrition.json, som appen läser.
// Data: Livsmedelsverket, Livsmedelsdatabasen, licens CC BY 4.0. Källan ska anges.
// Kräver Node 18 eller nyare, inga paket. Ingen nyckel behövs.
//
// Miljövariabler (valfria):
//   LV_BASE   annan bas-adress (standard https://dataportal.livsmedelsverket.se/livsmedel/api/v1)
//   FORCE=1   hämta om även om filen är färskare än 7 dagar
//   DEBUG=1   skriv ut exempel på råa svar
//   FULL=0    hämta bara appens varor, inte hela tabellen (snabbare)

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
  grytbit:    { need: ['nöt'], pref: ['högrev', 'grytbit', 'bog', 'rå'], avoid: ['färs', 'stekt', 'kokt', 'korv', 'buljong', 'rökt', 'lever', 'tunga'] },
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

// Om API:et svarar med engelska namn används de här orden i stället
const EN = {
  kyckling:['chicken|breast,fillet,raw|fried,grilled,breaded,thigh,skin,stock,sausage,whole'], notfars:['mince|beef,raw,10|pork,fried,mixed'],
  blandfars:['mince|mixed,raw|fried'], grytbit:['beef|chuck,stewing,raw|mince,fried,boiled,sausage,stock,smoked,liver'], kalkonfars:['turkey|mince,raw|fried,cold cuts'], flaskfile:['pork|fillet,tenderloin,raw|fried,chop,belly,bacon,smoked'],
  lax:['salmon|farmed,raw|smoked,cured,fried,boiled,baked'], torsk:['cod|raw,fillet|fried,boiled,breaded,roe,dried'],
  rakor:['shrimp,prawn|boiled,peeled|mayonnaise,salad,canned'], agg:['egg|raw,whole|yolk,white,boiled,fried,powder,scrambled'],
  tofu:['tofu||fried'], keso:['cottage cheese|plain|fruit'], grekyog:['yoghurt|greek,turkish,10|fruit,flavoured,vanilla,drink,low fat'],
  kvarg:['quark|plain|fruit,vanilla,flavoured'], feta:['feta||'], ost:['cheese|hard,28|cream,processed,soft,cottage,feta,quark'],
  mjolk:['milk|1.5,medium,standard|chocolate,powder,condensed,fermented,oat,soy,almond,coconut'],
  gradde:['cream|cooking,15|whipping,ice,sour,sauce'], vispgradde:['cream|whipping,36,40|cooking,ice,sour'],
  smor:['butter|salted,80|peanut,almond,cocoa,pastry'], potatis:['potato|raw,peeled|sweet,mashed,chips,fries,fried,boiled,gratin,salad,flour'],
  sotpotatis:['sweet potato|raw|boiled,fried,chips'], paprika:['pepper|sweet,red,raw|powder,spice,canned,black'],
  lok:['onion|yellow,raw|spring,leek,fried,powder,roasted'], vitlok:['garlic|raw|powder,dried'], morot:['carrot|raw|boiled,juice,cake'],
  gurka:['cucumber|raw|pickled,salted'], tomat:['tomato|raw,fresh|crushed,puree,canned,ketchup,sun-dried,sauce,juice,soup'],
  champinjon:['mushroom|raw,button|canned,fried'], banan:['banana||dried,chips'], brod:['bread|wholemeal,wholegrain,soft|crisp,flat,white,toasted,crumbs'],
  tortilla:['tortilla|wheat|chips,maize'], broccoli:['broccoli|frozen,raw|boiled'], wok:['vegetable|mix,stir,frozen|soup,gratin,boiled'],
  spenat:['spinach|frozen,raw|creamed,boiled,soup'], bar:['berr|mixed,frozen|jam,juice,soup'], kikartor:['chickpea|boiled,canned|dried,flour,hummus'],
  bonor:['bean|black,boiled,canned|dried,green,sauce,brown'], linser:['lentil|red,dried,uncooked|boiled'],
  ris:['rice|jasmine,long grain,uncooked,dry|boiled,porridge,cake,flour,noodle,wild'], pasta:['pasta|uncooked,dry,wheat|boiled,wholegrain,fresh,salad,sauce'],
  fkpasta:['pasta|wholegrain,wholemeal,uncooked,dry|boiled,fresh'], couscous:['couscous|uncooked,dry|boiled,salad'], havre:['oat|flakes,rolled|porridge,boiled'],
  majs:['corn,maize|canned,kernel|chips,flour,popcorn,starch,flakes'], krossad:['tomato|crushed,canned|puree,ketchup,fresh,raw'],
  olja:['oil|olive,rapeseed|'], kokos:['coconut|milk|flakes,grated,oil'], soja:['soy|sauce|bean,drink,milk'], puree:['tomato|puree|ketchup,crushed'],
  curry:['curry|paste|powder,sauce,dish'], taco:['taco|spice,seasoning|shell,sauce,chips'], salsa:['salsa||chips'], jordnot:['peanut|butter|roasted,salted,oil'],
  notter:['almond|sweet,plain|milk,drink,paste,roasted,salted'], mjol:['flour|wheat|maize,potato,rye,oat,wholegrain'], socker:['sugar|white,granulated|icing,brown,vanilla,pearl']
};
const enSpec = pid => { const [n, p, a] = (EN[pid] && EN[pid][0] || '').split('|'); const sp = x => (x || '').split(',').filter(Boolean);
  return { need: sp(n), pref: sp(p), avoid: sp(a), any: true }; };
const norm = s => String(s || '').toLowerCase();
const pick = (o, ...keys) => { for (const k of Object.keys(o || {})) if (keys.includes(k.toLowerCase())) return o[k]; return undefined; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function get(path, params) {
  const url = new URL(BASE + path);
  Object.entries(params || {}).forEach(([k, v]) => url.searchParams.set(k, String(v)));
  const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'veckohandla-hobbyprojekt' } });
  if (!res.ok) {
    const body = (await res.text().catch(() => '')).slice(0, 300).replace(/\s+/g, ' ');
    throw new Error(`Livsmedelsverket svarade ${res.status} på ${url}${body ? ` — ${body}` : ''}`);
  }
  return res.json();
}
// Hittar själva listan i svaret, även om den ligger bredvid länkar eller metadata
function asList(j, hints) {
  if (Array.isArray(j)) return j;
  if (!j || typeof j !== 'object') return [];
  for (const k of Object.keys(j)) if ((hints || []).includes(k.toLowerCase()) && Array.isArray(j[k])) return j[k];
  let best = [];
  for (const k of Object.keys(j)) {
    const v = j[k];
    if (Array.isArray(v) && v.length > best.length && v.some(x => x && typeof x === 'object' && !('href' in x || 'rel' in x))) best = v;
    else if (v && typeof v === 'object' && !Array.isArray(v)) { const inner = asList(v, hints); if (inner.length > best.length) best = inner; }
  }
  return best;
}

const SWEDISH = /[åäö]|\brå\b|\bkokt\b|\bstekt\b/;
let PAGE = 500;
async function fetchList(extra) {
  const out = [];
  for (let offset = 0; offset < 10000; offset += PAGE) {
    let j;
    try { j = await get('/livsmedel', { offset, limit: PAGE, ...extra }); }
    catch (e) {
      if (offset === 0 && PAGE > 100 && /\b400\b/.test(e.message)) { PAGE = 100; console.log('API:et tog inte emot 500 per sida, provar 100.'); j = await get('/livsmedel', { offset, limit: PAGE, ...extra }); }
      else throw e;
    }
    const page = asList(j, ['livsmedel', 'data', 'items', 'results']);
    if (process.env.DEBUG && offset === 0) console.log('Rått svar (början):', JSON.stringify(j).slice(0, 500));
    out.push(...page.map(x => ({ nummer: pick(x, 'nummer', 'number', 'id', 'livsmedelsnummer'), namn: String(pick(x, 'namn', 'name') || '') })));
    if (page.length < PAGE) break;
    await sleep(300);
  }
  return out.filter(x => x.nummer != null && x.namn);
}
async function allFoods() {
  const tries = [{ sprak: 1 }, { sprak: 'sv' }, {}];
  let lastErr = null, english = null;
  for (const t of tries) {
    try {
      const foods = await fetchList(t);
      if (!foods.length) { console.log(`Inga livsmedel med parametrarna ${JSON.stringify(t)}, provar nästa.`); continue; }
      const sv = foods.slice(0, 300).filter(f => SWEDISH.test(norm(f.namn))).length;
      if (sv >= 10) { console.log(`Fick ${foods.length} livsmedel med svenska namn (${JSON.stringify(t)}).`); return { foods, lang: 'sv', params: t }; }
      if (!english) english = { foods, lang: 'en', params: t };
    } catch (e) { lastErr = e; console.log(`Försök med ${JSON.stringify(t)} misslyckades: ${e.message}`); }
  }
  if (english) { console.log(`Fick ${english.foods.length} livsmedel, men med engelska namn. Matchar på engelska.`); return english; }
  throw lastErr || new Error('Inga livsmedel i svaret. Kör med DEBUG=1 för att se hur svaret ser ut.');
}

function score(name, spec) {
  const n = norm(name);
  const needOk = spec.any ? spec.need.some(w => n.includes(w)) : spec.need.every(w => n.includes(w));
  if (!needOk) return -Infinity;
  let s = 0;
  spec.pref.forEach(w => { if (n.includes(w)) s += 2; });
  spec.avoid.forEach(w => { if (n.includes(w)) s -= 5; });
  s -= n.length / 60; // kortare, mer generella namn vinner vid lika poäng
  return s;
}

async function macros(nummer, params) {
  const j = await get(`/livsmedel/${nummer}/naringsvarden`, params || {}).catch(() => get(`/livsmedel/${nummer}/naringsvarden`));
  const rows = asList(j, ['naringsvarden', 'data', 'items', 'results']);
  if (process.env.DEBUG && !macros.shown) { macros.shown = true; console.log('Exempel på näringsrad:', JSON.stringify(rows[0]).slice(0, 400)); }
  const val = (code, unit) => {
    const r = rows.find(x => String(pick(x, 'eurofirkod', 'forkortning', 'code') || '').toUpperCase() === code &&
      (!unit || norm(pick(x, 'enhet', 'unit')).includes(unit)));
    const v = r ? Number(String(pick(r, 'varde', 'value')).replace(',', '.')) : NaN;
    return Number.isFinite(v) ? v : null;
  };
  return { k: val('ENERC', 'kcal'), p: val('PROT'), c: val('CHO'), f: val('FAT') };
}

// Hämtar näringsvärden för många livsmedel, några åt gången, med paus och ett nytt försök vid fel
async function fetchAllMacros(foods, params) {
  const rows = [], CONC = 4;
  let idx = 0, fails = 0, done = 0, stop = false;
  async function worker() {
    while (!stop && idx < foods.length) {
      const f = foods[idx++];
      let m = null;
      for (let attempt = 0; attempt < 2 && !m; attempt++) {
        try { m = await macros(f.nummer, params); }
        catch (e) { if (attempt === 0) await sleep(2000); else { fails++; if (fails > 40) stop = true; } }
      }
      if (m && [m.k, m.p, m.c, m.f].every(v => v != null)) rows.push([f.nummer, f.namn, m.k, m.p, m.c, m.f]);
      if (++done % 250 === 0) console.log(`  ${done} av ${foods.length} hämtade...`);
      await sleep(150);
    }
  }
  await Promise.all(Array.from({ length: CONC }, worker));
  if (stop) console.log(`Avbröt hela tabellen efter ${fails} misslyckade anrop. Sparar det som hann hämtas.`);
  return rows;
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
  const { foods, lang, params } = await allFoods();
  let table = [];
  if (process.env.FULL !== '0') {
    console.log(`Hämtar näringsvärden för alla ${foods.length} livsmedel. Det tar några minuter.`);
    table = await fetchAllMacros(foods, params);
    console.log(`Fick näringsvärden för ${table.length} livsmedel.`);
  }
  const byNr = new Map(table.map(r => [String(r[0]), r]));

  const items = {}, report = [];
  for (const [pid, svSpec] of Object.entries(SPEC)) {
    const spec = lang === 'en' ? enSpec(pid) : svSpec;
    let choice = null;
    if (overrides[pid]) choice = foods.find(f => String(f.nummer) === String(overrides[pid])) || { nummer: overrides[pid], namn: '(manuellt vald)' };
    else {
      let best = -Infinity;
      for (const f of foods) { const s = score(f.namn, spec); if (s > best) { best = s; choice = f; } }
      if (best === -Infinity) choice = null;
    }
    if (!choice) { report.push(`${pid}: ingen träff`); continue; }
    let m;
    const row = byNr.get(String(choice.nummer));
    if (row) m = { k: row[2], p: row[3], c: row[4], f: row[5] };
    else {
      try { m = await macros(choice.nummer, params); }
      catch (e) { report.push(`${pid}: ${choice.namn} gick inte att hämta (${e.message.slice(0, 120)})`); continue; }
    }
    if (!row) await sleep(250);
    if ([m.k, m.p, m.c, m.f].some(v => v == null)) { report.push(`${pid}: ${choice.namn} saknar värden`); continue; }
    // Rimlighetskontroll: energin ska stämma ungefär med 4p + 4c + 9f
    const calc = 4 * m.p + 4 * m.c + 9 * m.f;
    if (m.k > 20 && Math.abs(calc - m.k) / m.k > 0.35) { report.push(`${pid}: ${choice.namn} energin stämmer inte, hoppar över`); continue; }
    items[pid] = { ...m, nummer: choice.nummer, namn: choice.namn };
    report.push(`${pid}: ${choice.namn} (nr ${choice.nummer}) ${m.k} kcal, P ${m.p}, K ${m.c}, F ${m.f}`);
  }
  console.log(report.join('\n'));
  if (Object.keys(items).length) {
    mkdirSync(dirname(OUT), { recursive: true });
    // Hela tabellen sparas kompakt: [nummer, namn, kcal, protein, kolhydrater, fett] per 100 g
    writeFileSync(OUT, JSON.stringify({ updated: new Date().toISOString(), source: 'Livsmedelsverket, Livsmedelsdatabasen (CC BY 4.0)', lang, items, all: table }));
    if (table.length) console.log(`Hela tabellen med ${table.length} livsmedel finns nu för att slå upp okända ingredienser.`);
  }
  const n = Object.keys(items).length;
  console.log(`Skrev näringsvärden för ${n} av ${Object.keys(SPEC).length} varor till docs/nutrition.json`);
  if (!n) throw new Error('Ingen vara fick näringsvärden. Kör med DEBUG=1 och skicka loggen till Claude.');
  console.log('Är en vara felmatchad? Lägg in rätt livsmedelsnummer i scripts/nutrition-overrides.json, till exempel {"kyckling": 4410}.');
}

main().catch(e => { console.error('FEL:', e.message); process.exit(1); });
