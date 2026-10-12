"""Compare two SVG files by what they draw, ignoring colours, ids and grouping."""
from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from collections import Counter
from pathlib import Path

NS = "{http://www.w3.org/2000/svg}"


def _num(text: str) -> str:
    return f"{float(text):g}"


def _transform(text: str) -> str:
    """Canonical transform: numbers rounded so .75 equals 0.75 and 420/512 equals 0.8203."""
    return re.sub(r"-?\d*\.?\d+", lambda m: f"{round(float(m.group()), 3):g}",
                  re.sub(r"[\s,]+", " ", text).strip())


def _style(el: ET.Element, prop: str) -> str:
    """A presentation value given as an attribute or inside style="..."."""
    if el.get(prop):
        return el.get(prop)
    match = re.search(rf"(?:^|;)\s*{prop}\s*:\s*([^;]+)", el.get("style", ""))
    return match.group(1).strip() if match else ""


def _path(d: str) -> str:
    """Normalise a path: tokens only, numbers canonical."""
    tokens = re.findall(r"[A-Za-z]|-?\d*\.?\d+(?:e-?\d+)?", d)
    return " ".join(_num(tok) if re.match(r"-?\d|\.", tok) else tok for tok in tokens)


def facts(path: Path) -> dict[str, Counter]:
    root = ET.parse(path).getroot()
    paths: Counter = Counter()
    circles: Counter = Counter()
    rects: Counter = Counter()
    texts: Counter = Counter()
    transforms: Counter = Counter()
    for el in root.iter():
        tag = el.tag.removeprefix(NS)
        if tag == "path" and el.get("d"):
            paths[_path(el.get("d"))] += 1
        elif tag == "circle":
            circles[tuple(_num(el.get(k, "0")) for k in ("cx", "cy", "r"))] += 1
        elif tag == "rect" and el.get("width") not in (None, "100%"):
            rects[tuple(_num(el.get(k, "0")) for k in ("x", "y", "width", "height"))] += 1
        elif tag == "text":
            content = "".join(el.itertext()).strip()
            texts[(content, _num(el.get("x", "0")), _num(el.get("y", "0")),
                   _style(el, "font-size").removesuffix("px"),
                   _style(el, "font-weight") or "400",
                   _style(el, "letter-spacing").removesuffix("px") or "0")] += 1
        if el.get("transform"):
            transforms[_transform(el.get("transform"))] += 1
        elif tag == "svg" and el.get("width") and el.get("viewBox") and el is not root:
            # A nested <svg> placing a symbol equals a translate + scale group.
            vb = [float(v) for v in re.split(r"[ ,]+", el.get("viewBox").strip())]
            scale = float(el.get("width")) / vb[2]
            transforms[_transform(f"translate({el.get('x', 0)} {el.get('y', 0)}) scale({scale})")] += 1
    return {"paths": paths, "circles": circles, "rects": rects, "texts": texts, "transforms": transforms}


def diff(a: Path, b: Path) -> dict[str, tuple[list, list]]:
    """For each kind, (only in a, only in b). Empty lists mean identical."""
    fa, fb = facts(a), facts(b)
    out = {}
    for kind in fa:
        out[kind] = (sorted((fa[kind] - fb[kind]).elements(), key=str),
                     sorted((fb[kind] - fa[kind]).elements(), key=str))
    return out
