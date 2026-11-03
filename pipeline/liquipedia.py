"""Polite Liquipedia MediaWiki API client.

Follows https://liquipedia.net/api-terms-of-use:
  * at most 1 request per 2 seconds (we use 2.1s)
  * at most 1 action=parse request per 30 seconds (we use 30.5s)
  * custom User-Agent with contact info
  * cache results and never re-request the same data
  * gzip (requests sends Accept-Encoding: gzip by default)
"""
import hashlib
import json
import time
from pathlib import Path

import requests

API_URL = "https://liquipedia.net/valorant/api.php"
BATCH_SIZE = 50  # MediaWiki max titles per query for normal clients


class Liquipedia:
    QUERY_GAP = 2.1
    PARSE_GAP = 30.5

    def __init__(self, user_agent, cache_dir="cache", max_age_days=None, verbose=True):
        if not user_agent or "CHANGE_ME" in user_agent:
            raise SystemExit(
                "Liquipedia needs a contact in your User-Agent. Copy "
                "pipeline/local_settings.example.py to pipeline/local_settings.py "
                "and replace CHANGE_ME with your email, Discord, or GitHub URL."
            )
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": user_agent, "Accept-Encoding": "gzip"})
        self.cache = Path(cache_dir)
        (self.cache / "wikitext").mkdir(parents=True, exist_ok=True)
        (self.cache / "html").mkdir(parents=True, exist_ok=True)
        self.max_age = None if max_age_days is None else max_age_days * 86400
        self.verbose = verbose
        self._last_any = 0.0
        self._last_parse = 0.0
        self.network_requests = 0

    # ---------- cache helpers ----------
    @staticmethod
    def _key(title):
        return hashlib.sha1(title.replace("_", " ").strip().encode("utf-8")).hexdigest()

    def _fresh(self, path):
        if not path.exists():
            return False
        return self.max_age is None or (time.time() - path.stat().st_mtime) < self.max_age

    # ---------- raw request with throttling ----------
    def _request(self, params, parse=False):
        params = {**params, "format": "json", "formatversion": "2"}
        now = time.monotonic()
        wait = self._last_any + self.QUERY_GAP - now
        if parse:
            wait = max(wait, self._last_parse + self.PARSE_GAP - now)
        if wait > 0:
            if self.verbose and wait > 5:
                print(f"  waiting {wait:.0f}s (parse rate limit)...")
            time.sleep(wait)

        for attempt in range(4):
            resp = self.session.get(API_URL, params=params, timeout=60)
            self._last_any = time.monotonic()
            if parse:
                self._last_parse = self._last_any
            self.network_requests += 1
            if resp.status_code == 429 or resp.status_code >= 500:
                backoff = 60 * (attempt + 1)
                print(f"  HTTP {resp.status_code}, backing off {backoff}s")
                time.sleep(backoff)
                continue
            resp.raise_for_status()
            data = resp.json()
            if "error" in data and data["error"].get("code") != "missingtitle":
                raise RuntimeError(f"Liquipedia API error: {data['error']}")
            return data
        raise RuntimeError("Liquipedia kept rate-limiting us; try again later.")

    # ---------- public: wikicode for many pages ----------
    def wikitext(self, titles, with_titles=False):
        """Return {title: wikicode or None} for each requested title.

        With with_titles=True, values are (final_title, wikicode) where
        final_title is the page after following redirects.

        Uncached titles are fetched 50 at a time with action=query
        (counts against the 2-second limit, not the 30-second parse limit).
        """
        out, missing = {}, []
        for t in dict.fromkeys(titles):
            path = self.cache / "wikitext" / f"{self._key(t)}.json"
            if self._fresh(path):
                rec = json.loads(path.read_text(encoding="utf-8"))
                out[t] = (rec["title"], rec["wikitext"]) if with_titles else rec["wikitext"]
            else:
                missing.append(t)

        for i in range(0, len(missing), BATCH_SIZE):
            chunk = missing[i : i + BATCH_SIZE]
            if self.verbose:
                print(f"  fetching {len(chunk)} page(s) ({i + len(chunk)}/{len(missing)})")
            params = {
                "action": "query",
                "prop": "revisions",
                "rvprop": "content",
                "rvslots": "main",
                "redirects": "1",
                "titles": "|".join(chunk),
            }
            pages, normalized, redirects = {}, {}, {}
            while True:  # follow continuation if the response was split
                data = self._request(params)
                q = data.get("query", {})
                normalized.update({n["from"]: n["to"] for n in q.get("normalized", [])})
                redirects.update({r["from"]: r["to"] for r in q.get("redirects", [])})
                for p in q.get("pages", []):
                    if p.get("revisions") or p["title"] not in pages:
                        pages[p["title"]] = p
                if "continue" not in data:
                    break
                params = {**params, **data["continue"]}

            for t in chunk:
                final = normalized.get(t, t)
                for _ in range(3):  # resolve redirect chains
                    final = redirects.get(final, final)
                page = pages.get(final, {})
                text = None
                if not page.get("missing") and page.get("revisions"):
                    text = page["revisions"][0]["slots"]["main"]["content"]
                path = self.cache / "wikitext" / f"{self._key(t)}.json"
                path.write_text(json.dumps({"title": final, "wikitext": text}), encoding="utf-8")
                out[t] = (final, text) if with_titles else text
        return out

    # ---------- public: rendered HTML for one page ----------
    def html(self, title):
        """Rendered HTML via action=parse. Expensive: max 1 per 30 s. Cached."""
        path = self.cache / "html" / f"{self._key(title)}.json"
        if self._fresh(path):
            return json.loads(path.read_text(encoding="utf-8"))["html"]
        if self.verbose:
            print(f"  rendering {title} (action=parse)")
        data = self._request(
            {"action": "parse", "page": title, "prop": "text", "redirects": "1"}, parse=True
        )
        html = data.get("parse", {}).get("text")
        path.write_text(json.dumps({"title": title, "html": html}), encoding="utf-8")
        return html
