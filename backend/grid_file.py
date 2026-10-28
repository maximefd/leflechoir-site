"""Le fichier d'une grille de l'API ouverte : son format, sa lecture, ses liens et la vérification de ses définitions (ADR 0032).

On ne stocke pas les grilles : une grille est un fichier JSON qui appartient à qui l'a reçu, et qu'il nous renvoie pour
la dessiner, vérifier ses définitions ou l'ouvrir sur le site. Le format est public et versionné :

    {"format": "flechoir.grid", "version": 1, "type": "arrowword", "lang": "fr", "level": "medium",
     "width": 10, "height": 10, "seed": 42,
     "rows": ["#G#M#A#D#J", "OREE#NIEME", …],               # « # » : une case de définition
     "words": [{"answer": "GRILLE", "x": 1, "y": 0, "direction": "down", "length": 6, "source": "preferred",
                "clue_cell": {"x": 0, "y": 0}, "arrow": "right_then_down",
                "clue_shares_cell": true, "clue_max_chars": 43, "clue": "Elle a ses cases"}, …],
     "mystery": {"word": "CLAUDE", "cells": [{"x": 5, "y": 6}, …]}}

À la lecture, on ne croit que les lignes, la place et le sens des mots, et les définitions : la case de définition, la
flèche et la place disponible se recalculent (un fichier retouché à la main ne peut pas tromper le dessin). On lit
toute grille valide, même venue d'un autre moteur (décision de l'auteur du 27/10/2026), et on la signe au dessin.
"""

import base64
import json
import re
import zlib
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator

from engine.arrows import clue_for_slot
from grid_render import clue_capacity, clue_cells, word_key, wrap_definition
from normalization import normalize_word

FORMAT = "flechoir.grid"
VERSION = 1
# Bornes de lecture : celles du site (5 à 20) ; la génération de l'API s'arrête à 15
MIN_SIDE, MAX_SIDE = 5, 20
MAX_CLUE_LENGTH = 120
PLAIN_TEXT = r"^[^\x00-\x1f\x7f<>]+$"
LEVELS = ("easy", "medium", "hard")
# Flèches de l'API, et celles du moteur (engine/arrows.py)
ARROWS = {"droite": "right", "bas": "down", "coudee_bas_droite": "down_then_right",
          "coudee_droite_bas": "right_then_down"}
# Au-delà, une définition est plus une phrase de dictionnaire qu'une définition de mots fléchés (essais du 27/10/2026 :
# 5,2 mots en moyenne pour ChatGPT, 2,3 pour l'auteur)
STYLE_MAX_WORDS = 4
# Les relatives, signe d'une définition de dictionnaire ; une alerte, jamais un refus
RELATIVES = {
    "fr": re.compile(r"\b(qui|que l'on|que l’on|qu'on|qu’on|dont|lequel|laquelle|lesquels|lesquelles)\b", re.I),
    "de": re.compile(r",\s*(der|die|das|welche[rsnm]?)\b", re.I),
    "en": re.compile(r"\b(which|who|whom|that)\b", re.I),
}


class FileModel(BaseModel):
    # Un fichier peut porter des champs d'une version plus récente : on les ignore, on ne refuse pas
    model_config = ConfigDict(extra="ignore")


class CellIn(FileModel):
    x: Annotated[int, Field(ge=0, lt=MAX_SIDE)]
    y: Annotated[int, Field(ge=0, lt=MAX_SIDE)]


class WordIn(FileModel):
    answer: Annotated[str, StringConstraints(pattern=r"^[A-Z]{2,20}$")]
    x: Annotated[int, Field(ge=0, lt=MAX_SIDE)]
    y: Annotated[int, Field(ge=0, lt=MAX_SIDE)]
    direction: Literal["across", "down"]
    source: Literal["required", "preferred", "lexicon"] | None = None
    clue: Annotated[str, StringConstraints(strip_whitespace=True, max_length=400)] | None = None


class MysteryIn(FileModel):
    word: Annotated[str, StringConstraints(pattern=r"^[A-Z]+( [A-Z]+)*$", max_length=40)]
    cells: Annotated[list[CellIn], Field(max_length=20)]


class GridFileIn(FileModel):
    format: Literal["flechoir.grid"] = FORMAT
    version: Literal[1] = VERSION
    type: Literal["arrowword"] = "arrowword"
    lang: Annotated[str, StringConstraints(pattern=r"^[a-z]{2}$")]
    level: Literal["easy", "medium", "hard"] | None = None
    seed: Annotated[int, Field(ge=0)] | None = None
    rows: Annotated[list[Annotated[str, StringConstraints(pattern=r"^[A-Z#.]+$", max_length=MAX_SIDE)]],
                    Field(min_length=MIN_SIDE, max_length=MAX_SIDE)]
    words: Annotated[list[WordIn], Field(max_length=4 * MAX_SIDE * MAX_SIDE)]
    mystery: MysteryIn | None = None

    @field_validator("rows")
    @classmethod
    def same_width(cls, rows: list[str]) -> list[str]:
        if len({len(row) for row in rows}) != 1 or not MIN_SIDE <= len(rows[0]) <= MAX_SIDE:
            raise ValueError("les lignes n'ont pas toutes la même longueur, entre 5 et 20")
        return rows


class _RowsTemplate:
    """Vue minimale d'une grille en lignes, pour `engine.arrows` : seules les cases de définition comptent."""

    def __init__(self, rows: list[str]):
        self.rows = rows
        self.width, self.height = len(rows[0]), len(rows)

    def is_black_square(self, x: int, y: int) -> bool:
        return 0 <= x < self.width and 0 <= y < self.height and self.rows[y][x] == "#"


def cells_of(word: dict) -> list[tuple[int, int]]:
    dx, dy = (1, 0) if word["direction"] == "across" else (0, 1)
    return [(word["x"] + i * dx, word["y"] + i * dy) for i in range(len(word["answer"]))]


def complete(rows: list[str], words: list[dict]) -> list[dict]:
    """Les mots avec ce qui se déduit des lignes : case de définition, flèche, case partagée, place disponible."""
    template = _RowsTemplate(rows)
    out = []
    for word in words:
        found = clue_for_slot(template, word["x"], word["y"], word["direction"])
        out.append({
            "answer": word["answer"],
            "x": word["x"],
            "y": word["y"],
            "direction": word["direction"],
            "length": len(word["answer"]),
            "source": word.get("source") or "lexicon",
            "clue_cell": {"x": found[0][0], "y": found[0][1]} if found else None,
            "arrow": ARROWS.get(found[1]) if found else None,
            "clue": word.get("clue") or None,
        })
    shared = clue_cells(out)
    for word in out:
        cell = word["clue_cell"]
        word["clue_shares_cell"] = bool(cell) and len(shared[(cell["x"], cell["y"])]) > 1
        word["clue_max_chars"] = clue_capacity(word["arrow"], word["clue_shares_cell"]) if cell else None
    return out


def build(lang: str, level: str, seed, rows: list[str], words: list[dict], mystery: dict | None) -> dict:
    """Le fichier d'une grille tout juste générée (generation_runner.py)."""
    grid = {"format": FORMAT, "version": VERSION, "type": "arrowword", "lang": lang, "level": level,
            "width": len(rows[0]), "height": len(rows), "seed": seed, "rows": rows, "words": complete(rows, words)}
    if mystery:
        grid["mystery"] = {"word": mystery["word"], "cells": mystery["cells"]}
    return grid


def read(data: GridFileIn) -> tuple[dict | None, list[dict]]:
    """Le fichier relu et complété, ou les problèmes qui le rendent illisible : (grille, problèmes)."""
    rows = data.rows
    width, height = len(rows[0]), len(rows)
    problems = []
    seen = set()
    for index, word in enumerate(data.words):
        cells = cells_of(word.model_dump())
        if any(x >= width or y >= height for x, y in cells):
            problems.append({"word": index, "problem": "outside_grid"})
        elif "".join(rows[y][x] for x, y in cells) != word.answer:
            problems.append({"word": index, "problem": "letters_mismatch"})
        key = (word.x, word.y, word.direction)
        if key in seen:
            problems.append({"word": index, "problem": "duplicate"})
        seen.add(key)
    if data.mystery:
        letters = data.mystery.word.replace(" ", "")
        if len(data.mystery.cells) != len(letters) or any(
                cell.x >= width or cell.y >= height or rows[cell.y][cell.x] != letter
                for cell, letter in zip(data.mystery.cells, letters)):
            problems.append({"mystery": True, "problem": "letters_mismatch"})
    if problems:
        return None, problems
    grid = build(data.lang, data.level or "medium", data.seed, rows, [word.model_dump() for word in data.words],
                 data.mystery.model_dump() if data.mystery else None)
    return grid, []


def genre_problems(grid: dict) -> list[dict]:
    """Ce qui fait d'une grille autre chose qu'une grille de mots fléchés : une suite de lettres qui n'est pas un mot
    déclaré, une lettre hors de tout mot, un mot sans case de définition. Avertissements du dessin : on dessine
    quand même (une grille d'un autre moteur, une grille retouchée)."""
    rows, words = grid["rows"], grid["words"]
    width, height = grid["width"], grid["height"]
    declared = {(word["x"], word["y"], word["direction"]) for word in words}
    covered = {cell for word in words for cell in cells_of(word)}
    problems = []
    for y in range(height):
        for x in range(width):
            if rows[y][x] == "#":
                continue
            starts_across = (x == 0 or rows[y][x - 1] == "#") and x + 1 < width and rows[y][x + 1] != "#"
            starts_down = (y == 0 or rows[y - 1][x] == "#") and y + 1 < height and rows[y + 1][x] != "#"
            if starts_across and (x, y, "across") not in declared:
                problems.append({"x": x, "y": y, "direction": "across", "problem": "undeclared_word"})
            if starts_down and (x, y, "down") not in declared:
                problems.append({"x": x, "y": y, "direction": "down", "problem": "undeclared_word"})
            if (x, y) not in covered:
                problems.append({"x": x, "y": y, "problem": "orphan_letter"})
    problems += [{"x": word["x"], "y": word["y"], "direction": word["direction"], "problem": "no_clue_cell"}
                 for word in words if word["clue_cell"] is None]
    return problems


def check_clue(text: str | None, word: dict, lang: str) -> list[dict]:
    """Ce qu'on dit d'une définition : des refus (`error`) et des alertes de style (`warning`), avec leur `reason`."""
    if not text:
        return [{"level": "error", "reason": "clue_missing"}]
    if len(text) > MAX_CLUE_LENGTH or not re.match(PLAIN_TEXT, text):
        return [{"level": "error", "reason": "clue_invalid", "params": {"max_length": MAX_CLUE_LENGTH}}]
    findings = []
    answer = word["answer"]
    tokens = {normalize_word(token, lang) for token in re.split(r"[\s'’\-,.;:!?()]+", text) if token}
    if answer in tokens or (len(answer) >= 5 and answer in normalize_word(text, lang)):
        findings.append({"level": "error", "reason": "clue_contains_answer"})
    if word["clue_cell"] and wrap_definition(text, word["arrow"], word["clue_shares_cell"])["overflow"]:
        findings.append({"level": "error", "reason": "clue_too_long", "max_chars": word["clue_max_chars"],
                         "params": {"max_chars": word["clue_max_chars"]}})
    if len(text.split()) > STYLE_MAX_WORDS:
        findings.append({"level": "warning", "reason": "clue_style_long", "params": {"max_words": STYLE_MAX_WORDS}})
    relative = RELATIVES.get(lang)
    if relative and relative.search(text):
        findings.append({"level": "warning", "reason": "clue_style_relative"})
    return findings


def encode(grid: dict) -> str:
    """La grille dans un lien, après le « # » : compressée (zlib), en base64 pour les adresses. Jamais envoyée au serveur."""
    raw = json.dumps(grid, ensure_ascii=False, separators=(",", ":")).encode()
    return base64.urlsafe_b64encode(zlib.compress(raw, 9)).decode().rstrip("=")


def decode(fragment: str) -> dict:
    padded = fragment + "=" * (-len(fragment) % 4)
    return json.loads(zlib.decompress(base64.urlsafe_b64decode(padded)))


def links(grid: dict, site_url: str) -> dict:
    """Les liens vers le site de la langue de la grille : la jouer, ou l'ouvrir (imprimer, retoucher, enregistrer)."""
    data = encode({key: value for key, value in grid.items() if key != "links"})
    return {"open": f"{site_url}/grille#g={data}", "play": f"{site_url}/grille#mode=jouer&g={data}"}


def with_clues(grid: dict, clues: dict[str, str]) -> dict:
    return {**grid, "words": [{**word, "clue": clues.get(word_key(word), word.get("clue"))} for word in grid["words"]]}
