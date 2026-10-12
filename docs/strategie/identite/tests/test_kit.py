"""Tests for the identity kit. Run from identite/:  python -m unittest discover -s tests"""
from __future__ import annotations

import colorsys
import re
import sys
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from kit import outputs, preview, signatures, variants  # noqa: E402
from kit.marks import MARKS  # noqa: E402
from parity import diff  # noqa: E402

REF = ROOT / "reference" / "svg"
LOGO = ROOT / "logo"

# What the hand-written originals draw, and the generated file that must draw the same.
PARITY = (
    ("runtime/seshatruntime-modular-symbol.svg", "seshat-runtime/mark-on-light.svg"),
    ("runtime/seshatruntime-modular-horizontal.svg", "seshat-runtime/lockup-on-light.svg"),
    ("cloud/seshatcloud-shared-flower-symbol.svg", "seshat-cloud/mark-on-light.svg"),
    ("cloud/seshatcloud-shared-flower-horizontal.svg", "seshat-cloud/lockup-on-light.svg"),
    ("seshatos/seshatos-symbol.svg", "seshatos/mark-on-light.svg"),
    ("seshatos/seshatos-lockup.svg", "seshatos/lockup-on-light.svg"),
    ("knowledge/seshatos-knowledge-symbol-v4.svg", "seshatos-knowledge/mark-on-light.svg"),
    ("kpo-tech/kpotech-symbol.svg", "kpo-tech/mark-on-light.svg"),
    ("kpo-tech/kpotech-horizontal-nohyphen.svg", "kpo-tech/lockup-on-light.svg"),
    ("kpo-tech/kpotech-horizontal-nohyphen-dark.svg", "kpo-tech/lockup-on-dark.svg"),
    ("kpo-tech/kpotech-vertical-nohyphen.svg", "kpo-tech/lockup-vertical-on-light.svg"),
)

HEX = re.compile(r"#[0-9A-Fa-f]{6}\b")


class Parity(unittest.TestCase):
    """The generator draws exactly what was drawn by hand."""

    def test_matches_hand_written_originals(self):
        for original, generated in PARITY:
            with self.subTest(generated):
                differences = diff(REF / original, LOGO / generated)
                for kind, (only_original, only_generated) in differences.items():
                    self.assertEqual((only_original, only_generated), ([], []), kind)


class Build(unittest.TestCase):
    def test_tree_is_up_to_date(self):
        self.assertEqual(outputs.check(ROOT) + preview.check(ROOT) + signatures.check(), [], "run python build.py")

    def test_every_product_has_the_same_core_files(self):
        core = {"mark-on-light.svg", "mark-on-dark.svg", "mono-black.svg", "mono-white.svg",
                "icon-light.svg", "icon-dark.svg", "icon-orange.svg", "favicon.svg",
                "lockup-on-light.svg", "lockup-on-dark.svg"}
        for key, mark in MARKS.items():
            with self.subTest(key):
                self.assertTrue(core <= set(variants.files(mark)))

    def test_preview_links_resolve(self):
        page = (ROOT / "apercu" / "index.html").read_text(encoding="utf-8")
        for target in re.findall(r'(?:src|href)="([^"#]+)"', page):
            if "://" in target:
                continue
            with self.subTest(target):
                self.assertTrue((ROOT / "apercu" / target).resolve().exists())


class Files(unittest.TestCase):
    def svgs(self):
        return sorted(LOGO.rglob("*.svg"))

    def test_valid_xml_with_unique_ids(self):
        for path in self.svgs():
            with self.subTest(path.name):
                root = ET.parse(path).getroot()
                ids = [el.get("id") for el in root.iter() if el.get("id")]
                self.assertEqual(len(ids), len(set(ids)))

    def test_only_orange_is_a_brand_colour(self):
        """No amber or yellow anywhere (hues 33 to 70 degrees)."""
        for path in self.svgs():
            for colour in set(HEX.findall(path.read_text(encoding="utf-8"))):
                r, g, b = (int(colour[i:i + 2], 16) / 255 for i in (1, 3, 5))
                hue, saturation, _ = colorsys.rgb_to_hsv(r, g, b)
                with self.subTest(f"{path.parent.name}/{path.name} {colour}"):
                    if saturation > 0.3:
                        self.assertFalse(33 <= hue * 360 <= 70, "amber or yellow")

    def test_mono_files_use_one_colour_and_no_gradient(self):
        for path in self.svgs():
            if not path.name.startswith("mono-"):
                continue
            text = path.read_text(encoding="utf-8")
            with self.subTest(f"{path.parent.name}/{path.name}"):
                self.assertNotIn("linearGradient", text)
                expected = "#111111" if "black" in path.name else "#FFFFFF"
                colours = {c.upper() for c in HEX.findall(text)}
                # The runtime mask that cuts the seams uses pure black and white.
                self.assertLessEqual(colours, {expected, "#000000", "#FFFFFF"})
                self.assertIn(expected, colours)

    def test_icons_are_square_tiles(self):
        for path in self.svgs():
            if path.name.startswith(("icon-", "favicon")):
                with self.subTest(f"{path.parent.name}/{path.name}"):
                    self.assertIn('viewBox="0 0 512 512"', path.read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
