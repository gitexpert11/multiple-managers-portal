"""Shared schema base: camelCase on the wire, snake_case in Python."""

from datetime import date

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class APIModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True, serialize_by_alias=True)


class DateRangeOut(APIModel):
    start: date = Field(alias="from")
    end: date = Field(alias="to")
    days: int


class MessageOut(APIModel):
    detail: str
