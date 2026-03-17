# Code Review — kampeerhub
Date: 2026-03-17
Reviewer: Claude Sonnet 4.6

---

## Summary

The codebase is clean, well-structured and delivers its stated scope (KAM-1 through KAM-4 / KAM-6). It follows the project's own guidelines: short modules, clear names, no over-engineering. The most critical issues are a race condition in tile-fetching, absent input validation on the campings endpoint, SQLite connections that leak on exception, and a tile-count problem that causes very slow initial loads. Several UX gaps are also worth addressing before the remaining roadmap items are built on top of this foundation.

---

## 1. Bugs and Correctness

### BUG-1 [HOOG] Race condition in `_fetching_tiles` set

**File:** `backend/main.py`, lines 138-163

`_fetching_tiles` is a plain Python `set` mutated from multiple concurrent async tasks without a lock. The check at line 138 (`if tile_key in _fetching_tiles`) and the `add` at line 139 are not atomic. Two coroutines for the same tile can pass the check simultaneously, resulting in two parallel Overpass requests for the same tile and a double `store_tile` write.

The lock `_overpass_lock` is acquired only inside the function, after the guard. The inner `is_tile_cached` re-check (line 151) partially mitigates the double-write but the duplicate request still fires.

---

### BUG-2 [HOOG] SQLite connections not closed on exception

**File:** `backend/main.py`, functions `is_tile_cached`, `store_tile`, `get_campings_in_bbox`

Every database function opens a `sqlite3.connect()` and manually calls `con.close()`. If an exception is raised before `close()` (for example inside the element loop in `store_tile`), the connection is never closed and WAL files accumulate. `store_tile` runs inside `asyncio.to_thread` so exceptions are silently swallowed by the bare `except Exception: pass` in `fetch_tile`.

The fix is to use `with sqlite3.connect(DB_PATH) as con:` in every database function.

---

### BUG-3 [HOOG] No bounding-box parameter validation on `/api/campings`

**File:** `backend/main.py`, line 180

The endpoint accepts `south`, `west`, `north`, `east` as raw floats with no range checks. Passing values outside valid lat/lon ranges (e.g. `south=-9999`) is passed straight into `tile_keys`, producing an arbitrarily large tile set and potentially thousands of Overpass requests per call.

The frontend `useOverpass` hook correctly guards with `MIN_ZOOM = 9`, but nothing prevents a direct API call bypassing this. Valid ranges are south/north within [-90, 90], west/east within [-180, 180], north > south. A per-request tile cap (e.g. 25 tiles) is also needed (see PERF-1).

---

### BUG-4 [MIDDEN] Silent exception swallowing in tile fetch

**File:** `backend/main.py`, line 160

`except Exception: pass` means Overpass HTTP errors, JSON parse errors, and database errors are all invisible. If Overpass returns a non-JSON response, the tile stays uncached and the frontend polls again 3 seconds later indefinitely. At minimum the exception should be logged. Retryable errors (429, 5xx) should be distinguished from permanent failures so permanently-broken tiles are not retried on every poll.

---

### BUG-5 [MIDDEN] `useOverpass` poll can fire after component unmount

**File:** `frontend/hooks/useOverpass.ts`, lines 93-101

The cleanup effect sets `mountedRef.current = false` and clears `pollRef`. However if the 3-second poll fires just before cleanup runs, the `load(b)` call at line 55 may execute. The `mountedRef` check at line 49 prevents a state update but the fetch itself still runs, wasting a network request after navigation.

---

### BUG-6 [MIDDEN] KAM-5 not implemented: campings are not visible on the map

**File:** `frontend/components/MapPanel.tsx`, `frontend/app/page.tsx`

`MapPanel` has no `campings` prop and places no markers. The camping data fetched by `useOverpass` is used only by `CampingList`; the map and the list are fully decoupled. This is the most visible functional gap relative to the project goals and is listed as "Not started" in PLAN.md.

---

### BUG-7 [MIDDEN] `ChatResponse.action` is logged but never executed

**File:** `frontend/components/ChatPanel.tsx`, lines 43-46

The action returned by the LLM is only written to `console.log`. PLAN.md section 9 describes auto-execution of LLM actions as a core feature. The agentic loop is not operational.

---

### BUG-8 [LAAG] `hasSignificantShift` is unstable at high zoom

**File:** `frontend/hooks/useOverpass.ts`, lines 11-18

At very high zoom (e.g. zoom 18) the lat/lon span is a fraction of a degree. The shift ratio becomes extremely sensitive, causing nearly every small pan to exceed the 30% threshold and trigger a refetch. The guard `if (latSpan === 0 || lngSpan === 0) return true` handles the zero case but not the near-zero case.

---

### BUG-9 [LAAG] `tile_keys` does not handle bounding boxes crossing the antimeridian

**File:** `backend/main.py`, lines 122-132

If `west > east` (bbox wrapping 180°/-180°), the inner `while lon <= math.floor(east)` loop never executes, silently returning zero tiles. This is unlikely for European campings but is a silent failure with no error.

---

## 2. Performance and User Experience

### PERF-1 [HOOG] No tile count cap — initial view triggers excessive sequential Overpass fetches

At zoom 9 over France the bounding box spans roughly 6° lat x 8° lon = 48 tiles. Each tile is a separate sequential Overpass request (serialized by `_overpass_lock`). With a 30-second timeout per request that is up to 24 minutes of sequential fetching. The frontend polls every 3 seconds and shows "laden..." the entire time. This makes the initial experience effectively broken.

A tile cap per API request (e.g. 16 tiles) and/or raising `MIN_ZOOM` to 10 or 11 would keep the tile count manageable at any given viewport.

---

### PERF-2 [HOOG] Connection status dot is hardcoded green

**File:** `frontend/app/page.tsx`, line 19

The status dot is `bg-green-400` regardless of `loading` or `error` state from `useOverpass`. PLAN.md specifies yellow for reconnecting and red for disconnected. As-is it is decorative and misleading when an error has occurred.

---

### PERF-3 [MIDDEN] Google Fonts CDN dependency in a self-contained Docker container

**File:** `frontend/app/layout.tsx`, lines 5-13

`next/font/google` downloads Geist and Geist Mono from Google's CDN at Next.js build time. If the build environment has no outbound internet access (air-gapped CI, corporate proxy), the build fails. For a terminal-inspired dark theme the Google Fonts dependency is unnecessary; `next/font/local` with fonts in `public/` or system fonts would be safer.

---

### PERF-4 [MIDDEN] Tile cache has no TTL or expiry

**File:** `backend/main.py`, table `fetched_tiles`

The `fetched_at` column is written but never read for expiry. Once a tile is cached it is served forever. OSM data changes over time; a reasonable TTL (e.g. 7 days) would keep camping data fresh.

---

### PERF-5 [MIDDEN] Double initial bounds emit from MapPanel

**File:** `frontend/components/MapPanel.tsx`, lines 53-55

Both `map.once("load", emitBounds)` and `setTimeout(emitBounds, 300)` are registered. On fast devices both fire within milliseconds, triggering two consecutive `/api/campings` requests for the same viewport. One of the two triggers is redundant.

---

### PERF-6 [MIDDEN] No empty-state UI when no campings are found

**File:** `frontend/components/CampingList.tsx`

When `campings.length === 0`, loading is false, and the zoom is adequate, the list renders a blank area with only "0 campings gevonden". A brief message explaining why (e.g. "geen campings in dit gebied") would improve UX.

---

### PERF-7 [MIDDEN] `CampingList` shows `cursor-pointer` but has no click handler

**File:** `frontend/components/CampingList.tsx`, line 50

Every row has `cursor-pointer` and a hover highlight, implying interactivity. There is no `onClick` handler. This is visually misleading until KAM-8 (detail overlay) is implemented.

---

## 3. Code Quality and Maintainability

### QUAL-1 [MIDDEN] `chat` endpoint is synchronous — blocks the event loop

**File:** `backend/main.py`, line 209

`def chat(...)` is a plain synchronous FastAPI handler. LiteLLM's `completion()` is a blocking call that can take several seconds. FastAPI runs sync handlers in a thread pool, which is safe, but on a single-worker server the Overpass tile-fetching async loop may be starved during a long LLM call. Using `async def` with `await asyncio.to_thread(completion, ...)` is more consistent with the rest of the async codebase.

---

### QUAL-2 [MIDDEN] `python-dotenv` is an implicit/transitive dependency

**File:** `backend/pyproject.toml`

`load_dotenv()` is called at line 19 of `main.py` and requires `python-dotenv`, but the package is not declared in `pyproject.toml`. It is currently pulled in transitively by `litellm`, but this could break on a future `litellm` release. It should be declared explicitly.

---

### QUAL-3 [MIDDEN] Initial UI greeting is included in the LLM chat history

**File:** `frontend/components/ChatPanel.tsx`, line 27

The `updated` array sent to `/api/chat` includes the hardcoded greeting `"Hallo! Ik ben kampeerhub..."`. This message was never generated by the LLM. Sending it as a prior assistant turn can confuse the model and wastes tokens as conversation grows. A separate `apiMessages` list that excludes the UI-only greeting would fix this.

---

### QUAL-4 [MIDDEN] `fee`/`charge` data fetched and typed but never displayed

**File:** `frontend/types/camping.ts`, `frontend/components/CampingList.tsx`

`Camping.tags` includes `fee?: string` and `charge?: string`, populated by the backend. These fields are not rendered in `CampingList`. The planned price filter (PLAN.md "Filterpanel") cannot work until this data is surfaced.

---

### QUAL-5 [MIDDEN] `mapRef` typed as `unknown`

**File:** `frontend/components/MapPanel.tsx`, line 13

`mapRef` is `useRef<unknown>(null)` and cast to `{ remove: () => void }` in cleanup. The Leaflet `Map` type is available from `@types/leaflet`. Using the real type eliminates the cast and makes the code self-documenting.

---

### QUAL-6 [LAAG] Chat message list uses array index as React key

**File:** `frontend/components/ChatPanel.tsx`, line 70

`key={i}` where `i` is the array index causes React to re-render all messages on every addition. A stable ID (e.g. `crypto.randomUUID()` assigned when the message is created) is the correct approach.

---

### QUAL-7 [LAAG] `DB_PATH` hardcodes the container path — breaks local development

**File:** `backend/main.py`, line 21

`/app/database/kampeerhub.db` only exists inside Docker. Running `uv run uvicorn main:app` locally writes to a path that may not exist, producing a confusing error. Using an environment variable `DATABASE_PATH` with a local default (e.g. `./database/kampeerhub.db`) would make local development work out of the box.

---

### QUAL-8 [LAAG] `pyproject.toml` description is the scaffold placeholder

**File:** `backend/pyproject.toml`, line 4

`description = "Add your description here"` was never updated. No functional impact.

---

## 4. Security

### SEC-1 [HOOG] No bbox validation enables Overpass quota exhaustion

**File:** `backend/main.py`, line 180

As noted in BUG-3, there is no validation on bounding-box parameters. A caller can pass extreme values to trigger hundreds of Overpass requests in one call, exhausting the public Overpass API quota for all users sharing the endpoint. This is also a Denial-of-Service vector against the application itself.

---

### SEC-2 [MIDDEN] Overpass query built with f-strings from user-controlled input

**File:** `backend/main.py`, lines 143-149

Tile coordinates are derived from integer math on validated floats, so injection is not possible today. However, if the input validation from SEC-1 is added and later relaxed, or if the input source changes, the f-string query construction becomes an injection vector. Overpass QL injection can cause expensive or malformed queries. Parameterized query construction or at least explicit integer casting of coordinates before interpolation would be safer.

---

### SEC-3 [MIDDEN] API key read on every chat request, not validated at startup

**File:** `backend/main.py`, line 224

`os.getenv("OPENROUTER_API_KEY")` is called on every request. If the key is removed from the environment after startup it silently becomes `None`, causing an opaque error. Reading and validating the key once in the `lifespan` handler and storing it as a module-level constant would make misconfiguration visible immediately at boot.

---

### SEC-4 [MIDDEN] Broad `except Exception as e` exposes internal error detail to client

**File:** `backend/main.py`, line 233

The catch-all handler passes the raw Python exception message to `HTTPException(detail=...)`, which is returned to the client. This can leak internal paths, library versions, or stack information. The exception should be logged server-side and a generic message returned to the client.

---

### SEC-5 [LAAG] No rate limiting on `/api/chat`

The chat endpoint is unauthenticated with no rate limiting. A single client can exhaust the OpenRouter API quota by rapid requests. For a personal/demo app this is acceptable, but should be addressed before any public deployment.

---

## 5. Architecture

### ARCH-1 [MIDDEN] Polling design creates unnecessary database load

The frontend polls `/api/campings` every 3 seconds while `fetching: true`. For a viewport with many missing tiles this means a database round-trip every 3 seconds for several minutes. Server-Sent Events (SSE) — already described in PLAN.md as the intended real-time mechanism — would eliminate polling: the backend pushes a notification when a batch of tiles is ready.

---

### ARCH-2 [LAAG] No React error boundary around `MapPanel`

**File:** `frontend/app/page.tsx`

Leaflet initialisation can throw (e.g. if the container renders at zero size). Without an error boundary, an unhandled exception in `MapPanel` crashes the entire page. Wrapping `<MapPanel>` in an `<ErrorBoundary>` would isolate the failure.

---

### ARCH-3 [LAAG] Docker container runs as root

**File:** `Dockerfile`

The runtime stage has no `USER` directive, so `uvicorn` runs as root inside the container. Adding a non-root user is a minimal hardening step recommended for production images.

---

### ARCH-4 [LAAG] `useOverpass` hook is growing in complexity

**File:** `frontend/hooks/useOverpass.ts`

The hook combines debouncing, shift-threshold calculation, polling, abort control, and state in 104 lines. As filters (KAM-7) and additional parameters are added, this will grow further. A dedicated `useBoundsDebounce` helper that returns the stable, debounced bounds would keep the data-fetching logic in `useOverpass` focused.

---

## Issue Summary

| ID | Priority | Area | Title |
|---|---|---|---|
| BUG-1 | HOOG | Correctheid | Race condition in `_fetching_tiles` set |
| BUG-2 | HOOG | Correctheid | SQLite connections not closed on exception |
| BUG-3 | HOOG | Correctheid / Security | No bbox parameter validation on `/api/campings` |
| BUG-4 | MIDDEN | Correctheid | Silent exception swallowing in tile fetch |
| BUG-5 | MIDDEN | Correctheid | Poll can fire after component unmount |
| BUG-6 | MIDDEN | Correctheid | KAM-5 not implemented — no map markers |
| BUG-7 | MIDDEN | Correctheid | `ChatResponse.action` logged but not executed |
| BUG-8 | LAAG | Correctheid | Shift ratio unstable at high zoom |
| BUG-9 | LAAG | Correctheid | Antimeridian crossing not handled in `tile_keys` |
| PERF-1 | HOOG | Performance | No tile cap — up to 48 sequential Overpass requests at zoom 9 |
| PERF-2 | HOOG | UX | Status dot hardcoded green regardless of error/loading state |
| PERF-3 | MIDDEN | Performance | Google Fonts CDN dependency breaks offline Docker builds |
| PERF-4 | MIDDEN | Performance | Tile cache has no TTL / expiry |
| PERF-5 | MIDDEN | Performance | Double initial bounds emit from MapPanel |
| PERF-6 | MIDDEN | UX | No empty-state message in camping list |
| PERF-7 | MIDDEN | UX | `cursor-pointer` on camping rows with no click handler |
| QUAL-1 | MIDDEN | Kwaliteit | Sync LLM handler — blocks event loop under concurrent load |
| QUAL-2 | MIDDEN | Kwaliteit | `python-dotenv` is an implicit transitive dependency |
| QUAL-3 | MIDDEN | Kwaliteit | Hardcoded UI greeting included in LLM chat history |
| QUAL-4 | MIDDEN | Kwaliteit | `fee`/`charge` fetched and typed but never displayed |
| QUAL-5 | MIDDEN | Kwaliteit | `mapRef` typed as `unknown` instead of Leaflet `Map` |
| QUAL-6 | LAAG | Kwaliteit | Array index used as React key in chat messages |
| QUAL-7 | LAAG | Kwaliteit | Hardcoded container DB path breaks local development |
| QUAL-8 | LAAG | Kwaliteit | Placeholder description in `pyproject.toml` |
| SEC-1 | HOOG | Beveiliging | No bbox validation — Overpass quota exhaustion / DoS |
| SEC-2 | MIDDEN | Beveiliging | Overpass query built with f-strings from user input |
| SEC-3 | MIDDEN | Beveiliging | API key read per-request, not validated at startup |
| SEC-4 | MIDDEN | Beveiliging | Broad except exposes raw Python error detail to client |
| SEC-5 | LAAG | Beveiliging | No rate limiting on `/api/chat` |
| ARCH-1 | MIDDEN | Architectuur | Polling creates unnecessary database load — SSE would be better |
| ARCH-2 | LAAG | Architectuur | No React error boundary around `MapPanel` |
| ARCH-3 | LAAG | Architectuur | Docker container runs as root |
| ARCH-4 | LAAG | Architectuur | `useOverpass` hook growing in complexity |

---

## Gaps Relative to PLAN.md

| PLAN.md item | Status | Note |
|---|---|---|
| KAM-5 Pins on map | Missing | `MapPanel` has no markers prop; campings not shown on map |
| KAM-7 Filters | Missing | No filter panel exists |
| KAM-8 Detail overlay | Missing | Click on camping does nothing |
| KAM-9 Weather widget | Missing | Open-Meteo not integrated |
| KAM-10 Favourites | Missing | |
| KAM-11 Deploy | Missing | |
| E2E tests | Missing | `test/` directory does not exist |
| Backend unit tests | Missing | |
| SSE streaming `/api/stream/*` | Missing | Described as "to be determined" in PLAN.md |
| Filter panel (dogs/wifi/pool/electricity) | Missing | |
| Distance to sea | Missing | No tag or calculation present |
| Price display in list | Missing | `fee`/`charge` in type but not rendered |
| Connection status indicator (live) | Partial | Dot present but hardcoded green |
| `ChatResponse.action` auto-execution | Partial | Only `console.log`, no further handling |

---

## Positive Observations

- The tile-based backend caching design is well-conceived: OSM data is fetched once per 1x1 degree tile and served instantly on all subsequent requests.
- `_overpass_lock` prevents concurrent Overpass requests — good citizenship toward the public API.
- `useOverpass` correctly handles AbortController, unmount cleanup, and debouncing in one hook.
- `rel="noopener noreferrer"` is consistently applied on all external links.
- The `LLM_MOCK` pattern enables testable, API-key-free development — good design.
- Dockerfile multi-stage build is clean and produces a minimal runtime image with `uv sync --frozen --no-dev`.
- WAL mode on SQLite (`PRAGMA journal_mode=WAL`) is the right choice for this read-heavy workload with background writes.
- Input length limits are enforced on the chat endpoint via Pydantic `Field(max_length=...)`.
- Dark-theme colours (`#0d1117`, `#ecad0a`, `#209dd7`, `#753991`) are applied consistently throughout, matching the design spec in PLAN.md.
- `maxsize:1048576` in the Overpass query prevents excessively large responses.
