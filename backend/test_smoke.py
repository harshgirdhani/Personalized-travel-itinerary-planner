"""Lightweight smoke test: run with `python test_smoke.py` after installing requirements."""
from datetime import date, timedelta
from app.main import TripRequest, local_itinerary

start = date.today() + timedelta(days=10)
req = TripRequest(destination="Jaipur, India", start_date=start, end_date=start + timedelta(days=2), budget=18000, currency="INR", trip_type="solo", group_size=1, interests=["Food", "Culture"], pace="balanced", accommodation="mid-range")
trip = local_itinerary(req)
assert trip["destination"] == "Jaipur, India"
assert len(trip["days"]) == 3
assert all(day["activities"] for day in trip["days"])
assert trip["currency"] == "INR"
print("Smoke test passed: 3-day itinerary generated with activities and dining.")
