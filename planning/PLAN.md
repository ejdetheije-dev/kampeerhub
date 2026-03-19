# plan — kampeerhub

##  Huidige staat
Laatste wijziging: KAM-16 backend auth flow + passlib→bcrypt fix ✓ (2026-03-19)
Volgende: nieuwe Jira features
Open: E2E tests (test/ directory bestaat nog niet), LOW/INFO issues uit code review
Niet aanraken zonder overleg: filter logic (KAM-7), DetailOverlay (KAM-8), ChatPanel retry/timeout logica

## asyncio.to_thread — ontwerpbeslissing (bijgewerkt na KAM-14)

`to_thread` wordt op vier plaatsen gebruikt in `backend/main.py`:

| Locatie | Functie | Beslissing |
|---|---|---|
| `/api/campings` handler | `get_campings_in_bbox` (SQLite read, hot path) | **`to_thread`** — voorkomt event loop blokkade tijdens poll |
| `/api/water-bodies` handler | `get_water_points_in_bbox` (SQLite read, hot path) | **`to_thread`** — zelfde reden |
| `fetch_tile` background task | `store_tile` (SQLite write, background) | **Direct aangeroepen** — schrijf is snel (~1ms), lock serialiseert toch al |
| `fetch_tile` background task | `enrich_tile_cozy` (naam-normalisatie + SQLite update) | **`to_thread`** — CPU-zwaar bij grote tiles (100-200 campings); draait buiten de Overpass lock |
| `fetch_water_tile` background task | `store_water_tile` (SQLite write, background) | **Direct aangeroepen** — zelfde reden als store_tile |

**Reden voor writes direct:** `to_thread` kan niet geannuleerd worden; bij parallelle tile-fetches accumuleren threads. SQLite-writes zijn kort en de Lock serialiseert toch al.

**Reden voor enrich_tile_cozy via to_thread:** naam-normalisatie (unicodedata + regex) voor honderden campings blokkeert de event loop merkbaar; draait ná de Overpass lock zodat accumulation geen probleem is.

**Terugdraaien store_tile/store_water_tile:** vervang de directe aanroepen terug door `await asyncio.to_thread(store_tile, ...)` / `await asyncio.to_thread(store_water_tile, ...)`.

##  Werkwijze Claude
1. Lees Jira issue via MCP voordat je de code aanraakt
2. Verken relevante bestanden
3. Toon aanpak in 3-5 bullets — wacht op bevestiging
4. Voer uit, commit, update "Huidige staat" hierboven
5. Bij wijziging >3 bestanden: altijd eerst vragen
6. Na elke PR: update de "Huidige staat" sectie hierboven
7. Bij twijfel over architectuurkeuze: vraag, niet gokken

## Project Status (2026-03-19, updated after KAM-16)

| Step | Status | Notes |
|---|---|---|
| KAM-1 scaffold | Done | FastAPI, Next.js static export, Docker, scripts |
| KAM-2 AI chat | Done | `/api/chat`, ChatPanel, LiteLLM/Cerebras |
| Bug fixes & cleanup | Done | LLM_MOCK, error handling, MapPanel StrictMode, local Leaflet icons, input limits |
| KAM-3 Leaflet map | Done | Map renders with OSM tiles, centered on France (46.5, 2.5) zoom 6 |
| KAM-4 Overpass hook | Done | Backend SQLite tile cache; frontend polls `/api/campings`; debounce 800ms, 30% shift threshold, 3s poll interval |
| KAM-5 Pins on map | Done | divIcon circle markers; click pin or list item to select; yellow highlight for selected |
| KAM-6 CampingList (real data) | Done | Live OSM data, tag badges, sorted by distance to map center; website tag as primary deeplink, Eurocampings search as fallback |
| KAM-7 Filters | Done | Uitklapbaar filterpanel: faciliteiten (honden/wifi/zwembad), type/grootte, afstand tot water slider; `/api/water-bodies` endpoint met SQLite tile cache; beaches+grote meren+grote rivieren als waterdefinitie |
| KAM-8 Detail overlay | Done | `DetailOverlay` component: floating panel linksonder op kaart; naam, faciliteitenbadges, capaciteit, prijs, coördinaten, website/Eurocampings/OSM links; sluit via ×-knop |
| KAM-9 Weather widget | Done | 7-daagse Open-Meteo voorspelling in DetailOverlay; max/min temp, neerslag, weerlabel per dag; timezone Europe/Paris; geen API key |
| KAM-10 Favourites | Done | `useFavorites` hook met localStorage; hart-icoon op campingkaart en in DetailOverlay; favorieten-only filter in lijstheader |
| KAM-11 Deploy | Done | Multi-stage Docker build; venv via .venv/bin/uvicorn (geen uv run overhead) |
| KAM-12 Reisbereik vanaf camping | Done | Slider 0-8u in DetailOverlay; cirkel op kaart; vogelvlucht = reistijd*90/1.3; skipTrailingSlashRedirect fix voor dev proxy |
| KAM-13 AI chat integratie | Done | navigate_map/set_filters/set_travel_range/select_camping acties; Nominatim geocoding; acompletion async met 3x retry; inputfocus na antwoord |
| Code review — CRITICAL | Done | dev.db + playwright artifacts uit git verwijderd; .dockerignore toegevoegd |
| Code review — HIGH | Done | water polling loop fix; to_thread writes verwijderd; geocode cache + User-Agent; select_camping feedback; water fetching flag fix |
| Code review — MEDIUM | Done | haversine sort; weather error state; TAG_LABELS/HeartIcon naar shared.tsx; capacity parser; dog=leashed; size_type validatie; location_name max_length; DATABASE_PATH gedocumenteerd |
| Code review — LOW/INFO | Not started | Zie planning/REVIEW.md voor volledige lijst |
| KAM-14 knusse campings | Done | Atout France CSV import; name-based matching; cozy flag; diamond icoon (groen) op kaart; badge in lijst; AF website fallback |
| KAM-15 landingspagina | Done | LandingPage component; login/register tabs (MVP, geen auth); localStorage loggedIn flag; AppContent los van Home |
| KAM-16 backend flow | Done | users + sessions tabellen; register/login/logout endpoints; bcrypt direct (passlib vervangen, incompatibel met bcrypt>=4); admin list + approve/revoke; admin pagina `/admin` |
| E2E tests | Not started | `test/` directory does not exist yet |
| Backend unit tests | Not started | |

---

## Project Specification

## 1. Vision

Boilerplate is a visually stunning AI-powered project that lets users look for campsites in europe and integrates an LLM chat assistant that can find campsites on a map and filter on various aspects of the campsite. It can compare campsites and propose best fit to the users expressed needs. It can execute reservations to the chose campsite on the user's behalf. 

## Wat bouw je
Een persoonlijke camping zoek-app voor vakantie in Europa (focus: Frankrijk).  
Split-screen interface: kaart links, gefilterde lijst rechts.  
Data: OpenStreetMap (locaties + faciliteiten) + Eurocampings deeplinks (reviews).


It is built entirely by Coding Agents demonstrating how orchestrated AI agents can produce a production-quality full-stack application. Agents interact through files in `planning/`.

## 2. User Experience

### First Launch

The user runs a single Docker command (or a provided start script). A browser opens to `http://localhost:8000`. No login, no signup. They immediately see:

- A dark, data-rich  terminal aesthetic
- a map of europe including locations of campsites
- a list of proposed campsites based on user preferences
- An AI chat panel ready to assist

### What the User Can Do

- **Watch** — user can see boht the map of europe and the initial selections of campsite
- **interact** - changes user preferences
- **Chat with the AI assistant** — ask about selecting, refining and booking campsites 

### Visual Design

- **Dark theme**: backgrounds around `#0d1117` or `#1a1a2e`, muted gray borders, no pure black
- **Connection status indicator**: a small colored dot (green = connected, yellow = reconnecting, red = disconnected) visible in the header
- **Professional, data-dense layout**: inspired by modern terminals and the booking.com app — every pixel earns its place
- **Responsive but desktop-first**: optimized for wide screens, functional on tablet

### Color Scheme
- Accent Yellow: `#ecad0a`
- Blue Primary: `#209dd7`
- Purple Secondary: `#753991` (submit buttons)

## 3. Architecture Overview

### Single Container, Single Port

```
┌─────────────────────────────────────────────────┐
│  Docker Container (port 8000)                   │
│                                                 │
│  FastAPI (Python/uv)                            │
│  ├── /api/*          REST endpoints             │
│  ├── /api/stream/*   SSE streaming              │
│  └── /*              Static file serving         │
│                      (Next.js export)            │
│                                                 │
│  SQLite database (volume-mounted)               │
│  Background task: to be determined              │
└─────────────────────────────────────────────────┘
```

- **Frontend**: Next.js with TypeScript, built as a static export (`output: 'export'`), served by FastAPI as static files
- **Backend**: FastAPI (Python), managed as a `uv` project
- **Database**: SQLite, single file at `db/boilerplate.db`, volume-mounted for persistence
- **Real-time data**: (When applicable) Server-Sent Events (SSE) — simpler than WebSockets, one-way server→client push, works everywhere
- **AI integration**: LiteLLM → OpenRouter (Cerebras for fast inference), with structured outputs 


### Why These Choices

| Decision | Rationale |
|---|---|
| SSE over WebSockets | One-way push is all we need; simpler, no bidirectional complexity, universal browser support |
| Static Next.js export | Single origin, no CORS issues, one port, one container, simple deployment |
| SQLite over Postgres | No auth = no multi-user = no need for a database server; self-contained, zero config |
| Single Docker container | Students run one command; no docker-compose for production, no service orchestration |
| uv for Python | Fast, modern Python project management; reproducible lockfile; what students should learn |

## Tech stack

| Onderdeel | Keuze | Reden |
| Kaart | Leaflet.js + OpenStreetMap tiles | Gratis, geen key nodig |
| Camping data | Overpass API (OSM) | Gratis, live, 50k+ campings Europa |
| Weer | Open-Meteo API | Gratis, geen key, per coördinaat |
| Reviews | Eurocampings deeplink | Geen API nodig, direct naar pagina |


## Kernfunctionaliteit — stap voor stap
LET OP - DIT IS EEN SUGGESTIE VOOR EEN STAPPENPLAN - JE BENT NIET VERPLICHT DEZE STAPPEN OF DE TECH STACK VAN DEZE STAPPEN TE VOLGEN

### Stap 1: Project opzetten
```bash
npm create vite@latest camping-app -- --template react-ts
cd camping-app
npm install leaflet react-leaflet @types/leaflet tailwindcss
```

### Stap 2: Overpass query voor campings

De basis Overpass query voor campings in een bounding box:

```
[out:json][timeout:30];
(
  node["tourism"="camp_site"]({{bbox}});
  way["tourism"="camp_site"]({{bbox}});
  relation["tourism"="camp_site"]({{bbox}});
);
out center tags;
```

Relevante OSM tags om op te filteren:
- `dog` = yes/no → honden toegestaan
- `internet_access` = wlan → wifi
- `swimming_pool` = yes → zwembad  
- `electricity` = yes → stroomaansluiting
- `nudism` = yes/designated → naturistencamping
- `capacity` (getal) → klein (<50) of groot (>200)
- `fee` = yes + `charge` → prijsindicatie
- `access` = private/public

### Stap 3: Eurocampings deeplink

```typescript
// src/utils/eurocampings.ts
export function getEurocampingsUrl(name: string, lat: number, lon: number): string {
  // Zoek op naam in Eurocampings
  const query = encodeURIComponent(name);
  return `https://www.eurocampings.nl/zoeken/?q=${query}`;
}

// Of directer: zoek op coördinaten via hun kaart
export function getEurocampingsMapUrl(lat: number, lon: number): string {
  return `https://www.eurocampings.nl/kaart/#lat=${lat}&lng=${lon}&zoom=14`;
}
```

### Stap 4: Afstand tot zee

Gebruik de OSM-tag `natural=coastline` of bereken afstand tot kust via:
- Eenvoudig: hardcode Bretonse kustlijn als GeoJSON bounding box
- Beter: Overpass query voor dichtste kustpunt (zwaar, alleen on-demand)
- Praktisch: toon coördinaten en laat gebruiker zelf inschatten via kaart

### Stap 5: Weer per camping (Open-Meteo)

```typescript
// src/hooks/useWeather.ts
async function getWeather(lat: number, lon: number) {
  const url = `https://api.open-meteo.com/v1/forecast?` +
    `latitude=${lat}&longitude=${lon}` +
    `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weathercode` +
    `&forecast_days=7&timezone=Europe%2FParis`;
  const res = await fetch(url);
  return res.json();
}
```

---

## Interface layout

```
┌─────────────────────────────────────────────────────────┐
│  🏕️ Camping App    [Zoek regio...]    [Filters ▼]        │
├──────────────────────────┬──────────────────────────────┤
│                          │  📋 42 campings gevonden      │
│      LEAFLET KAART       │  ┌─────────────────────────┐ │
│                          │  │ 🏕️ Camping Le Vieux Bourg│ │
│   📍 📍    📍           │  │ ⭐ Eurocampings →        │ │
│        📍               │  │ 🐕 🌊 ⚡ 📶            │ │
│   📍                    │  │ 2,3 km van zee  ~€25/nt  │ │
│                          │  └─────────────────────────┘ │
│                          │  ┌─────────────────────────┐ │
│                          │  │ 🏕️ Camping de la Plage  │ │
│                          │  │ ⭐ Eurocampings →        │ │
└──────────────────────────┴──────────────────────────────┘
```

### Filterpanel (uitklapbaar):
- **Faciliteiten**: checkboxes Honden / Wifi / Zwembad / Stroom
- **Type**: Klein (<50 plekken) / Middelgroot / Groot / Naturist
- **Afstand tot zee**: slider 0–20 km (via OSM bbox benadering)
- **Prijs**: slider €0–€80 per nacht

---




---

## 4. Directory Structure

```
boilerplate/
├── frontend/                 # Next.js TypeScript project (static export)
├── backend/                  # FastAPI uv project (Python)
│   └── db/                   # Schema definitions, seed data, migration logic
├── planning/                 # Project-wide documentation for agents
│   ├── PLAN.md               # This document
│   └── ...                   # Additional agent reference docs
├── scripts/
│   ├── start_mac.sh          # Launch Docker container (macOS/Linux)
│   ├── stop_mac.sh           # Stop Docker container (macOS/Linux)
│   ├── start_windows.ps1     # Launch Docker container (Windows PowerShell)
│   └── stop_windows.ps1      # Stop Docker container (Windows PowerShell)
├── test/                     # Playwright E2E tests + docker-compose.test.yml
├── database/                 # Volume mount target (SQLite file lives here at runtime)
│   └── .gitkeep              # Directory exists in repo; boilerplate.db is gitignored
├── Dockerfile                # Multi-stage build (Node → Python)
├── docker-compose.yml        # Optional convenience wrapper
├── .env                      # Environment variables (gitignored, .env.example committed)
└── .gitignore
```

### Key Boundaries

- **`frontend/`** is a self-contained Next.js project. It knows nothing about Python. It talks to the backend via `/api/*` endpoints and `/api/stream/*` SSE endpoints. Internal structure is up to the Frontend Engineer agent.
- **`backend/`** is a self-contained uv project with its own `pyproject.toml`. It owns all server logic including database initialization, schema, seed data, API routes, SSE streaming, market data, and LLM integration. Internal structure is up to the Backend/Market Data agents.
- **`backend/db/`** contains schema SQL definitions and seed logic. The backend lazily initializes the database on first request — creating tables and seeding default data if the SQLite file doesn't exist or is empty.
- **`database/`** at the top level is the runtime volume mount point. The SQLite file (`db/boilerplate.db`) is created here by the backend and persists across container restarts via Docker volume.
- **`planning/`** contains project-wide documentation, including this plan. All agents reference files here as the shared contract.
- **`test/`** contains Playwright E2E tests and supporting infrastructure (e.g., `docker-compose.test.yml`). Unit tests live within `frontend/` and `backend/` respectively, following each framework's conventions.
- **`scripts/`** contains start/stop scripts that wrap Docker commands.

---

## 5. Environment Variables

```bash
# Required: OpenRouter API key for LLM chat functionality
OPENROUTER_API_KEY=your-openrouter-api-key-here

# Optional: Set to "true" for deterministic mock LLM responses (testing)
LLM_MOCK=false
```

### Behavior

- If `LLM_MOCK=true` → backend returns deterministic mock LLM responses (for E2E tests)
- The backend reads `.env` from the project root (mounted into the container or read via docker `--env-file`)

---

### SSE Streaming (when applicable)

- Endpoint: to be determined
- Long-lived SSE connection; client uses native `EventSource` API
- Client handles reconnection automatically (EventSource has built-in retry)

---

## 7. Database

### SQLite with Lazy Initialization

The backend checks for the SQLite database on startup (or first request). If the file doesn't exist or tables are missing, it creates the schema and seeds default data. This means:

- No separate migration step
- No manual database setup
- Fresh Docker volumes start with a clean, seeded database automatically

### Schema

to be determined

## 8. API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/health` | Health check, returns `{"status": "ok"}` |
| POST | `/api/chat` | LLM chat — body: `{"messages": [{role, content}]}`, returns `ChatResponse` |

---

## 9. LLM Integration

When writing code to make calls to LLMs, use cerebras-inference skill to use LiteLLM via OpenRouter to the `openrouter/openai/gpt-oss-120b` model with Cerebras as the inference provider. Structured Outputs should be used to interpret the results.

There is an OPENROUTER_API_KEY in the .env file in the project root.

### How It Works

When the user sends a chat message, the backend:

1. Prepends the kampeerhub system prompt (Dutch, camping-focused assistant)
2. Calls LiteLLM → OpenRouter → Cerebras (`openrouter/openai/gpt-oss-120b`, `reasoning_effort="low"`)
3. Parses the structured JSON response into `ChatResponse`
4. Returns `ChatResponse` to the frontend

### Structured Output Schema

```python
class ChatResponse(BaseModel):
    message: str                                               # text shown in chat
    action: Literal["none", "search", "set_preference"] = "none"
```


### Auto-Execution

execution specified by the LLM execute automatically — no confirmation dialog. This is a deliberate design choice:
- It creates an impressive, fluid demo experience
- It demonstrates agentic AI capabilities 


### System Prompt Guidance

The LLM should be prompted as "kampeerhub, een AI assistent" with instructions to:

- Be concise and data-driven in responses
- Always respond with valid structured JSON

### LLM Mock Mode

When `LLM_MOCK=true`, the backend returns deterministic mock responses instead of calling OpenRouter. This enables:
- Fast, free, reproducible E2E tests
- Development without an API key
- CI/CD pipelines

---

## 10. Frontend Design

### Layout

The frontend is a single-page application with a dense, terminal-inspired layout.

```
┌──────────────────────────────────────────────────────┐
│  kampeerhub  camping zoeker                    ● (status) │
├────────────────────────┬─────────────────────────────┤
│                        │  N campings gevonden         │
│   LEAFLET KAART        │  ┌───────────────────────┐  │
│   (Frankijk, zoom 6)   │  │ Camping naam          │  │
│                        │  │ tags  afstand  prijs  │  │
│                        │  └───────────────────────┘  │
│                        ├─────────────────────────────┤
│                        │  AI ASSISTENT               │
│                        │  [chat messages]            │
│                        │  [input] [Stuur]            │
└────────────────────────┴─────────────────────────────┘
```

**Components:**
- `MapPanel` — Leaflet kaart, gecentreerd op Frankrijk (46.5, 2.5), zoom 6
- `CampingList` — gescrold lijstje met campingkaarten (naam, tags, prijs, afstand)
- `ChatPanel` — AI chat interface, h-72, paarse stuur-knop

### Technical Notes

- Canvas-based charting library preferred (Lightweight Charts or Recharts) for performance
- All API calls go to the same origin (`/api/*`) — no CORS configuration needed
- Tailwind CSS for styling with a custom dark theme

---

## 11. Docker & Deployment

### Multi-Stage Dockerfile

```
Stage 1: Node 20 slim
  - Copy frontend/
  - npm install && npm run build (produces static export)

Stage 2: Python 3.12 slim
  - Install uv
  - Copy backend/
  - uv sync (install Python dependencies from lockfile)
  - Copy frontend build output into a static/ directory
  - Expose port 8000
  - CMD: uvicorn serving FastAPI app
```

FastAPI serves the static frontend files and all API routes on port 8000.

### Docker Volume

The SQLite database persists via a named Docker volume:

```bash
docker run -v kampeerhub-data:/app/db -p 8000:8000 --env-file .env kampeerhub
```

The `db/` directory in the project root maps to `/app/db` in the container. The backend writes `kampeerhub.db` to this path.

### Start/Stop Scripts

**`scripts/start_mac.sh`** (macOS/Linux):
- Builds the Docker image if not already built (or if `--build` flag passed)
- Runs the container with the volume mount, port mapping, and `.env` file
- Prints the URL to access the app
- Optionally opens the browser

**`scripts/stop_mac.sh`** (macOS/Linux):
- Stops and removes the running container
- Does NOT remove the volume (data persists)

**`scripts/start_windows.ps1`** / **`scripts/stop_windows.ps1`**: PowerShell equivalents for Windows.

All scripts should be idempotent — safe to run multiple times.

### Optional Cloud Deployment

The container is designed to deploy to AWS App Runner, Render, or any container platform. A Terraform configuration for App Runner may be provided in a `deploy/` directory as a stretch goal, but is not part of the core build.

---

## 12. Testing Strategy

### Unit Tests (within `frontend/` and `backend/`)

**Backend (pytest)**:
- LLM: structured output parsing handles all valid schemas, graceful handling of malformed responses, trade validation within chat flow
- API routes: correct status codes, response shapes, error handling

**Frontend (React Testing Library or similar)**:

- Chat message rendering and loading state

### E2E Tests (in `test/`)

**Infrastructure**: A separate `docker-compose.test.yml` in `test/` that spins up the app container plus a Playwright container. This keeps browser dependencies out of the production image.

**Environment**: Tests run with `LLM_MOCK=true` by default for speed and determinism.

**Key Scenarios**:
- Fresh start: 
- Add and remove 
- AI chat (mocked): send a message, receive a response
- SSE resilience: disconnect and verify reconnection
