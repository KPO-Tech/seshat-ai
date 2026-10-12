"""A tiny SVG writer: enough to emit clean, diff-friendly files, nothing more."""
from __future__ import annotations

from collections.abc import Iterable, Sequence


def num(value: float) -> str:
    """Format a number without a trailing .0."""
    text = f"{value:.3f}".rstrip("0").rstrip(".")
    return "0" if text in ("-0", "") else text


def _name(key: str) -> str:
    return key.rstrip("_").replace("_", "-")


def attrs(**values: object) -> str:
    """Render attributes; None is skipped, snake_case becomes kebab-case."""
    parts = []
    for key, value in values.items():
        if value is None:
            continue
        if isinstance(value, float):
            value = num(value)
        parts.append(f'{_name(key)}="{value}"')
    return (" " + " ".join(parts)) if parts else ""


def path(d: str, **kw: object) -> str:
    return f"<path{attrs(d=d, **kw)}/>"


def circle(cx: float, cy: float, r: float, **kw: object) -> str:
    return f"<circle{attrs(cx=cx, cy=cy, r=r, **kw)}/>"


def rect(x: float, y: float, width: float, height: float, **kw: object) -> str:
    return f"<rect{attrs(x=x, y=y, width=width, height=height, **kw)}/>"


def group(children: Iterable[str], **kw: object) -> str:
    body = "\n".join(children)
    return f"<g{attrs(**kw)}>\n{body}\n</g>"


def gradient(ident: str, stops: Sequence[tuple[float, str]], *, x1: float = 0, y1: float = 0,
             x2: float = 1, y2: float = 1, opacities: Sequence[float] | None = None) -> str:
    items = []
    for index, (offset, color) in enumerate(stops):
        opacity = None if opacities is None else opacities[index]
        items.append(f"<stop{attrs(offset=offset, stop_color=color, stop_opacity=opacity)}/>")
    head = attrs(id=ident, x1=x1, y1=y1, x2=x2, y2=y2)
    return f"<linearGradient{head}>\n  " + "\n  ".join(items) + "\n</linearGradient>"


def text(segments: Sequence[tuple[str, str]], x: float, y: float, *, size: float, weight: object,
         family: str, spacing: float = 0, anchor: str | None = None) -> str:
    """One text element. segments is [(content, fill), ...]; one segment renders without tspan."""
    common = attrs(x=x, y=y, font_family=family, font_size=size, font_weight=weight,
                   letter_spacing=spacing or None, text_anchor=anchor)
    if len(segments) == 1:
        content, fill = segments[0]
        return f"<text{common}{attrs(fill=fill)}>{content}</text>"
    spans = "".join(f"<tspan{attrs(fill=fill)}>{content}</tspan>" for content, fill in segments)
    return f"<text{common}>{spans}</text>"


def document(viewbox: tuple[float, float, float, float], body: Iterable[str], *,
             defs: Iterable[str] = (), label: str | None = None) -> str:
    x, y, w, h = viewbox
    head = attrs(xmlns="http://www.w3.org/2000/svg", viewBox=f"{num(x)} {num(y)} {num(w)} {num(h)}",
                 role="img" if label else None, aria_label=label)
    lines = [f"<svg{head}>"]
    defs = list(defs)
    if defs:
        lines.append("<defs>\n" + "\n".join(defs) + "\n</defs>")
    lines.extend(body)
    lines.append("</svg>")
    return "\n".join(lines) + "\n"
