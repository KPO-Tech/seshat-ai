"""Build the identity kit.

    python build.py            write logo/ and apercu/ (preview and mail signatures)
    python build.py --check    exit 1 if the tree on disk differs from the kit
    python build.py --png      also export PNGs to export/ (needs Microsoft Edge)
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from kit import outputs, preview, signatures

ROOT = Path(__file__).resolve().parent


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--check", action="store_true", help="verify without writing")
    parser.add_argument("--png", action="store_true", help="export PNGs (needs Microsoft Edge)")
    args = parser.parse_args(argv)

    if args.check:
        problems = outputs.check(ROOT) + preview.check(ROOT) + signatures.check()
        for problem in problems:
            print(problem)
        print("up to date" if not problems else f"{len(problems)} difference(s): run python build.py")
        return 1 if problems else 0

    changed = outputs.write(ROOT) + preview.write(ROOT) + signatures.write()
    print(f"{len(changed)} file(s) changed" if changed else "nothing to change")
    if args.png:
        from kit import export
        for rel in export.run(ROOT):
            print(f"  exported {rel}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
