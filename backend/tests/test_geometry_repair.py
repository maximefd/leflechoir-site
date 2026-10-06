"""Sur mesure (#219) : réparer la géométrie pendant le remplissage, mots souhaités en réserve, géométrie assortie aux
mots. Tous ces réglages sont coupés par défaut : sans eux, les trajectoires restent celles de `baseline.json`."""

import random
from collections import Counter
from types import SimpleNamespace

import pytest

from engine.geometry import (
    DEFAULT_PROFILE,
    cut_keeps_editor_rules,
    generate_geometry,
    profile_for_words,
    repair_allowed,
    repair_density_cap,
    slot_lengths,
)
from engine.grid_edit import geometry_issues
from engine.grid_solver import GridSolver
from engine.grid_template import GridTemplate
from engine.orchestrator import Orchestrator, climb_candidate
from engine.skeleton import generated_factory, length_coverage
from engine.slot_finder import SlotFinder
from engine.word_repository import WordRepository
from grid_generator import GridGenerator
from tests.paths import FIXTURE_LAYOUTS_DIR

VARIANT = {"fill_determined": True, "min_safe_candidates": 1}
# Le lexique d'essai s'arrête à 5 lettres : cette géométrie a trois emplacements de 6 lettres, qui ne s'y remplissent
# pas sans être coupés. Trois coupes suffisent si la densité peut monter à 25 % (mesuré : à 21 %, aucune n'est permise)
LONG_ROWS = generate_geometry(10, 10, 5, {"max_length": 6})
DENSITY = 0.25


def solver_for(rows, repository, seed=0, **options):
    template = GridTemplate.from_rows(rows)
    finder = SlotFinder(template)
    finder.find_all_slots()
    return GridSolver(template, repository, finder, rng=random.Random(seed), **VARIANT, **options)


def with_cell(rows, x, y):
    rows = list(rows)
    rows[y] = rows[y][:x] + "x" + rows[y][x + 1:]
    return rows


def assert_complete(solver, words):
    """La grille rendue : aux règles de l'éditeur, chaque emplacement de sa géométrie porte un mot valide, sans doublon."""
    rows = solver.geometry_rows()
    assert geometry_issues(rows) == []
    template = GridTemplate.from_rows(rows)
    finder = SlotFinder(template)
    finder.find_all_slots()
    assert ({(slot["x"], slot["y"], slot["direction"], slot["length"]) for slot in finder.slots}
            == {(word["x"], word["y"], word["direction"], len(word["text"])) for word in solver.placed_words})
    texts = [word["text"] for word in solver.placed_words]
    assert len(texts) == len(set(texts))
    assert set(texts) <= set(words)
    for word in solver.placed_words:
        for i, char in enumerate(word["text"]):
            x = word["x"] + (i if word["direction"] == "across" else 0)
            y = word["y"] + (i if word["direction"] == "down" else 0)
            assert solver.grid[y][x] == char


def test_a_definition_cell_is_added_only_where_the_rules_allow_it():
    rows = generate_geometry(9, 9, 0)
    black = {(x, y) for y, row in enumerate(rows) for x, char in enumerate(row) if char == "x"}
    inside = [(x, y) for y in range(1, 9) for x in range(1, 9) if (x, y) not in black]
    legal = [(x, y) for x, y in inside if repair_allowed(with_cell(rows, x, y), x, y, max_density=1.0)]

    assert legal
    for x, y in legal:
        assert geometry_issues(with_cell(rows, x, y)) == []
    # Collée à une case définition de l'intérieur : jamais
    touching = [(x, y) for x, y in inside
                if any((nx, ny) in black and nx >= 1 and ny >= 1 for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)))]
    assert touching
    assert not any(repair_allowed(with_cell(rows, x, y), x, y, max_density=1.0) for x, y in touching)
    # Le plafond de densité tient : à la densité actuelle, plus aucune case
    density = len(black) / 81
    assert not any(repair_allowed(with_cell(rows, x, y), x, y, max_density=density) for x, y in legal)


@pytest.mark.parametrize("size", [(6, 6), (7, 9), (10, 10), (13, 16), (15, 15), (12, 8)])
def test_the_local_check_gives_the_editor_verdict_cut_by_cut(size):
    """`cut_keeps_editor_rules` ne regarde qu'autour de la case : même verdict que `geometry_issues` sur toute la forme.

    Mesuré sur 29 534 coupes (géométries générées et layouts du catalogue) : aucun écart, 5 µs contre 154 µs.
    """
    for seed in range(8):
        rows = generate_geometry(*size, seed)
        for y in range(1, size[1]):
            for x in range(1, size[0]):
                if rows[y][x] == "-":
                    after = with_cell(rows, x, y)
                    assert cut_keeps_editor_rules(after, x, y) == (not geometry_issues(after)), (seed, x, y)


def test_the_solver_cuts_a_slot_that_has_no_candidate(small_trie, small_words):
    rows = LONG_ROWS
    assert max(slot_lengths(rows)) == 6
    repository = WordRepository.from_pools(small_trie, small_words)

    assert not solver_for(rows, repository).solve()  # aucun mot de plus de 5 lettres : impossible telle quelle
    # Au plafond de 21 %, aucune coupe permise ; sans valeur, un 10×10 (100 cases) peut monter à 23 %
    assert not solver_for(rows, repository, repair=8, repair_max_density=0.21).solve()
    assert solver_for(rows, repository, repair=8).repair_max_density == 0.23
    solver = solver_for(rows, repository, repair=8, repair_max_density=DENSITY)
    assert solver.solve()
    assert solver.repairs
    assert max(slot_lengths(solver.geometry_rows())) <= 5
    assert solver.metrics["repairs"] >= len(solver.repairs)
    assert_complete(solver, small_words)


def test_a_cut_is_undone_with_its_branch(small_trie, small_words):
    """Une coupe qui ne mène à rien est défaite : emplacements, motifs et cases redeviennent ceux d'avant."""
    repository = WordRepository.from_pools(small_trie, small_words)
    solver = solver_for(LONG_ROWS, repository, repair=1, repair_max_density=DENSITY)
    before = ([dict(slot) for slot in solver.slots], [row[:] for row in solver.grid], dict(solver._cell_slots))
    cell, undo = None, None
    for x, y in ((x, y) for y in range(1, 10) for x in range(1, 10)):
        undo = solver._cut(x, y)
        if undo is not None:
            cell = (x, y)
            break
    assert undo is not None and cell is not None
    assert solver.grid[cell[1]][cell[0]] == solver.template.BLACK_SQUARE
    solver._uncut(undo)
    assert ([dict(slot) for slot in solver.slots], solver.grid, solver._cell_slots) == before


def test_at_the_density_cap_a_definition_cell_is_moved_not_added(small_trie, small_words):
    """`repair_move` (#219) : une case définition d'une région encore vide est retirée, ses emplacements rejoints."""
    longer = ["ABCDEF", "ABCDEFG", "ABCDEFGH", "ABCDEFGHI"]  # le lexique d'essai s'arrête à 5 lettres
    repository = WordRepository.from_pools(small_trie, small_words, longer, ())
    rows = generate_geometry(10, 10, 0)
    solver = solver_for(rows, repository, repair=2, repair_move=True)
    before = ([dict(slot) for slot in solver.slots], [row[:] for row in solver.grid], dict(solver._cell_slots))

    undo = solver._free_a_definition(1, 1)
    assert undo is not None
    x, y = undo[0], undo[1]
    assert rows[y][x] == "x" and solver.geometry_rows()[y][x] == "-"
    shape = solver.geometry_rows()
    assert geometry_issues(shape) == []
    assert sum(row.count("x") for row in shape) == sum(row.count("x") for row in rows) - 1
    assert len(solver.slots) < len(before[0])
    solver._unfree(undo)
    assert ([dict(slot) for slot in solver.slots], solver.grid, solver._cell_slots) == before


def test_a_definition_cell_between_two_free_slots_is_removed_to_fit_a_wished_word(small_trie, small_words):
    """`repair_merge` (#219) : deux emplacements libres rejoints à la longueur du mot, la case qui les séparait retirée."""
    longer = ["ABCDEF", "ABCDEFG", "ABCDEFGH", "ABCDEFGHI"]
    repository = WordRepository.from_pools(small_trie, small_words, longer, ())
    solver = solver_for(generate_geometry(10, 10, 0), repository, repair=2, repair_merge=True)
    options = [(word, option) for word in longer for option in solver._soft_merge_options(word)]
    assert options
    # La première qui tient les règles (mots de 9 lettres au plus, carrés de 4 × 4 au plus, un candidat chacun)
    word, ((x, y), (sx, sy, direction)), undo = next(
        (word, option, undo) for word, option in options if (undo := solver._remove_definition(*option[0])))
    assert [slot for slot in solver.slots if (slot["x"], slot["y"], slot["direction"], slot["length"])
            == (sx, sy, direction, len(word))]
    assert geometry_issues(solver.geometry_rows()) == []
    solver._unfree(undo)
    assert solver.grid[y][x] == solver.template.BLACK_SQUARE


def test_climbs_can_start_from_other_grids_as_rich_as_the_best(small_trie, small_words):
    words = ["ARBRE", "PORTE", "SALLE", "TERRE", "ROUTE", "ASTRE", "TAPIS", "RAME", "LIME", "RIRE"]
    repository = WordRepository.from_pools(small_trie, small_words, words, ())
    result = Orchestrator(generated_factory(5, 5), repository, seed=2, max_attempts=30, wish_words=words,
                          climb_share=0.5, climb_elite=4, solver_options=VARIANT).run()
    names = {attempt.candidate for attempt in result.attempts if attempt.climb}
    grids = {attempt.candidate for attempt in result.attempts if attempt.success and not attempt.climb}
    assert result.best is not None
    assert names <= grids | {result.best.candidate.name}
    with pytest.raises(ValueError):
        Orchestrator(generated_factory(5, 5), repository, seed=2, max_attempts=1, climb_elite=0)


def test_a_swapping_climb_unpins_one_word_of_the_best_grid():
    template = GridTemplate.from_rows(generate_geometry(5, 5, 0))
    finder = SlotFinder(template)
    finder.find_all_slots()
    words = [{"text": text, "id": index, "source": "wish"} for index, text in enumerate(["ARBRE", "PORTE", "SALLE"])]
    best = SimpleNamespace(placed_words=words + [{"text": "LE", "id": 9, "source": "common"}],
                           candidate=SimpleNamespace(name="généré-1", template=template, finder=finder))

    assert set(climb_candidate(best).pinned) == {"ARBRE", "PORTE", "SALLE"}
    swapped = climb_candidate(best, random.Random(0), drop=1)
    assert len(swapped.pinned) == 2 and set(swapped.pinned) < {"ARBRE", "PORTE", "SALLE"}


def test_a_wished_word_gets_a_slot_cut_to_its_length(small_trie, small_words):
    """Plus d'emplacement libre de 4 lettres : un plus long est taillé à sa longueur, par un bout (#219).

    D'un emplacement d'une lettre de plus, la coupe se collerait à la case définition qui le termine (refusée, sauf
    contre le bord) : il en faut au moins deux de plus, la lettre restante étant croisée dans l'autre sens.
    """
    repository = WordRepository.from_pools(small_trie, small_words, ["RAME"], ())
    solver = solver_for(LONG_ROWS, repository, soft_words=["RAME"], repair=2, repair_max_density=DENSITY)
    for slot in solver.slots:
        if slot["length"] == 4:
            slot["is_filled"] = True  # comme si d'autres mots les occupaient déjà

    options = solver._soft_repair_options("RAME")
    assert options
    assert all(length == 4 for (_, _, _, length), _ in options)
    # La première coupe permise (les autres seraient refusées par les règles) laisse un emplacement de 5 à cet endroit
    (x, y, direction, length), _ = next(option for option in options if solver._cut(*option[1][0]) is not None)
    target = [slot for slot in solver.slots if (slot["x"], slot["y"], slot["direction"], slot["length"])
              == (x, y, direction, length) and not slot["is_filled"]]
    assert len(target) == 1


def test_the_solver_places_at_most_its_target_from_the_reserve(small_trie, small_words):
    rows = generate_geometry(5, 5, 1)
    repository = WordRepository.from_pools(small_trie, small_words)
    # Le dernier de la liste est essayé d'abord : 8 lettres, aucune place, il est passé ; le suivant est posé
    solver = solver_for(rows, repository, soft_words=["ARBRE", "PORTE", "ABCDEFGH"], soft_target=1)

    assert solver.solve()
    assert solver._soft_placed == 1
    assert "PORTE" in [word["text"] for word in solver.placed_words]


def test_an_attempt_that_cannot_place_enough_wished_words_stops_before_filling(small_trie, small_words):
    rows = generate_geometry(5, 5, 1)
    repository = WordRepository.from_pools(small_trie, small_words)
    # Le mot de 8 lettres n'entre pas : deux mots exigés, l'essai s'arrête sans remplir la grille
    hopeless = solver_for(rows, repository, soft_words=["PORTE", "ABCDEFGH"], soft_required=2)
    assert not hopeless.solve()
    assert hopeless.metrics["recursive_calls"] <= 3
    assert solver_for(rows, repository, soft_words=["PORTE", "ABCDEFGH"], soft_required=1).solve()


def test_the_orchestrator_returns_the_repaired_geometry(small_trie, small_words):
    repository = WordRepository.from_pools(small_trie, small_words)
    options = {**VARIANT, "repair": 8, "repair_max_density": DENSITY}
    result = Orchestrator(generated_factory(10, 10), repository, seed=0, max_attempts=10,
                          solver_options=options).run()

    best = result.best
    assert best is not None and best.solver.repairs
    assert rows_of(best.candidate) == best.solver.geometry_rows()
    assert best.candidate.name.endswith("-réparé")
    ids = {(slot["x"], slot["y"], slot["direction"]): slot["id"] for slot in best.candidate.finder.slots}
    assert all(ids[(word["x"], word["y"], word["direction"])] == word["id"] for word in best.placed_words)


def test_the_reserve_gives_every_placeable_word_to_each_attempt(small_trie, small_words):
    words = ["ARBRE", "PORTE", "SALLE", "TERRE", "ROUTE", "ASTRE"]
    repository = WordRepository.from_pools(small_trie, small_words, words, ())
    result = Orchestrator(generated_factory(5, 5), repository, seed=0, max_attempts=3, wish_words=words,
                          soft_pool=True, solver_options=VARIANT).run()

    assert sorted(result.attempts[0].soft_words) == sorted(words)


def test_a_climbing_attempt_starts_from_the_best_grid(small_trie, small_words):
    """Montée (#219) : même géométrie que la meilleure grille, ses mots souhaités épinglés, un mot de plus à poser."""
    words = ["ARBRE", "PORTE", "SALLE", "TERRE", "ROUTE", "ASTRE", "TAPIS", "RAME", "LIME", "RIRE"]
    repository = WordRepository.from_pools(small_trie, small_words, words, ())
    seen = []

    def watch(attempts, score, best):
        seen.append(None if best is None else (best.candidate.name, sorted(
            word["text"] for word in best.placed_words if word["source"] == "wish")))

    result = Orchestrator(generated_factory(5, 5), repository, seed=1, max_attempts=12, wish_words=words,
                          climb_share=1.0, solver_options=VARIANT, on_progress=watch).run()

    climbs = [attempt for attempt in result.attempts if attempt.climb]
    assert climbs
    for attempt in climbs:
        before = seen[attempt.k - 2]  # la meilleure grille au moment de l'essai
        assert before is not None and attempt.candidate == before[0]
        if attempt.success:
            assert attempt.score.wish_placed >= len(before[1])
    # Sans montée, aucun essai n'en est une, et la suite des essais est celle d'avant (aucun tirage de plus)
    plain = Orchestrator(generated_factory(5, 5), WordRepository.from_pools(small_trie, small_words, words, ()),
                         seed=1, max_attempts=12, wish_words=words, solver_options=VARIANT).run()
    assert not any(attempt.climb for attempt in plain.attempts)


def test_matched_geometries_hold_at_least_as_many_words_by_length():
    words = ["ARBRES", "PORTES", "SALLES", "TERRES", "ROUTES", "ASTRES", "LIMES"]
    lengths = Counter(len(word) for word in words)
    plain, matched = generated_factory(9, 9), generated_factory(9, 9, match_words=words)
    gains = 0
    for k in range(1, 25):
        before = length_coverage(rows_of(plain(random.Random(k), k)), lengths)
        after = length_coverage(rows_of(matched(random.Random(k), k)), lengths)
        assert after >= before  # mêmes géométries conformes tirées, la mieux assortie gardée
        gains += after > before
    assert gains


def test_the_profile_can_lean_towards_the_lengths_of_the_words():
    words = ["ARROSOIR", "BOUTURE", "POTAGER", "TULIPE", "COCCINELLE"]  # 8, 7, 7, 6 lettres ; 10 : hors géométrie
    plain, mixed = profile_for_words(words, 0.0), profile_for_words(words, 0.5)
    assert plain["lengths"] == DEFAULT_PROFILE["lengths"]
    total = sum(DEFAULT_PROFILE["lengths"].values())
    assert mixed["lengths"][7] == pytest.approx(0.5 * DEFAULT_PROFILE["lengths"][7] / total + 0.5 * 2 / 4)
    assert mixed["lengths"][3] < DEFAULT_PROFILE["lengths"][3] / total
    assert 10 not in mixed["lengths"] or mixed["lengths"][10] < DEFAULT_PROFILE["lengths"][10]


def test_the_three_letter_cap_holds():
    for seed in range(40):
        lengths = slot_lengths(generate_geometry(10, 10, seed, {"max_three_letter_share": 0.2}))
        assert sum(1 for length in lengths if length == 3) / len(lengths) <= 0.2


def test_the_catalogue_is_never_repaired(small_trie, small_words):
    with pytest.raises(ValueError):
        GridGenerator(5, 5, small_words, prebuilt_trie=small_trie, layouts_dir=FIXTURE_LAYOUTS_DIR, repair=2)


def test_repair_needs_the_solver_variant(small_trie, small_words):
    """Un morceau d'emplacement écrit par ses croisements doit être posé explicitement : `fill_determined` exigé."""
    rows = generate_geometry(7, 7, 0)
    template = GridTemplate.from_rows(rows)
    finder = SlotFinder(template)
    finder.find_all_slots()
    with pytest.raises(ValueError):
        GridSolver(template, WordRepository.from_pools(small_trie, small_words), finder, repair=1)


def rows_of(candidate):
    black = candidate.template.BLACK_SQUARE
    return ["".join("x" if char == black else "-" for char in row) for row in candidate.template.grid]


def test_the_density_cap_of_a_repair_depends_on_the_size():
    """Décision de l'auteur (#219), seuil confirmé par la mesure : 23 % au plus pour 130 cases ou moins, 21 % au-delà."""
    assert repair_density_cap(10, 10) == 0.23 and repair_density_cap(10, 13) == 0.23
    assert repair_density_cap(11, 13) == 0.21 and repair_density_cap(15, 15) == 0.21


def test_sur_mesure_takes_the_settings_of_219_and_the_catalogue_none(small_trie, small_words):
    drawn = GridGenerator(7, 7, small_words, small_trie, seed=1, time_budget_s=1, geometry="sur_mesure")
    assert (drawn.repair, drawn.soft_pool, drawn.climb_share, drawn.fail_fast, drawn.patience_s) == (
        3, True, 0.5, True, 1.5)
    assert GridGenerator(15, 15, small_words, small_trie, seed=1, time_budget_s=1, geometry="sur_mesure").patience_s == pytest.approx(3.375, abs=0.01)
    plain = GridGenerator(7, 7, small_words, small_trie, seed=1, time_budget_s=1, geometry="sur_mesure",
                          repair=0, soft_pool=False, climb_share=0.0, fail_fast=False, patience_s=0)
    assert (plain.repair, plain.soft_pool, plain.patience_s) == (0, False, None)
    catalogue = GridGenerator(5, 5, small_words, small_trie, seed=1, layouts_dir=FIXTURE_LAYOUTS_DIR)
    assert (catalogue.repair, catalogue.soft_pool, catalogue.climb_share, catalogue.patience_s) == (0, False, 0.0, None)


def test_the_best_grid_is_returned_once_it_stops_improving(small_trie, small_words):
    words = ["ARBRE", "PORTE", "SALLE", "TERRE", "ROUTE", "ASTRE", "TAPIS", "RAME", "LIME", "RIRE", "ABCDE"]
    repository = WordRepository.from_pools(small_trie, small_words, words, ())
    ticks = iter(range(100_000))
    result = Orchestrator(generated_factory(5, 5), repository, seed=1, time_budget_s=10_000, patience_s=20,
                          wish_words=words, solver_options=VARIANT, clock=lambda: next(ticks)).run()
    assert result.stop in ("patience", "complete")
    if result.stop == "patience":
        assert result.attempts[-1].elapsed_s - result.best_grid_s <= 22
    # Sans mot souhaité, avec l'arrêt anticipé : la première grille suffit
    alone = Orchestrator(generated_factory(5, 5), WordRepository.from_pools(small_trie, small_words), seed=1,
                         time_budget_s=10_000, patience_s=20, solver_options=VARIANT).run()
    assert alone.stop == "complete" and len(alone.attempts) == 1


def test_the_smallest_grid_with_the_best_chance_is_advised(monkeypatch):
    from engine import difficulty

    monkeypatch.setattr(difficulty, "SUR_MESURE_SUCCESS", {
        (2, "6-7"): {7: 0.40, 9: 0.85, 10: 0.90, 12: 0.95, 15: 0.95},
        (2, "8-9"): {7: 0.0, 9: 0.30, 10: 0.50, 12: 0.80, 15: 0.95},
    })
    # 9, 10, 12 et 15 se valent à 0,10 près du meilleur taux : la plus petite, 9 × 9
    assert difficulty.best_sur_mesure_size(["TULIPE", "ROSE"]) == {"width": 9, "height": 9, "success_rate": 0.85}
    assert difficulty.best_sur_mesure_size(["ARROSOIR", "ROSE"])["width"] == 15  # 12 × 12 : 0,80, trop loin
    # Un mot de 8 lettres n'entre pas dans un 7 × 7 ; 11 × 11 prend le taux du côté mesuré le plus proche
    assert difficulty.sur_mesure_rate(["ARROSOIR", "ROSE"], 7, 7) == 0.0
    assert difficulty.sur_mesure_rate(["TULIPE", "ROSE"], 11, 11) == 0.90
    # Un mot de plus de 9 lettres a son emplacement réservé (#222) : impossible seulement au-delà du grand côté
    monkeypatch.setitem(difficulty.SUR_MESURE_SUCCESS, (1, "10+"), {13: 1.0, 15: 1.0, 20: 1.0})
    assert difficulty.sur_mesure_rate(["COCCINELLE"], 15, 15) == 1.0
    assert difficulty.sur_mesure_rate(["ORNITHORYNQUE"], 12, 12) == 0.0
    assert difficulty.best_sur_mesure_size(["ORNITHORYNQUE"]) == {"width": 13, "height": 13, "success_rate": 1.0}
    assert difficulty.best_sur_mesure_size(["APPLAUDISSEMENTS"])["width"] == 20
    assert difficulty.best_sur_mesure_size([]) is None
