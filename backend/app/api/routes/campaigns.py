from datetime import date
from typing import Annotated, Literal

from fastapi import APIRouter, Query, Response, status

from app.api.deps import DB, Filters, Range
from app.domain.constants import DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE
from app.schemas.campaign import CampaignCreate, CampaignOut, CampaignPageOut, CampaignUpdate, DuplicateIn
from app.schemas.performance import PerformanceOut, PerformanceRowOut, PerformanceUpsertIn
from app.services import campaigns as svc

router = APIRouter(prefix="/campaigns", tags=["campaigns"])


@router.get("", response_model=CampaignPageOut, summary="List campaigns with their metrics for a period")
def list_campaigns(
    db: DB,
    rng: Range,
    filters: Filters,
    sort: Annotated[str, Query(description="Column or metric id to sort by")] = "createdAt",
    direction: Annotated[Literal["asc", "desc"], Query(alias="dir")] = "desc",
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(alias="pageSize", ge=1, le=MAX_PAGE_SIZE)] = DEFAULT_PAGE_SIZE,
    locate: Annotated[str | None, Query(description="Return the page that contains this campaign id (overrides 'page')")] = None,
) -> CampaignPageOut:
    return svc.list_campaigns(db, filters, rng, sort=sort, direction=direction, page=page, page_size=page_size, locate=locate)


@router.post("", response_model=CampaignOut, status_code=status.HTTP_201_CREATED, summary="Create a campaign")
def create_campaign(db: DB, payload: CampaignCreate) -> CampaignOut:
    return svc.serialize(db, svc.create_campaign(db, payload))


@router.get("/{campaign_id}", response_model=CampaignOut)
def get_campaign(db: DB, campaign_id: str) -> CampaignOut:
    return svc.serialize(db, svc.get_campaign(db, campaign_id))


@router.patch("/{campaign_id}", response_model=CampaignOut, summary="Edit a campaign (type is immutable)")
def update_campaign(db: DB, campaign_id: str, patch: CampaignUpdate) -> CampaignOut:
    return svc.serialize(db, svc.update_campaign(db, campaign_id, patch))


@router.delete("/{campaign_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete a campaign (soft; see /restore)")
def delete_campaign(db: DB, campaign_id: str) -> Response:
    svc.soft_delete(db, campaign_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{campaign_id}/restore", response_model=CampaignOut, summary="Undo a delete")
def restore_campaign(db: DB, campaign_id: str) -> CampaignOut:
    return svc.serialize(db, svc.restore(db, campaign_id))


@router.post("/{campaign_id}/duplicate", response_model=CampaignOut, status_code=status.HTTP_201_CREATED, summary="Copy a campaign (paused, starting today, no history)")
def duplicate_campaign(db: DB, campaign_id: str, payload: DuplicateIn | None = None) -> CampaignOut:
    today: date | None = payload.start_date if payload else None
    return svc.serialize(db, svc.duplicate_campaign(db, campaign_id, today=today))


@router.post("/{campaign_id}/pause", response_model=CampaignOut)
def pause_campaign(db: DB, campaign_id: str) -> CampaignOut:
    return svc.serialize(db, svc.set_status(db, campaign_id, "paused"))


@router.post("/{campaign_id}/resume", response_model=CampaignOut)
def resume_campaign(db: DB, campaign_id: str) -> CampaignOut:
    return svc.serialize(db, svc.set_status(db, campaign_id, "active"))


@router.post("/{campaign_id}/toggle-status", response_model=CampaignOut, summary="Pause an active campaign or resume a paused one")
def toggle_campaign(db: DB, campaign_id: str) -> CampaignOut:
    return svc.serialize(db, svc.toggle_status(db, campaign_id))


@router.post("/{campaign_id}/archive", response_model=CampaignOut)
def archive_campaign(db: DB, campaign_id: str) -> CampaignOut:
    return svc.serialize(db, svc.archive(db, campaign_id))


@router.post("/{campaign_id}/unarchive", response_model=CampaignOut, summary="Bring an archived campaign back (paused)")
def unarchive_campaign(db: DB, campaign_id: str) -> CampaignOut:
    return svc.serialize(db, svc.unarchive(db, campaign_id))


@router.get("/{campaign_id}/performance", response_model=PerformanceOut, summary="Daily performance rows")
def get_performance(
    db: DB,
    campaign_id: str,
    start: Annotated[date | None, Query(alias="from")] = None,
    end: Annotated[date | None, Query(alias="to")] = None,
) -> PerformanceOut:
    from app.domain.dates import resolve_range

    rng = resolve_range(start, end) if (start or end) else None
    rows = svc.get_performance(db, campaign_id, rng)
    return PerformanceOut(
        campaign_id=campaign_id,
        range=svc.range_out(rng) if rng else None,
        rows=[PerformanceRowOut.model_validate(r) for r in rows],
    )


@router.put("/{campaign_id}/performance", response_model=CampaignOut, summary="Upsert daily performance rows (a reporting feed)")
def upsert_performance(db: DB, campaign_id: str, payload: PerformanceUpsertIn) -> CampaignOut:
    return svc.serialize(db, svc.upsert_performance(db, campaign_id, payload.rows))
