"""SQLAlchemy models for the Ads Campaign Management domain."""

from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Campaign(Base):
    __tablename__ = "campaigns"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    daily_budget: Mapped[int] = mapped_column(Integer, nullable=False)  # minor units (cents)
    type: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    bid_strategy: Mapped[str] = mapped_column(String(32), nullable=False, default="auto")
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="active", index=True)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    # Where the record came from: "user" | "sample" | "dummy". Lets the sample /
    # dummy data toggles remove exactly what they added, even after edits.
    source: Mapped[str] = mapped_column(String(16), nullable=False, default="user", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    # Soft delete so "Undo" after a delete is a simple restore.
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, index=True)

    products: Mapped[list[CampaignProduct]] = relationship(
        back_populates="campaign", cascade="all, delete-orphan", order_by="CampaignProduct.position", lazy="selectin"
    )
    performance: Mapped[list[PerformanceRow]] = relationship(back_populates="campaign", cascade="all, delete-orphan", lazy="noload")


class CampaignProduct(Base):
    """A snapshot of an advertised product, so catalogue changes never break old campaigns."""

    __tablename__ = "campaign_products"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    campaign_id: Mapped[str] = mapped_column(ForeignKey("campaigns.id", ondelete="CASCADE"), nullable=False, index=True)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    product_id: Mapped[str] = mapped_column(String(64), nullable=False)
    sku: Mapped[str] = mapped_column(String(64), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    category: Mapped[str] = mapped_column(String(100), nullable=False, default="")
    price: Mapped[int] = mapped_column(Integer, nullable=False, default=0)  # cents

    campaign: Mapped[Campaign] = relationship(back_populates="products")


class PerformanceRow(Base):
    """One day of reporting for one campaign. Derived metrics are never stored."""

    __tablename__ = "campaign_performance"

    campaign_id: Mapped[str] = mapped_column(ForeignKey("campaigns.id", ondelete="CASCADE"), primary_key=True)
    date: Mapped[date] = mapped_column(Date, primary_key=True)
    impressions: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    clicks: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    spend: Mapped[int] = mapped_column(Integer, nullable=False, default=0)  # cents
    conversions: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    sales: Mapped[int] = mapped_column(Integer, nullable=False, default=0)  # cents

    campaign: Mapped[Campaign] = relationship(back_populates="performance")


Index("ix_campaign_performance_date", PerformanceRow.date)


class Product(Base):
    """The catalogue campaigns can advertise from (seeded at startup)."""

    __tablename__ = "products"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    sku: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    category: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    price: Mapped[int] = mapped_column(Integer, nullable=False)  # cents
    color: Mapped[str] = mapped_column(String(16), nullable=False, default="#94a3b8")


class Preference(Base):
    """Key/value settings (e.g. display currency)."""

    __tablename__ = "preferences"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[str] = mapped_column(Text, nullable=False)
