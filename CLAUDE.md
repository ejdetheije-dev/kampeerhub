# kampeerhub Project 

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
Rate limiting: 30s cooldown tussen requests, debounce 1500ms, auto-retry bij 429
In-memory cache (Map<id, Camping>) — toon cached campings direct, fetch op achtergrond
Shift threshold: alleen refetch als kaartview >30% verschuift

## Leaflet setup
Importeer CSS in main.tsx: import 'leaflet/dist/leaflet.css'
Fix marker icon bug: gebruik custom icon of importeer leaflet-defaulticon-compatibility

## Eurocampings links
Altijd openen in nieuw tabblad (target="_blank")
Deeplink formaat: https://www.eurocampings.nl/zoeken/?q={naam}

---

## Bouwvolgorde (aanbevolen)

1. **Basis scaffold** — DONE (KAM-1): FastAPI backend, Next.js frontend, Docker, scripts
2. **AI chat** — DONE (KAM-2): `/api/chat` endpoint, ChatPanel component, LiteLLM/Cerebras
3. **Bug fixes & cleanup** — DONE: LLM_MOCK, error handling, MapPanel StrictMode fix, local Leaflet icons, input limits, removed unused deps
4. **Kaart** — DONE (KAM-3/KAM-11): Leaflet kaart met OSM tiles, gecentreerd op Frankrijk (46.5, 2.5) zoom 6
5. **Overpass hook** — DONE (KAM-4): `useOverpass` hook, in-memory cache, rate limiting
6. **CampingList (live data)** — DONE (KAM-6): live OSM data, tag badges, Eurocampings deeplinks
7. **Pins op kaart** — Campings als markers, klikbaar
8. **Filters** — Faciliteiten, type, prijs toggles
9. **Detail overlay** — Bij klik op camping: naam, tags, Eurocampings link
10. **Weer widget** — Open-Meteo per geselecteerde camping
11. **Favorieten** — Hart-icoon + opslag
12. **Deploy**

---

## Aandachtspunten

- **Overpass rate limiting**: niet bij elke kaartbeweging opnieuw fetchen. 
  Gebruik debounce (500ms) en alleen refetch als kaartview >30% verschuift.
- **Leaflet + React StrictMode**: kan dubbele renders geven, gebruik `useRef` voor de map instance.
- **OSM datakwaliteit**: niet alle campings hebben alle tags. Toon altijd "onbekend" 
  als fallback, filter alleen op aanwezige tags.
- **Eurocampings naam matching**: sommige campings hebben andere namen in OSM vs 
  Eurocampings. Overweeg ook lat/lon-gebaseerde deeplink als backup.
