"""Dashboard summary (with previous period) and daily series."""

from tests.conftest import add_performance, create_campaign

API = "/api/v1/dashboard"


def test_summary_totals_previous_and_counts(client):
    a = create_campaign(client, name="A")
    b = create_campaign(client, name="B", type="sponsored_brands")
    c = create_campaign(client, name="C")
    client.post(f"/api/v1/campaigns/{c['id']}/archive")
    add_performance(client, a["id"], [{"date": "2025-03-10", "impressions": 100, "clicks": 10, "spend": 1000, "conversions": 1, "sales": 4000}])
    add_performance(client, b["id"], [{"date": "2025-03-12", "impressions": 300, "clicks": 10, "spend": 1000, "conversions": 3, "sales": 2000}])
    add_performance(client, b["id"], [{"date": "2025-03-01", "impressions": 50, "clicks": 5, "spend": 500, "conversions": 1, "sales": 1000}])  # previous period
    add_performance(client, c["id"], [{"date": "2025-03-10", "impressions": 9999, "clicks": 999, "spend": 99999, "conversions": 99, "sales": 999999}])  # archived: excluded

    summary = client.get(f"{API}/summary", params={"from": "2025-03-09", "to": "2025-03-15"}).json()
    assert summary["range"] == {"from": "2025-03-09", "to": "2025-03-15", "days": 7}
    assert summary["previousRange"] == {"from": "2025-03-02", "to": "2025-03-08", "days": 7}
    assert summary["totals"]["impressions"] == 400
    assert summary["totals"]["clicks"] == 20
    assert summary["totals"]["spend"] == 2000
    assert summary["totals"]["sales"] == 6000
    assert summary["totals"]["ctr"] == 0.05
    assert summary["totals"]["roas"] == 3.0
    assert summary["totals"]["days"] == 2
    assert summary["previous"]["spend"] == 0  # 2025-03-01 is before the previous window
    assert summary["campaignCount"] == 2
    assert summary["archivedCount"] == 1
    assert summary["totalCampaigns"] == 3
    assert summary["datasets"] == {"sample": 0, "dummy": 0}

    previous = client.get(f"{API}/summary", params={"from": "2025-03-02", "to": "2025-03-08"}).json()
    assert previous["previous"]["spend"] == 500

    # Filters scope the cards the same way they scope the grid.
    brands = client.get(f"{API}/summary", params={"from": "2025-03-09", "to": "2025-03-15", "type": "sponsored_brands"}).json()
    assert brands["totals"]["spend"] == 1000 and brands["campaignCount"] == 1
    archived = client.get(f"{API}/summary", params={"from": "2025-03-09", "to": "2025-03-15", "status": "archived"}).json()
    assert archived["totals"]["spend"] == 99999


def test_series_has_one_zero_filled_point_per_day(client):
    a = create_campaign(client, name="Alpha")
    b = create_campaign(client, name="Bravo")
    add_performance(client, a["id"], [{"date": "2025-03-10", "impressions": 100, "clicks": 10, "spend": 1000, "conversions": 1, "sales": 4000}])
    add_performance(client, b["id"], [{"date": "2025-03-10", "impressions": 100, "clicks": 10, "spend": 1000, "conversions": 1, "sales": 2000}, {"date": "2025-03-12", "impressions": 10, "clicks": 1, "spend": 100, "conversions": 0, "sales": 0}])

    series = client.get(f"{API}/series", params={"from": "2025-03-09", "to": "2025-03-12"}).json()
    assert [p["date"] for p in series["points"]] == ["2025-03-09", "2025-03-10", "2025-03-11", "2025-03-12"]
    day = series["points"][1]
    assert (day["impressions"], day["clicks"], day["spend"], day["sales"]) == (200, 20, 2000, 6000)
    assert day["ctr"] == 0.1 and day["roas"] == 3.0 and day["days"] == 2
    assert series["points"][0]["spend"] == 0 and series["points"][2]["spend"] == 0
    assert series["points"][3]["spend"] == 100

    filtered = client.get(f"{API}/series", params={"from": "2025-03-09", "to": "2025-03-12", "q": "alpha"}).json()
    assert filtered["points"][1]["sales"] == 4000
