"""Performance ingestion and the per-campaign metrics it produces."""

from tests.conftest import add_performance, create_campaign

API = "/api/v1/campaigns"


def test_upsert_replaces_rows_for_the_same_date(client):
    cid = create_campaign(client)["id"]
    add_performance(client, cid, [{"date": "2025-03-10", "impressions": 100, "clicks": 10, "spend": 500, "conversions": 2, "sales": 4000}])
    add_performance(client, cid, [{"date": "2025-03-10", "impressions": 200, "clicks": 20, "spend": 1000, "conversions": 4, "sales": 8000}, {"date": "2025-03-11", "impressions": 50}])

    rows = client.get(f"{API}/{cid}/performance").json()
    assert rows["campaignId"] == cid
    assert rows["range"] is None
    assert rows["rows"] == [
        {"date": "2025-03-10", "impressions": 200, "clicks": 20, "spend": 1000, "conversions": 4, "sales": 8000},
        {"date": "2025-03-11", "impressions": 50, "clicks": 0, "spend": 0, "conversions": 0, "sales": 0},
    ]
    assert client.get(f"{API}/{cid}").json()["performanceDays"] == 2

    ranged = client.get(f"{API}/{cid}/performance", params={"from": "2025-03-11", "to": "2025-03-12"}).json()
    assert ranged["range"] == {"from": "2025-03-11", "to": "2025-03-12", "days": 2}
    assert [r["date"] for r in ranged["rows"]] == ["2025-03-11"]


def test_upsert_validation(client):
    cid = create_campaign(client)["id"]
    assert client.put(f"{API}/{cid}/performance", json={"rows": []}).status_code == 422
    assert client.put(f"{API}/{cid}/performance", json={"rows": [{"date": "2025-03-10", "clicks": -1}]}).status_code == 422
    assert client.put(f"{API}/{cid}/performance", json={"rows": [{"date": "not-a-date"}]}).status_code == 422
    assert client.put(f"{API}/nope/performance", json={"rows": [{"date": "2025-03-10"}]}).status_code == 404


def test_listing_metrics_are_ratios_of_sums_over_the_period(client):
    cid = create_campaign(client)["id"]
    add_performance(
        client,
        cid,
        [
            {"date": "2025-03-10", "impressions": 1000, "clicks": 10, "spend": 500, "conversions": 1, "sales": 2000},
            {"date": "2025-03-11", "impressions": 1000, "clicks": 30, "spend": 1500, "conversions": 3, "sales": 6000},
            {"date": "2025-02-01", "impressions": 99999, "clicks": 1, "spend": 1, "conversions": 1, "sales": 1},  # outside the period
        ],
    )
    page = client.get(API, params={"from": "2025-03-01", "to": "2025-03-15"}).json()
    m = page["items"][0]["metrics"]
    assert m == {
        "impressions": 2000,
        "clicks": 40,
        "spend": 2000,
        "conversions": 4,
        "sales": 8000,
        "ctr": 0.02,
        "cpc": 50.0,
        "cvr": 0.1,
        "roas": 4.0,
        "acos": 0.25,
        "days": 2,
    }
    assert page["items"][0]["performanceDays"] == 3
