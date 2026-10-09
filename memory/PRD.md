# PRD – Douchebeslag Voorraad (Expo + FastAPI + MongoDB)

## Originele opdracht
Nederlandstalige mobiele voorraadbeheer-app voor ±300 artikelen douchebeslag: artikelenbeheer, barcode/QR-scannen via telefooncamera, voorraadmutaties (ontvangst, afboeken, retour, correctie) met controleerbare historie, dashboard, gebruikers & rechten, uitbreidbaar naar projecten/reserveringen.

## Keuzes gebruiker
- E-mail + wachtwoord (JWT); beheerder maakt accounts aan
- Rollen: Beheerder (alles + artikelen/barcodes/gebruikers), Magazijn (+ ontvangst/correctie), Monteur (afboeken/retour)
- Geen CSV-import nu (datastructuur voorbereid); 20 demo-artikelen; licht thema donkerblauw/grijs

## Architectuur
- Backend `/app/backend/server.py`: collections users, articles (unieke index artikelnummer + unieke multikey index barcodes), mutations (onveranderlijk grootboek, unieke client_request_id voor idempotentie), reservations (voorbereid; gereserveerd = som actieve reserveringen), project_id op mutaties
- Atomische boeking: mutatie vastleggen → conditionele $inc (geen negatieve voorraad) → afronden; correctie met optimistische lock; afgewezen pogingen blijven als 'afgewezen'
- Frontend: expo-router, tabs Dashboard/Artikelen/Scannen/Mutaties (NativeTabs op iOS 26+), artikel/[id], artikel-form, koppel, profiel, gebruikers; expo-camera scanner + handmatige invoer

## Geïmplementeerd (okt 2026)
- Login/rollen, dashboard, artikelen zoeken/filteren, artikeldetail (fysiek/gereserveerd/beschikbaar), mutatie-sheet, mutatiehistorie, scanner met permissie-afhandeling, onbekende barcode koppelen (beheerder), artikel aanmaken/bewerken, gebruikersbeheer
- Getest: 32/32 backend-tests, alle frontend-flows (incl. 10 gelijktijdige afboekingen → nooit negatief)

## Iteratie 2 (okt 2026)
- Demo- en testartikelen + bijbehorende mutaties verwijderd; demo-seed van artikelen uit startup gehaald (gebruikers blijven; 2 testaccounts @test.local gedeactiveerd)
- Excel-import (/import, beheerder): voorbeeldbestand, preview met foutmeldingen, dubbele codes (bestand + database) overgeslagen, resultaatoverzicht. Kolommen: Artikelnaam→name, Artikelcode→article_number, Artikelbeschrijving→description, Hoeveelheid→beginvoorraad, Categorie, Minimumhoeveelheid
- Beginvoorraad = één mutatie type 'beginvoorraad' (geen ontvangst), ook bij handmatig aanmaken
- SVG-barcode per artikel (Emergent Object Storage), met aparte barcodewaarde (in barcodes, uniek); vervangen/verwijderen; scan toont overeenkomst-banner
- Nieuw veld Artikelnaam (optioneel) in artikelformulier

## Iteratie 3 (okt 2026) – Projectreserveringen
- reservations + reservation_events (onveranderlijke historie); articles.reserved_stock atomisch bijgehouden; beschikbaar = fysiek − gereserveerd
- Alleen admin: aanmaken/wijzigen/opheffen/voltooien (backend 403 voor anderen); iedereen mag bekijken
- Afboeken optioneel op reservering: fysiek daalt, reservering daalt, beschikbaar niet dubbel; vrij afboeken beperkt tot beschikbaar
- UI: sectie Reserveringen op artikeldetail, segment Reserveringen in Mutaties-tab, projectkeuze in afboeken-sheet

## Backlog
- P1: CSV/Excel-import artikelen; projecten + reserveringen; wachtwoord wijzigen
- P2: inkomende bestellingen, verbruiksanalyse, besteladvies bij lange levertijden, export mutaties
