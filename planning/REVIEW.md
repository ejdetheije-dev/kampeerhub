# Code Review — kampeerhub

Reviewed: 2026-03-17
Reviewer: Claude Sonnet 4.6
Scope: frontend components, hooks, types, page/layout, backend main.py

---

## Samenvatting

De kern van de app werkt en is degelijk opgezet. De Leaflet-integratie vermijdt het StrictMode-probleem correct via een ref-guard en een `cancelled`-vlag. De Overpass-hook heeft doordachte rate-limiting met debounce, cooldown en 429-retry. De backend is compact en helder. De grootste openstaande risico's zijn functionele gaten (geen kaartpins, geen filters) en een paar stille bugs die pas onder specifieke omstandigheden zichtbaar worden.

---

## Bevindingen per prioriteit

### HOOG

**H1 — KAM-5 ontbreekt volledig: campings zijn niet zichtbaar op de kaart**

`MapPanel.tsx` plaatst geen markers. `useOverpass` levert campingdata op maar `MapPanel` ontvangt die data niet en heeft geen prop of mechanisme om markers te tonen. De kaart en de lijst zijn volledig ontkoppeld: de gebruiker ziet wel een lijst rechts maar de kaart blijft leeg behalve de tegel-achtergrond. Dit is de meest zichtbare functionele tekortkoming ten opzichte van de projectdoelen.

Betrokken bestanden:
- `frontend/components/MapPanel.tsx` — geen markers-prop, geen marker-rendering
- `frontend/app/page.tsx` — `campings` wordt niet doorgegeven aan `MapPanel`

---

**H2 — `useOverpass`: cleanup van de cooldown-timer is partieel**

In `useOverpass.ts` regels 156-169: de outer `debounceRef.current = setTimeout(...)` op regel 156 heeft cleanup in de return-functie (regels 171-173). Maar de inner `setTimeout` op regel 162 die wacht op het einde van de cooldown-periode, wordt ook in `debounceRef.current` gezet — nadat `debounceRef.current` al door de outer timeout is overschreven. Als de component unmount terwijl de cooldown-wachttijd actief is, veroorzaakt de inner timer een `doFetch`-aanroep op een unmounted component. Dit leidt tot een state-update na unmount en een React console-warning.

Betrokken bestand: `frontend/hooks/useOverpass.ts` regels 156-173

---

**H3 — Backend: `python-dotenv` ontbreekt, `.env` wordt nooit ingeladen**

`backend/pyproject.toml` bevat geen `python-dotenv`. `main.py` gebruikt `os.getenv()` direct zonder `.env` in te laden. In de Docker-container werkt dit via `--env-file`, maar bij lokale ontwikkeling buiten Docker (bijv. `uv run uvicorn`) worden de variabelen uit `.env` nooit ingelezen. De startup-waarschuwing ("OPENROUTER_API_KEY is not set") verschijnt dan altijd, ook als de sleutel correct in `.env` staat.

Betrokken bestanden: `backend/pyproject.toml`, `backend/main.py`

---

**H4 — `hasSignificantShift` bevat een delingdoor-nul-risico**

In `useOverpass.ts` regels 15-17:

```ts
const latSpan = next.north - next.south;
const lngSpan = next.east - next.west;
const latShift = Math.abs(...) / latSpan;
```

Als door een edge-case in de Leaflet-projectie `latSpan` of `lngSpan` nul uitkomt, resulteert dit in `NaN` of `Infinity`. De shift-check retourneert dan altijd `false` (geen refetch) of altijd `true` (altijd refetch). Bij normale zoom-niveaus in Europa treedt dit niet op, maar het ontbreekt een guard.

Betrokken bestand: `frontend/hooks/useOverpass.ts` regels 13-19

---

### MIDDEN

**M1 — `ChatPanel`: geen input-lengte-limiet in de UI**

De backend accepteert maximaal 4000 tekens per bericht (`Field(max_length=4000)`) en maximaal 50 berichten per request. `ChatPanel.tsx` legt geen `maxLength` op het `<input>` element. Een gebruiker kan een string langer dan 4000 tekens insturen; de backend wijst dit af met een Pydantic-validatiefout waarvan de ruwe tekst in de UI verschijnt.

Betrokken bestand: `frontend/components/ChatPanel.tsx` regel 91

---

**M2 — `CampingList`: cursor-pointer maar geen onClick-handler**

Elke camping-rij heeft `cursor-pointer` en `hover:bg-gray-800/40`, wat de gebruiker suggereert dat klikken iets doet. Er is geen `onClick`-handler. Dit staat haaks op KAM-8 (detail overlay) en is visueel misleidend zolang die stap niet is geimplementeerd.

Betrokken bestand: `frontend/components/CampingList.tsx` regel 50

---

**M3 — `MapPanel`: dubbele initieel bounds-emit**

`MapPanel.tsx` koppelt zowel `map.once("load", emitBounds)` als `setTimeout(emitBounds, 300)`. In de praktijk vuurt het Leaflet `load`-event bij kaart-initialisatie snel, waarna ook de 300ms-timeout afloopt. Dit triggert `onBoundsChange` twee keer op rij, wat twee Overpass-requests vlak na het laden van de pagina veroorzaakt. Een van beide triggers is overbodig.

Betrokken bestand: `frontend/components/MapPanel.tsx` regels 53-55

---

**M4 — `useOverpass`: in-memory cache groeit onbegrensd**

`cacheRef.current` is een `Map<string, Camping>` die nooit wordt opgeschoond. Bij intensief gebruik (veel viewport-verschuivingen) kan de cache tienduizenden objecten bevatten. Voor een demo-app is dit acceptabel op de korte termijn, maar er is geen documentatie van dit gedrag en het vormt een sluipend geheugenlek bij langdurig gebruik.

Betrokken bestand: `frontend/hooks/useOverpass.ts` regel 83

---

**M5 — `ChatPanel`: `ChatResponse.action` wordt volledig genegeerd**

`ChatPanel.tsx` regel 43-46 logt de action naar de console maar voert niets uit. PLAN.md sectie 9 beschrijft dat acties automatisch worden uitgevoerd ("Auto-Execution"). De hele agentic loop — de kern van de geplande LLM-integratie — is daarmee niet operationeel.

Betrokken bestand: `frontend/components/ChatPanel.tsx` regels 43-46

---

**M6 — `CampingList`: prijs-informatie aanwezig in type maar niet getoond**

`Camping.tags` heeft `fee?: string` en `charge?: string`. Deze worden ingelezen door `useOverpass` maar `CampingList.tsx` toont ze niet in de kaart-UI. Het filterpanel op prijs (PLAN.md sectie "Filterpanel") kan ook niet werken zonder deze data zichtbaar te maken.

Betrokken bestanden: `frontend/types/camping.ts`, `frontend/components/CampingList.tsx`

---

**M7 — `layout.tsx`: Google Fonts via next/font in statische export**

`Geist` en `Geist_Mono` worden geladen via `next/font/google`. Bij een Docker-build zonder outbound DNS of in een CI-omgeving zonder internet kan de font-download de build laten mislukken. Voor een terminal-geïnspireerd dark-theme is de afhankelijkheid van externe Google Fonts niet noodzakelijk.

Betrokken bestand: `frontend/app/layout.tsx`

---

### LAAG

**L1 — `page.tsx`: verbindingsindicator is statisch groen**

De statusdot is altijd groen. PLAN.md beschrijft een indicator die geel wordt bij reconnecting en rood bij disconnected. Er is geen SSE-verbinding om te monitoren en de dot geeft nu een valse indruk van een actieve verbinding.

Betrokken bestand: `frontend/app/page.tsx` regel 20

---

**L2 — `ChatPanel`: array-index als React key**

Regel 70: `key={i}` is een anti-patroon wanneer de lijst door toevoegingen verandert. Bij elke re-render na het toevoegen van een bericht worden alle bestaande berichten opnieuw gerenderd. Een stabiele key (bijv. timestamp gecombineerd met role) is efficienter.

Betrokken bestand: `frontend/components/ChatPanel.tsx` regel 70

---

**L3 — `backend/main.py`: brede `except Exception` lekt interne foutdetails**

Regel 93-94: `except Exception as e` geeft de ruwe Python-foutmelding terug in `detail`. Dit kan interne stacktrace-informatie of padnamen lekken naar de client. Beter is de fout intern te loggen en een generieke melding te retourneren.

Betrokken bestand: `backend/main.py` regels 93-94

---

**L4 — `useOverpass.ts`: onnodige `"use client"` directive**

Hook-bestanden zijn in Next.js App Router per definitie client-side. De directive is overbodig maar schaadt niets.

Betrokken bestand: `frontend/hooks/useOverpass.ts` regel 1

---

**L5 — `pyproject.toml`: placeholder project-beschrijving**

`description = "Add your description here"` is nooit vervangen. Geen functionele impact.

Betrokken bestand: `backend/pyproject.toml` regel 4

---

## Ontbrekend t.o.v. PLAN.md

| PLAN.md item | Status | Opmerking |
|---|---|---|
| KAM-5 Pins op kaart | Ontbreekt | Campings komen niet op de kaart |
| KAM-7 Filters | Ontbreekt | Geen filterpanel aanwezig |
| KAM-8 Detail overlay | Ontbreekt | Klikken op camping doet niets |
| KAM-9 Weer widget | Ontbreekt | Open-Meteo niet geintegreerd |
| KAM-10 Favorieten | Ontbreekt | |
| KAM-11 Deploy | Ontbreekt | |
| E2E tests | Ontbreekt | `test/` directory bestaat niet |
| Backend unit tests | Ontbreekt | |
| SSE streaming `/api/stream/*` | Ontbreekt | Endpoint "to be determined" in PLAN, niet gebouwd |
| Filterpanel (honden/wifi/zwembad/stroom) | Ontbreekt | |
| Afstand tot zee | Ontbreekt | Geen tag of berekening aanwezig |
| Prijs weergave in lijst | Ontbreekt | `fee`/`charge` in type maar niet getoond |
| Connection status indicator (live) | Gedeeltelijk | Dot aanwezig maar statisch groen |
| `ChatResponse.action` auto-execution | Gedeeltelijk | Alleen `console.log`, geen verdere actie |

---

## Sterke punten

- Leaflet StrictMode-fix via `mapRef` guard en `cancelled`-vlag is correct en robuust.
- Overpass-debounce (1500ms), cooldown (30s), 30%-shift-threshold en 429-retry zijn allemaal aanwezig en goed doordacht.
- `pendingBoundsRef` zorgt ervoor dat na een langzame fetch altijd de meest recente viewport wordt getoond.
- `maxsize:1048576` in de Overpass-query voorkomt extreem grote responses.
- Backend-structuur is compact en leesbaar.
- Eurocampings deeplink met `encodeURIComponent` en `rel="noopener noreferrer"` is correct geimplementeerd.
- Dark-theme kleuren (`#0d1117`, `#ecad0a`, `#209dd7`, `#753991`) zijn consistent doorgevoerd conform PLAN.md.
- Input-limieten in de backend (`max_length=4000` per bericht, `max_length=50` berichten) zijn aanwezig.
- LLM_MOCK is geimplementeerd in de backend (`main.py` regels 71-72).
