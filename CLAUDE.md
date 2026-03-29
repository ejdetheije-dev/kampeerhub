# kampeerhub Project 

## Werkwijze per issue
1. Lees het issue volledig
2. Verken relevante bestanden
3. Toon aanpak in bullets — wacht op bevestiging
4. Pas dan uitvoeren

All project documentation is in the `planning` directory.

The key document is PLAN.md included in full below; Consult this doc only when required. The remainder of the platform is still to be developed.

@planning/PLAN.md

# Camping App

## Doel
Persoonlijke camping zoek-app. Kaart + lijst, split-screen.
Data: OpenStreetMap via Overpass API + Eurocampings deeplinks.

## Stack
- Leaflet.js voor de kaart
- Open-Meteo voor weer


## Overpass API
Endpoint: https://overpass-api.de/api/interpreter
Gebruik altijd [timeout:30][maxsize:1048576] en bounding box queries
Alleen fetchen bij zoom >= 9 (anders te grote bbox → 500 error)
**Architectuur**: backend haalt Overpass op en slaat op in SQLite per 1°×1° tile (permanent gecached)
Frontend roept `/api/campings` aan; backend geeft direct gecachede campings terug + start background tile fetch
Frontend pollt elke 3s zolang `fetching: true`; stopt als alle tiles gecached zijn
asyncio.Lock zorgt voor max 1 gelijktijdig Overpass verzoek (geen 429)
Shift threshold: frontend refetcht alleen als kaartview >30% verschuift (debounce 800ms)

## Leaflet setup
Importeer CSS in main.tsx: import 'leaflet/dist/leaflet.css'
Fix marker icon bug: gebruik custom icon of importeer leaflet-defaulticon-compatibility

## Eurocampings links
Altijd openen in nieuw tabblad (target="_blank")
Gebruik OSM `website`/`url` tag als primaire link indien beschikbaar.
Fallback: https://www.eurocampings.nl/search/specific/?query={naam}+{lat}+{lon}
Let op: /zoeken/?q= en /campsite/search/q/ werken niet (404 of toont alle 9680 campings)

---

## Bouwvolgorde (aanbevolen)

1. **Basis scaffold** — DONE (KAM-1): FastAPI backend, Next.js frontend, Docker, scripts
2. **AI chat** — DONE (KAM-2): `/api/chat` endpoint, ChatPanel component, LiteLLM/Cerebras
3. **Bug fixes & cleanup** — DONE: LLM_MOCK, error handling, MapPanel StrictMode fix, local Leaflet icons, input limits, removed unused deps
4. **Kaart** — DONE (KAM-3/KAM-11): Leaflet kaart met OSM tiles, gecentreerd op Frankrijk (46.5, 2.5) zoom 6
5. **Overpass hook** — DONE (KAM-4): backend SQLite tile cache, `/api/campings` endpoint, frontend polling
6. **CampingList (live data)** — DONE (KAM-6): live OSM data, tag badges, gesorteerd op afstand tot kaartcentrum, OSM website tag als primaire deeplink
7. **Pins op kaart** — DONE (KAM-5): divIcon cirkels op kaart, klikbaar; selectie gedeeld tussen kaart en lijst
8. **Filters** — DONE (KAM-7): uitklapbaar filterpanel (faciliteiten, type/grootte, afstand tot water slider); `/api/water-bodies` endpoint met SQLite tile cache
9. **Detail overlay** — DONE (KAM-8): floating panel linksonder op kaart; naam, faciliteitenbadges, capaciteit, prijs, coördinaten, website/Eurocampings/OSM links; `DetailOverlay` component, sluit via ×
10. **Weer widget** — DONE (KAM-9): 7-daagse Open-Meteo voorspelling in DetailOverlay; max/min temp, neerslag, weerlabel; timezone Europe/Paris
11. **Favorieten** — DONE (KAM-10): `useFavorites` hook (localStorage); hart-icoon op kaart en overlay; favorieten-only filter in lijstheader
12. **Deploy** — DONE (KAM-11): Docker multi-stage build; `.venv/bin/uvicorn` als CMD; `skipTrailingSlashRedirect: true` in next.config.ts
13. **Reisbereik** — DONE (KAM-12): slider 0-8u in DetailOverlay; cirkel op kaart via Leaflet ref (synchroon); vogelvlucht = reistijd × 90 / 1.3
14. **AI chat integratie** — DONE (KAM-13): acties navigate_map/set_filters/set_travel_range/select_camping; Nominatim geocoding; acompletion async met 3x backend retry; inputfocus na antwoord
15. **Code review fixes** — DONE: alle CRITICAL/HIGH/MEDIUM issues uit code review opgelost (zie planning/REVIEW.md)
16. **Knusse campings** — DONE (KAM-14): Atout France CSV import bij startup; naam-matching met OSM; cozy flag + website fallback; groen diamant-icoon op kaart; badge in lijst; enrichment via asyncio.to_thread na Overpass lock
17. **Landingspagina** — DONE (KAM-15): `LandingPage` component; login/aanmelden tabs (MVP zonder auth); `localStorage.loggedIn` flag; `AppContent` los van `Home` in page.tsx
18. **Backend auth flow** — DONE (KAM-16): `users` + `sessions` tabellen; `POST /api/auth/register` (eerste gebruiker = admin + auto-approved), `POST /api/auth/login`, `POST /api/auth/logout`; bcrypt direct (passlib vervangen); `GET /api/admin/users` + `PATCH /api/admin/users/{id}` (admin-only); `/admin` pagina met gebruikerstabel en approve checkbox; `authToken` + `isAdmin` in localStorage
19. **Landingspagina redesign** — DONE (KAM-17): Unsplash campingfoto als achtergrond, donkere overlay, glazen kaart effect; alles in Nederlands
20. **Security fixes** — DONE: sessie tokens verlopen na 30 dagen; RegisterRequest validatie (min/max fields); AdminUpdateRequest Pydantic model + 404 guard + admin-lockout guard; `/api/chat` vereist Bearer token; hydration fix via useEffect; water slider disabled bij tooFarOut; AbortController in useWaterBodies + DetailOverlay weather; catch in handleSubmit
21. **E2E tests** — DONE: Playwright in `test/`; `docker-compose.test.yml` (LLM_MOCK=true, tmpfs DB, poort 8001); `globalSetup.ts` maakt admin aan vóór tests; 14 tests in 4 bestanden (auth/admin/api/app); alle 14 geslaagd in ~22s
22. **KAM-19 laadoptimalisatie** — REVERTED: warmup/prefetch/adaptive polling veroorzaakten Overpass rate limiting op Render waardoor gebruikersverzoeken ook blokkeerden; teruggedraaid naar pre-KAM-19 on-demand laden (commit c58934b)
23. **Telefoon-first UI** — DONE (KAM-20): toggle-knoppen "lijst" en "chat" in header; op mobile (< 768px) standaard verborgen zodat kaart vol scherm in landscape; `fullHeight` prop op ChatPanel vult zijbalk als lijst verborgen is

---

## Toekomstige feature: beschikbaarheid op datum (onderzocht 2026-03-29)

### Kernidee
Gebruiker geeft aankomst- en vertrekdatum op; app toont alleen campings met beschikbaarheid in dat window.

### Onderzochte opties en conclusies

| Optie | Conclusie |
|---|---|
| **Pitchup.com API** | Supply-side API (campings pushen inventory naar Pitchup). Geen publieke zoek-API voor derden. Formeel partnerschap vereist — commercieel, niet gratis. |
| **ACSI / Eurocampings** | Geen publieke API beschikbaar. |
| **iCal-feeds** | Technisch mogelijk (Beds24, Lodgify, Smoobu publiceren standaard iCal). Bottleneck: iCal-URL per camping ontdekken is niet schaalbaar. |
| **Keten-scraping** (Tohapi, Huttopia, Homair, Yelloh Village) | Scrapeable JSON, maar dekt alleen ~300 campings in Frankrijk. Fragiel + juridisch grijs. |
| **Real-time Playwright** | Te traag voor gebruiker. Niet performant te krijgen. |
| **Background async scraping + cache** | Werkt in theorie (nachtelijks crawlen, 90 dagen vooruit, SQLite opslag). Hoge buildcomplexiteit en onderhoudslast. |

### Gekozen richting voor verdere uitwerking
**Datum-aware deeplinks**: gebruiker geeft datums in → app genereert directe deeplinks naar boekingspagina van elke camping **met datum-parameters vooringevuld** in de URL. Geen echte beschikbaarheidsdata, maar betere UX dan nu + dramatisch lagere complexiteit.

Voorbeeldaanpak:
- `arrival` en `departure` datumvelden toevoegen aan de UI (bijv. in FilterPanel of header)
- Backend detecteert boekingssysteem via HTML-scan (zie empirisch onderzoek hieronder)
- In DetailOverlay: "Controleer beschikbaarheid" knop die de boekingslink opent met datums vooringevuld

### Empirisch onderzoek — boekingssystemen (2026-03-29)

Dataset: 1080 campings met website-tag uit Overpass (centraal/zuidelijk Frankrijk, bbox 44-47°N / 2-6°O)

**Wat de URLs zeggen (geen fetch nodig):**
- 99% eigen domein — URL zelf verraadt het boekingssysteem niet
- ~1% herkend platform in de URL (e-camping.net: 24, aquadis: 7, gites-de-france: 4)

**Wat de HTML verraadt (60-site sample, 47 bereikbaar):**

| Systeem | Hits | URL-patroon |
|---|---|---|
| **Secureholiday (Ctoutvert)** | ~10 | `*.secureholiday.net/?BeginDate=DD/MM/YYYY&EndDate=DD/MM/YYYY` |
| Yelloh Village | 4 | `booking.yellohvillage.com` |
| resa-booking.com | 3 | `online.resa-booking.com` |
| Reservit | 2 | `secure.reservit.com` — heeft gedocumenteerde URL-params |
| Eigen domein/onbekend | 8 | — |
| Geen boekingssysteem gevonden | 21 | — |

**Conclusies:**
- **Secureholiday/Ctoutvert** is de marktleider voor Franse campings. Datum-params zijn gedocumenteerd en werken.
- **~20% van sites onbereikbaar** (timeout, oud SSL, 404) — niet alle campings hebben een werkende site
- **~45% van bereikbare sites** heeft geen herkend boekingssysteem (eigen systeem of geen online boeking)
- Booking.com en Pitchup komen nauwelijks voor als embedded systeem — initiële aanname was onjuist

**Geschat bereik van datum-aware deeplinks:**
- ~30-40%: Secureholiday/Reservit/resa-booking → datum direct vooringevuld
- ~10%: ketens (Yelloh, Capfun) → directe link
- ~20%: onbereikbaar/geen boeking → alleen homepage
- ~30%: onbekend/eigen systeem → homepage zonder datums

**Technische aanpak:**
Boekingslink-detectie kan asynchroon in de backend (net als Overpass tile cache): één keer de camping-website ophalen, de booking-link extraheren en opslaan in SQLite. Herkenning via regex op bekende domeinen in `href`-attributen. Geen Playwright nodig — gewone HTTP fetch is voldoende.

---

## Aandachtspunten

- **Overpass rate limiting**: opgelost via backend SQLite tile cache. Elke 1°×1° tile wordt één keer opgehaald en permanent opgeslagen. asyncio.Lock voorkomt gelijktijdige requests. Globale cooldown van 60s na 429, gedeeld tussen camping- en water-tiles. Frontend pollt alleen, doet zelf geen Overpass calls.
- **Water distance filter**: `/api/water-bodies` endpoint met aparte SQLite tabellen (`water_points`, `water_tiles`). Water = stranden (`natural=beach`), grote meren (relaties `natural=water,water=lake`), grote rivieren (relaties `waterway=river`). Geen coastline (te zwaar voor Overpass). Afstandsberekening via Haversine in de frontend. Filter is opt-in (disabled by default).
- **Leaflet + React StrictMode**: kan dubbele renders geven, gebruik `useRef` voor de map instance.
- **OSM datakwaliteit**: niet alle campings hebben alle tags. Toon altijd "onbekend" 
  als fallback, filter alleen op aanwezige tags.
- **Eurocampings naam matching**: opgelost via OSM `website` tag als primaire link. Fallback gebruikt naam + coördinaten in Eurocampings search. Generieke namen (bijv. "camping municipal") geven anders te veel resultaten.
- **Dev proxy**: `next.config.ts` stuurt `/api/*` door naar `http://localhost:8000` in dev mode (NODE_ENV !== production). In productie gebruikt Next.js static export zonder proxy. `skipTrailingSlashRedirect: true` is vereist — zonder dit veroorzaakt `trailingSlash: true` een 308 redirect die de proxy omzeilt.
- **Reisbereik cirkel**: Leaflet opslaan in ref (`leafletRef`) tijdens initialisatie zodat de circle effect synchroon tekent. `campings` NIET in de dependency array van de circle effect — anders wordt de cirkel verwijderd bij elke campings-refresh (zoomen).
- **Haversine wegfactor**: vogelvlucht_max = reistijd × snelheid / wegfactor (dus `/1.3`, niet `*1.3`).
- **AI chat LLM**: gebruikt `acompletion` (litellm async) met `asyncio.wait_for(timeout=9s)` en 3x retry loop. `asyncio.to_thread` NIET gebruiken — kan niet geannuleerd worden waardoor threads accumuleren. Provider: OpenRouter `gpt-oss-120b` met `allow_fallbacks: True` (Cerebras → Fireworks → Together).
- **ChatResponse schema**: acties zijn `none|set_filters|navigate_map|set_travel_range|select_camping`. Geen prijs-gerelateerde filters — die zijn uit het project verwijderd.
- **asyncio.to_thread**: gebruiken voor SQLite reads op de hot path (`get_campings_in_bbox`, `get_water_points_in_bbox`) én voor `enrich_tile_cozy` (CPU-zwaar: naam-normalisatie voor honderden campings). Niet voor `store_tile`/`store_water_tile` — die zijn snel en geserialiseerd via Lock.
- **Geocoding cache**: `_geocode_cache` dict in geheugen voorkomt herhaalde Nominatim calls. User-Agent bevat GitHub URL conform Nominatim beleid.
- **Atout France koppeling**: `import_atout_france_csv()` downloadt eenmalig de officiële Franse campingclassificatie CSV bij startup en slaat deze op in SQLite tabel `atout_france`. Lookup dict `_atout_france_lookup` in geheugen (genormaliseerde naam → AF data). `enrich_tile_cozy(tile_key)` loopt na elke tile-fetch via `asyncio.to_thread` (buiten de Overpass lock) en update `cozy` + `website` in de campings tabel.
- **Knusse camping definitie**: `CLASSEMENT == "Aire naturelle"` OF (`NOMBRE D'EMPLACEMENTS < 50` EN `NOMBRE D'UNITES D'HABITATION == 0`). Alleen campings met een Atout France match krijgen `cozy: True` — buitenlandse/niet-geclassificeerde campings krijgen `cozy: False`.
- **Naam-normalisatie**: `_normalize_camping_name()` verwijdert accenten (unicodedata NFD), lowercase, "camping"-prefix varianten, en niet-alfanumerieke tekens. Exacte dict-lookup — geen fuzzy matching.
- **Gedeelde frontend componenten**: `TAG_LABELS` en `HeartIcon` leven in `frontend/components/shared.tsx` — niet dupliceren.
- **Water polling**: `useWaterBodies` stopt polling zodra `fetching: false`, ook als `points.length === 0` (inland areas zijn geldige lege staat).
- **select_camping feedback**: toont timed banner in kaartgebied als camping niet in huidig viewport gevonden wordt.
- **Capaciteit parsing**: `re.search(r"\d+", cap)` pakt eerste getal uit waardes als "150-200" of "~100".
- **Dog filter**: `dog in ("yes", "leashed")` — leashed is ook toegestaan.
- **Wachtwoord hashing**: gebruik `bcrypt` direct (`import bcrypt`), niet `passlib`. Passlib is incompatibel met bcrypt>=4.0 (`detect_wrap_bug` crasht met ValueError over password >72 bytes).
- **Sessie tokens**: verlopen na 30 dagen (`expires_at` kolom in `sessions` tabel). `_get_user_by_token` filtert op `expires_at > datetime('now')`. Cleanup van verlopen tokens bij elke login.
- **Water filter + zoom**: `FilterPanel` ontvangt `tooFarOut` prop; water checkbox is disabled + toont uitleg als kaart niet ingezoomd is. Bounding box bij zoom < 9 bevat >16 tiles → water endpoint geeft leeg terug.
- **Auth op /api/chat**: `_require_session()` helper vereist geldig Bearer token. `ChatPanel` stuurt `authToken` mee via Authorization header.
- **Hydration fix**: `Home` component leest `localStorage` via `useEffect`, niet in `useState` initializer — voorkomt mismatch tussen server-rendered HTML en client.
