"""Guest visit history lookup with privacy-preserving phone hashing.

Phone numbers are NEVER stored or logged. Only the SHA-256 hash (salted
with PHONE_HASH_SALT + tenant_id) is persisted in guest_visits.
"""
from __future__ import annotations

import hashlib
import os
from dataclasses import dataclass
from datetime import date
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from .database import GuestVisit, engine


@dataclass
class GuestHistory:
    visit_count: int
    no_show_count: int
    completion_count: int
    last_visit: Optional[date]
    average_spend: Optional[float]


def hash_phone(phone: str, tenant_id: str) -> str:
    """Return the SHA-256 hex digest of a phone number with a per-tenant salt.

    The salt is read from the PHONE_HASH_SALT environment variable. This
    variable MUST be set before calling this function — it raises ValueError
    if absent so callers can decide to fall back to cold-start rather than
    producing an insecure hash.

    The hash format is: SHA-256(f"{salt}:{tenant_id}:{phone}")
    Using tenant_id in the payload means the same phone number hashes to
    different values across tenants, preventing cross-tenant correlation.

    Args:
        phone: Raw phone number string (not stored or logged).
        tenant_id: Tenant identifier included in the hash payload.

    Returns:
        64-character lowercase hex digest.

    Raises:
        ValueError: If PHONE_HASH_SALT is not set in the environment.
    """
    salt = os.environ.get("PHONE_HASH_SALT")
    if not salt:
        raise ValueError(
            "PHONE_HASH_SALT environment variable is required for phone hashing. "
            "Set it to a random string unique to this deployment. "
            "See .env.example for instructions."
        )
    payload = f"{salt}:{tenant_id}:{phone}".encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def get_history(tenant_id: str, phone_hash: str) -> GuestHistory:
    """Return aggregated visit history for a guest identified by phone_hash.

    Cross-tenant isolation is enforced: the query always filters on both
    tenant_id AND phone_hash. A guest hash from tenant A will never match
    tenant B records (the hash payload includes tenant_id).

    Args:
        tenant_id: Tenant identifier.
        phone_hash: SHA-256 hash from hash_phone().

    Returns:
        GuestHistory with zero counts if no records exist for this guest.
    """
    with Session(engine) as session:
        rows = session.execute(
            select(GuestVisit).where(
                GuestVisit.tenant_id == tenant_id,
                GuestVisit.phone_hash == phone_hash,
            )
        ).scalars().all()

    if not rows:
        return GuestHistory(
            visit_count=0,
            no_show_count=0,
            completion_count=0,
            last_visit=None,
            average_spend=None,
        )

    no_show_count = sum(1 for r in rows if r.status == "no_show")
    completion_count = sum(1 for r in rows if r.status == "completed")
    last_visit = max(r.visit_date for r in rows)
    spends = [r.spend_aed for r in rows if r.spend_aed is not None]
    average_spend = round(sum(spends) / len(spends), 2) if spends else None

    return GuestHistory(
        visit_count=len(rows),
        no_show_count=no_show_count,
        completion_count=completion_count,
        last_visit=last_visit,
        average_spend=average_spend,
    )
