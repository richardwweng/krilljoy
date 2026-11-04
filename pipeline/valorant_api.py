"""Small cached client for valorant-api.com (unofficial, free, no key).

Game content only: agents, abilities, weapons, skins, maps, callouts.
It publishes no rate limit, so we stay gentle anyway: one request per second,
every response cached, and the whole set is only ~6 requests.
"""
import json
import time
from pathlib import Path

import requests

BASE = "https://valorant-api.com/v1/"
ENDPOINTS = {
    "version": "version",
    "agents": "agents?isPlayableCharacter=true&language=en-US",
    "weapons": "weapons?language=en-US",
    "maps": "maps?language=en-US",
    "themes": "themes?language=en-US",
    "contenttiers": "contenttiers?language=en-US",
    "contracts": "contracts?language=en-US",  # battle passes + agent gear: skins you can't buy
}


class ValorantAPI:
    GAP = 1.0

    def __init__(self, user_agent, cache_dir, max_age_days=7, verbose=True):
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": user_agent or "Krilljoy/0.1"})
        self.cache = Path(cache_dir) / "valorant-api"
        self.cache.mkdir(parents=True, exist_ok=True)
        self.max_age = None if max_age_days is None else max_age_days * 86400
        self.verbose = verbose
        self._last = 0.0
        self.network_requests = 0

    def _fresh(self, path):
        if not path.exists():
            return False
        return self.max_age is None or (time.time() - path.stat().st_mtime) < self.max_age

    def get(self, name):
        path = self.cache / f"{name}.json"
        if self._fresh(path):
            return json.loads(path.read_text(encoding="utf-8"))
        wait = self._last + self.GAP - time.monotonic()
        if wait > 0:
            time.sleep(wait)
        if self.verbose:
            print(f"  fetching valorant-api.com/{name}")
        resp = self.session.get(BASE + ENDPOINTS[name], timeout=60)
        self._last = time.monotonic()
        self.network_requests += 1
        resp.raise_for_status()
        data = resp.json()["data"]
        path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
        return data

    def all(self):
        return {name: self.get(name) for name in ENDPOINTS}
