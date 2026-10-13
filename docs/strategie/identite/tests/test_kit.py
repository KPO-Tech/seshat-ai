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

from kit import og, outputs, palette, preview, publish, signatures, variants  # noqa: E402
from kit import tokens as t  # noqa: E402
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


class Palette(unittest.TestCase):
    """The site's colours are the kit's colours: the stylesheet is generated, and the
    site holds none of the values it used before."""

    SITE = ROOT.parents[2] / "website"
    STYLESHEET = SITE / "src" / "styles" / "tokens.css"
    DARK = ":root[data-theme='dark']"

    def test_every_colour_is_a_token_or_a_mix_of_tokens(self):
        css = palette.css()
        for token in (t.ORANGE, t.ORANGE_LIGHT, t.ORANGE_DEEP, t.ORANGE_TEXT, t.INK, t.CHARCOAL,
                      t.GREY, t.PAPER, t.CREAM, t.TILE_DARK, t.OFF_WHITE, t.BLACK, t.GREY_ON_DARK,
                      t.INK_STOPS[1][1], t.INK_STOPS_ON_DARK[0][1]):
            with self.subTest(token):
                self.assertIn(token, css)
        for retired in palette.RETIRED:
            with self.subTest(retired):
                self.assertNotIn(retired, css.lower())

    def test_the_dark_theme_redraws_the_whole_page(self):
        light, dark = palette.css().split(self.DARK)
        self.assertIn("--accent: var(--orange);", light)
        for var in ("--bg", "--band", "--surface", "--line", "--text", "--text2", "--accent",
                    "--accent-text", "--panel", "--code-bg", "--shadow"):
            with self.subTest(var):
                self.assertIn(f"  {var}:", dark)
        self.assertIn("--accent: var(--orange-light);", dark)

    def test_the_palette_is_published_into_the_site(self):
        planned = {op.target: op for op in publish.plan()}
        self.assertIn(self.STYLESHEET, planned)
        op = planned[self.STYLESHEET]
        self.assertEqual(op.what, "text")
        self.assertEqual(publish.text_of(op), palette.css())

    def test_the_site_stylesheet_is_up_to_date(self):
        if not self.STYLESHEET.exists():
            self.skipTest("le site n'est pas dans ce dossier de travail")
        self.assertEqual(self.STYLESHEET.read_text(encoding="utf-8"), palette.css(),
                         "python publish.py --apply --repo seshat-ai")

    def test_the_site_holds_no_retired_colour(self):
        styles = self.STYLESHEET.parent
        if not styles.is_dir():
            self.skipTest("le site n'est pas dans ce dossier de travail")
        for path in sorted(styles.glob("*.css")):
            if path == self.STYLESHEET:        # generated: checked just above
                continue
            text = path.read_text(encoding="utf-8").lower()
            for retired in palette.RETIRED:
                with self.subTest(f"{path.name} {retired}"):
                    self.assertNotIn(retired, text)

    def test_the_theme_colour_is_paper(self):
        """A meta tag cannot hold a var()."""
        base = self.SITE / "src" / "layouts" / "Base.astro"
        if not base.exists():
            self.skipTest("le site n'est pas dans ce dossier de travail")
        wanted = f'content="{t.PAPER.lower()}"'
        self.assertIn(wanted, base.read_text(encoding="utf-8").lower())


class Publish(unittest.TestCase):
    def test_every_source_exists(self):
        generated = set(outputs.generate())
        for op in publish.plan():
            if op.source:
                with self.subTest(op.target.name):
                    self.assertIn(f"logo/{op.source}", generated)

    def test_every_social_image_is_planned(self):
        planned = {op.page for op in publish.plan() if op.what == "og"}
        self.assertEqual(planned, set(og.files()))


class Social(unittest.TestCase):
    """The social images are built from the kit. Only Edge proves the pixels, so
    these check everything the rendering depends on."""

    def test_every_page_is_complete(self):
        self.assertEqual(og.files(), ["og-fr.png", "og-en.png", "og-docs.png"])
        for name in og.files():
            page = og.entry(name)
            with self.subTest(name):
                for field in ("lang", "doc_title", "before", "accent", "subtitle"):
                    self.assertTrue(page[field].strip(), field)

    def test_page_carries_the_kit_colours_and_the_official_lockup(self):
        for name in og.files():
            page = og.html(name)
            with self.subTest(name):
                self.assertIn(t.ORANGE, page)
                self.assertIn(t.PAPER, page)
                self.assertIn('<svg xmlns="http://www.w3.org/2000/svg"', page)
                self.assertIn(og.DOMAIN, page)

    def test_fonts_are_vendored(self):
        for font in (og.DISPLAY_FONT, og.TEXT_FONT):
            with self.subTest(font):
                self.assertTrue((ROOT / og.FONT_DIR / font).exists())
                self.assertTrue((ROOT / og.FONT_DIR / "OFL.txt").exists())


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
                expected = "#111111" if "black" in path.name else "#F1DEC8"
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
