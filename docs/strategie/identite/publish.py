"""Copy the generated logos and the site palette into the repositories that ship them.

    python publish.py                        show what would change
    python publish.py --apply                write it
    python publish.py --check                fail if a text file differs from the kit
    python publish.py --apply --repo seshat-ai   only one repository

Exits 1 when an operation had to be skipped because its repository is not
checked out, so a run in an incomplete workspace cannot pass for a full one.
--check ignores the PNG, the ICO and the social images: comparing them means
rendering them with Edge, which --apply does.
"""
from __future__ import annotations

import argparse
import sys

from kit import publish


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--apply", action="store_true", help="write the files (default: report only)")
    parser.add_argument("--check", action="store_true",
                        help="exit 1 when a text file (logo SVG, palette) differs from the kit")
    parser.add_argument("--repo", action="append", metavar="NAME",
                        help="restrict to one repository; repeatable")
    args = parser.parse_args(argv)

    ops = publish.plan()
    if args.repo:
        known = sorted({publish.repo_of(op) for op in ops})
        unknown = [name for name in args.repo if name not in known]
        if unknown:
            parser.error(f"unknown repository: {', '.join(unknown)} (expected one of {', '.join(known)})")
        ops = [op for op in ops if publish.repo_of(op) in set(args.repo)]

    if args.check:
        lines = publish.drift(ops)
        for line in lines:
            print(line)
        if lines:
            print(f"{len(lines)} file(s) differ from the kit: run python publish.py --apply")
            return 1
        print(f"{len(ops)} operation(s) in step with the kit")
        return 0

    report = publish.apply(ops, write=args.apply)
    skipped = [line for line in report if line.startswith("skip ")]
    for line in report:
        print(line)
    print(f"{len(report) - len(skipped)} change(s)" + ("" if args.apply else " (dry run: use --apply)"))
    if skipped:
        print(f"{len(skipped)} operation(s) skipped: the repository is not checked out next to seshat-ai.")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
