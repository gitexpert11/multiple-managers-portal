"""Lifecycle actions: pause / resume / toggle / archive / unarchive / duplicate."""

from tests.conftest import TODAY, create_campaign

API = "/api/v1/campaigns"


def test_pause_resume_toggle(client):
    cid = create_campaign(client)["id"]
    assert client.post(f"{API}/{cid}/pause").json()["status"] == "paused"
    assert client.post(f"{API}/{cid}/pause").json()["status"] == "paused"  # idempotent
    assert client.post(f"{API}/{cid}/resume").json()["status"] == "active"
    assert client.post(f"{API}/{cid}/toggle-status").json()["status"] == "paused"
    assert client.post(f"{API}/{cid}/toggle-status").json()["status"] == "active"


def test_archive_hides_from_default_listing_and_unarchive_comes_back_paused(client):
    cid = create_campaign(client)["id"]
    assert client.post(f"{API}/{cid}/archive").json()["status"] == "archived"

    assert client.get(API).json()["total"] == 0  # "all" = active + paused
    assert client.get(API, params={"status": "archived"}).json()["total"] == 1
    summary = client.get("/api/v1/dashboard/summary").json()
    assert summary["campaignCount"] == 0
    assert summary["archivedCount"] == 1
    assert summary["totalCampaigns"] == 1

    assert client.post(f"{API}/{cid}/unarchive").json()["status"] == "paused"
    assert client.post(f"{API}/{cid}/unarchive").json()["status"] == "paused"  # no-op when not archived
    # An archived campaign toggled comes back active (matches the UI contract).
    client.post(f"{API}/{cid}/archive")
    assert client.post(f"{API}/{cid}/toggle-status").json()["status"] == "active"


def test_duplicate_makes_a_paused_copy_starting_today_without_history(client):
    source = create_campaign(client, name="Launch", endDate="2025-04-01", startDate="2025-02-01")
    client.put(f"{API}/{source['id']}/performance", json={"rows": [{"date": "2025-03-01", "impressions": 10, "clicks": 1, "spend": 100, "conversions": 0, "sales": 0}]})

    copy = client.post(f"{API}/{source['id']}/duplicate", json={"startDate": TODAY.isoformat()})
    assert copy.status_code == 201, copy.text
    body = copy.json()
    assert body["id"] != source["id"]
    assert body["name"] == "Copy of Launch"
    assert body["status"] == "paused"
    assert body["startDate"] == "2025-03-15"
    assert body["endDate"] == "2025-04-01"  # still in the future: kept
    assert body["dailyBudget"] == source["dailyBudget"]
    assert body["type"] == source["type"]
    assert body["products"] == source["products"]
    assert body["performanceDays"] == 0
    assert body["source"] == "user"

    # Names are made unique, and a past end date is dropped from the copy.
    second = client.post(f"{API}/{source['id']}/duplicate", json={"startDate": TODAY.isoformat()}).json()
    assert second["name"] == "Copy of Launch (2)"
    ended = create_campaign(client, name="Old", startDate="2025-01-01", endDate="2025-02-01")
    copy_of_ended = client.post(f"{API}/{ended['id']}/duplicate", json={"startDate": TODAY.isoformat()}).json()
    assert copy_of_ended["endDate"] is None

    # Without a body the copy starts on the server's today.
    assert client.post(f"{API}/{source['id']}/duplicate").status_code == 201


def test_copy_name_stays_within_limit():
    from app.services.campaigns import copy_name

    long_name = "x" * 120
    first = copy_name(long_name, set())
    assert len(first) == 120 and first.startswith("Copy of ")
    second = copy_name(long_name, {first})
    assert len(second) == 120 and second.endswith(" (2)")
    assert copy_name("A", {"copy of a", "Copy of A (2)"}) == "Copy of A (3)"
