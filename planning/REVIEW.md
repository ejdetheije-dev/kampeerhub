# Code Review — kampeerhub

Review date: 2026-03-19
Reviewer: Claude Sonnet 4.6
Scope: Full codebase after KAM-13 (current HEAD), reviewed against PLAN.md

Severity levels: CRITICAL / HIGH / MEDIUM / LOW / INFO

---

## Summary

The project is well-structured for its scope. The incremental build is clearly reflected in the code. The backend is lean and correct in its core logic, the frontend component split is clean, and the Docker setup works as designed. The most pressing concerns are: a SQLite database and Playwright artifacts committed to git, a persistent polling loop bug in `useWaterBodies` that fires indefinitely for inland areas, weak geocoding safety (no caching, insufficient User-Agent for Nominatim policy), silent failure when `select_camping` finds nothing in the current view, and a complete absence of automated tests. Several lower-severity code quality and spec-drift issues are also documented below.

---

## Issues by Severity

### CRITICAL

#### C-1: SQLite database committed to git
**File:** `backend/dev.db` (committed in commit `9d2890f`, git-tracked as confirmed by `git ls-files`)

`backend/dev.db` is tracked in git. The `.gitignore` only excludes `database/*.db`, not `backend/*.db`. The file contains ~2.5 MB of OSM camping data fetched during development. Any user cloning the repo receives a pre-populated, potentially stale database, and any future cached response containing sensitive information would be exposed in the repository history.

Additionally, `backend/dev.db` is copied into the Docker production image by the `COPY backend/ ./` instruction in `Dockerfile` line 21, inflating the image with a development artefact.

**Required actions:**
1. Add `backend/*.db` to `.gitignore`.
2. Remove `backend/dev.db` from git: `git rm --cached backend/dev.db`.

---

#### C-2: Playwright MCP session artefacts committed to git
**Files:** `.playwright-mcp/` directory (24+ files: PNG screenshots up to 1.6 MB each, and console log files, all git-tracked)

The `.playwright-mcp/` directory is fully tracked. These are ephemeral debugging artefacts from ad-hoc browser sessions during development. They add significant repository weight, have no value to future contributors, and the console logs may contain session-specific data.

Similarly, eight screenshot PNG files (`bordeaux-nav.png`, `chat-test.png`, `filter-result.png`, `filters-active.png`, `filter-test.png`, `map-state.png`, `map-zoom2.png`, `map-zoomed.png`) are committed at the project root with no README references.

**Required actions:**
1. Add `.playwright-mcp/` and root-level `*.png` test screenshots to `.gitignore`.
2. Remove from git history.

---

### HIGH

#### H-1: Persistent polling loop in `useWaterBodies` for inland areas with zero water
**File:** `frontend/hooks/useWaterBodies.ts`, line 48

```typescript
if (data.fetching || data.points.length === 0) {
  pollRef.current = setTimeout(() => {
    if (mountedRef.current) doFetch(b);
  }, POLL_MS);
}
```

When a tile is fully cached but contains zero water points (any inland area with no beaches, large lakes, or major rivers), `data.fetching` is `false` and `data.points.length` is `0`. The condition `data.points.length === 0` re-schedules a poll every 5 seconds indefinitely, even though the backend has complete, correct data indicating no water exists in that tile. This causes continuous unnecessary HTTP traffic for the lifetime of the session.

The `useOverpass` hook does not have this bug — it stops polling when `fetching` is `false`.

**Fix:** Only continue polling if `data.fetching` is `true`. Remove the `data.points.length === 0` condition from the poll trigger. An area with no water is valid final state.

---

#### H-2: `asyncio.to_thread` used in tile fetch — contradicts PLAN.md architecture note
**File:** `backend/main.py`, lines 250 and 289

PLAN.md `Aandachtspunten` explicitly states: "`asyncio.to_thread` NIET gebruiken — kan niet geannuleerd worden waardoor threads accumuleren." This guidance was written for the LLM call, but the same risk applies to `store_tile` (line 250) and `store_water_tile` (line 289), which are called via `asyncio.to_thread` inside background tile-fetch tasks. If many tiles are being fetched simultaneously and the background tasks are abandoned, the write threads cannot be cancelled.

The `asyncio.to_thread` usage on lines 333 and 364 (for the read queries in API handlers) is correct — without offloading, the synchronous SQLite reads would block the event loop. The inconsistency is specifically in the background write calls inside `fetch_tile` and `fetch_water_tile`.

---

#### H-3: Nominatim usage without rate limiting or response caching
**File:** `backend/main.py`, line 412

The `geocode` function calls Nominatim on every `navigate_map` chat action with no caching, no rate limiting, and no deduplication. Nominatim's usage policy requires a maximum of 1 request/second and discourages automated use without caching. A user who issues multiple rapid navigation requests (or an automated test run) could trigger IP-based blocking of the backend.

The `User-Agent` is `kampeerhub/1.0`. Nominatim policy requires an identifying `User-Agent` that includes a contact URL or email address. The current value is technically non-compliant.

**Minimum fix:** Cache geocoding results in a simple `dict` keyed by `location_name.lower()` for the lifetime of the process. This costs no persistent storage and avoids repeat calls for common locations like "France" or "Bretagne".

---

#### H-4: `select_camping` action silently does nothing if camping is not in current view
**File:** `frontend/app/page.tsx`, lines 180-185

```typescript
onSelectCamping={(name) => {
  const found = campings.find((c) =>
    c.name.toLowerCase().includes(name.toLowerCase())
  );
  if (found) handleSelectCamping(found);
}}
```

The LLM may name a camping that exists in OSM but is not within the current viewport. `campings` only contains campings currently loaded for the visible area. When `found` is `undefined`, the action silently does nothing. The chat panel shows the AI's message (e.g., "Ik selecteer camping X") but nothing happens on the map. The user receives no indication that the camping was not found in the current view.

---

#### H-5: Water bodies `fetching` flag returns `True` for any uncached tile, not just in-flight ones
**File:** `backend/main.py`, lines 365-368

```python
fetching = any(
    t in _fetching_water_tiles or not is_water_tile_cached(t)
    for t in tiles
)
```

Unlike the camping endpoint (which checks `_tile_retry_after` to distinguish in-flight from cooldown), the water bodies `fetching` flag returns `True` for any tile that is simply not yet cached — including tiles that may be in cooldown or have not been requested. Combined with H-1, this means areas with uncached water tiles perpetually report `fetching: True`, causing the client to poll indefinitely even after all possible tile requests have been dispatched.

---

### MEDIUM

#### M-1: Camping list sort uses squared Euclidean distance, not Haversine
**File:** `frontend/app/page.tsx`, lines 81-85

```typescript
const da = (a.lat - clat) ** 2 + (a.lon - clon) ** 2;
const db = (b.lat - clat) ** 2 + (b.lon - clon) ** 2;
```

The sort uses squared Euclidean distance in degrees, which distorts at northern latitudes. At ~46°N (France), a degree of longitude is ~70 km while a degree of latitude is ~111 km, so the sort order can be measurably wrong for campings at similar distances. A `haversine` function is already defined and used in the same file (line 15). Using it here is a one-line change.

---

#### M-2: Weather fetch has no error UI — shows "loading" indefinitely on failure
**File:** `frontend/components/DetailOverlay.tsx`, line 81

```typescript
.catch(() => {});
```

If Open-Meteo fails (network error, rate limit, API change), the weather section displays "weer laden..." indefinitely. There is no timeout, no retry, and no "weather unavailable" state. The user has no indication that weather data will never arrive for this camping.

---

#### M-3: `TAG_LABELS` constant duplicated across two components
**Files:** `frontend/components/CampingList.tsx` lines 6-12, `frontend/components/DetailOverlay.tsx` lines 6-12

Identical `TAG_LABELS` map defined in both files. If a tag label is added or changed, both files must be updated in sync. The constant should be extracted to `frontend/types/camping.ts` or a shared utility.

---

#### M-4: `HeartIcon` component duplicated across two components
**Files:** `frontend/components/CampingList.tsx` lines 14-23, `frontend/components/DetailOverlay.tsx` lines 34-44

The SVG heart icon component is copy-pasted identically into both files. It should be extracted to a shared component file.

---

#### M-5: `capacity` OSM tag parsing rejects common real-world values
**File:** `backend/main.py`, line 144

```python
"capacity": int(cap) if cap.isdigit() else None,
```

`str.isdigit()` returns `False` for values like `"150-200"`, `"~100"`, `"50 pitches"`, or `"250 "` (trailing space), all of which appear in real OSM data. These campings will have `capacity: null` and will be excluded from or included in size filters incorrectly. A more robust approach would parse the first contiguous digit sequence from the string.

---

#### M-6: `dog` filter misses the common OSM tag value `dog=leashed`
**File:** `backend/main.py`, line 139

```python
"dog": t.get("dog") == "yes",
```

`dog=leashed` is a valid and common OSM value for campsites that allow dogs on a leash. These campsites are stored as `dog: false` and filtered out when the user enables the dog filter, causing false negatives. The PLAN.md describes the intent as "honden toegestaan" (dogs permitted), which `dog=leashed` satisfies.

---

#### M-7: `size_type` from AI chat applied via unsafe type cast
**File:** `frontend/app/page.tsx`, line 174

```typescript
...(patch.size_type !== undefined ? { sizeType: patch.size_type as SizeType } : {}),
```

The `as SizeType` cast bypasses TypeScript type safety. If the LLM returns an invalid value (e.g., `"huge"` or `"groot"`), `sizeType` is silently set to a string that matches no filter branch. The valid values should be validated at runtime with a guard like `(["all","small","medium","large","naturist"] as const).includes(patch.size_type)`.

---

#### M-8: No input length or character validation on `location_name` in geocode
**File:** `backend/main.py`, line 412

The `location_name` from the parsed LLM response is passed directly to Nominatim without any length check or sanitisation. While this is not a SQL injection risk, a malformed or adversarially extended LLM response could pass very long strings as query parameters. The `ChatMessage.content` has a 4000-character limit, but there is no limit on the length of `location_name` within the parsed structured response.

---

#### M-9: `DATABASE_PATH` environment variable is undocumented
**File:** `backend/main.py`, line 25; `.env.example`

```python
DB_PATH = Path(os.getenv("DATABASE_PATH", "/app/database/kampeerhub.db"))
```

The `DATABASE_PATH` override is not mentioned in `.env.example` or PLAN.md. During local development outside Docker, the path `/app/database/kampeerhub.db` does not exist and the directory is auto-created at the root filesystem level, which is unexpected. The existence of `backend/dev.db` in git (C-1) suggests this was worked around by committing a database rather than setting the env var. Adding `DATABASE_PATH=./database/kampeerhub.db` to `.env.example` with a comment would resolve this.

---

### LOW

#### L-1: Tile TTL of 7 days is inconsistently named vs. intended behaviour
**File:** `backend/main.py`, line 28

`TILE_TTL_SECONDS = 7 * 24 * 3600`. PLAN.md describes tiles as "permanent gecached" (permanently cached). The `TILE_TTL` name implies expiry, but the intent appears to be permanent caching. If the intent is truly permanent, the TTL logic should be removed and the table should use a simple "fetched: boolean" flag. If 7-day expiry is intended, it should be documented as such in the code and PLAN.md.

---

#### L-2: `MAX_TILES` exceeded returns empty result with no indication to client
**File:** `backend/main.py`, lines 318-319

```python
if len(tiles) > MAX_TILES:
    return {"campings": [], "fetching": False}
```

When the bounding box covers more than 16 tiles, the endpoint returns an empty list with `fetching: False` and no error message. The frontend `tooFarOut` guard based on zoom level is the primary protection, but if the zoom threshold and tile limit ever diverge, the user sees no campings with no explanation.

---

#### L-3: `onMapReady` flyTo ref is a stale closure if `MapPanel` remounts
**File:** `frontend/app/page.tsx`, line 135; `frontend/components/MapPanel.tsx`, line 78

The `flyTo` function is captured once during map initialisation. If `MapPanel` were unmounted and remounted (e.g., in a future tab-switching feature), `mapFlyToRef.current` in the parent would hold a stale reference. This works correctly in the current single-page setup but is a latent bug.

---

#### L-4: Docker `Dockerfile` copies `backend/` after lockfile install, re-copying redundant files
**File:** `Dockerfile`, lines 17-21

```dockerfile
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev
COPY backend/ ./
```

`COPY backend/ ./` re-copies `pyproject.toml` and `uv.lock` over themselves. More critically, it also copies any `.db` files present in `backend/` (such as `backend/dev.db`) into the production image. Once C-1 is resolved this will be less dangerous, but explicitly excluding database files via `.dockerignore` would be more robust.

---

#### L-5: `start_mac.sh` does not open the browser
**File:** `scripts/start_mac.sh`

PLAN.md section 11 states the script should "optionally open the browser." The script only prints the URL. On macOS, `open http://localhost:8000` would satisfy this requirement.

---

#### L-6: `ChatPanel` uses hardcoded `slice(1)` to exclude greeting — fragile
**File:** `frontend/components/ChatPanel.tsx`, line 52

```typescript
const apiMessages = updated.slice(1).slice(-6);
```

The `slice(1)` assumes the greeting is always the first element. If the initial `useState` ever changes (additional welcome messages, or the greeting is removed), this silently skips or includes the wrong messages. A comment explains the intent, but tracking API messages in a separate state variable would be more robust.

---

#### L-7: `global _overpass_cooldown_until` declared in two separate functions
**File:** `backend/main.py`, lines 238 and 272

Both `fetch_tile` and `fetch_water_tile` declare `global _overpass_cooldown_until`. This is valid Python but represents shared mutable global state spread across two functions. If a third tile type is added, the developer must remember to add the `global` declaration. Encapsulating the cooldown state in a small class or dataclass would be cleaner.

---

### INFO

#### I-1: No automated tests of any kind
**Files:** `test/` directory does not exist; no pytest files in `backend/`; no Jest/RTL tests in `frontend/`

PLAN.md section 12 specifies backend pytest tests for LLM parsing and API routes, frontend component tests, and E2E Playwright tests with `LLM_MOCK=true`. None of these exist. This is acknowledged in PLAN.md but the gap is material for a project described as demonstrating production-quality output.

The highest-priority missing test is for the `ChatResponse` parsing path in `backend/main.py` — a malformed LLM response currently falls through to a generic error with no test catching regressions.

---

#### I-2: PLAN.md section 9 `ChatResponse` schema is significantly out of date
**File:** `planning/PLAN.md`, section 9

The spec documents:
```python
class ChatResponse(BaseModel):
    message: str
    action: Literal["none", "search", "set_preference"] = "none"
```

The actual implementation in `backend/main.py` (lines 398-404) has actions `navigate_map`, `set_filters`, `set_travel_range`, `select_camping` and additional payload fields `navigate`, `filters`, `travel_hours`, `camping_name`. The spec should be updated to reflect the current schema.

---

#### I-3: PLAN.md SSE streaming endpoint described but not implemented
**File:** `planning/PLAN.md`, section 3 architecture diagram

The architecture shows `/api/stream/*` SSE endpoints. No SSE endpoint exists; polling is used instead. This is a conscious trade-off (polling works correctly) but the spec has not been updated to reflect the decision or explicitly defer SSE.

---

#### I-4: Vision mentions reservation capability — never deferred in PLAN.md
**File:** `planning/PLAN.md`, section 1 Vision

"It can execute reservations to the chose campsite on the user's behalf." No reservation flow exists anywhere in the codebase. This feature is not mentioned in the build order table, has not been explicitly deferred, and there is no external booking API integrated. The vision section should be updated to reflect current scope.

---

#### I-5: `wifi` tag includes `internet_access=yes` which is broader than wifi
**File:** `backend/main.py`, line 140

```python
"wifi": t.get("internet_access") in ("wlan", "yes"),
```

`internet_access=yes` is a catch-all that can mean a wired ethernet port in a reception building, not necessarily wifi. This may produce false positives in the wifi filter. Only `wlan` strictly means wifi in OSM convention.

---

#### I-6: Root-level screenshots not referenced anywhere but committed
**Files:** `bordeaux-nav.png`, `chat-test.png`, `filter-result.png`, `filters-active.png`, `filter-test.png`, `map-state.png`, `map-zoom2.png`, `map-zoomed.png` (at project root)

Eight screenshot files from manual testing sessions are committed at the project root. No README or documentation references them. They add approximately 10 MB of binary history.

---

## Architecture Observations

**Strengths:**
- Single-file backend (`main.py`, ~480 lines) is readable and self-contained.
- The asyncio lock pattern for Overpass serialisation is correct and well-commented.
- The `useOverpass` hook's debounce + 30% shift threshold is a good UX decision.
- Ref-based Leaflet initialisation pattern correctly avoids StrictMode double-mount.
- `LLM_MOCK` escape hatch is well-designed for future test use.
- WAL mode on SQLite is the right choice for this read-heavy + background-write workload.
- `rel="noopener noreferrer"` is consistently applied on all external links.
- Input length limits on chat endpoint via Pydantic `Field(max_length=...)` are in place.

**Gaps vs PLAN.md:**
- SSE streaming (section 3): not implemented; polling is used.
- E2E tests (section 12): not started.
- Backend unit tests (section 12): not started.
- Reservation capability (section 1): not started, not deferred.
- `ChatResponse` schema in PLAN.md section 9 is stale.

---

## Priority Remediation Order

| Priority | Issue | File | Effort |
|---|---|---|---|
| 1 | C-1: Remove `backend/dev.db` from git | `.gitignore`, git history | Low |
| 2 | C-2: Remove `.playwright-mcp/` and root PNGs from git | `.gitignore`, git history | Low |
| 3 | H-1: Fix persistent poll in `useWaterBodies` | `frontend/hooks/useWaterBodies.ts:48` | Low |
| 4 | H-4: Add feedback when `select_camping` finds no match | `frontend/app/page.tsx:180` | Low |
| 5 | H-3: Add Nominatim response caching + fix User-Agent | `backend/main.py:407` | Low |
| 6 | M-1: Use Haversine for camping list sort | `frontend/app/page.tsx:82` | Low |
| 7 | M-2: Add weather error/timeout state in DetailOverlay | `frontend/components/DetailOverlay.tsx:81` | Low |
| 8 | M-3/M-4: Extract shared `TAG_LABELS` and `HeartIcon` | Multiple components | Low |
| 9 | M-5/M-6: Improve capacity and dog tag parsing | `backend/main.py:139,144` | Low |
| 10 | M-7: Validate `size_type` at runtime before cast | `frontend/app/page.tsx:174` | Low |
| 11 | M-9: Document `DATABASE_PATH` in `.env.example` | `.env.example` | Low |
| 12 | I-1: Write backend unit tests for chat endpoint | new `backend/tests/` | High |
| 13 | I-2: Update PLAN.md `ChatResponse` schema | `planning/PLAN.md` section 9 | Low |
| 14 | L-4: Add `.dockerignore` to exclude `backend/*.db` | new `.dockerignore` | Low |
