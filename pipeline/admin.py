"""Local admin page for writing questions.

    python pipeline/admin.py

Opens http://localhost:8765 in your browser. Only reachable from this computer.
Uses the data saved by build.py (out/players.json), so it never calls Liquipedia.
"""
import hashlib
import json
import threading
import webbrowser
from datetime import date
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import config
import prompts as P
import schedule as S
from data import DATASET_FILE, load_dataset
from game import GAME_FILE, load_game

ROOT = Path(__file__).parent
PORT = getattr(config, "ADMIN_PORT", 8765)


class Data:
    """Reloads players.json / game.json automatically when build.py rewrites them."""
    def __init__(self):
        self.mtime, self.ds, self.game, self.opts, self.ctx = None, None, None, None, None

    def get(self):
        mtime = (DATASET_FILE.stat().st_mtime,
                 GAME_FILE.stat().st_mtime if GAME_FILE.exists() else 0)
        if mtime != self.mtime:
            self.ds = load_dataset()
            self.game = load_game()
            self.opts = P.options(self.ds, self.game)
            self.ctx = P.context(self.ds)
            self.mtime = mtime
        return self.ds


DATA = Data()


def schedule_state():
    """Days from two weeks ago to the end of the plan, plus when each question was/will be used."""
    data = S.plan(P.load_prompts(), S.load_schedule())
    S.save_schedule(data)
    today = S.eastern_today()
    start = (today - S.timedelta(days=14)).isoformat()
    days = [{"date": k, "prompts": v["prompts"], "pinned": v.get("pinned", False),
             "past": k < today.isoformat(), "today": k == today.isoformat()}
            for k, v in sorted(data["days"].items()) if k >= start]
    return {"today": today.isoformat(), "days": days, "usage": S.usage(data, today)}


def send_schedule_to_game(data):
    """Update the schedule inside dive.json without rebuilding every answer."""
    path = Path(config.OUTPUT_FILE)
    if path.exists():
        dive = json.loads(path.read_text(encoding="utf-8"))
        dive["schedule"] = S.for_game(data)
        path.write_text(json.dumps(dive, indent=2, ensure_ascii=False), encoding="utf-8")


def prompts_version():
    """Fingerprint of prompts.json, so a stale tab can't save over newer questions."""
    f = P.PROMPTS_FILE
    return hashlib.sha1(f.read_bytes()).hexdigest()[:12] if f.exists() else "none"


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):  # keep the terminal quiet
        pass

    def _send(self, code, body, ctype):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _json(self, obj, code=200):
        self._send(code, json.dumps(obj, ensure_ascii=False).encode("utf-8"),
                   "application/json; charset=utf-8")

    def do_GET(self):
        if self.path in ("/", "/index.html"):
            self._send(200, (ROOT / "admin.html").read_bytes(), "text/html; charset=utf-8")
        elif self.path == "/api/schedule":
            self._json(schedule_state())
        elif self.path == "/api/state":
            ds = DATA.get()
            self._json({
                "usage": schedule_state()["usage"],
                "prompts": P.load_prompts(),
                "version": prompts_version(),
                "options": DATA.opts,
                "dataset": {"generated": ds["generated"], "players": len(ds["players"]),
                            "events": len(ds["events"]),
                            "game_version": (DATA.game or {}).get("game_version")},
            })
        else:
            self._send(404, b"not found", "text/plain")

    def do_POST(self):
        # Only accept requests from this page (blocks other websites from posting here)
        origin = self.headers.get("Origin")
        if origin and origin not in (f"http://localhost:{PORT}", f"http://127.0.0.1:{PORT}"):
            return self._json({"error": "forbidden"}, 403)
        try:
            body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
            ds = DATA.get()
            if self.path == "/api/preview":
                answers = P.evaluate(body["prompt"], ds, date.today(), DATA.ctx, DATA.game)
                self._json({"answers": answers})
            elif self.path in ("/api/save", "/api/publish") and body.get("version") != prompts_version():
                # prompts.json changed since this tab loaded it (another tab, or Claude added
                # questions): refuse instead of overwriting, and ask the page to reload
                self._json({"error": "stale", "message": "The question list changed since this "
                            "page loaded. Reload the page to get the latest."}, 409)
            elif self.path == "/api/schedule/day":
                # Hand-pick a future day (prompts = list of ids) or unpin it (prompts = null)
                data = S.set_day(P.load_prompts(), S.load_schedule(), body["date"], body.get("prompts"))
                S.save_schedule(data)
                send_schedule_to_game(data)
                self._json(schedule_state())
            elif self.path == "/api/save":
                P.save_prompts(body["prompts"])
                self._json({"ok": True, "version": prompts_version()})
            elif self.path == "/api/publish":
                P.save_prompts(body["prompts"])
                path, built = P.publish(body["prompts"], ds, game=DATA.game)
                self._json({"ok": True, "path": str(path), "version": prompts_version(),
                            "prompts": [{"id": b["id"], "answers": len(b["answers"])} for b in built]})
            else:
                self._json({"error": "unknown endpoint"}, 404)
        except Exception as e:  # show the error in the page instead of crashing
            self._json({"error": f"{type(e).__name__}: {e}"}, 500)


def main():
    DATA.get()  # fail early with a clear message if build.py hasn't run
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    url = f"http://localhost:{PORT}"
    print(f"Admin page running at {url}  (press Ctrl+C to stop)")
    threading.Timer(0.5, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
