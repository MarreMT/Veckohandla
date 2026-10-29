// Hämtar veckans erbjudanden för områdena i scripts/areas.json och sparar dem som docs/offers-<id>.json
// i det format som Veckohandla-appen läser. Kräver Node 18 eller nyare, inga paket.
//
// Miljövariabler (alla valfria):
//   TJEK_API_KEY  nyckel om tjänsten kräver en (skickas som headern X-Api-Key)
//   TJEK_API_URL  annan bas-adress än https://squid-api.tjek.com/v2
//   DEBUG=1       skriv ut hur ett rått svar ser ut, för felsökning

import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const BASE = (process.env.TJEK_API_URL || 'https://squid-api.tjek.com/v2').replace(/\/+$/, '');
// Områdena står i scripts/areas.json. Varje område får en egen fil, docs/offers-<id>.json,
// och docs/areas.json talar om för appen vilka områden och butiker som finns.
const DOCS = fileURLToPath(new URL('../docs/', import.meta.url));
const AREAS_FILE = fileURLToPath(new URL('./areas.json', import.meta.url));

// id, förpackning i gram (samma som i appen), sökord, regex som måste matcha, regex som inte får matcha,
// req = extra krav i texten (t.ex. laktosfri eller fryst)
const LF = /laktos|lactose|lactofree|minilac/;
const FROZEN = /fryst|frysta|djupfryst/;
const RULES = [
  { id: 'kyckling', pack: 900, base: 119, q: 'kycklingfilé', re: /kyckling(fil[eé]|bröst)|kyckling.*(fil[eé]|bröst)/, not: /panerad|marinerad|krydd|fryst|strimlor|färdig|grillad|rökt/ },
  { id: 'notfars', pack: 500, base: 59, q: 'nötfärs', re: /nötfärs/, not: /plant|vegan|växtbaserad/ },
  { id: 'grytbit', pack: 600, base: 109, q: 'grytbitar', re: /grytbit|högrev|nötkött|kalvkött|oxkött|bogstek|ryggbiff|entrecote/, not: /färs|korv|pålägg|buljong|rökt|kokt/ },
  { id: 'kalkonfars', pack: 500, base: 69, q: 'kalkonfärs', re: /kalkonfärs/ },
  { id: 'flaskfile', pack: 500, base: 69, q: 'fläskfilé', re: /fläskfil[eé]/, not: /marinerad|panerad|rökt/ },
  { id: 'lax', pack: 600, base: 99, q: 'laxfilé', re: /laxfil[eé]|lax.*fil[eé]/, not: /rökt|gravad|kallrökt|varmrökt|sushi|panerad/ },
  { id: 'torsk', pack: 600, base: 89, q: 'torsk', re: /torsk/, not: /panerad|stekt|stav|rökt|lutfisk|rom/ },
  { id: 'rakor', pack: 500, base: 79, q: 'räkor', re: /räk(or|a)\b/, not: /sallad|smörgås|majonnäs|rom|chips/ },
  { id: 'agg', pack: 660, base: 39, q: 'ägg', re: /(^|\s)ägg(\s|,|$)/, not: /nudlar|äggrulle|tårta|äggost|påsk/ },
  { id: 'tofu', pack: 400, base: 29, q: 'tofu', re: /tofu/ },
  { id: 'keso', pack: 500, base: 35, q: 'keso', re: /keso|cottage/, req: LF },
  { id: 'grekyog', pack: 500, base: 32, q: 'grekisk yoghurt', re: /grekisk.*yoghurt|yoghurt.*grekisk/, req: LF },
  { id: 'kvarg', pack: 500, base: 29, q: 'kvarg', re: /kvarg/, not: /dessert|choklad/ },
  { id: 'feta', pack: 200, base: 29, q: 'fetaost', re: /fetaost|(^|\s)feta(\s|,|$)/ },
  { id: 'mjolk', pack: 1000, base: 17, q: 'laktosfri mjölk', re: /mjölk/, not: /havre|soja|mandel|kokos|choklad|ris|sojamjölk|jäst/, req: LF },
  { id: 'gradde', pack: 200, base: 19, q: 'matlagningsgrädde', re: /matlagningsgrädde|grädde/, not: /glass|visp|dessert/, req: LF },
  { id: 'potatis', pack: 2000, base: 29, q: 'potatis', re: /potatis/, not: /chips|sötpotatis|pommes|mos|gratäng|klyftor|rostad|fryst|färdig|sallad|kroketter/ },
  { id: 'sotpotatis', pack: 1000, base: 29, q: 'sötpotatis', re: /sötpotatis/, not: /pommes|fryst|klyft/ },
  { id: 'paprika', pack: 500, base: 29, q: 'paprika', re: /paprika/, not: /krydda|pulver|fylld|rostad|burk|strimlad|chips|pesto/ },
  { id: 'lok', pack: 1000, base: 19, q: 'gul lök', re: /gul lök|lök gul|(^|\s)lök(\s|,|$)/, not: /vitlök|rödlök|salladslök|purjo|stekt|krispig|pulver/ },
  { id: 'vitlok', pack: 100, base: 12, q: 'vitlök', re: /vitlök/, not: /pulver|krydd|dressing|sås|baguette|bröd|rostad|pasta|smör/ },
  { id: 'morot', pack: 1000, base: 19, q: 'morötter', re: /morot|morötter/, not: /juice|kaka|sallad|rivna|fryst|baby/ },
  { id: 'gurka', pack: 350, base: 12, q: 'gurka', re: /gurka/, not: /inlagd|saltgurka|picklad|syltgurka|smörgåsgurka|relish/ },
  { id: 'tomat', pack: 500, base: 29, q: 'tomater', re: /(^|\s)tomat(er)?(\s|,|$)|körsbärstomat|kvisttomat|romantomat|salladstomat/, not: /krossad|passerad|hackad|puré|ketchup|soltork|sås|soppa/ },
  { id: 'champinjon', pack: 250, base: 22, q: 'champinjoner', re: /champinjon/, not: /soppa|sås|konserv|burk/ },
  { id: 'banan', pack: 1000, base: 25, q: 'bananer', re: /banan/, not: /chips|bröd|mjölk|yoghurt|kaka|choklad|torkad|glass/ },
  { id: 'brod', pack: 700, base: 32, q: 'fullkornsbröd', re: /fullkornsbröd|fullkorn.*bröd|(^|\s)bröd(\s|,|$)|limpa/, not: /knäckebröd|tunnbröd|vitlöksbröd|brödmix|hamburger|korv/ },
  { id: 'tortilla', pack: 320, base: 25, q: 'tortilla', re: /tortilla|wraps?\b/, not: /chips|tacoskal|mix|kit|sås/ },
  { id: 'broccoli', pack: 600, base: 25, q: 'broccoli fryst', re: /broccoli/, not: /soppa|gratäng|paj/, req: FROZEN },
  { id: 'wok', pack: 600, base: 29, q: 'wokgrönsaker', re: /wok/, not: /sås|nudlar|krydda|kit|panna/, req: FROZEN },
  { id: 'spenat', pack: 450, base: 22, q: 'spenat fryst', re: /spenat/, not: /pannkak|lasagne|paj|soppa/, req: FROZEN },
  { id: 'bar', pack: 500, base: 35, q: 'frysta bär', re: /(^|\s)bär|hallon|blåbär|jordgubb|skogsbär/, not: /sylt|juice|dryck|glass|bars|energi|saft/, req: FROZEN },
  { id: 'kikartor', pack: 380, base: 14, q: 'kikärtor', re: /kikärtor/, not: /hummus|mjöl|rostade|snack/ },
  { id: 'bonor', pack: 380, base: 15, q: 'svarta bönor', re: /svarta bönor/, not: /sås|chili|pasta/ },
  { id: 'linser', pack: 500, base: 25, q: 'röda linser', re: /röda linser|linser.*röda/ },
  { id: 'ris', pack: 1000, base: 35, q: 'jasminris', re: /jasmin.*ris|jasminris/, not: /snabb|portion|kokt/ },
  { id: 'pasta', pack: 500, base: 15, q: 'pasta', re: /(^|\s)pasta(\s|,|$)|spaghetti|penne|makaroner|fusilli|tagliatelle/, not: /fullkorn|färsk|sås|sallad|gratäng|fylld|bolognese|lasagne|panini|carbonara|glutenfri/ },
  { id: 'fkpasta', pack: 500, base: 19, q: 'fullkornspasta', re: /fullkorns?(pasta|spaghetti|penne|makaroner|fusilli)|pasta.*fullkorn/ },
  { id: 'couscous', pack: 500, base: 22, q: 'couscous', re: /couscous/, not: /sallad/ },
  { id: 'havre', pack: 1000, base: 22, q: 'havregryn', re: /havregryn/, not: /müsli|granola|bar\b|gröt/ },
  { id: 'majs', pack: 340, base: 14, q: 'majs', re: /majs/, not: /chips|popcorn|mjöl|stärkelse|bröd|tortilla|snack|ringar/ },
  { id: 'krossad', pack: 400, base: 12, q: 'krossade tomater', re: /krossade? tomat/ },
  { id: 'olja', pack: 500, base: 59, q: 'olivolja', re: /olivolja/, not: /spray|tapenade|sardin|tonfisk|sallad/ },
  { id: 'kokos', pack: 400, base: 22, q: 'kokosmjölk', re: /kokosmjölk|kokosgrädde/ },
  { id: 'soja', pack: 150, base: 25, q: 'sojasås', re: /sojasås|soyasås|soya sauce|soy sauce/ },
  { id: 'puree', pack: 140, base: 13, q: 'tomatpuré', re: /tomatpuré/ },
  { id: 'curry', pack: 110, base: 19, q: 'currypasta', re: /currypasta|röd curry/ },
  { id: 'taco', pack: 28, base: 12, q: 'tacokrydda', re: /tacokrydda|tacomix|taco.*krydd/, not: /kit|skal|sås/ },
  { id: 'salsa', pack: 230, base: 22, q: 'salsa', re: /salsa/, not: /chips|dip|nachos|kit|tortilla/ },
  { id: 'jordnot', pack: 350, base: 29, q: 'jordnötssmör', re: /jordnötssmör/ },
  { id: 'notter', pack: 200, base: 29, q: 'mandlar', re: /mandlar|(^|\s)mandel(\s|,|$)/, not: /mjölk|dryck|kaka|smör|massa|bakelse|choklad|glass/ }
];

export function storeOf(name) {
  const n = String(name || '').toLowerCase();
  if (/willys/.test(n)) return 'willys';
  if (/city\s*gross/.test(n)) return 'citygross';
  if (/ica.*kvantum/.test(n)) return 'kvantum';
  if (/ica.*maxi/.test(n)) return 'maxi';
  if (/lidl/.test(n)) return 'lidl';
  return null;
}

const UNIT_G = { g: 1, kg: 1000, ml: 1, cl: 10, dl: 100, l: 1000 };
function offerGrams(o) {
  const q = o.quantity || {};
  const sym = String((q.unit && (q.unit.symbol || (q.unit.si && q.unit.si.symbol))) || '').toLowerCase();
  const from = Number(q.size && q.size.from), to = Number(q.size && q.size.to);
  const size = from && to ? (from + to) / 2 : from || to;
  if (size && UNIT_G[sym]) return size * UNIT_G[sym];
  return null;
}

// Uppenbart icke-livsmedel i en matbutiks reklamblad
const NONFOOD = /tvättmedel|sköljmedel|blöj|hygien|schampo|tandkräm|tandborste|deodorant|rakhyvel|hushållspapper|toalettpapper|servett|kattmat|hundmat|kattsand|batteri|glödlampa|trädgård|kläder|strumpor|leksak|disktrasa|diskmedel|soppås|folie|grillkol|tändvätska|blomma|kruka|present|bok |tidning|spel |mobil|hörlurar|lakan|handduk|ljus\b|solkräm|plåster|värktablett|vitamin|kosttillskott|snus|cigarett|tobak/;

export function isFood(text) { return !NONFOOD.test(text); }

// Tolkar rubriken: "3 för 2", "2 för 40 kr" och "max 2 per hushåll"
export function parseDeal(text, price) {
  const max = (text.match(/max\.?\s*(\d+)/) || [])[1];
  const m = text.match(/(\d+)\s*för\s*(\d+)/);
  let kind = 'price', buy = 0, pay = 0, unit = price;
  if (m) {
    const x = +m[1], y = +m[2];
    if (x >= 2 && y < x && x <= 6) { kind = 'multi'; buy = x; pay = y; }
    else if (x >= 2 && y >= x) { kind = 'multi'; buy = x; pay = x; unit = Math.abs(price - y) < 0.5 ? y / x : price; }
  }
  return { kind, buy, pay, price: unit, max: max ? +max : 0 };
}

export function matchProduct(text) {
  for (const r of RULES) {
    if (r.re.test(text) && !(r.not && r.not.test(text)) && (!r.req || r.req.test(text))) return r;
  }
  return null;
}

const day = d => (d ? String(d).slice(0, 10) : null);
const num = v => { const n = Number(String(v).replace(',', '.')); return n > 0 ? n : null; };

// Ordinarie pris per förpackning, och vad vi vet om det.
// reg: priset. regSrc: 'pre' fältet pre_price, 'text' ur rubriken, 'spara' räknat ur "spara X kr", null okänt.
function ordinaryPrice(item, text, unitEff, deal) {
  const pre = num(item.pricing && item.pricing.pre_price);
  if (pre) {
    if (pre > unitEff) return { reg: Math.round(pre * 100) / 100, src: 'pre' };
    if (deal.buy > 1 && pre / deal.buy > unitEff) return { reg: Math.round(pre / deal.buy * 100) / 100, src: 'pre' };
  }
  const ord = text.match(/ord(?:inarie|\.)?\s*pris[:\s]*([0-9]+(?:[.,][0-9]+)?)/);
  if (ord && num(ord[1]) > unitEff) return { reg: num(ord[1]), src: 'text' };
  const save = text.match(/spara\s*([0-9]+(?:[.,][0-9]+)?)/);
  if (save && num(save[1])) return { reg: Math.round((unitEff + num(save[1])) * 100) / 100, src: 'spara' };
  return { reg: null, src: null };
}

// Gör om råa erbjudanden till appens format.
// Priser och förpackningar är flygbladets egna och räknas aldrig om.
// Allt livsmedel behålls. Saknas ordinarie pris eller vikt märks det som uppskattat i appen.
export function normalize(rawOffers, now = new Date()) {
  const best = {}, all = [], seenId = new Set();
  const stats = { seen: 0, foreign: 0, store: 0, nonfood: 0, expired: 0, matched: 0, withReg: 0 };
  for (let item of rawOffers) {
    item = item.offer || item;
    stats.seen++;
    const cur = item.pricing && item.pricing.currency;
    const dc = item.dealer && item.dealer.country;
    const country = String((dc && (dc.id || dc)) || item.country || '').toUpperCase();
    if ((cur && String(cur).toUpperCase() !== 'SEK') || (country && country !== 'SE')) { stats.foreign++; continue; }
    const dealer = (item.dealer && item.dealer.name) || (item.branding && item.branding.name) || '';
    const store = storeOf(dealer);
    if (!store) continue;
    stats.store++;
    const heading = String(item.heading || item.name || '');
    const text = (heading + ' ' + String(item.description || '')).toLowerCase();
    if (!isFood(text)) { stats.nonfood++; continue; }
    const price = Number(item.pricing ? item.pricing.price : item.price);
    if (!(price > 0)) continue;
    const from = day(item.run_from), until = day(item.run_till || item.valid_until);
    if (until && new Date(until + 'T23:59:59') < now) { stats.expired++; continue; }
    if (from && new Date(from + 'T00:00:00') > new Date(now.getTime() + 3 * 864e5)) continue;
    const id = String(item.id || item.offer_id || (store + ':' + heading + ':' + price));
    if (seenId.has(id)) continue;
    seenId.add(id);

    const deal = parseDeal(text, price);
    const eff = deal.kind === 'multi' ? deal.price * deal.pay / deal.buy : deal.price;
    const { reg, src } = ordinaryPrice(item, text, eff, deal);
    const g = offerGrams(item);
    const packG = g && g >= 20 && g <= 10000 ? Math.round(g) : null;
    const rule = matchProduct(text);
    const rec = {
      id, store, heading: heading.slice(0, 90),
      kind: deal.kind, price: Math.round(deal.price * 100) / 100,
      buy: deal.buy, pay: deal.pay, max: deal.max,
      reg: reg || 0, regSrc: src || '', packG: packG || 0,
      qty: String((item.quantity && item.quantity.size && item.quantity.size.from) || '') &&
           ((item.quantity.size.from === item.quantity.size.to ? item.quantity.size.from : item.quantity.size.from + '-' + item.quantity.size.to) +
            ' ' + ((item.quantity.unit && (item.quantity.unit.symbol || (item.quantity.unit.si && item.quantity.unit.si.symbol))) || '')).trim(),
      from, until, pid: rule ? rule.id : ''
    };
    if (reg) stats.withReg++;
    all.push(rec);
    if (!rule) continue;
    stats.matched++;
    const perG = eff / (packG || rule.pack);
    const key = store + '|' + rule.id;
    if (!best[key] || perG < best[key].perG) best[key] = { perG, offer: rec };
  }
  const offers = Object.values(best).map(b => b.offer);
  return { offers, all, stats };
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const headers = () => {
  const h = { Accept: 'application/json', 'User-Agent': 'veckohandla-hobbyprojekt (en gang per dygn)' };
  if (process.env.TJEK_API_KEY) h['X-Api-Key'] = process.env.TJEK_API_KEY;
  return h;
};
let shown = false;
async function get(path, params) {
  const url = new URL(BASE + path);
  Object.entries(params || {}).forEach(([k, v]) => url.searchParams.set(k, String(v)));
  const res = await fetch(url, { headers: headers() });
  if (res.status === 401 || res.status === 403) {
    throw new Error(`Tjek svarade ${res.status}. Tjänsten kräver troligen en API-nyckel. Se README, avsnittet Om det inte fungerar.`);
  }
  if (!res.ok) throw new Error(`Tjek svarade ${res.status} på ${url}`);
  const j = await res.json();
  if (process.env.DEBUG && !shown) {
    shown = true;
    console.log('Exempel på rått svar:\n', JSON.stringify(Array.isArray(j) ? j[0] : j, null, 2).slice(0, 2500));
  }
  return Array.isArray(j) ? j : (j.data || j.offers || j.catalogs || j.results || []);
}

// Läser hela reklambladen hos dina butiker, inte bara enstaka sökord.
// Läser hela reklambladen hos dina butiker inom ett område. Returnerar erbjudanden och vilka butiker som finns där.
async function fetchArea(area) {
  const r = { r_lat: area.lat, r_lng: area.lng, r_radius: Math.round((area.radie_km || 10) * 1000) };
  const cats = await get('/catalogs', { ...r, limit: 100 });
  const mine = cats.filter(c => storeOf((c.dealer && c.dealer.name) || (c.branding && c.branding.name) || ''));
  const present = [...new Set(mine.map(c => storeOf((c.dealer && c.dealer.name) || (c.branding && c.branding.name) || '')))];
  console.log(`${area.namn}: ${cats.length} reklamblad inom ${area.radie_km} km, varav ${mine.length} från dina butiker (${present.join(', ') || 'inga'}).`);
  const raw = [];
  if (!mine.length) {
    console.log(`${area.namn}: faller tillbaka på sökning per vara.`);
    for (const t of [...new Set(RULES.map(x => x.q))]) {
      raw.push(...await get('/offers/search', { query: t, ...r, limit: 100 }));
      await sleep(500);
    }
    return { raw, present: null };
  }
  for (const c of mine) {
    for (let offset = 0; offset < 1000; offset += 100) {
      const page = await get('/offers', { catalog_ids: c.id, limit: 100, offset });
      raw.push(...page.map(o => ({ dealer: c.dealer, ...o })));
      await sleep(400);
      if (page.length < 100) break;
    }
  }
  return { raw, present };
}

async function main() {
  const cfg = JSON.parse(readFileSync(AREAS_FILE, 'utf8'));
  const areas = (cfg.omraden || []).slice(0, 5);   // högst fem områden, för att hålla nere antalet anrop
  if (!areas.length) throw new Error('Inga områden i scripts/areas.json.');
  mkdirSync(DOCS, { recursive: true });
  const index = [];let ok = 0;
  for (const area of areas) {
    try {
      const { raw, present } = await fetchArea(area);
      const { offers, all, stats } = normalize(raw);
      const stores = present || [...new Set(all.map(o => o.store))];
      console.log(`${area.namn}: behöll ${all.length} livsmedelserbjudanden, ${stats.withReg} med ordinarie pris, ${offers.length} kopplade till appens varor.`);
      if (!all.length) throw new Error('inga erbjudanden');
      const updated = new Date().toISOString();
      const body = JSON.stringify({ updated, source: 'tjek', area: { id: area.id, namn: area.namn, radie_km: area.radie_km }, stores, offers, all }, null, 1);
      writeFileSync(DOCS + `offers-${area.id}.json`, body);
      if (area === areas[0]) writeFileSync(DOCS + 'offers.json', body);   // för äldre versioner av appen
      index.push({ id: area.id, namn: area.namn, radie_km: area.radie_km, stores, updated, antal: all.length });
      ok++;
    } catch (e) {
      console.error(`FEL för ${area.namn}: ${e.message}`);
      // behåll förra lyckade hämtningen för området, om den finns
      const old = DOCS + `offers-${area.id}.json`;
      if (existsSync(old)) { try { const j = JSON.parse(readFileSync(old, 'utf8')); index.push({ id: area.id, namn: area.namn, radie_km: area.radie_km, stores: j.stores || [], updated: j.updated, antal: (j.all || []).length, gammal: true }); } catch (x) { /* hoppa över */ } }
      else index.push({ id: area.id, namn: area.namn, radie_km: area.radie_km, stores: [], updated: null, antal: 0 });
    }
    await sleep(1000);
  }
  writeFileSync(DOCS + 'areas.json', JSON.stringify({ updated: new Date().toISOString(), areas: index }, null, 1));
  console.log(`Klart: ${ok} av ${areas.length} områden hämtade.`);
  if (!ok) throw new Error('Inget område kunde hämtas. Kör med DEBUG=1 för att se hur svaret ser ut.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(e => { console.error('FEL:', e.message); process.exit(1); });
}
