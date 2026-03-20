"""Kampeerhub FastAPI backend."""
import asyncio
import csv
import io
import json
import logging
import math
import os
import re
import secrets
import sqlite3
import time
import unicodedata
from contextlib import asynccontextmanager, closing
from pathlib import Path
from typing import Literal

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException
from fastapi.staticfiles import StaticFiles
from litellm import acompletion
from litellm.exceptions import AuthenticationError, RateLimitError, ServiceUnavailableError, Timeout
import bcrypt as _bcrypt_lib
from pydantic import BaseModel, Field

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("kampeerhub")

DB_PATH = Path(os.getenv("DATABASE_PATH", "/app/database/kampeerhub.db"))
STATIC_DIR = Path(__file__).parent / "static"
OVERPASS_URL = "https://overpass-api.de/api/interpreter"
TILE_TTL_SECONDS = 7 * 24 * 3600  # 7 days
MAX_TILES = 16

# Popular France camping tiles pre-fetched at startup to minimize cold-start latency
FRANCE_WARMUP_TILES = [
    "47_-5", "47_-4", "47_-3", "47_-2", "47_-1",  # Bretagne + Loire
    "48_-4", "48_-3", "48_-2", "48_-1", "48_0",   # Bretagne coast + Normandie
    "49_0",  "49_-1",                               # Normandie east
    "44_-2", "45_-1", "43_-2",                     # Atlantic south
    "43_2",  "43_3",  "43_4",  "43_5",  "43_6",   # Mediterranean
    "44_0",  "44_1",                                # Dordogne / Périgord
    "45_6",  "44_6",  "46_2",                      # Alps + Loire Valley center
]
MAX_BACKGROUND_PREFETCH = 6  # Soft cap on concurrent background prefetch tasks

MODEL = "openrouter/openai/gpt-oss-120b"
EXTRA_BODY = {"provider": {"order": ["cerebras", "fireworks", "together"], "allow_fallbacks": True}}

SYSTEM_PROMPT = """Je bent kampeerhub, een Nederlandse AI assistent voor het zoeken van campings in Europa.

BELANGRIJK:
- Antwoord ALTIJD in het Nederlands, nooit in het Engels
- Het veld "message" is wat de gebruiker ziet — schrijf daar een korte, vriendelijke Nederlandse zin
- Nooit technische termen of actienamen in het "message" veld zetten

Beschikbare acties (gebruik de juiste op basis van de vraag):

1. set_filters — filters aanpassen:
   - dog: true/false | wifi: true/false | pool: true/false
   - size_type: "all" | "small" | "medium" | "large" | "naturist"
   - water_max_km: getal 1-20 of null (uitschakelen)

2. navigate_map — kaart naar locatie bewegen:
   - location_name: plaatsnaam (bijv. "Bordeaux", "Bretagne")

3. set_travel_range — reisbereik instellen vanuit geselecteerde camping:
   - travel_hours: 0-8 (uren), 0 = uitschakelen

4. select_camping — camping selecteren op naam:
   - camping_name: naam van de camping

5. none — alleen een antwoord, geen actie

Voorbeeldresponse voor "ga naar bordeaux":
{"message": "Ik navigeer naar Bordeaux.", "action": "navigate_map", "navigate": {"location_name": "Bordeaux"}}

Voorbeeldresponse voor "filter op honden":
{"message": "Filter ingesteld: alleen campings waar honden welkom zijn.", "action": "set_filters", "filters": {"dog": true}}"""

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
_geocode_cache: dict[str, tuple[float, float]] = {}  # location_name -> (lat, lon)
_atout_france_lookup: dict[str, dict] = {}           # normalized name -> AF data

def _hash_password(password: str) -> str:
    return _bcrypt_lib.hashpw(password.encode(), _bcrypt_lib.gensalt()).decode()

def _verify_password(password: str, hashed: str) -> bool:
    return _bcrypt_lib.checkpw(password.encode(), hashed.encode())


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
        con.execute("""
            CREATE TABLE IF NOT EXISTS atout_france (
                name_normalized TEXT PRIMARY KEY,
                emplacements    INTEGER,
                unites          INTEGER,
                classement      TEXT,
                website         TEXT
            )
        """)
        con.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                email        TEXT    NOT NULL UNIQUE,
                password_hash TEXT   NOT NULL,
                name         TEXT    NOT NULL,
                approved     INTEGER NOT NULL DEFAULT 0,
                is_admin     INTEGER NOT NULL DEFAULT 0,
                last_login   TEXT,
                created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
            )
        """)
        con.execute("""
            CREATE TABLE IF NOT EXISTS sessions (
                token      TEXT    PRIMARY KEY,
                user_id    INTEGER NOT NULL REFERENCES users(id),
                created_at TEXT    NOT NULL DEFAULT (datetime('now')),
                expires_at TEXT    NOT NULL DEFAULT (datetime('now', '+30 days'))
            )
        """)
        # Migrate existing sessions table: add expires_at if absent
        try:
            con.execute("ALTER TABLE sessions ADD COLUMN expires_at TEXT NOT NULL DEFAULT (datetime('now', '+30 days'))")
        except sqlite3.OperationalError:
            pass  # Column already exists
        con.execute("CREATE INDEX IF NOT EXISTS idx_campings_bbox ON campings(lat, lon)")
        con.execute("CREATE INDEX IF NOT EXISTS idx_water_points_bbox ON water_points(lat, lon)")
        con.commit()


ATOUT_FRANCE_URL = (
    "https://data.classement.atout-france.fr/static/exportHebergementsClasses/hebergements_classes.csv"
)
_AF_NAME_PREFIXES = (
    "camping de ", "camping du ", "camping des ", "camping la ", "camping le ",
    "camping les ", "camping l ", "camping ",
)


def _normalize_camping_name(name: str) -> str:
    """Lowercase, strip accents and common prefixes, keep only alphanumeric."""
    name = unicodedata.normalize("NFD", name)
    name = "".join(c for c in name if unicodedata.category(c) != "Mn")
    name = name.lower()
    for prefix in _AF_NAME_PREFIXES:
        if name.startswith(prefix):
            name = name[len(prefix):]
            break
    name = re.sub(r"[^a-z0-9]", " ", name)
    return re.sub(r"\s+", " ", name).strip()


def _load_atout_france_lookup() -> None:
    global _atout_france_lookup
    with closing(sqlite3.connect(DB_PATH)) as con:
        rows = con.execute(
            "SELECT name_normalized, emplacements, unites, classement, website FROM atout_france"
        ).fetchall()
    _atout_france_lookup = {
        r[0]: {"emplacements": r[1], "unites": r[2], "classement": r[3], "website": r[4]}
        for r in rows
    }
    logger.info("Loaded %d Atout France campings into memory", len(_atout_france_lookup))


async def import_atout_france_csv() -> None:
    """Download Atout France CSV once and cache camping rows in SQLite."""
    with closing(sqlite3.connect(DB_PATH)) as con:
        count = con.execute("SELECT COUNT(*) FROM atout_france").fetchone()[0]
    if count > 0:
        _load_atout_france_lookup()
        return

    logger.info("Downloading Atout France classification CSV...")
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            res = await client.get(ATOUT_FRANCE_URL)
        res.raise_for_status()
    except Exception:
        logger.warning("Failed to download Atout France CSV; cozy detection disabled")
        return

    try:
        text = res.content.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = res.content.decode("latin-1")

    reader = csv.DictReader(io.StringIO(text), delimiter=";")
    rows = []
    for row in reader:
        if row.get("TYPOLOGIE ÉTABLISSEMENT", "").strip().upper() != "CAMPING":
            continue
        name = row.get("NOM COMMERCIAL", "").strip()
        if not name:
            continue
        name_norm = _normalize_camping_name(name)
        if len(name_norm) < 3:
            continue
        empl_raw = row.get("NOMBRE D'EMPLACEMENTS", "").strip()
        unit_raw = row.get("NOMBRE D'UNITES D'HABITATION (résidences de tourisme)", "").strip()
        emplacements = int(empl_raw) if empl_raw.isdigit() else None
        unites = int(unit_raw) if unit_raw.isdigit() else 0
        classement = row.get("CLASSEMENT", "").strip()
        website_raw = row.get("SITE INTERNET", "").strip()
        website = website_raw if website_raw.startswith("http") else None
        rows.append((name_norm, emplacements, unites, classement, website))

    with closing(sqlite3.connect(DB_PATH)) as con:
        con.executemany(
            "INSERT OR REPLACE INTO atout_france "
            "(name_normalized, emplacements, unites, classement, website) VALUES (?, ?, ?, ?, ?)",
            rows,
        )
        con.commit()
    logger.info("Imported %d Atout France campings", len(rows))
    _load_atout_france_lookup()


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
                "dog":         t.get("dog") in ("yes", "leashed"),
                "wifi":        t.get("internet_access") in ("wlan", "yes"),
                "pool":        t.get("swimming_pool") == "yes",
                "electricity": t.get("electricity") == "yes",
                "nudism":      t.get("nudism") in ("yes", "designated"),
                "capacity":    int(m.group()) if (m := re.search(r"\d+", cap)) else None,
                "fee":         t.get("fee"),
                "charge":      t.get("charge"),
                "website":     t.get("website") or t.get("url"),
                "cozy":        False,
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


def enrich_tile_cozy(tile_key: str) -> None:
    """Match campings in a tile against Atout France data; update cozy flag and website fallback."""
    if not _atout_france_lookup:
        return
    lat, lon = map(int, tile_key.split("_"))
    with closing(sqlite3.connect(DB_PATH)) as con:
        rows = con.execute(
            "SELECT id, name, tags FROM campings "
            "WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?",
            (lat, lat + 1, lon, lon + 1),
        ).fetchall()
        updates = []
        for camping_id, name, tags_json in rows:
            tags = json.loads(tags_json)
            af = _atout_france_lookup.get(_normalize_camping_name(name))
            if af:
                if not tags.get("website") and af.get("website"):
                    tags["website"] = af["website"]
                empl = af.get("emplacements")
                unites = af.get("unites") or 0
                classement = (af.get("classement") or "").strip().lower()
                tags["cozy"] = classement == "aire naturelle" or (
                    empl is not None and empl < 50 and unites == 0
                )
            updates.append((json.dumps(tags), camping_id))
        con.executemany("UPDATE campings SET tags = ? WHERE id = ?", updates)
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
            store_tile(elements, tile_key)
        await asyncio.to_thread(enrich_tile_cozy, tile_key)
        prefetch_adjacent(tile_key)
    except Exception:
        logger.exception("Failed to fetch tile %s", tile_key)
    finally:
        _fetching_tiles.discard(tile_key)


async def fetch_water_tile(tile_key: str) -> None:
    """Fetch water bodies for a 1°×1° tile from Overpass and persist to SQLite."""
    try:
        lat, lon = map(int, tile_key.split("_"))
        query = (
            f"[out:json][timeout:30][maxsize:8388608];\n(\n"
            f'  way["natural"="beach"]({lat},{lon},{lat+1},{lon+1});\n'
            f'  node["natural"="bay"]({lat},{lon},{lat+1},{lon+1});\n'
            f'  relation["natural"="water"]["water"="lake"]({lat},{lon},{lat+1},{lon+1});\n'
            f'  relation["waterway"="river"]({lat},{lon},{lat+1},{lon+1});\n'
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
            data = res.json()
            if data.get("remark", "").startswith("runtime error"):
                logger.warning("Overpass query error for water tile %s: %s", tile_key, data["remark"])
                _water_tile_retry_after[tile_key] = time.time() + COOLDOWN_SECONDS
                return
            elements = data.get("elements", [])
            store_water_tile(elements, tile_key)
    except Exception:
        logger.exception("Failed to fetch water tile %s", tile_key)
    finally:
        _fetching_water_tiles.discard(tile_key)


def prefetch_adjacent(tile_key: str) -> None:
    """Queue uncached neighbour tiles as low-priority background tasks.

    Stays within camping-relevant Europe and respects MAX_BACKGROUND_PREFETCH
    to prevent runaway expansion.
    """
    lat, lon = map(int, tile_key.split("_"))
    neighbours = [f"{lat+1}_{lon}", f"{lat-1}_{lon}", f"{lat}_{lon+1}", f"{lat}_{lon-1}"]
    for neighbour in neighbours:
        if len(_fetching_tiles) >= MAX_BACKGROUND_PREFETCH:
            break
        n_lat, n_lon = map(int, neighbour.split("_"))
        if not (35 <= n_lat <= 60 and -10 <= n_lon <= 30):
            continue
        if not is_tile_cached(neighbour) and neighbour not in _fetching_tiles:
            _fetching_tiles.add(neighbour)
            asyncio.create_task(fetch_tile(neighbour))


async def warmup_france_tiles() -> None:
    """Pre-fetch popular France camping tiles in the background at startup."""
    await asyncio.sleep(5)  # Let the server fully initialise before hitting Overpass
    missing = [t for t in FRANCE_WARMUP_TILES if not is_tile_cached(t) and t not in _fetching_tiles]
    if not missing:
        logger.info("France warmup: all %d tiles already cached", len(FRANCE_WARMUP_TILES))
        return
    logger.info("France warmup: queuing %d tiles", len(missing))
    for tile in missing:
        if tile not in _fetching_tiles:
            _fetching_tiles.add(tile)
            asyncio.create_task(fetch_tile(tile))


# --- App ---

@asynccontextmanager
async def lifespan(app: FastAPI):
    global _openrouter_api_key
    init_db()
    _openrouter_api_key = os.getenv("OPENROUTER_API_KEY")
    if not _openrouter_api_key and os.getenv("LLM_MOCK", "").lower() != "true":
        logger.warning("OPENROUTER_API_KEY is not set and LLM_MOCK is not enabled")
    await import_atout_france_csv()
    asyncio.create_task(warmup_france_tiles())
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
    tiles_cached = sum(1 for t in tiles if is_tile_cached(t))
    return {"campings": result, "fetching": fetching, "tiles_total": len(tiles), "tiles_cached": tiles_cached}


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
        t in _fetching_water_tiles or (not is_water_tile_cached(t) and now < _water_tile_retry_after.get(t, 0))
        for t in tiles
    )
    return {"points": points, "fetching": fetching}


# --- Chat ---

class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=4000)


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(max_length=50)


class FiltersPayload(BaseModel):
    dog: bool | None = None
    wifi: bool | None = None
    pool: bool | None = None
    size_type: str | None = None       # "all"|"small"|"medium"|"large"|"naturist"
    water_max_km: int | None = None    # null = disable filter


class NavigatePayload(BaseModel):
    location_name: str = Field(max_length=200)
    lat: float | None = None           # filled by backend after geocoding
    lon: float | None = None
    zoom: int = 10


class ChatResponse(BaseModel):
    message: str
    action: Literal["none", "set_filters", "navigate_map", "set_travel_range", "select_camping"] = "none"
    filters: FiltersPayload | None = None
    navigate: NavigatePayload | None = None
    travel_hours: float | None = None
    camping_name: str | None = None   # for select_camping


async def geocode(location_name: str) -> tuple[float, float] | None:
    """Resolve a place name to (lat, lon) via Nominatim, with in-process caching."""
    key = location_name.strip().lower()
    if key in _geocode_cache:
        return _geocode_cache[key]
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.get(
                "https://nominatim.openstreetmap.org/search",
                params={"q": location_name, "format": "json", "limit": 1},
                headers={"User-Agent": "kampeerhub/1.0 (https://github.com/ejdetheije-dev/kampeerhub)"},
            )
        results = res.json()
        if results:
            coords = float(results[0]["lat"]), float(results[0]["lon"])
            _geocode_cache[key] = coords
            return coords
    except Exception:
        logger.warning("Geocoding failed for %r", location_name)
    return None


@app.post("/api/chat")
async def chat(req: ChatRequest, authorization: str | None = Header(default=None)) -> ChatResponse:
    _require_session(authorization)
    """Call the LLM and return a structured response."""
    if os.getenv("LLM_MOCK", "").lower() == "true":
        return ChatResponse.model_validate_json(MOCK_RESPONSE)

    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    messages += [{"role": m.role, "content": m.content} for m in req.messages]

    response = None
    for attempt in range(3):
        try:
            response = await asyncio.wait_for(
                acompletion(
                    model=MODEL,
                    messages=messages,
                    response_format=ChatResponse,
                    extra_body=EXTRA_BODY,
                    api_key=_openrouter_api_key,
                    timeout=6,
                ),
                timeout=7.0,
            )
            break
        except AuthenticationError:
            raise HTTPException(status_code=401, detail="LLM authenticatie mislukt. Controleer de API sleutel.")
        except RateLimitError:
            raise HTTPException(status_code=429, detail="Te veel verzoeken. Probeer later opnieuw.")
        except Exception as e:
            logger.warning("LLM poging %d/3 mislukt: %s", attempt + 1, type(e).__name__)

    if response is None:
        raise HTTPException(status_code=503, detail="LLM tijdelijk niet beschikbaar.")

    raw = response.choices[0].message.content
    try:
        data = ChatResponse.model_validate_json(raw)
    except Exception:
        logger.warning("ChatResponse validation failed for response: %.200s", raw)
        return ChatResponse(message="Sorry, probeer je vraag anders te formuleren.")

    if data.action == "navigate_map" and data.navigate:
        coords = await geocode(data.navigate.location_name)
        if coords:
            data.navigate.lat, data.navigate.lon = coords

    return data


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/config")
def config():
    return {"mapbox_token": os.getenv("NEXT_PUBLIC_MAPBOX_TOKEN", "")}


# --- Auth helpers ---

def _get_user_by_token(token: str) -> dict | None:
    """Return user row for a valid, non-expired session token, or None."""
    with closing(sqlite3.connect(DB_PATH)) as con:
        con.row_factory = sqlite3.Row
        row = con.execute(
            "SELECT u.* FROM users u JOIN sessions s ON s.user_id = u.id"
            " WHERE s.token = ? AND s.expires_at > datetime('now')",
            (token,),
        ).fetchone()
    return dict(row) if row else None


def _require_session(authorization: str | None) -> dict:
    """Raise 401 unless the Authorization header contains a valid session token."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Niet ingelogd")
    token = authorization.removeprefix("Bearer ")
    user = _get_user_by_token(token)
    if not user:
        raise HTTPException(status_code=401, detail="Ongeldige sessie")
    if not user["approved"]:
        raise HTTPException(status_code=403, detail="Account wacht op goedkeuring")
    return user


def _require_admin(authorization: str | None) -> dict:
    """Raise 401/403 unless the Authorization header belongs to an admin."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Niet ingelogd")
    token = authorization.removeprefix("Bearer ")
    user = _get_user_by_token(token)
    if not user:
        raise HTTPException(status_code=401, detail="Ongeldige sessie")
    if not user["is_admin"]:
        raise HTTPException(status_code=403, detail="Geen beheerderstoegang")
    return user


# --- Auth models ---

class RegisterRequest(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=8, max_length=72)
    name: str = Field(min_length=1, max_length=200)


class LoginRequest(BaseModel):
    email: str
    password: str


# --- Auth endpoints ---

@app.post("/api/auth/register")
def register(req: RegisterRequest):
    """Register a new user. First user becomes admin and is auto-approved."""
    with closing(sqlite3.connect(DB_PATH)) as con:
        con.row_factory = sqlite3.Row
        count = con.execute("SELECT COUNT(*) FROM users").fetchone()[0]
        is_first = count == 0
        password_hash = _hash_password(req.password)
        try:
            con.execute(
                "INSERT INTO users (email, password_hash, name, approved, is_admin) VALUES (?, ?, ?, ?, ?)",
                (req.email, password_hash, req.name, 1 if is_first else 0, 1 if is_first else 0),
            )
            con.commit()
        except sqlite3.IntegrityError:
            raise HTTPException(status_code=409, detail="E-mailadres al in gebruik")
    return {"status": "pending" if not is_first else "approved", "is_admin": is_first}


@app.post("/api/auth/login")
def login(req: LoginRequest):
    """Login with email + password. Returns session token."""
    with closing(sqlite3.connect(DB_PATH)) as con:
        con.row_factory = sqlite3.Row
        user = con.execute("SELECT * FROM users WHERE email = ?", (req.email,)).fetchone()
        if not user or not _verify_password(req.password, user["password_hash"]):
            raise HTTPException(status_code=401, detail="Onjuist e-mailadres of wachtwoord")
        if not user["approved"]:
            raise HTTPException(status_code=403, detail="Account wacht op goedkeuring")
        token = secrets.token_urlsafe(32)
        con.execute(
            "INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, datetime('now', '+30 days'))",
            (token, user["id"]),
        )
        con.execute("UPDATE users SET last_login = datetime('now') WHERE id = ?", (user["id"],))
        con.execute("DELETE FROM sessions WHERE expires_at < datetime('now')")
        con.commit()
    return {"token": token, "is_admin": bool(user["is_admin"]), "name": user["name"]}


@app.post("/api/auth/logout")
def logout(authorization: str | None = Header(default=None)):
    """Delete the session token."""
    if authorization and authorization.startswith("Bearer "):
        token = authorization.removeprefix("Bearer ")
        with closing(sqlite3.connect(DB_PATH)) as con:
            con.execute("DELETE FROM sessions WHERE token = ?", (token,))
            con.commit()
    return {"status": "ok"}


# --- Admin endpoints ---

@app.get("/api/admin/users")
def admin_list_users(authorization: str | None = Header(default=None)):
    """Return all users (admin only)."""
    _require_admin(authorization)
    with closing(sqlite3.connect(DB_PATH)) as con:
        con.row_factory = sqlite3.Row
        rows = con.execute(
            "SELECT id, email, name, approved, is_admin, last_login, created_at FROM users ORDER BY created_at"
        ).fetchall()
    return {"users": [dict(r) for r in rows]}


class AdminUpdateRequest(BaseModel):
    approved: bool


@app.patch("/api/admin/users/{user_id}")
def admin_update_user(user_id: int, body: AdminUpdateRequest, authorization: str | None = Header(default=None)):
    """Toggle approved for a user (admin only). Admins cannot be modified."""
    _require_admin(authorization)
    with closing(sqlite3.connect(DB_PATH)) as con:
        target = con.execute("SELECT is_admin FROM users WHERE id = ?", (user_id,)).fetchone()
        if target is None:
            raise HTTPException(status_code=404, detail="Gebruiker niet gevonden")
        if target[0]:
            raise HTTPException(status_code=400, detail="Beheerdersaccounts kunnen niet worden gewijzigd")
        con.execute("UPDATE users SET approved = ? WHERE id = ?", (1 if body.approved else 0, user_id))
        con.commit()
    return {"status": "ok"}


# Serve static frontend — must be last
if STATIC_DIR.exists():
    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
