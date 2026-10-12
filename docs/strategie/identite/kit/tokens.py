"""Design tokens: one orange, a few neutrals, two type stacks.

Every colour a logo uses comes from this file. Changing the brand colour is a
one-line edit here followed by `python build.py`.
"""

# --- The orange: the only brand colour ---------------------------------------
ORANGE = "#EA7828"            # the brand orange: text accents, links, tiles
ORANGE_LIGHT = "#FF9B50"      # gradient highlight
ORANGE_DEEP = "#C45A1F"       # gradient shadow; also the orange used on paper (contrast)
ORANGE_TEXT = "#B8500F"       # orange for small text on white (5.0:1, AA)
ORANGE_STOPS = ((0.0, ORANGE_LIGHT), (0.48, ORANGE), (1.0, ORANGE_DEEP))

# The Knowledge book was drawn with a more saturated ramp. It is kept as drawn;
# to make it the same orange as everything else, point it at ORANGE_STOPS.
ORANGE_VIVID_STOPS = ((0.0, "#FF922F"), (0.56, "#FA7416"), (1.0, "#E95B0A"))

# Small details inside the flower
FLOWER_HIGHLIGHT = "#F9A269"  # light veins in the two mid leaves
ROOT = "#813915"              # root node
ROOT_SHINE = "#E59A66"        # highlight on the root node

# --- Neutrals -----------------------------------------------------------------
INK = "#2A2420"               # text and structural strokes on light surfaces (warm, not black)
INK_STOPS = ((0.0, "#231D19"), (1.0, "#3B332D"))   # structural gradient (outlines, arcs)
CHARCOAL = "#3A322C"          # secondary text on light surfaces, runtime slab top
GREY = "#6B6058"              # tertiary text on light (KPO "Tech", taglines)
PAPER = "#F6F1EA"             # warm light surface
CREAM = "#E7E2DA"             # text on dark surfaces
TILE_DARK = "#2B2521"         # dark icon tile and dark surface: warm, lifted off black so it still reads on black
OFF_WHITE = "#F1DEC8"         # the "white" of the brand: warm, leaning orange, never pure white
BLACK = "#111111"             # mono-black only: printing needs a true black

# structural gradient and text greys used when the surface is dark
INK_STOPS_ON_DARK = ((0.0, "#F6E8D8"), (1.0, "#E3CDB4"))
GREY_ON_DARK = "#B8A898"
CREAM_SOFT = "#D9C6B0"

# --- Type ---------------------------------------------------------------------
# The logos reference these families by name; the fonts are not embedded.
FONT_DISPLAY = "Sora, Inter, Arial, sans-serif"        # Seshat products
FONT_TEXT = "Inter, Arial, Helvetica, sans-serif"      # KPO-Tech, taglines
