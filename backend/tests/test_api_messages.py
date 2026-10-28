"""Les messages de l'API ouverte (api_messages.py) : chaque `reason` a son texte dans chaque langue des messages."""

import re

import pytest

from api_messages import MESSAGE_LANGS, MESSAGES, message, pick_language
from tests.test_error_reasons import BACKEND


def test_every_reason_has_every_language_with_the_same_parameters():
    for reason, texts in MESSAGES.items():
        assert set(texts) == set(MESSAGE_LANGS), reason
        params = {lang: set(re.findall(r"{(\w+)}", text)) for lang, text in texts.items()}
        assert len({frozenset(names) for names in params.values()}) == 1, reason


def test_every_reason_the_open_api_returns_has_a_message():
    used = set()
    # Les routes des clés (api_keys.py) sont celles du site : leurs messages suivent le site, pas Accept-Language
    for name in ("api_v1.py", "generation_runner.py", "grid_file.py"):
        source = (BACKEND / name).read_text(encoding="utf-8")
        used |= set(re.findall(r'refuse\(\d+, "(\w+)"', source))
        used |= set(re.findall(r'"reason": "(\w+)"', source))
    assert used - set(MESSAGES) == set()


@pytest.mark.parametrize("header, expected", [
    (None, "en"), ("", "en"), ("fr", "fr"), ("de-CH,de;q=0.9,en;q=0.5", "de"), ("it,fr;q=0.8", "fr"),
    ("en;q=0.2,fr;q=0.9", "fr"), ("es", "en"),
])
def test_the_language_of_messages_follows_accept_language(header, expected):
    assert pick_language(header) == expected


def test_a_message_never_breaks_on_missing_parameters():
    assert message("quota_minute", "fr") == MESSAGES["quota_minute"]["fr"]
    assert message("raison_inconnue", "de") == MESSAGES["internal_error"]["de"]
