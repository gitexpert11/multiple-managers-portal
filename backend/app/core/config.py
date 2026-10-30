"""Runtime configuration, read from environment variables prefixed with ``ADS_``."""

from functools import lru_cache

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="ADS_", env_file=".env", extra="ignore")

    app_name: str = "Ads Campaign Management API"
    api_prefix: str = "/api/v1"
    database_url: str = "sqlite:///./data/ads.db"
    cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:5173", "http://127.0.0.1:5173"])
    auto_migrate: bool = True
    echo_sql: bool = False

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()
