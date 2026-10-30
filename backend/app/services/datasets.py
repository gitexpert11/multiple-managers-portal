"""Sample ("realistic") and dummy ("placeholder at volume") datasets, loaded and removed as a unit."""

from __future__ import annotations

from datetime import date

from sqlalchemy.orm import Session

from app.core.exceptions import DomainError
from app.domain.constants import SOURCE_DUMMY, SOURCE_SAMPLE
from app.domain.dates import utc_today
from app.domain.sample_data import generate_dummy_campaigns, generate_sample_campaigns
from app.schemas.datasets import DatasetChangeOut, DatasetsOut, DatasetStatus
from app.services.campaigns import count_by_source, insert_generated, remove_by_source

DATASETS = {"sample": SOURCE_SAMPLE, "dummy": SOURCE_DUMMY}


def _source(name: str) -> str:
    try:
        return DATASETS[name]
    except KeyError as exc:
        raise DomainError(f"Unknown dataset '{name}' (expected one of: {', '.join(DATASETS)})", status_code=404) from exc


def status(db: Session) -> DatasetsOut:
    sample = count_by_source(db, SOURCE_SAMPLE)
    dummy = count_by_source(db, SOURCE_DUMMY)
    return DatasetsOut(sample=DatasetStatus(present=sample > 0, count=sample), dummy=DatasetStatus(present=dummy > 0, count=dummy))


def load(db: Session, name: str, *, today: date | None = None) -> DatasetChangeOut:
    source = _source(name)
    today = today or utc_today()
    records = generate_sample_campaigns(today) if source == SOURCE_SAMPLE else generate_dummy_campaigns(today)
    added = insert_generated(db, records)
    return DatasetChangeOut(dataset=name, added=len(added), status=status(db))


def remove(db: Session, name: str) -> DatasetChangeOut:
    source = _source(name)
    removed = remove_by_source(db, source)
    return DatasetChangeOut(dataset=name, removed=removed, status=status(db))
