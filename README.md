# Wayfarer — Personalized Travel Itinerary Planner

A full-stack capstone project built with **React + Vite**, **FastAPI**, optional **Supabase** persistence/authentication, and optional **OpenAI-compatible generative AI**. It supports solo trips, couple vacations, and group trips with day-by-day itineraries, budget estimates, editable activities, day regeneration, and saved trips.

## Features
- Responsive SaaS-style dashboard and trip builder.
- Personalization by destination, dates, budget, interests, travel pace, trip type, group size, and accommodation style.
- Structured day-by-day itinerary with morning/afternoon/evening activities, dining suggestions, transport tips, and estimated costs.
- Edit activity names/notes, remove activities, regenerate a day, and save/reopen trips.
- Three scenario presets for solo, couple, and group planning.
- FastAPI REST API with Pydantic validation, CORS, health check, and optional AI provider.
- Supabase persistence when configured; local in-memory storage works for a zero-credential demo.
- Unsplash Source images are optional decorative destination images; app functionality does not depend on them.
- Example `.env` files, deployment notes, and API docs.

## Tech stack
- Frontend: React 18, Vite, plain CSS, Lucide-style Unicode/iconography (no paid UI dependency)
- Backend: Python 3.11+, FastAPI, Uvicorn, Pydantic, HTTPX
- Persistence: Supabase Postgres (optional; local memory fallback)
- AI: OpenAI-compatible chat completions endpoint (optional; deterministic local itinerary fallback)

## Run locally

### 1. Backend
```bash
cd backend
python -m venv .venv
# Windows PowerShell: .venv\Scripts\Activate.ps1
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # Windows: copy .env.example .env
uvicorn app.main:app --reload --port 8000
```
API docs: http://localhost:8000/docs

### 2. Frontend (in another terminal)
```bash
cd frontend
npm install
cp .env.example .env  # Windows: copy .env.example .env
npm run dev
```
Open http://localhost:5173. The Vite dev server proxies `/api` to the backend.

## Optional AI setup
In `backend/.env`, set:
```env
AI_API_KEY=your_api_key
AI_BASE_URL=https://api.openai.com/v1
AI_MODEL=gpt-4o-mini
```
The backend sends a structured itinerary-generation request to the OpenAI-compatible `/chat/completions` endpoint. If no key is configured, the app uses its local itinerary engine instead. You can use another compatible provider by changing `AI_BASE_URL` and `AI_MODEL`; provider pricing and free-tier availability vary.

## Optional Supabase setup
1. Create a Supabase project.
2. In SQL Editor, run `backend/supabase_schema.sql`.
3. Copy the project URL and service-role key into `backend/.env` as `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`.
4. Keep the service-role key **only on the backend**. Never put it in the frontend or commit real secrets.

If Supabase variables are blank, saved trips are kept in server memory (they reset when the backend restarts). The local demo still works.

## Deploy
### Backend — Render (example)
- Create a new Web Service from the GitHub repository.
- Root directory: `backend`
- Build command: `pip install -r requirements.txt`
- Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- Add environment variables from `.env.example` in the Render dashboard.

### Frontend — Vercel (example)
- Import the same GitHub repository into Vercel.
- Root directory: `frontend`
- Build command: `npm run build`
- Output directory: `dist`
- Set `VITE_API_BASE_URL` to your deployed backend URL, e.g. `https://your-api.onrender.com` (no trailing slash).

When deployed on separate domains, set backend `CORS_ORIGINS` to the frontend URL. For local development, defaults are already configured.

## GitHub and Skill Wallet submission
1. Extract this ZIP.
2. Create a public GitHub repository named `personalized-travel-itinerary-planner`.
3. From this project folder, run:
```bash
git init
git add .
git commit -m "Build personalized travel itinerary planner capstone"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/personalized-travel-itinerary-planner.git
git push -u origin main
```
4. Deploy frontend/backend using the steps above and test the deployed URL in an incognito window.
5. Add the actual GitHub URL and deployed demo URL to the Skill Wallet fields. Do not submit placeholder URLs.

## API overview
- `GET /health` — backend health and provider status
- `POST /api/itineraries/generate` — generate a personalized itinerary
- `GET /api/itineraries` — list saved itineraries
- `GET /api/itineraries/{trip_id}` — retrieve one saved itinerary
- `PUT /api/itineraries/{trip_id}` — update an itinerary
- `DELETE /api/itineraries/{trip_id}` — delete an itinerary
- `POST /api/itineraries/{trip_id}/regenerate-day` — regenerate one day

## Project structure
```text
travel-planner/
├── frontend/             # React application
├── backend/              # FastAPI application
├── .gitignore
└── README.md
```

## Notes / limitations
- The local fallback creates useful structured plans but is not a live booking engine. Confirm opening hours, prices, transport times, and availability independently before travelling.
- This project does not make reservations or payments.
- Unsplash source images are illustrative and can change; add an Unsplash API key and attribution flow if you want production-grade image retrieval.
