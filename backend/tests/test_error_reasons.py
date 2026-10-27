"""Toute erreur de l'API porte un code `reason` stable (CLAUDE.md ; ADR 0031 et 0032).

Le message est en français et changera de langue avec le site ; les clients (le site, l'API publique, les
assistants IA) ne lisent que `reason`. Ce test lit le code de l'API : tout dictionnaire qui porte une clé
`"error"` doit porter aussi `"reason"`. Il garde la règle pour les erreurs à venir.
"""

import ast
from pathlib import Path

import pytest

from tests.helpers import send

BACKEND = Path(__file__).resolve().parents[1]
# Des dictionnaires qui ont une clé « error » sans être une réponse d'erreur
NOT_ERROR_RESPONSES = {("seo.py", "sync_error")}


def _error_dicts_without_reason():
    missing = []
    for path in sorted(BACKEND.glob("*.py")):
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            if not isinstance(node, ast.Dict):
                continue
            keys = {key.value for key in node.keys if isinstance(key, ast.Constant)}
            if "error" in keys and "reason" not in keys:
                value = node.values[[getattr(k, "value", None) for k in node.keys].index("error")]
                if any(name == path.name and marker in ast.unparse(value) for name, marker in NOT_ERROR_RESPONSES):
                    continue
                missing.append(f"{path.name}:{node.lineno}")
    return missing


def test_every_error_response_in_the_code_carries_a_reason():
    assert _error_dicts_without_reason() == []


@pytest.mark.parametrize("method, path, status, reason", [
    ("get", "/api/nulle-part", 404, "not_found"),
    ("put", "/api/status", 405, "method_not_allowed"),
    ("get", "/api/dictionaries", 401, "auth_required"),
])
def test_generic_http_errors_carry_a_reason(client, method, path, status, reason):
    response = send(client, method, path)

    assert response.status_code == status
    assert response.get_json()["reason"] == reason
    assert response.get_json()["error"]


def test_a_validation_error_carries_a_reason(client):
    response = send(client, "post", "/api/suggestions", {"kind": "nimporte", "word": "chat", "source": "search"},
                    {"User-Agent": "Mozilla/5.0 (test)"})

    assert response.status_code == 400
    assert response.get_json()["reason"] == "invalid_request"
