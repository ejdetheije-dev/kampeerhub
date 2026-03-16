"""Kampeerhub FastAPI backend."""
import os
import sqlite3
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Literal

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from litellm import completion
from pydantic import BaseModel


DB_PATH = Path("/app/database/kampeerhub.db")
STATIC_DIR = Path(__file__).parent / "static"

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


def init_db():
    """Create database and tables if they don't exist."""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(DB_PATH)
    con.execute("PRAGMA journal_mode=WAL")
    con.commit()
    con.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="kampeerhub", lifespan=lifespan)


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]


class ChatResponse(BaseModel):
    message: str
    action: Literal["none", "search", "set_preference"] = "none"


@app.post("/api/chat")
def chat(req: ChatRequest) -> ChatResponse:
    """Call the LLM and return a structured response."""
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    messages += [{"role": m.role, "content": m.content} for m in req.messages]

    response = completion(
        model=MODEL,
        messages=messages,
        response_format=ChatResponse,
        reasoning_effort="low",
        extra_body=EXTRA_BODY,
        api_key=os.getenv("OPENROUTER_API_KEY"),
    )
    return ChatResponse.model_validate_json(response.choices[0].message.content)


@app.get("/api/health")
def health():
    return {"status": "ok"}


# Serve static frontend — must be last
if STATIC_DIR.exists():
    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
