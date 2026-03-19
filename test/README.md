# E2E tests — kampeerhub

Playwright tests tegen een draaiende Docker-container met `LLM_MOCK=true`.

## Vereisten

- Docker + Docker Compose
- Node.js 20+

## Stap 1 — Start de test-container

Vanuit de project-root:

```bash
docker compose -f test/docker-compose.test.yml up --build -d
```

De app draait nu op **http://localhost:8001** met een lege in-memory database.

## Stap 2 — Installeer Playwright

```bash
cd test
npm install
npx playwright install chromium
```

## Stap 3 — Draai de tests

```bash
cd test
npm test
```

## Opruimen

```bash
docker compose -f test/docker-compose.test.yml down
```

## Test-bestanden

| Bestand | Wat het test |
|---|---|
| `tests/auth.spec.ts` | Registreren, inloggen, uitloggen, foutmeldingen |
| `tests/admin.spec.ts` | Admin-pagina, gebruiker goedkeuren |
| `tests/api.spec.ts` | API auth-guard (`/api/health`, `/api/chat`) |
| `tests/app.spec.ts` | Kaart, chat na inloggen |
