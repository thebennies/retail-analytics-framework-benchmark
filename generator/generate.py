"""Phase 1b generator — deterministic 10M-transaction synthesizer.

Per spec section 4:
  - Exactly 10,000,000 transactions (hard equality).
  - ~16.2M line items.
  - Distribution per (weekday, hour, cart_size) bucket within ±0.5%.
  - psycopg3 + COPY binary for bulk load.
  - tqdm progress bar.
  - --reset drops + recreates tables before load.
"""
from __future__ import annotations

import argparse
import math
import os
import random
import sys
from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Iterable
from zoneinfo import ZoneInfo

import psycopg
from tqdm import tqdm

# Connect via PgBouncer in transaction mode would defeat COPY (large transactions
# hold a backend the whole time). Generator therefore connects directly to
# postgres:5432, bypassing pgbouncer. This is the only component allowed to do so.
DEFAULT_DSN = os.environ.get(
    "GENERATOR_DSN",
    "postgresql://bench:bench@postgres:5432/benchmark",
)

JKT = ZoneInfo("Asia/Jakarta")

# Spec section 4 distributions.
DAY_DISTRIBUTION = {  # index = python weekday(): Mon=0..Sun=6
    0: 0.105,  # Senin
    1: 0.108,  # Selasa
    2: 0.117,  # Rabu
    3: 0.125,  # Kamis
    4: 0.145,  # Jumat
    5: 0.198,  # Sabtu
    6: 0.202,  # Minggu
}

HOUR_DISTRIBUTION_WEEKDAY = {
    10: 0.03, 11: 0.05, 12: 0.08, 13: 0.09, 14: 0.10,
    15: 0.11, 16: 0.12, 17: 0.14, 18: 0.16, 19: 0.12,
}
HOUR_DISTRIBUTION_WEEKEND = {
    10: 0.04, 11: 0.06, 12: 0.09, 13: 0.11, 14: 0.12,
    15: 0.13, 16: 0.13, 17: 0.13, 18: 0.11, 19: 0.08,
}

CART_DISTRIBUTION = {1: 0.60, 2: 0.25, 3: 0.10, 4: 0.03, 5: 0.02}

TOTAL_TRANSACTIONS = 10_000_000

REGIONS = ["Jakarta", "Jawa Barat", "Jawa Tengah", "Jawa Timur", "Sumatera Utara"]
CATEGORIES = [
    "Makanan", "Minuman", "Snack", "Kebutuhan Harian", "Kesehatan",
    "Kecantikan", "Rumah Tangga", "Elektronik Kecil", "Stationery", "Lainnya",
]
PAYMENT_METHODS = ["Cash", "Debit", "Credit", "QRIS", "Transfer"]


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--dsn", default=DEFAULT_DSN)
    p.add_argument("--reset", action="store_true",
                   help="DROP + recreate all tables before load")
    p.add_argument("--seed", type=int, default=42,
                   help="RNG seed for reproducible runs")
    p.add_argument("--target-month", default=None,
                   help="YYYY-MM. Defaults to calendar month before NOW (spec section 4).")
    return p.parse_args()


def previous_calendar_month(now: datetime | None = None) -> tuple[int, int]:
    now = now or datetime.now(tz=JKT)
    year = now.year
    month = now.month - 1
    if month == 0:
        month = 12
        year -= 1
    return year, month


@dataclass
class Bucket:
    weekday: int    # 0..6 (Mon..Sun)
    hour: int       # 10..19
    cart_size: int  # 1..5
    target: int     # floor allocation
    frac_loss: float  # the truncated fractional remainder (for tie-break)


def list_weekday_dates(year: int, month: int) -> dict[int, list[datetime]]:
    """Return {python weekday: [date, ...]} for all days of target_month."""
    out: dict[int, list[datetime]] = {i: [] for i in range(7)}
    d = datetime(year, month, 1, tzinfo=JKT)
    while d.month == month:
        out[d.weekday()].append(d)
        d += timedelta(days=1)
    return out


def compute_allocation(year: int, month: int) -> list[Bucket]:
    """Spec section 4 algorithm:
       Step 1: per-bucket floor count.
       Step 2: remainder = 10M - sum(floors).
       Step 3: top-N buckets by fractional loss get +1.
    Property: sum(target_after_remainder) == 10_000_000.
    """
    weekday_dates = list_weekday_dates(year, month)
    raw: list[Bucket] = []
    for weekday in range(7):
        weekday_count = len(weekday_dates[weekday])
        if weekday_count == 0:
            continue
        weekday_total_share = DAY_DISTRIBUTION[weekday]
        is_weekend = weekday in (5, 6)
        hour_dist = HOUR_DISTRIBUTION_WEEKEND if is_weekend else HOUR_DISTRIBUTION_WEEKDAY
        for hour in range(10, 20):
            hour_share = hour_dist.get(hour, 0.0)
            if hour_share == 0.0:
                continue
            for cart_size, cart_share in CART_DISTRIBUTION.items():
                raw_expected = (
                    TOTAL_TRANSACTIONS
                    * weekday_total_share
                    * hour_share
                    * cart_share
                )
                target = math.floor(raw_expected)
                frac_loss = raw_expected - target
                raw.append(Bucket(weekday, hour, cart_size, target, frac_loss))

    allocated = sum(b.target for b in raw)
    remainder = TOTAL_TRANSACTIONS - allocated
    assert remainder >= 0, f"floor sum exceeded total: {allocated}"
    # Step 3: highest fractional loss gets +1 first.
    raw.sort(key=lambda b: b.frac_loss, reverse=True)
    for i in range(remainder):
        raw[i].target += 1
    final_sum = sum(b.target for b in raw)
    assert final_sum == TOTAL_TRANSACTIONS, (
        f"allocator bug: sum={final_sum} != {TOTAL_TRANSACTIONS}"
    )
    return raw


def reset_schema(conn: psycopg.Connection) -> None:
    """DROP + recreate all tables. Used only with --reset."""
    print("[reset] dropping + recreating all tables", file=sys.stderr)
    with conn.cursor() as cur:
        cur.execute("""
            DROP TABLE IF EXISTS transaction_items CASCADE;
            DROP TABLE IF EXISTS transactions CASCADE;
            DROP TABLE IF EXISTS payment_methods CASCADE;
            DROP TABLE IF EXISTS products CASCADE;
            DROP TABLE IF EXISTS locations CASCADE;
        """)
        cur.execute(_inline_ddl())
    conn.commit()


def _inline_ddl() -> str:
    """DDL identical to database/init/01-schema.sql."""
    return """
    CREATE TABLE locations (
      id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL, city TEXT NOT NULL,
      region TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW());
    CREATE TABLE products (
      id BIGSERIAL PRIMARY KEY, sku TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
      category TEXT NOT NULL, base_price NUMERIC(12,2) NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW());
    CREATE TABLE payment_methods (
      id BIGSERIAL PRIMARY KEY, name TEXT UNIQUE NOT NULL);
    CREATE TABLE transactions (
      id BIGSERIAL PRIMARY KEY, transaction_time TIMESTAMPTZ NOT NULL,
      location_id BIGINT NOT NULL REFERENCES locations(id),
      payment_method_id BIGINT NOT NULL REFERENCES payment_methods(id),
      total_amount NUMERIC(14,2) NOT NULL,
      total_discount NUMERIC(12,2) NOT NULL DEFAULT 0,
      item_count INTEGER NOT NULL);
    CREATE TABLE transaction_items (
      id BIGSERIAL PRIMARY KEY,
      transaction_id BIGINT NOT NULL REFERENCES transactions(id),
      product_id BIGINT NOT NULL REFERENCES products(id),
      quantity INTEGER NOT NULL, unit_price NUMERIC(12,2) NOT NULL,
      line_discount NUMERIC(12,2) NOT NULL DEFAULT 0,
      subtotal NUMERIC(14,2) NOT NULL);
    CREATE INDEX idx_tx_time         ON transactions(transaction_time);
    CREATE INDEX idx_tx_location     ON transactions(location_id);
    CREATE INDEX idx_tx_payment      ON transactions(payment_method_id);
    CREATE INDEX idx_tx_loc_time     ON transactions(location_id, transaction_time);
    CREATE INDEX idx_txi_transaction ON transaction_items(transaction_id);
    CREATE INDEX idx_txi_product     ON transaction_items(product_id);
    CREATE INDEX idx_txi_prod_tx     ON transaction_items(product_id, transaction_id);
    CREATE EXTENSION IF NOT EXISTS pg_prewarm;
    """


def seed_masters(conn: psycopg.Connection, rng: random.Random) -> tuple[list[int], list[tuple[int, Decimal]], list[int]]:
    """Insert master rows (locations, products, payment_methods).

    Returns (location_ids, list[(product_id, base_price)], payment_method_ids).
    """
    print("[masters] seeding 100 locations / 1000 products / 5 payment methods", file=sys.stderr)
    location_ids: list[int] = []
    product_rows: list[tuple[int, Decimal]] = []
    payment_method_ids: list[int] = []
    with conn.cursor() as cur:
        # Payment methods (5).
        for name in PAYMENT_METHODS:
            cur.execute(
                "INSERT INTO payment_methods (name) VALUES (%s) RETURNING id",
                (name,),
            )
            payment_method_ids.append(cur.fetchone()[0])
        # Locations (100 = 20 per region).
        for i in range(100):
            region = REGIONS[i // 20]
            city = f"{region}-City-{(i % 20) + 1}"
            name = f"Store-{i + 1:03d}"
            cur.execute(
                "INSERT INTO locations (name, city, region) VALUES (%s,%s,%s) RETURNING id",
                (name, city, region),
            )
            location_ids.append(cur.fetchone()[0])
        # Products (1000): 100 per category, base_price log-normal Rp 5K..Rp 500K.
        for i in range(1000):
            category = CATEGORIES[i // 100]
            raw = rng.lognormvariate(mu=10.5, sigma=0.75)
            base = max(5_000.0, min(500_000.0, raw))
            base_price = Decimal(f"{base:.2f}")
            sku = f"SKU-{i + 1:05d}"
            name = f"Product-{i + 1:05d}"
            cur.execute(
                "INSERT INTO products (sku, name, category, base_price) "
                "VALUES (%s,%s,%s,%s) RETURNING id",
                (sku, name, category, base_price),
            )
            product_rows.append((cur.fetchone()[0], base_price))
    conn.commit()
    return location_ids, product_rows, payment_method_ids


def random_timestamp_in_bucket(
    rng: random.Random,
    bucket: Bucket,
    weekday_dates: dict[int, list[datetime]],
) -> datetime:
    date = rng.choice(weekday_dates[bucket.weekday])
    minute = rng.randint(0, 59)
    second = rng.randint(0, 59)
    return date.replace(hour=bucket.hour, minute=minute, second=second, microsecond=0)


def generate_and_load(
    conn: psycopg.Connection,
    rng: random.Random,
    allocation: list[Bucket],
    weekday_dates: dict[int, list[datetime]],
    location_ids: list[int],
    product_rows: list[tuple[int, Decimal]],
    payment_method_ids: list[int],
) -> None:
    """Generate all 10M transactions + line items and COPY into DB.

    Two-pass strategy: generate all data in memory, then COPY transactions,
    then COPY transaction_items. psycopg doesn't support two simultaneous
    COPY operations on the same connection.
    """
    print("[generate] flattening + shuffling 10M slots", file=sys.stderr)
    flat: list[tuple[int, int, int]] = []
    for b in allocation:
        flat.extend([(b.weekday, b.hour, b.cart_size)] * b.target)
    assert len(flat) == TOTAL_TRANSACTIONS
    rng.shuffle(flat)

    print("[generate] generating row data", file=sys.stderr)
    products_only_ids = [pid for pid, _ in product_rows]
    price_by_id = {pid: bp for pid, bp in product_rows}

    # Pre-generate all row data.
    tx_rows: list[tuple] = []
    item_rows: list[tuple] = []
    tx_id = 1
    item_id = 1

    pbar = tqdm(total=TOTAL_TRANSACTIONS, unit="tx", smoothing=0.1)
    for idx, (weekday, hour, cart_size) in enumerate(flat):
        ts = random_timestamp_in_bucket(
            rng,
            Bucket(weekday, hour, cart_size, 0, 0.0),
            weekday_dates,
        )
        loc_id = rng.choice(location_ids)
        pm_id = rng.choice(payment_method_ids)

        chosen_pids = rng.choices(products_only_ids, k=cart_size)
        total_amount = Decimal("0.00")
        total_discount = Decimal("0.00")
        for pid in chosen_pids:
            qty = rng.choices([1, 2, 3], weights=[80, 15, 5], k=1)[0]
            unit_price = price_by_id[pid]
            if rng.random() < 0.20:
                discount_pct = Decimal(f"{rng.uniform(0.05, 0.15):.4f}")
                line_discount = (unit_price * Decimal(qty) * discount_pct
                                 ).quantize(Decimal("0.01"))
            else:
                line_discount = Decimal("0.00")
            subtotal = (unit_price * Decimal(qty) - line_discount
                        ).quantize(Decimal("0.01"))
            item_rows.append((item_id, tx_id, pid, qty,
                              unit_price, line_discount, subtotal))
            total_amount += subtotal
            total_discount += line_discount
            item_id += 1

        tx_rows.append((tx_id, ts, loc_id, pm_id,
                         total_amount, total_discount, cart_size))
        tx_id += 1

        if idx % 100_000 == 0:
            pbar.update(100_000 if idx > 0 else 0)
    pbar.update(TOTAL_TRANSACTIONS - pbar.n)
    pbar.close()

    print(f"[generate] generated {len(tx_rows):,} tx + {len(item_rows):,} items", file=sys.stderr)

    # Pass 1: COPY transactions.
    print("[generate] COPY transactions", file=sys.stderr)
    with conn.cursor() as cur:
        with cur.copy(
            "COPY transactions (id, transaction_time, location_id, "
            "payment_method_id, total_amount, total_discount, item_count) "
            "FROM STDIN WITH (FORMAT BINARY)"
        ) as cp:
            cp.set_types([
                "bigint", "timestamptz", "bigint", "bigint",
                "numeric", "numeric", "integer",
            ])
            for row in tx_rows:
                cp.write_row(row)
    conn.commit()

    # Pass 2: COPY transaction_items.
    print("[generate] COPY transaction_items", file=sys.stderr)
    with conn.cursor() as cur:
        with cur.copy(
            "COPY transaction_items (id, transaction_id, product_id, "
            "quantity, unit_price, line_discount, subtotal) "
            "FROM STDIN WITH (FORMAT BINARY)"
        ) as cp:
            cp.set_types([
                "bigint", "bigint", "bigint", "integer",
                "numeric", "numeric", "numeric",
            ])
            for row in item_rows:
                cp.write_row(row)
    conn.commit()

    # Bump sequences so future inserts don't collide with our explicit IDs.
    with conn.cursor() as cur:
        cur.execute("SELECT setval('transactions_id_seq', (SELECT MAX(id) FROM transactions))")
        cur.execute("SELECT setval('transaction_items_id_seq', (SELECT MAX(id) FROM transaction_items))")
    conn.commit()


def vacuum_analyze(conn: psycopg.Connection) -> None:
    """VACUUM ANALYZE both tables — required for planner stats and clean visibility."""
    print("[post-load] VACUUM ANALYZE", file=sys.stderr)
    old_autocommit = conn.autocommit
    conn.autocommit = True
    try:
        with conn.cursor() as cur:
            cur.execute("VACUUM ANALYZE transactions")
            cur.execute("VACUUM ANALYZE transaction_items")
    finally:
        conn.autocommit = old_autocommit


def validate(conn: psycopg.Connection) -> int:
    """Validate counts + per-bucket distribution.

    Returns 0 on success, 1 on failure. Spec section 4:
      - total = exactly 10_000_000 (hard).
      - per-bucket within ±0.5% of target share (soft, but enforced).
    """
    errs: list[str] = []

    with conn.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM transactions")
        tx_count = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM transaction_items")
        ti_count = cur.fetchone()[0]
        cur.execute("SELECT AVG(item_count)::float FROM transactions")
        avg_cart = cur.fetchone()[0]

    print(f"[validate] transactions = {tx_count:,}")
    print(f"[validate] transaction_items = {ti_count:,}")
    print(f"[validate] avg cart = {avg_cart:.4f}")

    if tx_count != TOTAL_TRANSACTIONS:
        errs.append(
            f"total != {TOTAL_TRANSACTIONS:,} (got {tx_count:,}) — HARD FAIL"
        )

    # Per-weekday distribution check.
    with conn.cursor() as cur:
        cur.execute("""
            SELECT EXTRACT(ISODOW FROM transaction_time AT TIME ZONE 'Asia/Jakarta')::int AS isodow,
                   COUNT(*)::bigint
            FROM transactions GROUP BY isodow ORDER BY isodow
        """)
        weekday_counts = {int(r[0]) - 1: int(r[1]) for r in cur.fetchall()}

    print("[validate] weekday distribution (actual vs expected ±0.5%):")
    for wd in range(7):
        observed_pct = (weekday_counts.get(wd, 0) / tx_count) * 100
        expected_pct = DAY_DISTRIBUTION[wd] * 100
        diff = observed_pct - expected_pct
        ok = abs(diff) <= 0.5
        marker = "OK" if ok else "FAIL"
        print(f"  weekday {wd}: {observed_pct:.3f}% vs {expected_pct:.3f}% "
              f"(Δ={diff:+.3f}%) {marker}")
        if not ok:
            errs.append(f"weekday {wd} drift {diff:+.3f}% exceeds ±0.5%")

    # Per-hour distribution check.
    with conn.cursor() as cur:
        cur.execute("""
            SELECT EXTRACT(HOUR FROM transaction_time AT TIME ZONE 'Asia/Jakarta')::int AS hr,
                   COUNT(*)::bigint
            FROM transactions GROUP BY hr ORDER BY hr
        """)
        hour_counts = {int(r[0]): int(r[1]) for r in cur.fetchall()}

    print("[validate] hour distribution (actual vs expected ±0.5%):")
    for hr in range(10, 20):
        expected = 0.0
        for wd in range(7):
            dist = HOUR_DISTRIBUTION_WEEKEND if wd in (5, 6) else HOUR_DISTRIBUTION_WEEKDAY
            expected += DAY_DISTRIBUTION[wd] * dist.get(hr, 0.0)
        if expected == 0.0:
            continue
        observed_pct = (hour_counts.get(hr, 0) / tx_count) * 100
        expected_pct = expected * 100
        diff = observed_pct - expected_pct
        ok = abs(diff) <= 0.5
        marker = "OK" if ok else "FAIL"
        print(f"  hour {hr:02d}: {observed_pct:.3f}% vs {expected_pct:.3f}% "
              f"(Δ={diff:+.3f}%) {marker}")
        if not ok:
            errs.append(f"hour {hr} drift {diff:+.3f}% exceeds ±0.5%")

    # Cart-size distribution check.
    with conn.cursor() as cur:
        cur.execute("""
            SELECT item_count, COUNT(*)::bigint
            FROM transactions GROUP BY item_count ORDER BY item_count
        """)
        cart_counts = {int(r[0]): int(r[1]) for r in cur.fetchall()}

    print("[validate] cart-size distribution (actual vs expected ±0.5%):")
    for cs in (1, 2, 3, 4, 5):
        observed_pct = (cart_counts.get(cs, 0) / tx_count) * 100
        expected_pct = CART_DISTRIBUTION[cs] * 100
        diff = observed_pct - expected_pct
        ok = abs(diff) <= 0.5
        marker = "OK" if ok else "FAIL"
        print(f"  cart {cs}: {observed_pct:.3f}% vs {expected_pct:.3f}% "
              f"(Δ={diff:+.3f}%) {marker}")
        if not ok:
            errs.append(f"cart {cs} drift {diff:+.3f}% exceeds ±0.5%")

    if errs:
        print("\n[validate] FAIL:")
        for e in errs:
            print(f"  - {e}")
        return 1
    print("\n[validate] OK — total exact, all distributions within ±0.5%")
    return 0


def main() -> int:
    args = parse_args()
    rng = random.Random(args.seed)

    with psycopg.connect(args.dsn, autocommit=False) as conn:
        # Check existing state and handle partial load (fixes M-33)
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM transactions")
            existing = cur.fetchone()[0]

        # Full state: validate only
        if existing == TOTAL_TRANSACTIONS and not args.reset:
            print(f"[generate] data already loaded ({existing:,} rows). Validating.")
            return validate(conn)

        # Partial state: detect and auto-reset (fixes M-33)
        if 0 < existing < TOTAL_TRANSACTIONS:
            if not args.reset:
                print(f"[generate] WARNING: partial load detected ({existing:,} / {TOTAL_TRANSACTIONS:,} rows)", file=sys.stderr)
                print(f"[generate] This indicates a prior run failed mid-load. Auto-resetting...", file=sys.stderr)
                print(f"[generate] (To skip this, use --reset explicitly)", file=sys.stderr)
            reset_schema(conn)  # Drops and recreates tables

        # Empty state: proceed with seed/load
        if args.reset:
            reset_schema(conn)

        if args.reset:
            reset_schema(conn)
        location_ids, product_rows, payment_method_ids = seed_masters(conn, rng)
        print(f"[masters] OK: {len(location_ids)} locations, "
              f"{len(product_rows)} products, {len(payment_method_ids)} payment methods")

        if args.target_month:
            year, month = map(int, args.target_month.split("-"))
        else:
            year, month = previous_calendar_month()
        print(f"[generate] target month = {year}-{month:02d}")

        weekday_dates = list_weekday_dates(year, month)
        allocation = compute_allocation(year, month)
        print(f"[generate] allocated {len(allocation)} non-empty (wd,hr,cart) "
              f"buckets, sum={sum(b.target for b in allocation):,}")

        generate_and_load(
            conn, rng, allocation, weekday_dates,
            location_ids, product_rows, payment_method_ids,
        )
        vacuum_analyze(conn)
        rc = validate(conn)
        return rc


if __name__ == "__main__":
    sys.exit(main())
