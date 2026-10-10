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

## Iteratie 4 (okt 2026) – Planning-tab
- Nieuw tabblad Planning met Projectreserveringen en Leveranciersbestellingen
- projects (unieke naam, status actief/vervallen); reserveringen gekoppeld via project_id; één actieve regel per project+artikel (unieke index); project aanmaken met meerdere regels (alles-of-niets), regel toevoegen, project vrijgeven
- supplier_orders met regels (besteld/ontvangen/open), statussen besteld/gedeeltelijk/volledig ontvangen, optimistische versie; binnenboeken idempotent (supplier_receipts) en als ontvangst-mutatie met supplier_order_number
- Alleen admin beheert; overige rollen alleen lezen (backend 403)

## Iteratie 5 (okt 2026) – Security-audit fixes
- Geen hard-coded seed-accounts; bootstrap-admin alleen bij lege users-collectie (must_change_password)
- Accounts met standaardwachtwoord moeten bij login wijzigen; /auth/change-password + token_version (oude tokens ongeldig); scherm /wachtwoord + knop in Profiel
- magazijn@/monteur@douchebeslag.nl gedeactiveerd; nieuwe/gereset accounts krijgen tijdelijk wachtwoord
- Login-throttling 5 mislukt/15 min per account (30 per IP); CORS via CORS_ORIGINS

## Backlog
- P1: CSV/Excel-import artikelen; projecten + reserveringen; wachtwoord wijzigen
- P2: inkomende bestellingen, verbruiksanalyse, besteladvies bij lange levertijden, export mutaties

## Webversie (okt 2026)
- Zelfde Expo-codebase draait als web-app (React Native Web). Backend/DB ongewijzigd.
- Web-only WebFrame in app/_layout.tsx: gecentreerd, max 1100px op desktop; native ongewijzigd.
- PWA: public/manifest.json + iconen; head-tags via +html.tsx (export) en runtime-injectie (dev).
- Camerascannen op web via expo-camera web (barcode-detector polyfill), vereist HTTPS; zaklamp niet op web.
- TODO bij publicatie: productie-webadres toevoegen aan CORS_ORIGINS in backend/.env.
