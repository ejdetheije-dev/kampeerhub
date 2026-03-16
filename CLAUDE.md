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
Gebruik altijd [timeout:30] en bounding box queries
Cache resultaten in React state, niet opnieuw fetchen bij pan <500m

## Leaflet setup
Importeer CSS in main.tsx: import 'leaflet/dist/leaflet.css'
Fix marker icon bug: gebruik custom icon of importeer leaflet-defaulticon-compatibility

## Eurocampings links
Altijd openen in nieuw tabblad (target="_blank")
Deeplink formaat: https://www.eurocampings.nl/zoeken/?q={naam}
```

---

## Bouwvolgorde (aanbevolen)

1. **Basis scaffold** 
2. **Kaart** — Leaflet kaart met OSM tiles, centreer op Frankrijk
3. **Overpass hook** — Fetch campings in huidige kaartview
4. **Pins op kaart** — Campings als markers, klikbaar
5. **Lijst rechts** — Zelfde data als kaartpins, gesorteerd op afstand
6. **Filters** — Faciliteiten, type, prijs toggles
7. **Detail overlay** — Bij klik op camping: naam, tags, Eurocampings link
8. **Weer widget** — Open-Meteo per geselecteerde camping
9. **Favorieten** — Hart-icoon + opslag
10. **Deploy** 

---

## Aandachtspunten

- **Overpass rate limiting**: niet bij elke kaartbeweging opnieuw fetchen. 
  Gebruik debounce (500ms) en alleen refetch als kaartview >30% verschuift.
- **Leaflet + React StrictMode**: kan dubbele renders geven, gebruik `useRef` voor de map instance.
- **OSM datakwaliteit**: niet alle campings hebben alle tags. Toon altijd "onbekend" 
  als fallback, filter alleen op aanwezige tags.
- **Eurocampings naam matching**: sommige campings hebben andere namen in OSM vs 
  Eurocampings. Overweeg ook lat/lon-gebaseerde deeplink als backup.
