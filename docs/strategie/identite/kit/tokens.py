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
INK = "#172127"               # text and structural strokes on light surfaces
INK_STOPS = ((0.0, "#111D23"), (1.0, "#303137"))   # structural gradient (outlines, arcs)
CHARCOAL = "#2F2E34"          # secondary text on light surfaces, runtime slab top
GREY = "#58636A"              # tertiary text on light (KPO "Tech", taglines)
PAPER = "#F6F1EA"             # warm light surface
CREAM = "#E7E2DA"             # text on dark surfaces
TILE_DARK = "#151E22"         # dark icon tile
WHITE = "#FFFFFF"
BLACK = "#111111"

# structural gradient and text greys used when the surface is dark
INK_STOPS_ON_DARK = ((0.0, "#F4EFE8"), (1.0, "#CFC7BC"))
GREY_ON_DARK = "#ADB7BE"
CREAM_SOFT = "#C9C3BA"

# --- Type ---------------------------------------------------------------------
# The logos reference these families by name; the fonts are not embedded.
FONT_DISPLAY = "Sora, Inter, Arial, sans-serif"        # Seshat products
FONT_TEXT = "Inter, Arial, Helvetica, sans-serif"      # KPO-Tech, taglines
