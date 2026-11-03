"""Turn Liquipedia wikicode / HTML into plain Python data.

Structures confirmed on liquipedia.net/valorant (Nov 2026):
  * Tournament pages list rosters in {{TeamCard|team=..|p1=..|p2=..|s1=..|p4link=..}}
  * Player pages have {{Infobox player|id=..|country=..|country2=..}}
  * Team pages' former rosters are auto-generated ({{FormerSquadAuto}}),
    so they are NOT in the wikicode -> we use TeamCards instead.
  * Prize pools are auto-filled from brackets, so the winner only appears in
    the rendered HTML (row with .prizepooltable-badge.placement-1).
"""
import re
import unicodedata
from datetime import date

import mwparserfromhell as mw
from bs4 import BeautifulSoup


def norm(name):
    """Normalize a team/player name for comparison: 'Leviatán' -> 'leviatan'."""
    s = unicodedata.normalize("NFKD", name or "").encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]", "", s.lower())


def _val(tpl, key):
    if not tpl.has(key):
        return ""
    return tpl.get(key).value.strip_code().strip()


def _templates(wikitext, name):
    name = name.lower()
    return [
        t for t in mw.parse(wikitext or "").filter_templates()
        if t.name.strip().lower().replace("_", " ") == name
    ]


def team_cards(wikitext):
    """[{team, players: [{id, page, sub}]}] for every {{TeamCard}} on a page."""
    cards = []
    for tpl in _templates(wikitext, "teamcard"):
        team = _val(tpl, "team")
        players = []
        for param in tpl.params:
            m = re.fullmatch(r"([ps])(\d+)", str(param.name).strip())
            if not m:
                continue
            pid = param.value.strip_code().strip()
            if not pid or pid.upper() in {"TBD", "TBA"}:
                continue
            page = _val(tpl, f"{m[1]}{m[2]}link") or pid
            players.append({"id": pid, "page": page, "sub": m[1] == "s"})
        if team and players:
            cards.append({"team": team, "players": players})
    return cards


def team_participants(wikitext):
    """Rosters from the newer {{TeamParticipants}} template (2025+ pages).

    Returns (cards, needs_html). Teams marked import=true don't list their
    players in the wikicode (they're filled in when the page renders), so
    needs_html=True means the rendered page must be read instead.
    """
    cards, needs_html = [], False
    for block in _templates(wikitext, "teamparticipants"):
        for param in block.params:
            for opp in param.value.filter_templates(recursive=False):
                if opp.name.strip().lower() != "opponent":
                    continue
                if _val(opp, "import").lower() in ("true", "1", "yes"):
                    needs_html = True
                team = _val(opp, "1")
                players = []
                if opp.has("players"):
                    for person in opp.get("players").value.filter_templates():
                        if person.name.strip().lower() != "person":
                            continue
                        if _val(person, "type").lower() == "staff":
                            continue
                        pid = _val(person, "1")
                        if not pid:
                            continue
                        page = _val(person, "link") or pid
                        sub = _val(person, "status").lower() == "sub"
                        players.append({"id": pid, "page": page, "sub": sub})
                if team:
                    cards.append({"team": team, "players": players})
    return cards, needs_html


def team_participants_html(html):
    """Rosters from the rendered TeamParticipants cards (handles import=true)."""
    if not html:
        return []
    soup = BeautifulSoup(html, "html.parser")
    cards = []
    for card in soup.select(".team-participant-card"):
        a = (card.select_one(".team-participant-card__opponent-full .name a[title]")
             or card.select_one(".team-participant-card__opponent .name a[title]"))
        if not a:
            continue
        team = a.get("title", "").replace(" (page does not exist)", "")
        # Tabs are labeled Main / Subs / Staff; map each content area to its label
        labels = {opt.get("data-toggle-area-btn"): opt.get_text(strip=True).lower()
                  for opt in card.select(".switch-pill-option[data-toggle-area-btn]")}
        areas = card.select("[data-toggle-area-content]") or [card]
        players, seen = [], set()
        for area in areas:
            label = labels.get(area.get("data-toggle-area-content"), "main")
            if label.startswith("staff"):
                continue
            for member in area.select(".team-participant-card__member"):
                link = member.select_one(".team-participant-card__member-name .name a")
                if not link:
                    continue
                roles = " ".join(r.get_text(" ", strip=True).lower()
                                 for r in member.select("[class*='member-role']"))
                if "coach" in roles or "analyst" in roles or "manager" in roles:
                    continue
                page = (link.get("title") or link.get_text(strip=True)).replace(" (page does not exist)", "")
                if page in seen:
                    continue
                seen.add(page)
                players.append({"id": link.get_text(strip=True), "page": page,
                                "sub": label.startswith("sub") or "substitute" in roles})
        cards.append({"team": team, "players": players})
    return cards


def league_info(wikitext):
    """{tier, name, start_date, end_date} from {{Infobox league}}."""
    def _date(s):
        m = re.match(r"(\d{4})-(\d{2})-(\d{2})", s)
        return date(int(m[1]), int(m[2]), int(m[3])) if m else None

    for tpl in _templates(wikitext, "infobox league"):
        return {
            "tier": _val(tpl, "liquipediatier"),
            "name": (_val(tpl, "shortname") or _val(tpl, "name")).replace("\xa0", " "),
            "start_date": _date(_val(tpl, "sdate")),
            "end_date": _date(_val(tpl, "edate")),
        }
    return None


def player_info(wikitext):
    """{id, countries, alt_ids} from {{Infobox player}}."""
    for tpl in _templates(wikitext, "infobox player"):
        countries = [c for c in (_val(tpl, k) for k in ("country", "country2", "country3")) if c]
        alt = _val(tpl, "ids")
        return {
            "id": _val(tpl, "id"),
            "countries": countries,
            "alt_ids": [a.strip() for a in re.split(r"[,;/]", alt) if a.strip()],
        }
    return None


def navbox_event_links(wikitext):
    """Every event page linked from a navbox template (past and upcoming)."""
    links = []
    for link in mw.parse(wikitext or "").filter_wikilinks():
        title = str(link.title).strip()
        if re.search(r"/\d{4}/", title) and not title.lower().startswith(("category:", ":")):
            links.append(title)
    return list(dict.fromkeys(links))


def prize_pool_winner(html):
    """Team page title in the 1st-place row of the rendered prize pool."""
    if not html:
        return None
    soup = BeautifulSoup(html, "html.parser")
    badge = soup.select_one(".prizepooltable-badge.placement-1")
    if not badge:
        return None
    row = badge.find_parent("tr")
    if not row:
        return None
    a = row.select_one(".prizepooltable-col-team .name a") or row.select_one(
        ".prizepooltable-col-team a[title]"
    )
    return a.get("title") if a else None
