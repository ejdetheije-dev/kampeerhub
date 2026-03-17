# kampeerhub — Code Review

Reviewed by: Claude Sonnet 4.6
Date: 2026-03-17

---

## Summary

The project has a solid foundation for KAM-1 (scaffold) and KAM-2 (AI chat). The architecture aligns with the plan: single Docker container, FastAPI backend, Next.js static export, Tailwind dark theme, Leaflet map placeholder, and a working chat panel. However, the codebase is at an early stage. Most features described in the plan are not yet implemented and several concrete bugs and structural gaps exist.

---

## 1. What Is Working

- Docker multi-stage build correctly copies the Next.js static export into the Python image and serves it from FastAPI.
- `/api/health` and `/api/chat` endpoints are implemented.
- ChatPanel sends messages to `/api/chat`, renders responses, and handles loading state.
- MapPanel initialises Leaflet with a dynamic import to avoid SSR issues, centres on France, uses the correct OSM tile URL, and applies the default marker icon fix.
- Dark theme, brand colours, and the split-screen layout all match the visual spec in the plan.
- `.env.example` is committed; `.env` is gitignored.
- Scripts exist for Mac and Windows.

---

## 2. Bugs and Correctness Issues

### 2.1 Backend: synchronous chat handler blocks the event loop

`main.py` line 64 declares `chat()` as a plain `def`, not `async def`. FastAPI runs synchronous route handlers in a thread-pool, so this does not crash, but `litellm.completion()` is a blocking HTTP call. Under concurrent requests this will exhaust the thread pool. The plan calls for streaming (`/api/stream/*`), which will require an async handler anyway.

File: `C:\Users\Gebruiker\projects\kampeerhub\backend\main.py`, line 64.

### 2.2 Backend: no LLM_MOCK support

The plan (section 9) explicitly requires `LLM_MOCK=true` to return deterministic responses for testing and CI. The current `chat()` handler always calls LiteLLM regardless of the environment variable. Any test run or CI pipeline without a live `OPENROUTER_API_KEY` will fail.

File: `C:\Users\Gebruiker\projects\kampeerhub\backend\main.py`, lines 63–77.

### 2.3 Backend: unhandled LiteLLM errors crash with HTTP 500

`completion()` can raise `litellm.exceptions.AuthenticationError`, `litellm.exceptions.RateLimitError`, `litellm.exceptions.ServiceUnavailableError`, and others. None are caught. The frontend receives an opaque 500 and shows "Verbindingsfout" with no further detail. At minimum, API key absence and rate-limit errors should return a clear HTTP 4xx with a message the frontend can display.

File: `C:\Users\Gebruiker\projects\kampeerhub\backend\main.py`, lines 69–77.

### 2.4 Backend: `response_format=ChatResponse` may not work with this model/router

The `openrouter/openai/gpt-oss-120b` model routed through Cerebras does not guarantee OpenAI-style structured outputs. Passing a Pydantic class as `response_format` is an OpenAI-specific feature. If the model returns free-form JSON or plain text, `ChatResponse.model_validate_json(response.choices[0].message.content)` will raise a `ValidationError` and return HTTP 500. There is no fallback parsing.

File: `C:\Users\Gebruiker\projects\kampeerhub\backend\main.py`, lines 69–77.

### 2.5 Backend: `reasoning_effort` is not a standard LiteLLM parameter

`reasoning_effort="low"` is not part of the LiteLLM `completion()` signature for this model. It may be silently ignored or cause an unexpected error depending on the LiteLLM version. The intent (cheap/fast inference) is correct but the mechanism needs verification against the actual LiteLLM docs for the installed version.

File: `C:\Users\Gebruiker\projects\kampeerhub\backend\main.py`, line 73.

### 2.6 Backend: DB path inconsistency

The plan (section 4) says the database file lives at `db/boilerplate.db` inside the container and the Docker volume mounts to `/app/db`. The `docker-compose.yml` mounts the volume to `/app/database`. `main.py` writes to `/app/database/kampeerhub.db`. The docker run command in the start scripts also uses `/app/database`. So the code and scripts are internally consistent, but they diverge from the path described in the plan (`/app/db`, `db/boilerplate.db`). The plan text is simply out of date. Not a runtime bug, but the plan should be updated to avoid confusing future agents.

Files: `C:\Users\Gebruiker\projects\kampeerhub\backend\main.py` line 14, `C:\Users\Gebruiker\projects\kampeerhub\docker-compose.yml` line 7.

### 2.7 Frontend: connection status indicator is always green

`page.tsx` line 12 renders a hardcoded green dot with no logic behind it. The plan (section 2) specifies a live indicator that changes colour based on connection state. As a static badge it is misleading — it shows "verbonden" even when the backend is unreachable.

File: `C:\Users\Gebruiker\projects\kampeerhub\frontend\app\page.tsx`, line 12.

### 2.8 Frontend: MapPanel cleanup races with Leaflet async import

The `useEffect` cleanup function at line 34–38 of `MapPanel.tsx` runs synchronously on unmount. If the component unmounts while the `import("leaflet")` promise is still in flight, `mapRef.current` is null when cleanup runs, so no cleanup happens. When the promise resolves after unmount it calls `L.map(containerRef.current!)` on an already-detached DOM node, which throws a Leaflet error. This is a React StrictMode problem the plan explicitly warns about (CLAUDE.md "Aandachtspunten").

File: `C:\Users\Gebruiker\projects\kampeerhub\frontend\components\MapPanel.tsx`, lines 10–40.

### 2.9 Frontend: Leaflet marker images loaded from unpkg CDN

The default icon fix in `MapPanel.tsx` loads marker images from `https://unpkg.com/leaflet@1.9.4/...`. This introduces a runtime dependency on an external CDN. In a containerised/offline environment the markers will be broken. The images should be bundled locally or served from the same origin.

File: `C:\Users\Gebruiker\projects\kampeerhub\frontend\components\MapPanel.tsx`, lines 19–21.

### 2.10 Frontend: `react-leaflet` is installed but not used

`package.json` declares `react-leaflet@^5.0.0` as a dependency. `MapPanel.tsx` uses raw Leaflet via dynamic import instead. `react-leaflet` adds bundle weight for no benefit and will be flagged by tree-shaking/linting tools.

File: `C:\Users\Gebruiker\projects\kampeerhub\frontend\package.json`, line 17.

---

## 3. Security Issues

### 3.1 No input validation on chat messages beyond Pydantic types

The `/api/chat` endpoint accepts an unbounded `list[ChatMessage]`, each with an unbounded `content: str`. A caller can submit a very large conversation history (hundreds of messages, megabytes of text) which is forwarded directly to LiteLLM. There is no length limit on individual messages or on the total list. This risks excessive LLM token costs and potential timeout/OOM conditions.

### 3.2 OPENROUTER_API_KEY is read at call time with no startup check

`os.getenv("OPENROUTER_API_KEY")` is evaluated inside the request handler. If the key is missing the request silently passes `None` to LiteLLM, which will fail at the LiteLLM layer with an authentication error (returning HTTP 500). A startup check in `lifespan()` that warns or raises when the key is absent (and `LLM_MOCK` is false) would surface misconfiguration early.

### 3.3 No rate limiting on `/api/chat`

The chat endpoint has no per-IP or per-session rate limiting. Each call hits the paid OpenRouter API. In a public deployment this is a direct cost risk.

---

## 4. Architecture Alignment with the Plan

| Plan item | Status |
|---|---|
| KAM-1 scaffold: FastAPI, Next.js, Docker, scripts | Done |
| KAM-2 AI chat `/api/chat` | Done (with caveats in section 2) |
| KAM-3 Leaflet map with OSM tiles | Map renders, but no campsite pins |
| KAM-4 Overpass API hook | Not implemented |
| KAM-5 Campsite pins on map | Not implemented |
| KAM-6 CampingList from real data | Hardcoded placeholder data only |
| KAM-7 Filters panel | Not implemented |
| KAM-8 Detail overlay | Not implemented |
| KAM-9 Weather widget (Open-Meteo) | Not implemented |
| KAM-10 Favourites | Not implemented |
| KAM-11 Deploy | Not implemented |
| SSE streaming endpoint `/api/stream/*` | Not implemented |
| SQLite schema | Empty — `init_db()` only enables WAL, no tables created |
| LLM_MOCK mode | Not implemented |
| E2E tests in `test/` | Directory does not exist |
| Unit tests (backend pytest) | No test files present |
| Unit tests (frontend) | No test files present |
| `ChatResponse.action` used by frontend | `action` field is returned by backend but frontend (`ChatPanel.tsx` line 38) reads only `data.message` — the action is discarded |

### Notable: `ChatResponse.action` is never acted upon

The plan (section 9) states that actions specified by the LLM execute automatically. The `ChatResponse` model exposes `action: Literal["none", "search", "set_preference"]`. The frontend reads `data.message` only and throws away `data.action`. The auto-execution loop that the plan describes does not exist.

File: `C:\Users\Gebruiker\projects\kampeerhub\frontend\components\ChatPanel.tsx`, line 38.

---

## 5. Code Quality

- Backend code is clean and minimal — appropriate for the current stage.
- `aiosqlite` is listed as a dependency in `pyproject.toml` but is not imported or used anywhere. The `init_db()` function uses the synchronous `sqlite3` module.
- The `database/` directory has no `.gitkeep` file (the plan says it should). The directory itself may not be committed, which could cause Docker volume mount issues on first run.
- `layout.tsx` sets `lang="en"` but the app is entirely in Dutch. Should be `lang="nl"`.
- The `html` attribute in `layout.tsx` could cause a Tailwind `dark` mode setup issue if dark mode is configured via the `html` class strategy. Currently unused but worth noting.
- `globals.css` imports Tailwind with `@import "tailwindcss"` which is the Tailwind v4 syntax — consistent with the `^4` version in `package.json`. This is correct.
- The `frontend/public/` directory contains Next.js boilerplate SVGs (`vercel.svg`, `next.svg`, etc.) that are never used and should be removed to keep the project clean.

---

## 6. Performance Concerns

- Leaflet is loaded via dynamic `import()` on mount, which is correct for avoiding SSR bundle weight. No concern here.
- The plan warns explicitly about Overpass API rate limiting (debounce 500ms, only refetch when view shifts >30%). This logic does not yet exist because Overpass is not implemented. When it is built, this requirement must be observed.
- The chat handler sends the full conversation history on every message (line 67 in `main.py`: `messages += [{"role": m.role, "content": m.content} for m in req.messages]`). There is no truncation strategy for long conversations. As conversations grow this will increase latency and token cost linearly.

---

## 7. Docker and Scripts

- `start_mac.sh` uses `--rm` on the `docker run` command. Combined with a named container (`--name kampeerhub`), this means the container is automatically removed when it stops. Stopping via `stop_mac.sh` (`docker stop kampeerhub`) works correctly. This is intentional and idempotent.
- The Windows build check `!(docker image inspect $IMAGE 2>$null)` is not reliable PowerShell — `docker image inspect` returns a non-null string on failure too. The check may not correctly detect a missing image on all Windows Docker Desktop versions.
- Neither start script prints a clear error message if `.env` is missing. The `--env-file .env` flag will cause `docker run` to fail with a cryptic Docker error if the file does not exist.
- The plan says the start script should "optionally open the browser". Neither script opens the browser.

---

## 8. Testing

- The `test/` directory does not exist. No E2E test infrastructure has been created.
- There are no backend unit tests (`pytest` or similar).
- There are no frontend unit tests.
- `LLM_MOCK` mode is not implemented, which is a blocker for writing any automated test of the chat flow.

---

## Priority Findings (Recommended Next Actions)

1. **Implement `LLM_MOCK`** — blocks all testing. Without it no CI/CD pipeline can run.
2. **Fix the `ChatResponse.action` discard** — the core agentic loop described in the plan is silently broken.
3. **Add error handling in `/api/chat`** — bare LiteLLM errors produce opaque HTTP 500 responses.
4. **Fix MapPanel unmount race** — will cause visible errors in React StrictMode (development).
5. **Remove unused `react-leaflet` dependency** — no-cost cleanup.
6. **Create `database/.gitkeep`** — ensures the volume mount target exists in the repo.
7. **Implement Overpass API hook + campsite pins** — the next planned step (KAM-4/KAM-5).
8. **Add input length limits to `/api/chat`** — basic cost and safety guard.
