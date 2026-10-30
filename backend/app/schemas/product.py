from pydantic import Field, field_validator

from app.schemas.common import APIModel


class ProductSnapshot(APIModel):
    """A product as stored on a campaign (a snapshot, independent of the catalogue)."""

    id: str = Field(min_length=1, max_length=64)
    sku: str = Field(default="", max_length=64)
    name: str = Field(min_length=1, max_length=200)
    category: str = Field(default="", max_length=100)
    price: int = Field(default=0, ge=0)

    @field_validator("id", "sku", "name", "category", mode="before")
    @classmethod
    def _strip(cls, v: object) -> object:
        return v.strip() if isinstance(v, str) else v

    def normalised(self) -> "ProductSnapshot":
        return self.model_copy(update={"sku": self.sku or self.id})


class ProductOut(APIModel):
    id: str
    sku: str
    name: str
    category: str
    price: int
    color: str


class ProductListOut(APIModel):
    items: list[ProductOut]
    total: int
    categories: list[str]
