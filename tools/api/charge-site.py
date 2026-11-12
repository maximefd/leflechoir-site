"""Ce que voient les visiteurs du site pendant le test de charge de l'API (ADR 0032, lot 3 ; docs/PRODUCTION.md).

Depuis le Mac : des générations du site, comme un visiteur, à 9 par minute au plus (le site en permet 10 par adresse),
avec PARALLEL demandes à la fois. À lancer deux fois : file de l'API vide, puis pleine (`flask api charge`). Le
résultat compare les refus « occupé » et les durées.

    python3 tools/api/charge-site.py --minutes 5 --label repos
    python3 tools/api/charge-site.py --minutes 5 --label charge
"""

from __future__ import annotations

import argparse
import json
import statistics
import sys
import threading
import time
import urllib.error
import urllib.request

PER_MINUTE = 9


def generate(api: str, width: int, height: int) -> tuple[int, str | None, float]:
    body = json.dumps({"size": {"width": width, "height": height}}).encode()
    request = urllib.request.Request(f"{api}/api/grids/generate", data=body, method="POST",
                                     headers={"Content-Type": "application/json", "User-Agent": "flechoir-charge/1"})
    start = time.monotonic()
    try:
        with urllib.request.urlopen(request, timeout=90) as response:
            response.read()
            return response.status, None, time.monotonic() - start
    except urllib.error.HTTPError as error:
        try:
            reason = json.loads(error.read() or b"{}").get("reason")
        except ValueError:
            reason = None
        return error.code, reason, time.monotonic() - start
    except OSError as error:  # coupure réseau, délai dépassé (socket.timeout en Python 3.9) : compté, la mesure continue
        return 0, type(error).__name__, time.monotonic() - start


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--api", default="https://api.leflechoir.fr")
    parser.add_argument("--minutes", type=float, default=5)
    parser.add_argument("--parallel", type=int, default=2)
    parser.add_argument("--size", default="10x10")
    parser.add_argument("--label", default="mesure")
    args = parser.parse_args()
    width, height = (int(side) for side in args.size.lower().split("x"))
    interval = 60 * args.parallel / PER_MINUTE
    end = time.monotonic() + 60 * args.minutes
    results: list[tuple[int, str | None, float]] = []
    lock = threading.Lock()

    def worker(offset: float) -> None:
        time.sleep(offset)
        while time.monotonic() < end:
            started = time.monotonic()
            result = generate(args.api.rstrip("/"), width, height)
            with lock:
                results.append(result)
            time.sleep(max(0.0, interval - (time.monotonic() - started)))

    threads = [threading.Thread(target=worker, args=(index * interval / args.parallel,)) for index in range(args.parallel)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    durations = sorted(seconds for status, _, seconds in results if status == 200)
    outcomes: dict[str, int] = {}
    for status, reason, _ in results:
        key = str(status) if reason is None else f"{status} {reason}"
        outcomes[key] = outcomes.get(key, 0) + 1
    summary = {
        "label": args.label, "format": f"{width}x{height}", "parallel": args.parallel, "requests": len(results),
        "outcomes": outcomes,
        "busy": sum(1 for _, reason, _ in results if (reason or "").startswith("busy")),
        "p50_s": round(statistics.median(durations), 2) if durations else None,
        "p95_s": round(durations[min(len(durations) - 1, int(0.95 * len(durations)))], 2) if durations else None,
    }
    print(json.dumps(summary, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
