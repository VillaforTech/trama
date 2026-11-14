"""Filter orders after applying the discount to each order."""

from config import INCLUDED_STATUS
from reader import Order


def net_cents(order: Order) -> int:
    gross_cents = order.units * order.unit_price_cents
    # Round half a cent upward using integer arithmetic.
    return (gross_cents * (100 - order.discount_percent) + 50) // 100


def include_order(order: Order, minimum_cents: int) -> bool:
    return order.status == INCLUDED_STATUS and net_cents(order) >= minimum_cents
