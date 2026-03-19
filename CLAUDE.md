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
12. **Deploy**

---

## Aandachtspunten

- **Overpass rate limiting**: opgelost via backend SQLite tile cache. Elke 1°×1° tile wordt één keer opgehaald en permanent opgeslagen. asyncio.Lock voorkomt gelijktijdige requests. Globale cooldown van 60s na 429, gedeeld tussen camping- en water-tiles. Frontend pollt alleen, doet zelf geen Overpass calls.
- **Water distance filter**: `/api/water-bodies` endpoint met aparte SQLite tabellen (`water_points`, `water_tiles`). Water = stranden (`natural=beach`), grote meren (relaties `natural=water,water=lake`), grote rivieren (relaties `waterway=river`). Geen coastline (te zwaar voor Overpass). Afstandsberekening via Haversine in de frontend. Filter is opt-in (disabled by default).
- **Leaflet + React StrictMode**: kan dubbele renders geven, gebruik `useRef` voor de map instance.
- **OSM datakwaliteit**: niet alle campings hebben alle tags. Toon altijd "onbekend" 
  als fallback, filter alleen op aanwezige tags.
- **Eurocampings naam matching**: opgelost via OSM `website` tag als primaire link. Fallback gebruikt naam + coördinaten in Eurocampings search. Generieke namen (bijv. "camping municipal") geven anders te veel resultaten.
- **Dev proxy**: `next.config.ts` stuurt `/api/*` door naar `http://localhost:8000` in dev mode (NODE_ENV !== production). In productie gebruikt Next.js static export zonder proxy.
