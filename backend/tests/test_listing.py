"""Filtering, searching, sorting and paging of /campaigns."""

import pytest

from tests.conftest import add_performance, create_campaign

API = "/api/v1/campaigns"


def seed(client):
    a = create_campaign(client, name="Alpha", type="sponsored_products", dailyBudget=1000, startDate="2025-03-01")
    b = create_campaign(client, name="Bravo", type="sponsored_brands", dailyBudget=3000, startDate="2025-02-01", endDate="2025-03-20", products=[{"id": "SKU-2001", "sku": "SKU-2001", "name": "Insulated Bottle", "category": "Home & Kitchen", "price": 2499}])
    c = create_campaign(client, name="Charlie", type="sponsored_display", dailyBudget=2000, startDate="2025-01-01")
    client.post(f"{API}/{b['id']}/pause")
    client.post(f"{API}/{c['id']}/archive")
    add_performance(client, a["id"], [{"date": "2025-03-10", "impressions": 100, "clicks": 10, "spend": 1000, "conversions": 1, "sales": 5000}])
    add_performance(client, b["id"], [{"date": "2025-03-10", "impressions": 1000, "clicks": 20, "spend": 500, "conversions": 2, "sales": 1000}])
    return a, b, c


def names(page: dict) -> list[str]:
    return [item["name"] for item in page["items"]]


def test_status_and_type_filters(client):
    seed(client)
    params = {"from": "2025-03-01", "to": "2025-03-15"}
    assert names(client.get(API, params=params).json()) == ["Bravo", "Alpha"]  # newest first; archived hidden
    assert names(client.get(API, params={**params, "status": "active"}).json()) == ["Alpha"]
    assert names(client.get(API, params={**params, "status": "paused"}).json()) == ["Bravo"]
    assert names(client.get(API, params={**params, "status": "archived"}).json()) == ["Charlie"]
    assert names(client.get(API, params={**params, "type": "sponsored_brands"}).json()) == ["Bravo"]
    assert client.get(API, params={**params, "status": "bogus"}).status_code == 422


def test_search_matches_name_product_name_and_sku(client):
    seed(client)
    assert names(client.get(API, params={"q": "alp"}).json()) == ["Alpha"]
    assert names(client.get(API, params={"q": "BOTTLE"}).json()) == ["Bravo"]
    assert names(client.get(API, params={"q": "sku-2001"}).json()) == ["Bravo"]
    assert names(client.get(API, params={"q": "zzz"}).json()) == []


@pytest.mark.parametrize(
    ("sort", "direction", "expected"),
    [
        ("name", "asc", ["Alpha", "Bravo"]),
        ("name", "desc", ["Bravo", "Alpha"]),
        ("budget", "desc", ["Bravo", "Alpha"]),
        ("status", "asc", ["Alpha", "Bravo"]),
        ("startDate", "asc", ["Bravo", "Alpha"]),
        ("endDate", "asc", ["Bravo", "Alpha"]),  # ongoing campaigns sort last
        ("spend", "desc", ["Alpha", "Bravo"]),
        ("impressions", "desc", ["Bravo", "Alpha"]),
        ("roas", "desc", ["Alpha", "Bravo"]),
        ("ctr", "desc", ["Alpha", "Bravo"]),
    ],
)
def test_sorting(client, sort, direction, expected):
    seed(client)
    page = client.get(API, params={"from": "2025-03-01", "to": "2025-03-15", "sort": sort, "dir": direction}).json()
    assert names(page) == expected
    assert page["sort"] == sort and page["dir"] == direction


def test_unknown_sort_key_is_rejected(client):
    assert client.get(API, params={"sort": "nope"}).status_code == 422
    assert client.get(API, params={"dir": "sideways"}).status_code == 422


def test_paging_and_locate(client):
    ids = [create_campaign(client, name=f"Campaign {i:02d}")["id"] for i in range(12)]
    page = client.get(API, params={"pageSize": 5}).json()
    assert (page["page"], page["pageCount"], page["total"], page["pageSize"]) == (1, 3, 12, 5)
    assert page["aggregates"] == {"campaigns": 12, "products": 12, "dailyBudget": 12 * 2500}
    assert names(page) == [f"Campaign {i:02d}" for i in range(11, 6, -1)]

    last = client.get(API, params={"pageSize": 5, "page": 3}).json()
    assert names(last) == ["Campaign 01", "Campaign 00"]
    # Out-of-range pages are clamped rather than rejected.
    assert client.get(API, params={"pageSize": 5, "page": 99}).json()["page"] == 3
    assert client.get(API, params={"pageSize": 0}).status_code == 422

    # locate: jump to the page a given campaign is on (the oldest one is on page 3).
    located = client.get(API, params={"pageSize": 5, "locate": ids[0]}).json()
    assert located["page"] == 3
    assert client.get(API, params={"pageSize": 5, "locate": "unknown"}).json()["page"] == 1


def test_range_validation(client):
    assert client.get(API, params={"from": "2025-03-15", "to": "2025-03-01"}).status_code == 422
    assert client.get(API, params={"from": "2020-01-01", "to": "2025-03-01"}).status_code == 422
    assert client.get(API, params={"from": "nope"}).status_code == 422
    page = client.get(API, params={"to": "2025-03-15"}).json()
    assert page["range"] == {"from": "2025-02-14", "to": "2025-03-15", "days": 30}
