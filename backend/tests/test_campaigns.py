"""CRUD + validation for /campaigns."""

from tests.conftest import TODAY, add_performance, campaign_payload, create_campaign

API = "/api/v1/campaigns"


def test_health_and_meta(client):
    assert client.get("/api/v1/health").json() == {"status": "ok"}
    meta = client.get("/api/v1/meta").json()
    assert [t["id"] for t in meta["campaignTypes"]] == ["sponsored_products", "sponsored_brands", "sponsored_display"]
    assert [s["id"] for s in meta["statuses"]] == ["active", "paused", "archived"]
    assert meta["bidStrategies"][0] == {"id": "auto", "label": "Auto bid", "description": meta["bidStrategies"][0]["description"], "available": True}
    assert meta["limits"]["minDailyBudget"] == 100
    assert "roas" in meta["metrics"]


def test_create_returns_camel_case_record_with_defaults(client):
    created = create_campaign(client)
    assert created["id"].startswith("cmp_")
    assert created["status"] == "active"
    assert created["bidStrategy"] == "auto"
    assert created["startDate"] == "2025-03-15"
    assert created["endDate"] is None
    assert created["source"] == "user"
    assert created["performanceDays"] == 0
    assert created["products"][0]["sku"] == "SKU-1001"
    assert created["createdAt"].endswith("+00:00")

    fetched = client.get(f"{API}/{created['id']}").json()
    assert fetched == created


def test_create_defaults_start_date_to_today_and_fills_sku(client):
    created = create_campaign(client, startDate=None, products=[{"id": "P1", "name": "Thing"}])
    assert created["startDate"]  # server-side today
    assert created["products"] == [{"id": "P1", "sku": "P1", "name": "Thing", "category": "", "price": 0}]


def test_create_validation_errors(client):
    def post(**overrides):
        return client.post(API, json=campaign_payload(**overrides))

    assert post(name="   ").status_code == 422
    assert "Campaign name is required" in post(name="   ").text
    assert "at least $1.00" in post(dailyBudget=99).text
    assert "too large" in post(dailyBudget=100_000_001).text
    assert post(dailyBudget=12.5).status_code == 422
    assert post(type="banner").status_code == 422
    assert "not available yet" in post(bidStrategy="manual").text
    assert "Add at least one product" in post(products=[]).text
    assert "End date cannot be before the start date" in post(endDate="2025-03-01").text
    assert post(name="x" * 121).status_code == 422
    assert client.post(API, json={}).status_code == 422


def test_products_are_deduplicated_and_capped(client):
    products = [{"id": f"P{i}", "name": f"Thing {i}"} for i in range(120)] + [{"id": "P0", "name": "dup"}]
    created = create_campaign(client, products=products)
    assert len(created["products"]) == 100
    assert [p["id"] for p in created["products"]][:3] == ["P0", "P1", "P2"]


def test_update_patches_fields_and_keeps_type_locked(client):
    created = create_campaign(client)
    cid = created["id"]

    response = client.patch(f"{API}/{cid}", json={"name": "  Renamed  ", "dailyBudget": 5000, "endDate": "2025-04-30", "status": "paused"})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["name"] == "Renamed"
    assert body["dailyBudget"] == 5000
    assert body["endDate"] == "2025-04-30"
    assert body["status"] == "paused"
    assert body["startDate"] == created["startDate"]  # never changes
    assert body["updatedAt"] >= created["updatedAt"]

    # Explicit null clears the end date; omitting it leaves it alone.
    assert client.patch(f"{API}/{cid}", json={"endDate": None}).json()["endDate"] is None
    assert client.patch(f"{API}/{cid}", json={"name": "Again"}).json()["endDate"] is None

    # Same type is fine, a different one is rejected.
    assert client.patch(f"{API}/{cid}", json={"type": "sponsored_products"}).status_code == 200
    bad = client.patch(f"{API}/{cid}", json={"type": "sponsored_brands"})
    assert bad.status_code == 422
    assert "type cannot be changed" in bad.text

    assert "before the start date" in client.patch(f"{API}/{cid}", json={"endDate": "2025-01-01"}).text
    assert client.patch(f"{API}/{cid}", json={"products": []}).status_code == 422
    assert client.patch(f"{API}/{cid}", json={"dailyBudget": 50}).status_code == 422

    updated = client.patch(f"{API}/{cid}", json={"products": [{"id": "SKU-2001", "name": "Bottle", "price": 2499}]}).json()
    assert [p["id"] for p in updated["products"]] == ["SKU-2001"]


def test_get_update_delete_unknown_campaign_is_404(client):
    assert client.get(f"{API}/nope").status_code == 404
    assert client.patch(f"{API}/nope", json={"name": "x"}).status_code == 404
    assert client.delete(f"{API}/nope").status_code == 404
    assert client.post(f"{API}/nope/pause").status_code == 404


def test_delete_is_soft_and_restore_undoes_it(client):
    created = create_campaign(client)
    cid = created["id"]
    add_performance(client, cid, [{"date": "2025-03-10", "impressions": 100, "clicks": 5, "spend": 250, "conversions": 1, "sales": 2500}])

    assert client.delete(f"{API}/{cid}").status_code == 204
    assert client.get(f"{API}/{cid}").status_code == 404
    assert client.get(API).json()["total"] == 0
    assert client.get("/api/v1/dashboard/summary", params={"from": "2025-03-01", "to": "2025-03-15"}).json()["totals"]["spend"] == 0

    restored = client.post(f"{API}/{cid}/restore")
    assert restored.status_code == 200
    assert restored.json()["id"] == cid
    assert restored.json()["performanceDays"] == 1  # history survived
    assert client.get(API).json()["total"] == 1
    # Restoring a live campaign is a no-op, restoring an unknown one is 404.
    assert client.post(f"{API}/{cid}/restore").status_code == 200
    assert client.post(f"{API}/zzz/restore").status_code == 404
