# fonts/

The two typefaces the kit draws text with, kept here so a rendering does not
depend on what the machine happens to have installed. They are the ones the
website loads (`@fontsource-variable/inter`, `@fontsource-variable/space-grotesk`,
version 5.3.0), so the social images and the site share one typography.

| File | Family | Used for |
| --- | --- | --- |
| `space-grotesk-latin-wght-normal.woff2` | Space Grotesk, variable weight | `tokens.FONT_DISPLAY`: headings, the lockups' name |
| `inter-latin-wght-normal.woff2` | Inter, variable weight | `tokens.FONT_TEXT`: taglines and body text |

Both files are the `latin` subset, which is enough for the French and English
copy the kit writes. A language with more accents needs the `latin-ext` file from
the same package.

The logos themselves stay SVG text (`font-family="Sora, Inter, Arial, sans-serif"`),
so only the pages that embed these fonts — `templates/og.html` today — draw with
them; a browser opening a `.svg` directly still falls back on Arial.

Both fonts are licensed under the SIL Open Font License 1.1, kept in
[`OFL.txt`](./OFL.txt):

- Space Grotesk, Copyright 2020 The Space Grotesk Project Authors (https://github.com/floriankarsten/space-grotesk)
- Inter, Copyright 2016 The Inter Project Authors (https://github.com/rsms/inter)
