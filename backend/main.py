"""Kampeerhub FastAPI backend."""
import sqlite3
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse


DB_PATH = Path("/app/database/kampeerhub.db")
STATIC_DIR = Path(__file__).parent / "static"


def init_db():
    """Create database and tables if they don't exist."""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(DB_PATH)
    con.execute("PRAGMA journal_mode=WAL")
    # Schema goes here as features are added
    con.commit()
    con.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="kampeerhub", lifespan=lifespan)


@app.get("/api/health")
def health():
    return {"status": "ok"}


# Serve static frontend — must be last
if STATIC_DIR.exists():
    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
