from fastapi import APIRouter, status

from app.api.deps import DB
from app.schemas.datasets import DatasetChangeOut, DatasetLoadIn, DatasetsOut
from app.services import datasets as svc

router = APIRouter(prefix="/datasets", tags=["datasets"])


@router.get("", response_model=DatasetsOut, summary="Whether the sample / dummy datasets are loaded")
def datasets_status(db: DB) -> DatasetsOut:
    return svc.status(db)


@router.post("/{name}", response_model=DatasetChangeOut, status_code=status.HTTP_201_CREATED, summary="Load the 'sample' or 'dummy' dataset")
def load_dataset(db: DB, name: str, payload: DatasetLoadIn | None = None) -> DatasetChangeOut:
    return svc.load(db, name, today=payload.today if payload else None)


@router.delete("/{name}", response_model=DatasetChangeOut, summary="Remove every campaign of the 'sample' or 'dummy' dataset")
def remove_dataset(db: DB, name: str) -> DatasetChangeOut:
    return svc.remove(db, name)
