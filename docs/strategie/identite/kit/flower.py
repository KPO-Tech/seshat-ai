"""The flower: the shape every Seshat product mark shares.

Seven rising leaves around a spear (the old rosette of Seshat's emblem), with a
root node at the foot. It is drawn in a 512 x 512 box; marks place it on a base
that says what the product is (a slab, a cloud, an arc, a book, a circuit).

The coordinates are the ones drawn by hand for the first logos; the tests keep
the generator and those originals identical.
"""
from __future__ import annotations

from . import svg
from . import tokens as t
from .drawing import Drawing

# Order matters: it is the paint order of the originals.
LEAVES = (
    "M 256 402 C 250 338 248 266 251 158 L 261 158 C 264 267 262 339 256 402 Z",   # spear
    "M 256 117 C 276 133 277 151 256 170 C 235 151 236 133 256 117 Z",             # spear tip
    "M 244 400 C 222 327 199 262 174 211 C 196 220 212 235 225 263 C 237 290 243 343 244 400 Z",  # inner left
    "M 268 400 C 290 327 313 262 338 211 C 316 220 300 235 287 263 C 275 290 269 343 268 400 Z",  # inner right
    "M 233 399 C 205 348 172 302 123 272 C 145 268 163 273 183 287 C 207 304 225 351 233 399 Z",  # mid left
    "M 279 399 C 307 348 340 302 389 272 C 367 268 349 273 329 287 C 305 304 287 351 279 399 Z",  # mid right
    "M 178 212 C 162 205 155 190 155 175 C 176 178 189 190 187 207 Z",             # tip, inner left
    "M 334 212 C 350 205 357 190 357 175 C 336 178 323 190 325 207 Z",             # tip, inner right
    "M 126 273 C 109 271 99 260 92 247 C 113 245 127 253 137 267 Z",               # tip, mid left
    "M 386 273 C 403 271 413 260 420 247 C 399 245 385 253 375 267 Z",             # tip, mid right
)
VEINS = (
    "M 226 350 C 211 305 195 278 184 267",
    "M 286 350 C 301 305 317 278 328 267",
)
ROOT_NODE = (256, 416, 18)
ROOT_SHINE = (250, 410, 5)
BOLD_SPEAR = "M 242 404 L 242 170 Q 242 158 256 158 Q 270 158 270 170 L 270 404 Z"


def elements(d: Drawing, *, bold: bool = False) -> list[str]:
    """The flower as SVG elements, coloured for the drawing's surface.

    bold is for favicons: the thin spear is thickened and the details that vanish
    at 16 px are dropped.
    """
    s = d.surface
    fill = d.paint("orange")
    out = [svg.path(leaf, fill=fill) for leaf in LEAVES]
    if bold:
        # A filled bar, not a stroked line: a gradient on a zero-width box paints nothing.
        out.append(svg.path(BOLD_SPEAR, fill=fill))
    elif not s.is_mono:
        out.extend(svg.path(v, fill="none", stroke=t.FLOWER_HIGHLIGHT, stroke_width=4, opacity=0.6,
                            stroke_linecap="round") for v in VEINS)
    cx, cy, r = ROOT_NODE
    out.append(svg.circle(cx, cy, r, fill=s.mono or t.ROOT))
    if not s.is_mono and not bold:
        sx, sy, sr = ROOT_SHINE
        out.append(svg.circle(sx, sy, sr, fill=t.ROOT_SHINE, opacity=0.7))
    return out
