"""The report is produced only after the complete input passes validation."""

from pathlib import Path

from aggregate import aggregate_regions
from config import MIN_NET_CENTS
from reader import read_orders
from rules import include_order


def run_pipeline(source: Path, minimum_cents: int = MIN_NET_CENTS) -> dict:
    if minimum_cents < 0:
        raise ValueError("minimum_cents must be nonnegative")
    orders = read_orders(source)
    included = [order for order in orders if include_order(order, minimum_cents)]
    regions = aggregate_regions(included)
    return {
        "minimum_net_cents": minimum_cents,
        "input_orders": len(orders),
        "included_orders": len(included),
        "excluded_orders": len(orders) - len(included),
        "total_net_cents": sum(region["net_cents"] for region in regions),
        "regions": regions,
    }
