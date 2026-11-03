"""Les assistants reconnus à leur adresse (revue de sécurité de l'API ouverte, 02/11/2026 ; ADR 0032).

Le connecteur MCP relaie des milliers de personnes au nom de quelques assistants, qui ont donc des quotas à eux. Le
nom qu'un appelant se donne (son User-Agent) s'invente : s'y fier laisserait n'importe qui vider le quota de Claude ou
de ChatGPT pour tous leurs utilisateurs. Un assistant n'a ses quotas que s'il appelle depuis les adresses qu'il publie
(assistant_ranges.json, relevé par tools/api/assistant-ranges.sh) ; les autres appelants du connecteur sont comptés à
leur adresse, comme une clé.
"""

import ipaddress
import json
import os
from functools import lru_cache

RANGES_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assistant_ranges.json")


@lru_cache(maxsize=1)
def _networks() -> tuple[tuple[str, tuple], ...]:
    with open(RANGES_FILE, encoding="utf-8") as f:
        data = json.load(f)
    return tuple((name, tuple(ipaddress.ip_network(cidr) for cidr in entry["ranges"]))
                 for name, entry in data["assistants"].items())


def verified_assistant(address: str) -> str | None:
    """« claude », « chatgpt »… si l'adresse est l'une de celles que l'assistant publie ; sinon None."""
    try:
        ip = ipaddress.ip_address(address)
    except ValueError:
        return None
    for name, networks in _networks():
        if any(ip in network for network in networks):
            return name
    return None
