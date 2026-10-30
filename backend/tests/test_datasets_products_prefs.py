"""Sample / dummy datasets, the product catalogue and preferences."""

from datetime import date, timedelta

from app.domain.sample_data import generate_dummy_campaigns, generate_sample_campaigns
from tests.conftest import TODAY

API = "/api/v1"


def test_sample_dataset_is_deterministic_and_realistic():
    first = generate_sample_campaigns(TODAY)
    second = generate_sample_campaigns(TODAY)
    assert first == second
    assert len(first) == 8
    assert {c["type"] for c in first} == {"sponsored_products", "sponsored_brands", "sponsored_display"}
    assert sum(c["status"] == "paused" for c in first) == 2
    headphones = first[0]
    assert headphones["start_date"] == TODAY - timedelta(days=89)
    assert len(headphones["performance"]) == 90
    assert headphones["performance"][-1]["date"] == TODAY
    assert all(row["spend"] > 0 for row in headphones["performance"])
    young = first[-1]
    assert young["start_date"] == TODAY - timedelta(days=5) and len(young["performance"]) == 6
    paused = first[5]
    assert paused["performance"][-1]["date"] == TODAY - timedelta(days=12)
    ended = first[6]
    assert ended["end_date"] == TODAY - timedelta(days=40)


def test_dummy_dataset_shape():
    dummies = generate_dummy_campaigns(TODAY)
    assert len(dummies) == 96
    assert dummies[0]["name"] == "Dummy Campaign 001"
    assert dummies[0]["products"][0]["name"] == "Dummy Product 1"
    assert sum(c["status"] == "archived" for c in dummies) == 7  # every 13th
    assert sum(c["status"] == "paused" for c in dummies) == 12 - 0  # every 8th that is not also a 13th
    assert len(dummies[29]["performance"]) == 30 and len(dummies[30]["performance"]) == 0
    assert dummies[4]["end_date"] is not None and dummies[3]["end_date"] is None


def test_load_and_remove_datasets_via_api(client):
    assert client.get(f"{API}/datasets").json() == {"sample": {"present": False, "count": 0}, "dummy": {"present": False, "count": 0}}

    loaded = client.post(f"{API}/datasets/sample", json={"today": TODAY.isoformat()})
    assert loaded.status_code == 201, loaded.text
    assert loaded.json()["added"] == 8
    assert loaded.json()["status"]["sample"] == {"present": True, "count": 8}
    # Loading again is idempotent.
    assert client.post(f"{API}/datasets/sample", json={"today": TODAY.isoformat()}).json()["added"] == 0

    summary = client.get(f"{API}/dashboard/summary", params={"from": "2025-02-14", "to": "2025-03-15"}).json()
    assert summary["totals"]["spend"] > 0
    assert summary["datasets"] == {"sample": 8, "dummy": 0}
    assert summary["campaignCount"] == 8

    dummy = client.post(f"{API}/datasets/dummy", json={"today": TODAY.isoformat()}).json()
    assert dummy["added"] == 96
    page = client.get(f"{API}/campaigns", params={"pageSize": 20, "status": "archived"}).json()
    assert page["total"] == 7 and all(i["source"] == "dummy" for i in page["items"])

    # A sample campaign edited by the user is still removed with the dataset (source, not id prefix).
    client.patch(f"{API}/campaigns/mock_0001", json={"name": "Renamed by me"})
    removed = client.delete(f"{API}/datasets/sample").json()
    assert removed["removed"] == 8
    assert removed["status"]["sample"]["present"] is False
    assert client.get(f"{API}/campaigns/mock_0001").status_code == 404
    assert client.get(f"{API}/datasets").json()["dummy"]["count"] == 96
    assert client.delete(f"{API}/datasets/dummy").json()["removed"] == 96

    assert client.post(f"{API}/datasets/other").status_code == 404
    assert client.post(f"{API}/datasets/sample").status_code == 201  # no body: server's today


def test_products_catalogue(client):
    products = client.get(f"{API}/products").json()
    assert products["total"] == 40
    assert products["items"][0]["id"] == "SKU-1001"
    assert products["categories"][:3] == ["Electronics", "Home & Kitchen", "Beauty"]
    assert client.get(f"{API}/products/categories").json() == products["categories"]

    search = client.get(f"{API}/products", params={"q": "coffee"}).json()
    assert [p["id"] for p in search["items"]] == ["SKU-6001"]
    by_cat = client.get(f"{API}/products", params={"category": "Books"}).json()
    assert {p["category"] for p in by_cat["items"]} == {"Books"} and by_cat["total"] == 3
    both = client.get(f"{API}/products", params={"category": "Books", "q": "atlas"}).json()
    assert [p["name"] for p in both["items"]] == ["Atlas of Remote Islands"]


def test_preferences(client):
    assert client.get(f"{API}/preferences").json() == {"currency": "USD"}
    assert client.patch(f"{API}/preferences", json={"currency": "eur"}).json() == {"currency": "EUR"}
    assert client.get(f"{API}/preferences").json() == {"currency": "EUR"}
    assert client.patch(f"{API}/preferences", json={"currency": "XXX"}).status_code == 422
    assert client.patch(f"{API}/preferences", json={}).json() == {"currency": "EUR"}


def test_generated_datasets_round_trip_through_listing(client):
    client.post(f"{API}/datasets/sample", json={"today": TODAY.isoformat()})
    page = client.get(f"{API}/campaigns", params={"from": "2025-03-09", "to": "2025-03-15", "pageSize": 20, "sort": "spend", "dir": "desc"}).json()
    assert page["total"] == 8
    spends = [i["metrics"]["spend"] for i in page["items"]]
    assert spends == sorted(spends, reverse=True)
    # A paused-40-days-ago campaign has nothing in the last 7 days.
    toys = next(i for i in page["items"] if i["name"].startswith("Toys"))
    assert toys["metrics"]["days"] == 0 and toys["status"] == "paused"
    assert date.fromisoformat(toys["endDate"]) < TODAY
