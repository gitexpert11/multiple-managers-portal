from datetime import date

from app.schemas.common import APIModel


class DatasetStatus(APIModel):
    present: bool
    count: int


class DatasetsOut(APIModel):
    sample: DatasetStatus
    dummy: DatasetStatus


class DatasetLoadIn(APIModel):
    today: date | None = None


class DatasetChangeOut(APIModel):
    dataset: str
    added: int = 0
    removed: int = 0
    status: DatasetsOut
