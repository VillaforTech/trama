"""Read and validate source rows before producing a report."""

import csv
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Order:
    order_id: str
    region: str
    units: int
    unit_price_cents: int
    discount_percent: int
    status: str


def read_orders(path: Path) -> list[Order]:
    orders = []
    seen = set()
    with path.open(newline="", encoding="utf-8") as source:
        reader = csv.DictReader(source)
        for line_number, row in enumerate(reader, start=2):
            try:
                order = Order(
                    order_id=row["order_id"].strip(),
                    region=row["region"].strip().lower(),
                    units=int(row["units"]),
                    unit_price_cents=int(row["unit_price_cents"]),
                    discount_percent=int(row["discount_percent"]),
                    status=row["status"].strip().lower(),
                )
                if not order.order_id or not order.region:
                    raise ValueError("empty order or region")
                if order.order_id in seen:
                    raise ValueError("duplicate order_id")
                if order.units < 1 or order.unit_price_cents < 0:
                    raise ValueError("invalid quantity or price")
                if not 0 <= order.discount_percent <= 100:
                    raise ValueError("invalid discount")
            except (KeyError, TypeError, ValueError, AttributeError) as error:
                raise ValueError(f"Invalid input at CSV line {line_number}: {error}") from error
            seen.add(order.order_id)
            orders.append(order)
    return orders
