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

## Om det inte fungerar

Öppna Actions, klicka på den röda körningen och därefter steget *Hämta erbjudanden*. Där står vad som gick fel.

- **"Tjek svarade 401 eller 403"**: tjänsten kräver en nyckel. Kontakta Tjek (hello@tjek.com) och fråga om åtkomst. Får du en nyckel lägger du in den under Settings, Secrets and variables, Actions, New repository secret, med namnet `TJEK_API_KEY`.
- **"Inga användbara erbjudanden hittades"**: svaret såg annorlunda ut än skriptet väntar sig. Lägg till variabeln `DEBUG=1` på raden `run:` (`run: DEBUG=1 node scripts/fetch-offers.mjs`), kör igen och skicka loggens utskrift "Exempel på rått svar" till Claude, så justerar vi skriptet.
- **Appen visar exempeldata**: antingen har ingen hämtning lyckats ännu, eller så öppnar du filen direkt från datorn i stället för via adressen ovan.

## Att tänka på

- Skriptet läser Tjeks erbjudandetjänst, som är den som ligger bakom eReklamblad. Jag hittade ingen officiell dokumentation för publik användning i Sverige, så läs Tjeks villkor. Skriptet tar en förfrågan i taget och bara en gång per dygn.
- Erbjudanden är fri text och kopplas till appens varor med sökord. Någon enstaka vara kan matchas fel eller missas. Du kan rätta till för hand under Erbjudanden.
- Reklamblad anger bara kampanjpriser, så ordinarie priser i appen är uppskattningar.
- Om GitHub inte ser någon aktivitet i repot på två månader kan de schemalagda körningarna pausas. Då är det bara att trycka på Enable under Actions.
