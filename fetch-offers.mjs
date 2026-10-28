// Hämtar veckans erbjudanden nära Hässleholm och sparar dem som docs/offers.json
// i det format som Veckohandla-appen läser. Kräver Node 18 eller nyare, inga paket.
//
// Miljövariabler (alla valfria):
//   TJEK_API_KEY  nyckel om tjänsten kräver en (skickas som headern X-Api-Key)
//   TJEK_API_URL  annan adress än standard
//   LAT, LNG      sökpunkt (standard: Hässleholm)
//   RADIUS        sökradie i meter (standard: 10000)
//   DEBUG=1       skriv ut hur ett rått svar ser ut, för felsökning

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const API = process.env.TJEK_API_URL || 'https://squid-api.tjek.com/v2/offers/search';
const LAT = process.env.LAT || '56.1589';
const LNG = process.env.LNG || '13.7661';
const RADIUS = process.env.RADIUS || '10000';
const OUT = fileURLToPath(new URL('../docs/offers.json', import.meta.url));

// id, förpackning i gram (samma som i appen), sökord, regex som måste matcha, regex som inte får matcha,
// req = extra krav i texten (t.ex. laktosfri eller fryst)
const LF = /laktos|lactose|lactofree|minilac/;
const FROZEN = /fryst|frysta|djupfryst/;
const RULES = [
  { id: 'kyckling', pack: 900, q: 'kycklingfilé', re: /kyckling(fil[eé]|bröst)|kyckling.*(fil[eé]|bröst)/, not: /panerad|marinerad|krydd|fryst|strimlor|färdig|grillad|rökt/ },
  { id: 'notfars', pack: 500, q: 'nötfärs', re: /nötfärs/, not: /plant|vegan|växtbaserad/ },
  { id: 'kalkonfars', pack: 500, q: 'kalkonfärs', re: /kalkonfärs/ },
  { id: 'flaskfile', pack: 500, q: 'fläskfilé', re: /fläskfil[eé]/, not: /marinerad|panerad|rökt/ },
  { id: 'lax', pack: 600, q: 'laxfilé', re: /laxfil[eé]|lax.*fil[eé]/, not: /rökt|gravad|kallrökt|varmrökt|sushi|panerad/ },
  { id: 'torsk', pack: 600, q: 'torsk', re: /torsk/, not: /panerad|stekt|stav|rökt|lutfisk|rom/ },
  { id: 'rakor', pack: 500, q: 'räkor', re: /räk(or|a)\b/, not: /sallad|smörgås|majonnäs|rom|chips/ },
  { id: 'agg', pack: 660, q: 'ägg', re: /(^|\s)ägg(\s|,|$)/, not: /nudlar|äggrulle|tårta|äggost|påsk/ },
  { id: 'tofu', pack: 400, q: 'tofu', re: /tofu/ },
  { id: 'keso', pack: 500, q: 'keso', re: /keso|cottage/, req: LF },
  { id: 'grekyog', pack: 500, q: 'grekisk yoghurt', re: /grekisk.*yoghurt|yoghurt.*grekisk/, req: LF },
  { id: 'kvarg', pack: 500, q: 'kvarg', re: /kvarg/, not: /dessert|choklad/ },
  { id: 'feta', pack: 200, q: 'fetaost', re: /fetaost|(^|\s)feta(\s|,|$)/ },
  { id: 'mjolk', pack: 1000, q: 'laktosfri mjölk', re: /mjölk/, not: /havre|soja|mandel|kokos|choklad|ris|sojamjölk|jäst/, req: LF },
  { id: 'gradde', pack: 200, q: 'matlagningsgrädde', re: /matlagningsgrädde|grädde/, not: /glass|visp|dessert/, req: LF },
  { id: 'potatis', pack: 2000, q: 'potatis', re: /potatis/, not: /chips|sötpotatis|pommes|mos|gratäng|klyftor|rostad|fryst|färdig|sallad|kroketter/ },
  { id: 'sotpotatis', pack: 1000, q: 'sötpotatis', re: /sötpotatis/, not: /pommes|fryst|klyft/ },
  { id: 'paprika', pack: 500, q: 'paprika', re: /paprika/, not: /krydda|pulver|fylld|rostad|burk|strimlad|chips|pesto/ },
  { id: 'lok', pack: 1000, q: 'gul lök', re: /gul lök|lök gul|(^|\s)lök(\s|,|$)/, not: /vitlök|rödlök|salladslök|purjo|stekt|krispig|pulver/ },
  { id: 'vitlok', pack: 100, q: 'vitlök', re: /vitlök/, not: /pulver|krydd|dressing|sås|baguette|bröd|rostad|pasta|smör/ },
  { id: 'morot', pack: 1000, q: 'morötter', re: /morot|morötter/, not: /juice|kaka|sallad|rivna|fryst|baby/ },
  { id: 'gurka', pack: 350, q: 'gurka', re: /gurka/, not: /inlagd|saltgurka|picklad|syltgurka|smörgåsgurka|relish/ },
  { id: 'tomat', pack: 500, q: 'tomater', re: /(^|\s)tomat(er)?(\s|,|$)|körsbärstomat|kvisttomat|romantomat|salladstomat/, not: /krossad|passerad|hackad|puré|ketchup|soltork|sås|soppa/ },
  { id: 'champinjon', pack: 250, q: 'champinjoner', re: /champinjon/, not: /soppa|sås|konserv|burk/ },
  { id: 'banan', pack: 1000, q: 'bananer', re: /banan/, not: /chips|bröd|mjölk|yoghurt|kaka|choklad|torkad|glass/ },
  { id: 'brod', pack: 700, q: 'fullkornsbröd', re: /fullkornsbröd|fullkorn.*bröd|(^|\s)bröd(\s|,|$)|limpa/, not: /knäckebröd|tunnbröd|vitlöksbröd|brödmix|hamburger|korv/ },
  { id: 'tortilla', pack: 320, q: 'tortilla', re: /tortilla|wraps?\b/, not: /chips|tacoskal|mix|kit|sås/ },
  { id: 'broccoli', pack: 600, q: 'broccoli fryst', re: /broccoli/, not: /soppa|gratäng|paj/, req: FROZEN },
  { id: 'wok', pack: 600, q: 'wokgrönsaker', re: /wok/, not: /sås|nudlar|krydda|kit|panna/, req: FROZEN },
  { id: 'spenat', pack: 450, q: 'spenat fryst', re: /spenat/, not: /pannkak|lasagne|paj|soppa/, req: FROZEN },
  { id: 'bar', pack: 500, q: 'frysta bär', re: /(^|\s)bär|hallon|blåbär|jordgubb|skogsbär/, not: /sylt|juice|dryck|glass|bars|energi|saft/, req: FROZEN },
  { id: 'kikartor', pack: 380, q: 'kikärtor', re: /kikärtor/, not: /hummus|mjöl|rostade|snack/ },
  { id: 'bonor', pack: 380, q: 'svarta bönor', re: /svarta bönor/, not: /sås|chili|pasta/ },
  { id: 'linser', pack: 500, q: 'röda linser', re: /röda linser|linser.*röda/ },
  { id: 'ris', pack: 1000, q: 'jasminris', re: /jasmin.*ris|jasminris/, not: /snabb|portion|kokt/ },
  { id: 'pasta', pack: 500, q: 'pasta', re: /(^|\s)pasta(\s|,|$)|spaghetti|penne|makaroner|fusilli|tagliatelle/, not: /fullkorn|färsk|sås|sallad|gratäng|fylld|bolognese|lasagne|panini|carbonara|glutenfri/ },
  { id: 'fkpasta', pack: 500, q: 'fullkornspasta', re: /fullkorns?(pasta|spaghetti|penne|makaroner|fusilli)|pasta.*fullkorn/ },
  { id: 'couscous', pack: 500, q: 'couscous', re: /couscous/, not: /sallad/ },
  { id: 'havre', pack: 1000, q: 'havregryn', re: /havregryn/, not: /müsli|granola|bar\b|gröt/ },
  { id: 'majs', pack: 340, q: 'majs', re: /majs/, not: /chips|popcorn|mjöl|stärkelse|bröd|tortilla|snack|ringar/ },
  { id: 'krossad', pack: 400, q: 'krossade tomater', re: /krossade? tomat/ },
  { id: 'olja', pack: 500, q: 'olivolja', re: /olivolja/, not: /spray|tapenade|sardin|tonfisk|sallad/ },
  { id: 'kokos', pack: 400, q: 'kokosmjölk', re: /kokosmjölk|kokosgrädde/ },
  { id: 'soja', pack: 150, q: 'sojasås', re: /sojasås|soyasås|soya sauce|soy sauce/ },
  { id: 'puree', pack: 140, q: 'tomatpuré', re: /tomatpuré/ },
  { id: 'curry', pack: 110, q: 'currypasta', re: /currypasta|röd curry/ },
  { id: 'taco', pack: 28, q: 'tacokrydda', re: /tacokrydda|tacomix|taco.*krydd/, not: /kit|skal|sås/ },
  { id: 'salsa', pack: 230, q: 'salsa', re: /salsa/, not: /chips|dip|nachos|kit|tortilla/ },
  { id: 'jordnot', pack: 350, q: 'jordnötssmör', re: /jordnötssmör/ },
  { id: 'notter', pack: 200, q: 'mandlar', re: /mandlar|(^|\s)mandel(\s|,|$)/, not: /mjölk|dryck|kaka|smör|massa|bakelse|choklad|glass/ }
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

// Gör om råa erbjudanden till appens format. Ett erbjudande per butik och vara (det billigaste).
export function normalize(rawOffers, now = new Date()) {
  const best = {};
  const stats = { seen: 0, store: 0, product: 0, valid: 0 };
  for (let item of rawOffers) {
    item = item.offer || item;
    stats.seen++;
    const dealer = (item.dealer && item.dealer.name) || (item.branding && item.branding.name) || '';
    const store = storeOf(dealer);
    if (!store) continue;
    stats.store++;
    const heading = String(item.heading || item.name || '');
    const text = (heading + ' ' + String(item.description || '')).toLowerCase();
    const rule = matchProduct(text);
    if (!rule) continue;
    stats.product++;
    const price = Number(item.pricing ? item.pricing.price : item.price);
    if (!(price > 0)) continue;
    const from = day(item.run_from), until = day(item.run_till || item.valid_until);
    if (until && new Date(until + 'T23:59:59') < now) continue;
    if (from && new Date(from + 'T00:00:00') > new Date(now.getTime() + 3 * 864e5)) continue;
    stats.valid++;
    const deal = parseDeal(text, price);
    // Räkna om till appens förpackningsstorlek när mängden är angiven
    const g = offerGrams(item);
    let unitPrice = deal.price;
    if (g && g > 0) {
      const ratio = rule.pack / g;
      if (ratio > 0.25 && ratio < 4) unitPrice = deal.price * ratio;
    }
    unitPrice = Math.round(unitPrice * 100) / 100;
    const eff = deal.kind === 'multi' ? unitPrice * deal.pay / deal.buy : unitPrice;
    const key = store + '|' + rule.id;
    if (!best[key] || eff < best[key].eff) {
      best[key] = {
        eff,
        offer: {
          store, pid: rule.id, kind: deal.kind, price: unitPrice, buy: deal.buy, pay: deal.pay,
          max: deal.max, from, until, heading: heading.slice(0, 80)
        }
      };
    }
  }
  const offers = Object.values(best).map((b, i) => ({ id: 'L' + i, ...b.offer }));
  return { offers, stats };
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchTerm(term) {
  const url = new URL(API);
  url.searchParams.set('query', term);
  url.searchParams.set('r_lat', LAT);
  url.searchParams.set('r_lng', LNG);
  url.searchParams.set('r_radius', RADIUS);
  url.searchParams.set('limit', '100');
  const headers = { Accept: 'application/json', 'User-Agent': 'veckohandla-hobbyprojekt (en gång per dygn)' };
  if (process.env.TJEK_API_KEY) headers['X-Api-Key'] = process.env.TJEK_API_KEY;
  const res = await fetch(url, { headers });
  if (res.status === 401 || res.status === 403) {
    throw new Error(`Tjek svarade ${res.status}. Tjänsten kräver troligen en API-nyckel. Se README, avsnittet Om det inte fungerar.`);
  }
  if (!res.ok) throw new Error(`Tjek svarade ${res.status} på ${url}`);
  const j = await res.json();
  if (process.env.DEBUG && !fetchTerm.shown) {
    fetchTerm.shown = true;
    console.log('Exempel på rått svar:\n', JSON.stringify(Array.isArray(j) ? j[0] : j, null, 2).slice(0, 2500));
  }
  return Array.isArray(j) ? j : (j.offers || j.results || []);
}

async function main() {
  const terms = [...new Set(RULES.map(r => r.q))];
  const raw = [];
  for (const t of terms) {
    raw.push(...await fetchTerm(t));
    await sleep(500); // snällt tempo, en förfrågan i taget
  }
  const { offers, stats } = normalize(raw);
  console.log(`Hämtade ${stats.seen} erbjudanden. ${stats.store} från dina butiker, ${stats.product} matchade en vara, ${stats.valid} gällde nu.`);
  const perStore = {};
  offers.forEach(o => { perStore[o.store] = (perStore[o.store] || 0) + 1; });
  console.log('Per butik:', perStore);
  if (!offers.length) {
    throw new Error('Inga användbara erbjudanden hittades, så ingen fil skrevs. Kör med DEBUG=1 för att se hur svaret ser ut.');
  }
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify({ updated: new Date().toISOString(), source: 'tjek', offers }, null, 1));
  console.log(`Skrev ${offers.length} erbjudanden till docs/offers.json`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(e => { console.error('FEL:', e.message); process.exit(1); });
}
