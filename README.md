# Veckohandla

Planerar veckans mat och inköp utifrån kampanjer i Hässleholm. Appen ligger i `docs/`, och ett nattligt jobb hämtar erbjudanden till `docs/offers.json`.

## Så sätter du upp det (ca 10 minuter)

1. **Skapa ett konto** på github.com om du inte har ett.
2. **Skapa ett nytt repository** (plustecknet uppe till höger, New repository). Namn: `veckohandla`. Välj **Public**, eftersom GitHub Pages är gratis för publika repon. Appen sparar all din personliga data i din egen webbläsare, så ingenting privat hamnar i repot.
3. **Ladda upp filerna.** På repots sida: Add file, Upload files, och dra in *innehållet* i den här mappen (`docs`, `scripts`, `.github`, `README.md`, `.gitignore`). Tryck Commit changes.
   - Syns inte mappen `.github` efter uppladdningen (den är dold på vissa datorer)? Gå då till Add file, Create new file, skriv `.github/workflows/offers.yml` som filnamn och klistra in filens innehåll.
4. **Slå på publicering.** Settings, Pages, under Source välj **GitHub Actions**.
5. **Starta första körningen.** Fliken Actions, välj *Uppdatera erbjudanden och publicera* i listan till vänster, tryck Run workflow. Det tar någon minut.
6. **Öppna appen** på `https://DITT-ANVÄNDARNAMN.github.io/veckohandla/`. Under fliken Erbjudanden ska det stå att erbjudandena är hämtade. Spara adressen som bokmärke eller lägg den på startskärmen i mobilen.

Efter det uppdateras erbjudandena automatiskt varje natt.

## Recept från ReceptAPI

Under fliken Recept finns **Hitta recept**. Sökningen går direkt från din webbläsare till [ReceptAPI](https://receptapi.se), så inget behöver ställas in på GitHub.

1. Sök på ett ord, till exempel kyckling, och välj kategori.
2. Välj måltid och tryck Lägg till. Appen hämtar receptet, kopplar ingredienserna till varor i appen och räknar om mängder (dl, msk, st) till gram.
3. Receptet ligger sedan bland dina egna recept och skalas mot dina kalori- och proteinmål precis som basreceptet.

Gränser och regler att känna till:

- Utan nyckel gäller **50 sökningar och hämtningar per dag**, och bara från IP-adresser i Norden. Med en gratisnyckel (receptapi.se/priser, `rapi_...`) får du 100 per dag. Lägg in den under Inställningar. Varje sökning och varje tillagt recept räknas som ett anrop.
- Gratisnivån kräver **attribution**. Appen visar därför "Data från ReceptAPI – receptapi.se" och länk till originalreceptet på varje hämtat recept.
- Villkoren förbjuder massnedladdning av hela receptbanken. Därför hämtar appen bara de recept du själv väljer, en i taget, och sparar bara ingredienser, mängder och tid, inte receptens texter.
- Recepten kommer från olika källor och varje recept visar sin. Jag har sett ICA och Tasteline. Om Köket finns med avgör ReceptAPI, så kolla källan på receptkortet.
- Ett recept läggs bara till om minst hälften av ingredienserna kan kopplas till appens varor. Det som inte kan kopplas, till exempel ananas, hamnar under "Utan pris i appen" på inköpslistan. Kryddor och salt räknas som hemma.
- Näringsvärden räknas från appens varulista, inte från receptkällan, och är därför uppskattningar.
- Funktionen fungerar bara när appen ligger på GitHub Pages (eller annan vanlig webbadress), inte i förhandsvisningen i Claude.

## Erbjudanden, priser och inköpslista

Skriptet läser **hela reklambladen** hos dina fem butiker, inte bara enstaka sökord, och behåller allt som är livsmedel. Uppenbart icke-livsmedel (tvättmedel, blöjor, batterier och liknande) sorteras bort.

- **Priser räknas aldrig om.** Flygbladets eget pris och egen förpackning visas som de står, till exempel "Torskfilé 350 g, 2 för 240 kr". Under varje erbjudande står i klartext vad priset gäller: per förpackning, per styck vid flerköp, förpackningens storlek, ordinarie pris och "du sparar" när det finns.
- **Ordinarie pris** tas från Tjeks fält `pre_price` eller ur texten ("ord. pris 149", "spara 30 kr"). Saknas det behålls erbjudandet ändå, men märks "Ordinarie pris saknas i bladet, uppskattat till ...". Sådana erbjudanden används inte när appen sätter ihop kampanjrecept.
- **Egna kampanjer** kan få ordinarie pris och förpackning, men fälten är frivilliga.

Under **Erbjudanden** ser du alla livsmedelserbjudanden per butik, med sökruta och filter. Kryssar du i ett erbjudande hamnar det på inköpslistan och väger tungt när appen väljer recept, utan att vara ett krav.

**Inköpslistan** visar hur mycket du behöver, inte vad det kostar: antal för ägg, bröd och grönsaker som räknas i styck, dl eller liter för vätskor och vikt för resten. Varor med erbjudande ligger under sin butik med en gul etikett som visar hur många erbjudanden butiken har i veckans plan. Övriga varor ligger under Övrigt, eftersom appen inte kan hämta butikernas ordinarie priser och därför inte kan jämföra dem. Av samma skäl finns ingen totalsumma, och butiksförslaget rankas på **antal fynd** i stället för på kronor. Du väljer själv om du vill handla i en, två eller tre butiker, eller låter appen välja. Fler än tre butiker föreslås aldrig.

## Skafferi och kyl

Bocka för det du har hemma så tas det bort från inköpslistan. Saknas en vara i listan skriver du in den, väljer kategori (samma kategorier som i listan, plus Övrigt) och trycker Lägg till. Små stavfel och böjningar spelar ingen roll: finns varan redan i appens lista kryssas den i där, annars läggs den till under kategorin du valt. Kategorin kan bytas i efterhand.

En ikryssad egen vara hamnar aldrig på inköpslistan. Ingredienser från recept som matchar den, till exempel "Fisksås" mot din "fisksas", tas bort från listan, och listan visar bara hur många som finns hemma. Vanliga ord som "laktosfri" och "fryst" räknas inte som matchning, så "laktosfri mjölk" tar inte bort laktosfri keso.

## Näringsvärden och portioner

**Varför inte Lifesum:** Lifesum har inget öppet API för utvecklare. En del av deras svenska data kommer från Livsmedelsverket, och det kopplas nu in direkt.

**Livsmedelsverket:** skriptet `scripts/fetch-nutrition.mjs` hämtar kcal, protein, kolhydrater och fett per 100 g för appens varor från Livsmedelsdatabasen. Ingen nyckel behövs. Det körs högst en gång i veckan i samma nattliga jobb och sparar `docs/nutrition.json`, som appen läser vid start. Misslyckas hämtningen blir det en gul varning, inte en röd körning, och appen använder sina egna värden. Loggen skriver då ut exakt vilken adress som anropades och vad Livsmedelsverket svarade. Skriptet väljer råa och okokta varianter (rå kycklingfilé, okokt ris) och kontrollerar att energin stämmer med protein, kolhydrater och fett. Loggen visar vilken post i databasen varje vara kopplades till. Ser en koppling fel ut, lägg in rätt livsmedelsnummer i `scripts/nutrition-overrides.json`, till exempel `{"kyckling": 1234}`, och kör om med `FORCE=1`. Under **Inställningar, Näringsvärden** ser du vilken post hos Livsmedelsverket varje vara och varje okänd receptingrediens kopplats till. Ser en koppling fel ut trycker du **Ändra**, söker bland alla livsmedel och väljer rätt post. För appens varor kan du också välja appens eget värde, och för okända ingredienser "Inget näringsvärde". **Automatiskt** går tillbaka till appens egen matchning. Det finns även en växel för att använda appens egna värden för alla varor i stället för Livsmedelsverkets. Du kan också **ange egna värden** per 100 g (kcal, protein, kolhydrater, fett) för en vara eller en okänd ingrediens. Appen stoppar orimliga värden, till exempel mer än 100 g näringsämnen per 100 g, och frågar om energin inte stämmer med protein, kolhydrater och fett. Egna värden går alltid före Livsmedelsverkets. Dina val sparas och följer med i delningskoden.

**Lägg till vara:** under samma rubrik kan du lägga till fler varor. Sök fram ett livsmedel hos Livsmedelsverket så fylls värdena i, eller skriv in dem själv. Ange namn, kategori, typ i recept (protein, kolhydrat, grönsak eller övrigt), förvaring och förpackningsstorlek. Varan fungerar sedan som appens övriga varor: den syns i skafferiet under sin kategori, kan väljas i egna recept, kopplas till ingredienser med samma namn i hämtade recept (även recept du redan sparat) och till erbjudanden med samma namn. Tar du bort en vara blir den en vanlig ingrediens igen i recepten. Egna varor följer med i delningskoden.

**Okända ingredienser:** skriptet hämtar också näringsvärden för hela Livsmedelsdatabasen, cirka 2 500 livsmedel, och sparar dem kompakt i samma fil (ungefär 100 KB). Ingredienser från recept som inte finns i appens varulista, till exempel mango, lime och fisksås, slås sedan upp direkt i appen utan nätverksanrop. Matchningen föredrar råa varor och färre extraord, så "Mango" blir "Mango rå" och inte mangochutney. Under Mängder per person visas vilken post varje ingrediens kopplades till, så du kan se om den gissat fel. Hela tabellen tar några minuter att hämta, men görs bara en gång i veckan. Sätt `FULL=0` för att bara hämta appens egna varor.

Data: Livsmedelsverket, Livsmedelsdatabasen, licens CC BY 4.0. Källan visas i appen, som licensen kräver.

**Portioner:** varje rätt skalas mot ditt kaloribehov men hålls inom realistiska gränser:
- Protein per rätt: 35–60 g för lunch och middag, 20–40 g för frukost, 10–25 g för mellanmål.
- Ingen ingrediens blir större än en normal portion, till exempel högst 250 g kycklingfilé, 130 g okokt ris eller 450 g potatis per person.
- Hela portionen skalas högst mellan 0,6 och 1,7 gånger receptets normalportion.

Det betyder att en stor person med högt proteinbehov inte får hela dagsbehovet i en enda middag, utan en rimlig portion. Resten fördelas på dagens övriga måltider.

**Rättat fel med absurda mängder:** recept där mängden saknade enhet, till exempel "600 kycklingfilé", tolkades som 600 *stycken* filéer. Ett tal över 12 utan enhet räknas nu som gram, och recept som redan sparats med fel mängd rättas automatiskt när appen startar.

## Kampanjrecept

Appen sätter själv ihop recept av veckans erbjudanden. Det finns tio beprövade rätttyper (wok, curry, pasta med köttfärssås, krämig pasta, ugnsrätt, tacos, chili, omelett, wrap och kvargskål). Varje typ har platser för protein, kolhydrat och grönsak, och appen provar de kombinationer som passar ihop och behåller de som har mest kampanjvaror i sig. Exempel: ligger kyckling på kampanj kan det bli kycklingwok med ris och broccoli. Recepten märks **Kampanjrecept**, har en kort beskrivning under Så gör du, skalas mot dina mål och kan väljas i veckoplanen som alla andra. De kostar inga anrop och kan stängas av under Inställningar.

Under Recept finns också knappen **Föreslå riktiga recept**. Den tar de tre proteinvaror som har störst rabatt, söker recept på ReceptAPI för var och en och visar de recept där mest av ingredienserna är på kampanj. Det kostar upp till 12 av dina dagliga anrop. Du väljer själv vilka som sparas.

## Dela med någon

Allt du väljer sparas i webbläsaren på den enhet du använder, så två personer som går in via samma länk har var sina uppgifter. Under **Inställningar, Dela med någon** kan du föra över dem:

1. Välj vad som ska följa med: personer och mål, inställningar, veckoplan, skafferi, valda erbjudanden, bockar på inköpslistan, betyg och historik, sparade recept, egna kampanjer och dina val av näringskällor.
2. Tryck **Skapa kod**. Kopiera koden eller länken och skicka den, till exempel i ett sms.
3. Mottagaren öppnar länken eller klistrar in koden under samma rubrik och väljer **Slå ihop med mina** eller **Ersätt mina**. Inget importeras förrän man har valt.

**Slå ihop** lägger ihop personer (efter namn), skafferi, valda erbjudanden, bockar, betyg, historik och sparade recept, och tar över inställningar och veckoplan. **Ersätt** skriver över allt som finns i koden.

Det är en kopia, inte en levande synk. Ändrar ni sedan var för sig syns det inte hos den andra, så skicka en ny kod när något ändrats. Din ReceptAPI-nyckel följer aldrig med. Koden komprimeras och blir oftast under ett par tusen tecken.

## Om det inte fungerar

Öppna Actions, klicka på den röda körningen och därefter steget *Hämta erbjudanden*. Där står vad som gick fel.

- **"Tjek svarade 401 eller 403"**: tjänsten kräver en nyckel. Kontakta Tjek (hello@tjek.com) och fråga om åtkomst. Får du en nyckel lägger du in den under Settings, Secrets and variables, Actions, New repository secret, med namnet `TJEK_API_KEY`.
- **"Inga användbara erbjudanden hittades"**: antingen saknar erbjudandena ordinarie pris (se loggraden "Utan känt ordinarie pris") eller så såg svaret annorlunda ut än skriptet väntar sig. Lägg till variabeln `DEBUG=1` på raden `run:` (`run: DEBUG=1 node scripts/fetch-offers.mjs`), kör igen och skicka loggens utskrift "Exempel på rått svar" till Claude, så justerar vi skriptet.
- **Appen visar exempeldata**: antingen har ingen hämtning lyckats ännu, eller så öppnar du filen direkt från datorn i stället för via adressen ovan.

## Att tänka på

- Skriptet läser Tjeks erbjudandetjänst, som är den som ligger bakom eReklamblad. Jag hittade ingen officiell dokumentation för publik användning i Sverige, så läs Tjeks villkor. Skriptet tar en förfrågan i taget och bara en gång per dygn.
- Erbjudanden är fri text och kopplas till appens varor med sökord. Någon enstaka vara kan matchas fel eller missas. Du kan rätta till för hand under Erbjudanden.
- Reklamblad anger bara kampanjpriser, så ordinarie priser i appen är uppskattningar.
- Om GitHub inte ser någon aktivitet i repot på två månader kan de schemalagda körningarna pausas. Då är det bara att trycka på Enable under Actions.
