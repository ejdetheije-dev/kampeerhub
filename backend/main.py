"""Kampeerhub FastAPI backend."""
import asyncio
import json
import logging
import math
import os
import sqlite3
import time
from contextlib import asynccontextmanager, closing
from pathlib import Path
from typing import Literal

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from litellm import completion
from litellm.exceptions import AuthenticationError, RateLimitError, ServiceUnavailableError
from pydantic import BaseModel, Field

load_dotenv()

logger = logging.getLogger("kampeerhub")

DB_PATH = Path(os.getenv("DATABASE_PATH", "/app/database/kampeerhub.db"))
STATIC_DIR = Path(__file__).parent / "static"
OVERPASS_URL = "https://overpass-api.de/api/interpreter"
TILE_TTL_SECONDS = 7 * 24 * 3600  # 7 days
MAX_TILES = 16

MODEL = "openrouter/openai/gpt-oss-120b"
EXTRA_BODY = {"provider": {"order": ["cerebras"]}}

SYSTEM_PROMPT = """Je bent kampeerhub, een AI assistent die helpt met het zoeken en boeken van campings in Europa.
Je helpt gebruikers met:
- Campings zoeken op basis van voorkeuren (locatie, faciliteiten, prijs, afstand tot zee)
- Campings vergelijken
- De beste camping aanbevelen op basis van behoeften
- Reserveringen maken

Wees beknopt en data-gedreven. Stel gerichte vragen om de perfecte camping te vinden.
Antwoord altijd in het Nederlands."""

MOCK_RESPONSE = '{"message": "Dit is een testantwoord. LLM_MOCK is ingeschakeld.", "action": "none"}'

# Read once at startup (SEC-3)
_openrouter_api_key: str | None = None

# One Overpass request at a time; set tracks in-progress tile keys
_overpass_lock = asyncio.Lock()
_fetching_tiles: set[str] = set()
_fetching_water_tiles: set[str] = set()
_tile_retry_after: dict[str, float] = {}        # camping tile_key -> earliest retry
_water_tile_retry_after: dict[str, float] = {}  # water tile_key -> earliest retry
_overpass_cooldown_until: float = 0             # global cooldown after any 429
COOLDOWN_SECONDS = 60


# --- Database ---

def init_db() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with closing(sqlite3.connect(DB_PATH)) as con:
        con.execute("PRAGMA journal_mode=WAL")
        con.execute("""
            CREATE TABLE IF NOT EXISTS campings (
                id   TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                lat  REAL NOT NULL,
                lon  REAL NOT NULL,
                tags TEXT NOT NULL
            )
        """)
        con.execute("""
            CREATE TABLE IF NOT EXISTS fetched_tiles (
                tile_key   TEXT PRIMARY KEY,
                fetched_at INTEGER NOT NULL
            )
        """)
        con.execute("""
            CREATE TABLE IF NOT EXISTS water_points (
                id       INTEGER PRIMARY KEY AUTOINCREMENT,
                tile_key TEXT NOT NULL,
                lat      REAL NOT NULL,
                lon      REAL NOT NULL
            )
        """)
        con.execute("""
            CREATE TABLE IF NOT EXISTS water_tiles (
                tile_key   TEXT PRIMARY KEY,
                fetched_at INTEGER NOT NULL
            )
        """)
        con.execute("CREATE INDEX IF NOT EXISTS idx_campings_bbox ON campings(lat, lon)")
        con.execute("CREATE INDEX IF NOT EXISTS idx_water_points_bbox ON water_points(lat, lon)")
        con.commit()


def is_tile_cached(tile_key: str) -> bool:
    with closing(sqlite3.connect(DB_PATH)) as con:
        row = con.execute(
            "SELECT 1 FROM fetched_tiles WHERE tile_key = ? AND fetched_at > strftime('%s','now') - ?",
            (tile_key, TILE_TTL_SECONDS),
        ).fetchone()
    return row is not None


def store_tile(elements: list, tile_key: str) -> None:
    with closing(sqlite3.connect(DB_PATH)) as con:
        for el in elements:
            lat = el.get("lat") or (el.get("center") or {}).get("lat")
            lon = el.get("lon") or (el.get("center") or {}).get("lon")
            if lat is None or lon is None:
                continue
            t = el.get("tags") or {}
            cap = t.get("capacity", "")
            tags = {
                "dog":         t.get("dog") == "yes",
                "wifi":        t.get("internet_access") in ("wlan", "yes"),
                "pool":        t.get("swimming_pool") == "yes",
                "electricity": t.get("electricity") == "yes",
                "nudism":      t.get("nudism") in ("yes", "designated"),
                "capacity":    int(cap) if cap.isdigit() else None,
                "fee":         t.get("fee"),
                "charge":      t.get("charge"),
                "website":     t.get("website") or t.get("url"),
            }
            con.execute(
                "INSERT OR REPLACE INTO campings (id, name, lat, lon, tags) VALUES (?, ?, ?, ?, ?)",
                (f"{el['type']}-{el['id']}", t.get("name") or "Camping (naamloos)", lat, lon, json.dumps(tags)),
            )
        con.execute(
            "INSERT OR REPLACE INTO fetched_tiles (tile_key, fetched_at) VALUES (?, strftime('%s','now'))",
            (tile_key,),
        )
        con.commit()


def get_campings_in_bbox(south: float, west: float, north: float, east: float) -> list[dict]:
    with closing(sqlite3.connect(DB_PATH)) as con:
        rows = con.execute(
            "SELECT id, name, lat, lon, tags FROM campings "
            "WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?",
            (south, north, west, east),
        ).fetchall()
    return [{"id": r[0], "name": r[1], "lat": r[2], "lon": r[3], "tags": json.loads(r[4])} for r in rows]


def is_water_tile_cached(tile_key: str) -> bool:
    with closing(sqlite3.connect(DB_PATH)) as con:
        row = con.execute(
            "SELECT 1 FROM water_tiles WHERE tile_key = ? AND fetched_at > strftime('%s','now') - ?",
            (tile_key, TILE_TTL_SECONDS),
        ).fetchone()
    return row is not None


def store_water_tile(elements: list, tile_key: str) -> None:
    with closing(sqlite3.connect(DB_PATH)) as con:
        for el in elements:
            lat = el.get("lat") or (el.get("center") or {}).get("lat")
            lon = el.get("lon") or (el.get("center") or {}).get("lon")
            if lat is None or lon is None:
                continue
            con.execute(
                "INSERT INTO water_points (tile_key, lat, lon) VALUES (?, ?, ?)",
                (tile_key, lat, lon),
            )
        con.execute(
            "INSERT OR REPLACE INTO water_tiles (tile_key, fetched_at) VALUES (?, strftime('%s','now'))",
            (tile_key,),
        )
        con.commit()


def get_water_points_in_bbox(south: float, west: float, north: float, east: float) -> list[dict]:
    margin = 0.5
    with closing(sqlite3.connect(DB_PATH)) as con:
        rows = con.execute(
            "SELECT lat, lon FROM water_points "
            "WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?",
            (south - margin, north + margin, west - margin, east + margin),
        ).fetchall()
    return [{"lat": r[0], "lon": r[1]} for r in rows]


# --- Tile fetching ---

def tile_keys(south: float, west: float, north: float, east: float) -> list[str]:
    """Return 1°×1° grid tile keys covering the bounding box."""
    tiles = []
    lat = math.floor(south)
    while lat <= math.floor(north):
        lon = math.floor(west)
        while lon <= math.floor(east):
            tiles.append(f"{lat}_{lon}")
            lon += 1
        lat += 1
    return tiles


async def fetch_tile(tile_key: str) -> None:
    """Fetch one 1°×1° tile from Overpass and persist to SQLite.
    Serialized via _overpass_lock so only one HTTP request runs at a time."""
    try:
        lat, lon = map(int, tile_key.split("_"))
        query = (
            f"[out:json][timeout:30][maxsize:1048576];\n(\n"
            f'  node["tourism"="camp_site"]({lat},{lon},{lat+1},{lon+1});\n'
            f'  way["tourism"="camp_site"]({lat},{lon},{lat+1},{lon+1});\n'
            f'  relation["tourism"="camp_site"]({lat},{lon},{lat+1},{lon+1});\n'
            f");\nout center tags;"
        )
        async with _overpass_lock:
            if is_tile_cached(tile_key):   # another task may have fetched it while we waited
                return
            global _overpass_cooldown_until
            if time.time() < _overpass_cooldown_until:
                return  # global cooldown active; leave tile for next retry
            async with httpx.AsyncClient(timeout=40.0) as client:
                res = await client.post(OVERPASS_URL, data={"data": query})
            if res.status_code == 429:
                logger.warning("Overpass rate limit hit for tile %s", tile_key)
                _overpass_cooldown_until = time.time() + COOLDOWN_SECONDS
                _tile_retry_after[tile_key] = time.time() + COOLDOWN_SECONDS
                return   # leave tile uncached; retry after cooldown
            res.raise_for_status()
            elements = res.json().get("elements", [])
            await asyncio.to_thread(store_tile, elements, tile_key)
    except Exception:
        logger.exception("Failed to fetch tile %s", tile_key)
    finally:
        _fetching_tiles.discard(tile_key)


async def fetch_water_tile(tile_key: str) -> None:
    """Fetch water bodies for a 1°×1° tile from Overpass and persist to SQLite."""
    try:
        lat, lon = map(int, tile_key.split("_"))
        query = (
            f"[out:json][timeout:30][maxsize:2097152];\n(\n"
            f'  way["natural"="coastline"]({lat},{lon},{lat+1},{lon+1});\n'
            f'  way["natural"="water"]({lat},{lon},{lat+1},{lon+1});\n'
            f'  node["natural"="water"]({lat},{lon},{lat+1},{lon+1});\n'
            f'  way["waterway"~"^(river|canal)$"]({lat},{lon},{lat+1},{lon+1});\n'
            f");\nout center;"
        )
        async with _overpass_lock:
            if is_water_tile_cached(tile_key):
                return
            global _overpass_cooldown_until
            if time.time() < _overpass_cooldown_until:
                return  # global cooldown active
            async with httpx.AsyncClient(timeout=40.0) as client:
                res = await client.post(OVERPASS_URL, data={"data": query})
            if res.status_code == 429:
                logger.warning("Overpass rate limit hit for water tile %s", tile_key)
                _overpass_cooldown_until = time.time() + COOLDOWN_SECONDS
                _water_tile_retry_after[tile_key] = time.time() + COOLDOWN_SECONDS
                return
            res.raise_for_status()
            elements = res.json().get("elements", [])
            await asyncio.to_thread(store_water_tile, elements, tile_key)
    except Exception:
        logger.exception("Failed to fetch water tile %s", tile_key)
    finally:
        _fetching_water_tiles.discard(tile_key)


# --- App ---

@asynccontextmanager
async def lifespan(app: FastAPI):
    global _openrouter_api_key
    init_db()
    _openrouter_api_key = os.getenv("OPENROUTER_API_KEY")
    if not _openrouter_api_key and os.getenv("LLM_MOCK", "").lower() != "true":
        logger.warning("OPENROUTER_API_KEY is not set and LLM_MOCK is not enabled")
    yield


app = FastAPI(title="kampeerhub", lifespan=lifespan)


@app.get("/api/campings")
async def campings_endpoint(south: float, west: float, north: float, east: float) -> dict:
    """Return cached campings immediately; start background fetch for missing tiles."""
    if not (-90 <= south < north <= 90) or not (-180 <= west <= 180) or not (-180 <= east <= 180):
        raise HTTPException(status_code=422, detail="Ongeldige bounding box parameters")

    tiles = tile_keys(south, west, north, east)
    if len(tiles) > MAX_TILES:
        return {"campings": [], "fetching": False}

    now = time.time()
    missing = [
        t for t in tiles
        if not is_tile_cached(t)
        and t not in _fetching_tiles
        and now >= _tile_retry_after.get(t, 0)
    ]
    for tile in missing:
        _tile_retry_after.pop(tile, None)
        _fetching_tiles.add(tile)  # Mark in-flight before task starts — prevents race condition
        asyncio.create_task(fetch_tile(tile))

    result = await asyncio.to_thread(get_campings_in_bbox, south, west, north, east)
    # fetching=True as long as any tile is in-flight OR in cooldown (but not yet cached)
    fetching = any(
        t in _fetching_tiles or (not is_tile_cached(t) and now < _tile_retry_after.get(t, 0))
        for t in tiles
    )
    return {"campings": result, "fetching": fetching}


@app.get("/api/water-bodies")
async def water_bodies_endpoint(south: float, west: float, north: float, east: float) -> dict:
    """Return water body representative points for client-side distance calculations."""
    if not (-90 <= south < north <= 90) or not (-180 <= west <= 180) or not (-180 <= east <= 180):
        raise HTTPException(status_code=422, detail="Ongeldige bounding box parameters")

    tiles = tile_keys(south, west, north, east)
    if len(tiles) > MAX_TILES:
        return {"points": [], "fetching": False}

    now = time.time()
    missing = [
        t for t in tiles
        if not is_water_tile_cached(t)
        and t not in _fetching_water_tiles
        and now >= _water_tile_retry_after.get(t, 0)
    ]
    for tile in missing:
        _water_tile_retry_after.pop(tile, None)
        _fetching_water_tiles.add(tile)
        asyncio.create_task(fetch_water_tile(tile))

    points = await asyncio.to_thread(get_water_points_in_bbox, south, west, north, east)
    fetching = any(
        t in _fetching_water_tiles or not is_water_tile_cached(t)
        for t in tiles
    )
    return {"points": points, "fetching": fetching}


# --- Chat ---

class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=4000)


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(max_length=50)


class ChatResponse(BaseModel):
    message: str
    action: Literal["none", "search", "set_preference"] = "none"


@app.post("/api/chat")
async def chat(req: ChatRequest) -> ChatResponse:
    """Call the LLM and return a structured response."""
    if os.getenv("LLM_MOCK", "").lower() == "true":
        return ChatResponse.model_validate_json(MOCK_RESPONSE)

    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    messages += [{"role": m.role, "content": m.content} for m in req.messages]

    try:
        response = await asyncio.to_thread(
            completion,
            model=MODEL,
            messages=messages,
            response_format=ChatResponse,
            reasoning_effort="low",
            extra_body=EXTRA_BODY,
            api_key=_openrouter_api_key,
        )
        return ChatResponse.model_validate_json(response.choices[0].message.content)
    except AuthenticationError:
        raise HTTPException(status_code=401, detail="LLM authenticatie mislukt. Controleer de API sleutel.")
    except RateLimitError:
        raise HTTPException(status_code=429, detail="Te veel verzoeken. Probeer later opnieuw.")
    except ServiceUnavailableError:
        raise HTTPException(status_code=503, detail="LLM service tijdelijk niet beschikbaar.")
    except Exception:
        logger.exception("LLM request failed")
        raise HTTPException(status_code=500, detail="LLM fout. Probeer opnieuw.")


@app.get("/api/health")
def health():
    return {"status": "ok"}


# Serve static frontend — must be last
if STATIC_DIR.exists():
    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
