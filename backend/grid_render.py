"""Le dessin d'une grille de l'API ouverte en SVG, et la place d'une définition dans sa case (ADR 0032).

Port de `frontend/src/components/grid/grid-svg.tsx` (`GridSvg`, `wrapDefinition`) : mêmes mesures, même police
(Archivo Narrow gras, embarquée dans le SVG), même découpe des définitions. Une définition qui tient ici tient sur le
site et dans son PDF. Si le dessin du site change, ce port est à reprendre (`tests/test_grid_render.py` en garde
les cas connus).
"""

import base64
import math
import os
from functools import lru_cache
from xml.sax.saxutils import escape

CELL = 100
LINE = 2.2
BORDER = 5
STEM = 8
IN, TIP, HALF_TIP, CORNER = 13, 11, 6, 16
CHAR_WIDTH = {True: 0.53, False: 0.52}
WIDEST_CHAR = 0.68
NUMBER_SIZE = CELL * 0.24
MYSTERY_GAP, MYSTERY_TITLE = 36, 28
MYSTERY_BOX = {"max": 78, "min": 46}
MYSTERY_WORD_GAP, MYSTERY_LINE_GAP = 0.5, 0.3
PAPER = {"cell": "#ffffff", "definition": "#e9e7e2", "line": "#1b1b1b", "letter": "#111111"}
FONT_FILE = os.path.join(os.path.dirname(__file__), "fonts", "archivo-narrow-700.ttf")
FONT_FAMILY = "ArchivoNarrow"

# Les flèches de l'API, et celles du dessin du site
SITE_ARROWS = {"right": "droite", "down": "bas", "down_then_right": "coudee_bas_droite",
               "right_then_down": "coudee_droite_bas"}
# Par quel côté sort chaque flèche : dans une case qui porte deux définitions, « right » en haut, « bottom » en bas
EXITS = {"right": "right", "right_then_down": "right", "down": "bottom", "down_then_right": "bottom"}
# Le titre de la rangée du mot mystère, dans la langue de la grille
MYSTERY_TITLES = {"fr": "MOT MYSTÈRE", "de": "LÖSUNGSWORT", "en": "MYSTERY WORD"}
# La signature de toute grille dessinée par l'API (ADR 0032) : sous la grille, dans la langue de la grille ; `site` est
# l'adresse du site (« leflechoir.fr »), choisie par l'auteur le 28/10/2026
SIGNATURES = {"fr": "Grille créée avec l'API de {site}", "de": "Rätsel erstellt mit der API von {site}",
              "en": "Grid made with the {site} API"}
SIGNATURE_SIZE = 26
SIGNATURE_GAP = 22
# Largeur du PNG en pixels par défaut, et résolution du PDF (300 points par pouce : net à l'impression)
PNG_WIDTH = 1600
PDF_DPI = 300


def printed_case(text: str) -> str:
    return text.upper()


def wrap_definition(text: str, arrow: str | None, half: bool, bold: bool = True) -> dict:
    """Les lignes d'une définition dans sa case (`arrow` : une flèche de l'API), et si elle déborde."""
    site_arrow = SITE_ARROWS.get(arrow or "", "droite")
    reserved = {"left": 0, "right": 0, "bottom": 0}
    if site_arrow in ("bas", "coudee_bas_droite"):
        reserved["bottom"] = STEM + 1
    else:
        reserved["right"] = STEM + 1
    height = CELL / 2 if half else CELL
    usable = CELL - reserved["left"] - reserved["right"] - 8
    char_width = CHAR_WIDTH[bold]
    words = [word for word in printed_case(text).split(" ") if word]
    longest = max((len(word) for word in words), default=0)

    def wrap(width):
        lines, current = [], ""
        for word in words:
            if not current or len(current + " " + word) <= width:
                current = f"{current} {word}" if current else word
            else:
                lines.append(current)
                current = word
        if current:
            lines.append(current)
        return lines

    def layout(font_size):
        per_line = max(4, math.floor(usable / (char_width * font_size)))
        lines = wrap(per_line)
        width = per_line - 1
        while width >= longest:
            candidate = wrap(width)
            if len(candidate) > len(lines):
                break
            lines = candidate
            width -= 1
        return {"font_size": font_size, "lines": lines, "line_height": font_size * 1.08}

    tenable = usable / (WIDEST_CHAR * longest) if longest else float("inf")
    nominal = min(CELL * (0.14 if half else 0.16), tenable)
    floor = min(CELL * (0.084 if half else 0.092), nominal)

    def lines_for(line_height):
        return min(3 if half else 5, max(2, math.floor((height - reserved["bottom"] - 4) / line_height)))

    sizes, size = [], nominal
    while size >= floor - 1e-9:
        sizes.append(size)
        size -= 0.5
    layouts = [layout(size) for size in sizes]
    fitting = next((index for index, candidate in enumerate(layouts)
                    if len(candidate["lines"]) <= lines_for(candidate["line_height"])), -1)
    best = layouts[fitting]
    largest = best["font_size"]
    if fitting != -1:
        for candidate in layouts[fitting + 1:]:
            if candidate["font_size"] < largest * 0.8:
                break
            if len(candidate["lines"]) < len(best["lines"]):
                best = candidate
    max_lines = lines_for(best["line_height"])
    return {**best, "lines": best["lines"][:max_lines], "overflow": len(best["lines"]) > max_lines,
            "reserved": reserved, "usable": usable}


# Une phrase ordinaire, aux longueurs de mots variées : la place annoncée vaut pour un texte réel, pas pour le pire cas
CAPACITY_TEXT = ("elle fait la joie des petits enfants au jardin chaque dimanche matin avec son chien fidele "
                 "compagnon de promenade sous le soleil")


@lru_cache(maxsize=None)
def clue_capacity(arrow: str, half: bool) -> int:
    """Combien de caractères d'un texte ordinaire tiennent : ce que l'API annonce pour chaque mot (`clue_max_chars`).

    Mesuré sur une phrase ordinaire allongée mot à mot jusqu'au débordement (comme benchmarks/clue_fit.py). Une
    indication : le contrôle exact d'une définition est `wrap_definition`.
    """
    text = ""
    for word in CAPACITY_TEXT.split():
        longer = f"{text} {word}".strip()
        if wrap_definition(longer, arrow, half)["overflow"]:
            break
        text = longer
    return len(text)


def clue_cells(words: list[dict]) -> dict[tuple[int, int], list[dict]]:
    """Les mots par case de définition : une case qui en porte deux est coupée en deux moitiés."""
    cells: dict[tuple[int, int], list[dict]] = {}
    for word in words:
        cell = word.get("clue_cell")
        if cell:
            cells.setdefault((cell["x"], cell["y"]), []).append(word)
    return cells


def word_key(word: dict) -> str:
    return f"{word['x']}-{word['y']}-{word['direction']}"


def _arrow_shape(arrow: str, offset: float):
    edge = CELL
    if arrow == "right":
        return (f"M {edge - STEM} {offset} H {edge + IN}",
                f"{edge + IN + TIP},{offset} {edge + IN},{offset - HALF_TIP} {edge + IN},{offset + HALF_TIP}")
    if arrow == "down":
        return (f"M {offset} {edge - STEM} V {edge + IN}",
                f"{offset},{edge + IN + TIP} {offset - HALF_TIP},{edge + IN} {offset + HALF_TIP},{edge + IN}")
    if arrow == "down_then_right":
        return (f"M {CORNER} {edge - STEM} V {edge + CORNER} H {CORNER + 10}",
                f"{CORNER + 10 + TIP},{edge + CORNER} {CORNER + 10},{edge + CORNER - HALF_TIP} "
                f"{CORNER + 10},{edge + CORNER + HALF_TIP}")
    if arrow == "right_then_down":
        return (f"M {edge - STEM} {offset} H {edge + CORNER} V {offset + 10}",
                f"{edge + CORNER},{offset + 10 + TIP} {edge + CORNER - HALF_TIP},{offset + 10} "
                f"{edge + CORNER + HALF_TIP},{offset + 10}")
    return None


def mystery_layout(word: str, width: float) -> dict:
    """La rangée du mot mystère au-dessus de la grille (port de `mysteryLayout`)."""
    groups = [group for group in word.split(" ") if group]
    total = sum(len(group) for group in groups)
    units = total + MYSTERY_WORD_GAP * max(0, len(groups) - 1)
    size = max(MYSTERY_BOX["min"], min(MYSTERY_BOX["max"], width / max(1, units)))
    per_line = max(1, math.floor(width / size))
    lines: list[list[dict]] = [[]]
    used, number = 0.0, 0
    for group in groups:
        needed = (MYSTERY_WORD_GAP if used > 0 else 0) + len(group)
        if used > 0 and used + needed > per_line + 1e-9:
            lines.append([])
            used = 0
        for index, letter in enumerate(group):
            line = lines[-1]
            if used > 0 and used + 1 > per_line + 1e-9:
                line = []
                lines.append(line)
                used = 0
            if index == 0 and line:
                line[-1]["gap_after"] = True
                used += MYSTERY_WORD_GAP
            number += 1
            line.append({"letter": letter, "number": number, "gap_after": False})
            used += 1
    boxes = []
    for row, line in enumerate(lines):
        line_units = sum(1 + (MYSTERY_WORD_GAP if box["gap_after"] else 0) for box in line)
        x = (width - line_units * size) / 2
        for box in line:
            boxes.append({**box, "x": x, "y": row * size * (1 + MYSTERY_LINE_GAP)})
            x += size * (1 + (MYSTERY_WORD_GAP if box["gap_after"] else 0))
    rows = len([line for line in lines if line])
    return {"boxes": boxes, "size": size, "height": rows * size + max(0, rows - 1) * size * MYSTERY_LINE_GAP}


@lru_cache(maxsize=1)
def _font_face() -> str:
    try:
        with open(FONT_FILE, "rb") as handle:
            data = base64.b64encode(handle.read()).decode()
    except OSError:
        return ""
    return (f"@font-face{{font-family:{FONT_FAMILY};font-weight:700;"
            f"src:url(data:font/ttf;base64,{data}) format('truetype');}}")


def _n(value: float) -> str:
    return f"{value:.2f}".rstrip("0").rstrip(".")


def render_svg(grid: dict, clues: dict[str, str] | None, solution: bool, lang: str, signature: str = "",
               embed_font: bool = True) -> str:
    """La grille de l'API (`rows`, `words`, `mystery`) dessinée : à remplir (définitions) ou sa solution (lettres).

    Les définitions viennent de `clues` (par mot, « x-y-direction ») ou, à défaut, du champ `clue` de chaque mot.
    `signature` : l'adresse du site (« leflechoir.fr »), écrite sous la grille. `embed_font` : la police dans le SVG (un SVG qui voyage) ; pour
    le PNG et le PDF, elle est donnée au moteur de rendu, qui ne lit pas les polices embarquées.
    """
    width, height = grid["width"], grid["height"]
    rows = grid["rows"]
    mystery = grid.get("mystery")
    if clues is None:
        clues = {word_key(word): word["clue"] for word in grid["words"] if word.get("clue")}
    row = mystery_layout(mystery["word"], width * CELL) if mystery else None
    extra = MYSTERY_GAP + MYSTERY_TITLE * 1.4 + row["height"] if row else 0
    footer = SIGNATURE_GAP + SIGNATURE_SIZE if signature else 0
    total_height = height * CELL + extra + footer + BORDER
    family = f"{FONT_FAMILY}, 'Archivo Narrow', 'Arial Narrow', sans-serif"
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{_n(-BORDER / 2)} {_n(-BORDER / 2)} '
        f'{_n(width * CELL + BORDER)} {_n(total_height)}" role="img" '
        f'font-family="{escape(family)}" font-weight="700">',
        f"<style>{_font_face()}</style>" if embed_font else "",
        f'<rect x="{_n(-BORDER / 2)}" y="{_n(-BORDER / 2)}" width="{_n(width * CELL + BORDER)}" '
        f'height="{_n(total_height)}" fill="{PAPER["cell"]}"/>',
    ]

    if mystery and row:
        top = MYSTERY_TITLE * 1.4
        parts.append(f'<text x="{_n(width * CELL / 2)}" y="{MYSTERY_TITLE}" text-anchor="middle" '
                     f'font-size="{MYSTERY_TITLE}" fill="{PAPER["letter"]}">{MYSTERY_TITLES.get(lang, "")}</text>')
        for box in row["boxes"]:
            size = row["size"]
            parts.append(f'<rect x="{_n(box["x"])}" y="{_n(top + box["y"])}" width="{_n(size)}" height="{_n(size)}" '
                         f'fill="{PAPER["cell"]}" stroke="{PAPER["line"]}" stroke-width="{_n(LINE * 1.3)}"/>')
            parts.append(f'<text x="{_n(box["x"] + size - 5)}" y="{_n(top + box["y"] + size - 6)}" text-anchor="end" '
                         f'font-size="{_n(size * 0.26)}" fill="{PAPER["letter"]}">{box["number"]}</text>')
            if solution:
                parts.append(f'<text x="{_n(box["x"] + size / 2)}" y="{_n(top + box["y"] + size / 2)}" '
                             f'text-anchor="middle" dominant-baseline="central" font-size="{_n(size * 0.56)}" '
                             f'fill="{PAPER["letter"]}">{escape(box["letter"])}</text>')

    parts.append(f'<g transform="translate(0 {_n(extra)})">' if extra else "<g>")
    for y, line in enumerate(rows):
        for x, char in enumerate(line):
            fill = PAPER["definition"] if char == "#" else PAPER["cell"]
            parts.append(f'<rect x="{x * CELL}" y="{y * CELL}" width="{CELL}" height="{CELL}" fill="{fill}" '
                         f'stroke="{PAPER["line"]}" stroke-width="{LINE}"/>')
    if solution:
        for y, line in enumerate(rows):
            for x, char in enumerate(line):
                if char not in "#.":
                    parts.append(f'<text x="{x * CELL + CELL / 2}" y="{y * CELL + CELL / 2}" text-anchor="middle" '
                                 f'dominant-baseline="central" font-size="{_n(CELL * 0.56)}" '
                                 f'fill="{PAPER["letter"]}">{escape(char)}</text>')
    for number, cell in enumerate((mystery or {}).get("cells", []), start=1):
        parts.append(f'<text x="{cell["x"] * CELL + CELL - 7}" y="{cell["y"] * CELL + CELL - 8}" text-anchor="end" '
                     f'font-size="{_n(NUMBER_SIZE)}" fill="{PAPER["letter"]}">{number}</text>')

    if not solution:
        for (cx, cy), words in clue_cells(grid["words"]).items():
            split = len(words) > 1
            x0, y0 = cx * CELL, cy * CELL
            for word in words:
                exit_side = EXITS.get(word.get("arrow") or "", "right")
                offset = (CELL * 0.25 if exit_side == "right" else CELL * 0.75) if split else CELL / 2
                shape = _arrow_shape(word.get("arrow") or "", offset)
                if shape:
                    parts.append(f'<g transform="translate({x0} {y0})" fill="{PAPER["line"]}" stroke="{PAPER["line"]}">'
                                 f'<path d="{shape[0]}" fill="none" stroke-width="{_n(LINE * 1.3)}"/>'
                                 f'<polygon points="{shape[1]}" stroke="none"/></g>')
                text = (clues or {}).get(word_key(word), "")
                if text:
                    box_y = y0 + CELL / 2 if split and exit_side == "bottom" else y0
                    box_height = CELL / 2 if split else CELL
                    wrapped = wrap_definition(text, word.get("arrow"), split)
                    center_x = x0 + wrapped["reserved"]["left"] + wrapped["usable"] / 2 + 4
                    center_y = box_y + (box_height - wrapped["reserved"]["bottom"]) / 2
                    start_y = center_y - (len(wrapped["lines"]) - 1) * wrapped["line_height"] / 2
                    spans = "".join(
                        f'<tspan x="{_n(center_x)}" y="{_n(start_y + index * wrapped["line_height"])}">'
                        f'{escape(line)}</tspan>' for index, line in enumerate(wrapped["lines"]))
                    parts.append(f'<text text-anchor="middle" '
                                 f'font-size="{_n(wrapped["font_size"])}" fill="{PAPER["letter"]}">{spans}</text>')
            if split:
                parts.append(f'<line x1="{x0}" y1="{y0 + CELL / 2}" x2="{x0 + CELL}" y2="{y0 + CELL / 2}" '
                             f'stroke="{PAPER["line"]}" stroke-width="{_n(LINE * 0.7)}"/>')
    parts.append(f'<rect x="0" y="0" width="{width * CELL}" height="{height * CELL}" fill="none" '
                 f'stroke="{PAPER["line"]}" stroke-width="{BORDER}"/>')
    if signature:
        text = SIGNATURES.get(lang, SIGNATURES["en"]).format(site=signature)
        parts.append(f'<text x="{width * CELL}" y="{_n(height * CELL + SIGNATURE_GAP + SIGNATURE_SIZE * 0.8)}" '
                     f'text-anchor="end" font-size="{SIGNATURE_SIZE}" fill="{PAPER["letter"]}">{escape(text)}</text>')
    parts.append("</g></svg>")
    return "".join(parts)


def render_png(svg: str, width: int = PNG_WIDTH) -> bytes:
    """Le SVG en PNG, avec la police de la grille (resvg : aucune dépendance système)."""
    import resvg_py

    return bytes(resvg_py.svg_to_bytes(svg_string=svg, width=width, font_files=[FONT_FILE],
                                       skip_system_fonts=True))


def render_pdf(svg: str, width_cm: float = 18.0) -> bytes:
    """Le SVG en PDF d'une page, à 300 points par pouce : la grille fait `width_cm` de large, nette à l'impression."""
    import io

    from PIL import Image

    pixels = round(width_cm / 2.54 * PDF_DPI)
    image = Image.open(io.BytesIO(render_png(svg, pixels))).convert("RGB")
    out = io.BytesIO()
    image.save(out, format="PDF", resolution=PDF_DPI)
    return out.getvalue()
