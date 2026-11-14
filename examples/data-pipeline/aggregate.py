"""Aggregate accepted orders while preserving their source identifiers."""

from reader import Order
from rules import net_cents


def aggregate_regions(orders: list[Order]) -> list[dict]:
    regions = {}
    for order in orders:
        region = regions.setdefault(
            order.region, {"region": order.region, "orders": 0, "net_cents": 0, "order_ids": []}
        )
        region["orders"] += 1
        region["net_cents"] += net_cents(order)
        region["order_ids"].append(order.order_id)
    return [regions[name] for name in sorted(regions)]
