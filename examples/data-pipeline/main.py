"""CLI for the fictional sales report."""

import argparse
import json
from pathlib import Path

from config import MIN_NET_CENTS
from pipeline import run_pipeline


def main() -> None:
    parser = argparse.ArgumentParser(description="Summarize fictional orders by region")
    parser.add_argument("source", type=Path, nargs="?", default=Path(__file__).parent / "data" / "orders.csv")
    parser.add_argument("--min-net", type=int, default=MIN_NET_CENTS, help="Minimum amount after discount, in cents")
    arguments = parser.parse_args()
    report = run_pipeline(arguments.source, arguments.min_net)
    print(json.dumps(report, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
