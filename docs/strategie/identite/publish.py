"""Copy the generated logos into the repositories that ship them (see kit/publish.py).

    python publish.py            show what would change
    python publish.py --apply    write it
"""
from __future__ import annotations

import argparse
import sys

from kit import publish


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--apply", action="store_true", help="write the files (default: report only)")
    args = parser.parse_args(argv)
    report = publish.apply(publish.plan(), write=args.apply)
    for line in report:
        print(line)
    print(f"{len(report)} change(s)" + ("" if args.apply else " (dry run: use --apply)"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
