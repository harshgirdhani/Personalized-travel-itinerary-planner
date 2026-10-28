from __future__ import annotations

import json
import os
import uuid
from datetime import date, timedelta
from typing import Any

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator

load_dotenv()

app = FastAPI(title="Wayfarer Travel Planner API", version="1.0.0", description="Personalized itinerary generation and trip management.")
origins = [x.strip() for x in os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",") if x.strip()]
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")
AI_API_KEY = os.getenv("AI_API_KEY", "")
AI_BASE_URL = os.getenv("AI_BASE_URL", "https://api.openai.com/v1").rstrip("/")
AI_MODEL = os.getenv("AI_MODEL", "gpt-4o-mini")
MEMORY: dict[str, dict[str, Any]] = {}


class TripRequest(BaseModel):
    destination: str = Field(min_length=2, max_length=120)
    start_date: date
    end_date: date
    budget: int = Field(ge=50, le=1_000_000)
    currency: str = Field(default="USD", pattern="^(USD|INR|AED|EUR|GBP)$")
    trip_type: str = Field(default="solo", pattern="^(solo|couple|group)$")
    group_size: int = Field(default=1, ge=1, le=30)
    interests: list[str] = Field(default_factory=lambda: ["Sightseeing", "Food"], max_length=12)
    pace: str = Field(default="balanced", pattern="^(relaxed|balanced|packed)$")
    accommodation: str = Field(default="mid-range", pattern="^(budget|mid-range|premium|not-needed)$")
    notes: str = Field(default="", max_length=800)

    @field_validator("end_date")
    @classmethod
    def dates_make_sense(cls, value: date, info):
        start = info.data.get("start_date")
        if start and value < start:
            raise ValueError("End date must be on or after start date")
        if start and (value - start).days > 20:
            raise ValueError("Trips are limited to 21 days in this demo")
        return value


class ItineraryUpdate(BaseModel):
    itinerary: dict[str, Any]


class RegenerateDayRequest(BaseModel):
    day_index: int = Field(ge=0)
    preferences: str = Field(default="", max_length=500)


def money(value: float, currency: str) -> str:
    symbols = {"USD": "$", "INR": "₹", "AED": "AED ", "EUR": "€", "GBP": "£"}
    return f"{symbols.get(currency, currency + ' ')}{value:,.0f}"


def local_itinerary(req: TripRequest) -> dict[str, Any]:
    days = (req.end_date - req.start_date).days + 1
    party = req.group_size if req.trip_type == "group" else (2 if req.trip_type == "couple" else 1)
    per_day = req.budget / days
    pace_count = {"relaxed": 2, "balanced": 3, "packed": 4}[req.pace]
    themes = [
        ("Morning", "Start with a signature local landmark", "Arrive early for a calmer visit and better photos."),
        ("Afternoon", "Explore a walkable cultural neighbourhood", "Leave room to browse local shops and take breaks."),
        ("Evening", "Enjoy a highly rated local food area", "Choose a busy, well-lit area and check current opening times."),
        ("Flexible", "Add a memorable experience nearby", "Keep this optional so the day can adapt to weather or energy."),
    ]
    interests = req.interests or ["Sightseeing"]
    days_out = []
    for i in range(days):
        d = req.start_date + timedelta(days=i)
        activities = []
        selected = themes[:pace_count]
        for j, (slot, base, note) in enumerate(selected):
            interest = interests[(i + j) % len(interests)].lower()
            title = base
            if "food" in interest or "culinary" in interest:
                title = "Discover a local market or regional food spot" if j == 1 else title
            elif "nature" in interest or "adventure" in interest:
                title = "Visit a nearby nature trail or scenic viewpoint" if j == 0 else title
            elif "culture" in interest or "history" in interest:
                title = "Explore a museum, heritage site, or historic quarter" if j == 0 else title
            elif "shopping" in interest:
                title = "Browse a local shopping street or artisan market" if j == 1 else title
            elif "relax" in interest or "wellness" in interest:
                title = "Take a slow scenic walk and coffee break" if j == 1 else title
            activity_cost = max(0, round(per_day * (0.12 if j == 0 else 0.16 if j == 1 else 0.18) / max(party, 1)))
            activities.append({"id": str(uuid.uuid4())[:8], "time": slot, "title": title, "description": note, "category": interests[(i+j) % len(interests)], "estimated_cost": activity_cost, "duration": "1–2 hours", "transport": "Walk where practical; otherwise use local public transport or a licensed taxi.", "editable": True})
        days_out.append({"date": d.isoformat(), "label": f"Day {i+1}", "theme": ["Arrival & highlights", "Local discovery", "Signature experiences", "Slow travel"][i % 4], "activities": activities, "dining": {"lunch": "A well-reviewed casual restaurant featuring local cuisine", "dinner": "A local favourite; check menus and dietary options before visiting"}, "daily_estimate": round(per_day), "travel_tip": "Group nearby stops together and verify current opening hours before setting out."})
    stay = {"budget": "Hostel, guesthouse, or well-reviewed budget hotel", "mid-range": "Centrally located boutique hotel or apartment", "premium": "Premium hotel or distinctive local stay", "not-needed": "No accommodation planned"}[req.accommodation]
    title = f"{req.destination} {('couple escape' if req.trip_type == 'couple' else 'group adventure' if req.trip_type == 'group' else 'solo getaway')}"
    return {"id": str(uuid.uuid4()), "title": title, "destination": req.destination, "trip_type": req.trip_type, "start_date": req.start_date.isoformat(), "end_date": req.end_date.isoformat(), "currency": req.currency, "group_size": party, "budget": req.budget, "total_estimate": round(min(req.budget, per_day * days)), "budget_status": "Within your stated budget (estimate)" if req.budget >= 50 else "Review budget", "accommodation_suggestion": stay, "personalization_summary": f"Built around {', '.join(interests[:4])}, a {req.pace} pace, and a {req.trip_type} travel style.", "days": days_out, "generated_by": "local-fallback", "disclaimer": "Planning estimate only, not live availability or a booking quote. Confirm prices, opening hours, transit and safety guidance before travel."}


async def ai_itinerary(req: TripRequest) -> dict[str, Any] | None:
    if not AI_API_KEY:
        return None
    system = "You are a practical travel planner. Return ONLY valid JSON matching this schema: {title,destination,trip_type,start_date,end_date,currency,group_size,budget,total_estimate,budget_status,accommodation_suggestion,personalization_summary,days:[{date,label,theme,activities:[{id,time,title,description,category,estimated_cost,duration,transport,editable}],dining:{lunch,dinner},daily_estimate,travel_tip}],generated_by,disclaimer}. Make a distinct useful day for each date, honor budget and interests, include realistic generic suggestions without claiming live prices/opening hours, and tailor solo/couple/group needs. Do not invent reservation availability."
    user = req.model_dump(mode="json")
    async with httpx.AsyncClient(timeout=45) as client:
        response = await client.post(f"{AI_BASE_URL}/chat/completions", headers={"Authorization": f"Bearer {AI_API_KEY}", "Content-Type": "application/json"}, json={"model": AI_MODEL, "temperature": 0.7, "messages": [{"role": "system", "content": system}, {"role": "user", "content": json.dumps(user)}]})
        response.raise_for_status()
        content = response.json()["choices"][0]["message"]["content"]
        content = content.strip().removeprefix("```json").removesuffix("```").strip()
        data = json.loads(content)
        data["id"] = str(uuid.uuid4())
        data["generated_by"] = f"ai:{AI_MODEL}"
        return data


async def db_request(method: str, path: str, **kwargs):
    if not (SUPABASE_URL and SUPABASE_KEY):
        return None
    headers = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}", "Content-Type": "application/json", "Prefer": "return=representation"}
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.request(method, f"{SUPABASE_URL}/rest/v1/{path}", headers=headers, **kwargs)
        if r.status_code >= 400:
            raise HTTPException(status_code=502, detail="Database operation failed. Check Supabase table and environment settings.")
        return r.json() if r.content else []


async def save_trip(trip: dict[str, Any]):
    if SUPABASE_URL and SUPABASE_KEY:
        await db_request("POST", "itineraries", json={"id": trip["id"], "title": trip["title"], "destination": trip["destination"], "trip_type": trip["trip_type"], "start_date": trip["start_date"], "end_date": trip["end_date"], "payload": trip})
    else:
        MEMORY[trip["id"]] = trip


async def get_trip(trip_id: str):
    if SUPABASE_URL and SUPABASE_KEY:
        rows = await db_request("GET", "itineraries", params={"id": f"eq.{trip_id}", "select": "payload"})
        return rows[0]["payload"] if rows else None
    return MEMORY.get(trip_id)


@app.get("/")
def root():
    return {"name": "Wayfarer Travel Planner API", "docs": "/docs", "health": "/health"}


@app.get("/health")
def health():
    return {"status": "ok", "ai_enabled": bool(AI_API_KEY), "database": "supabase" if SUPABASE_URL and SUPABASE_KEY else "in-memory", "version": "1.0.0"}


@app.post("/api/itineraries/generate")
async def generate(req: TripRequest):
    try:
        trip = await ai_itinerary(req)
    except Exception:
        # Keep the product demo usable if the optional provider is unavailable.
        trip = None
    trip = trip or local_itinerary(req)
    await save_trip(trip)
    return trip


@app.get("/api/itineraries")
async def list_trips():
    if SUPABASE_URL and SUPABASE_KEY:
        rows = await db_request("GET", "itineraries", params={"select": "payload", "order": "created_at.desc", "limit": "100"})
        return [row["payload"] for row in rows]
    return sorted(MEMORY.values(), key=lambda x: x.get("start_date", ""), reverse=True)


@app.get("/api/itineraries/{trip_id}")
async def retrieve(trip_id: str):
    trip = await get_trip(trip_id)
    if not trip:
        raise HTTPException(status_code=404, detail="Itinerary not found")
    return trip


@app.put("/api/itineraries/{trip_id}")
async def update(trip_id: str, body: ItineraryUpdate):
    trip = body.itinerary
    trip["id"] = trip_id
    if SUPABASE_URL and SUPABASE_KEY:
        rows = await db_request("PATCH", "itineraries", params={"id": f"eq.{trip_id}"}, json={"title": trip.get("title", "Saved trip"), "destination": trip.get("destination", "Unknown"), "trip_type": trip.get("trip_type", "solo"), "start_date": trip.get("start_date"), "end_date": trip.get("end_date"), "payload": trip, "updated_at": "now()"})
        if not rows:
            raise HTTPException(status_code=404, detail="Itinerary not found")
    else:
        if trip_id not in MEMORY:
            raise HTTPException(status_code=404, detail="Itinerary not found")
        MEMORY[trip_id] = trip
    return trip


@app.delete("/api/itineraries/{trip_id}")
async def delete(trip_id: str):
    if SUPABASE_URL and SUPABASE_KEY:
        rows = await db_request("DELETE", "itineraries", params={"id": f"eq.{trip_id}"})
        if not rows:
            raise HTTPException(status_code=404, detail="Itinerary not found")
    else:
        if trip_id not in MEMORY:
            raise HTTPException(status_code=404, detail="Itinerary not found")
        del MEMORY[trip_id]
    return {"deleted": True, "id": trip_id}


@app.post("/api/itineraries/{trip_id}/regenerate-day")
async def regenerate_day(trip_id: str, body: RegenerateDayRequest):
    trip = await get_trip(trip_id)
    if not trip:
        raise HTTPException(status_code=404, detail="Itinerary not found")
    if body.day_index >= len(trip.get("days", [])):
        raise HTTPException(status_code=400, detail="Day index is outside this itinerary")
    day = trip["days"][body.day_index]
    old_titles = {a.get("title") for a in day.get("activities", [])}
    req = TripRequest(destination=trip["destination"], start_date=date.fromisoformat(day["date"]), end_date=date.fromisoformat(day["date"]), budget=max(50, int(trip.get("budget", 500) / max(1, len(trip.get("days", []))))), currency=trip.get("currency", "USD"), trip_type=trip.get("trip_type", "solo"), group_size=trip.get("group_size", 1), interests=[body.preferences] if body.preferences else ["Culture", "Food", "Sightseeing"], pace="balanced", accommodation="mid-range")
    new_day = local_itinerary(req)["days"][0]
    for activity in new_day["activities"]:
        if activity["title"] in old_titles:
            activity["title"] = "Try a different nearby local experience"
    new_day["label"] = day.get("label", f"Day {body.day_index+1}")
    new_day["theme"] = "Refreshed experiences"
    trip["days"][body.day_index] = new_day
    trip["generated_by"] = trip.get("generated_by", "local-fallback")
    if SUPABASE_URL and SUPABASE_KEY:
        await db_request("PATCH", "itineraries", params={"id": f"eq.{trip_id}"}, json={"payload": trip, "updated_at": "now()"})
    else:
        MEMORY[trip_id] = trip
    return trip
