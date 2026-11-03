from pathlib import Path

PIPELINE_DIR = Path(__file__).parent
REPO_DIR = PIPELINE_DIR.parent

# Liquipedia requires a User-Agent that names the project and gives a way to
# contact you. It lives in local_settings.py, which git ignores, so your contact
# info never ends up in the public repo. Copy local_settings.example.py to
# local_settings.py and fill it in.
try:
    from local_settings import USER_AGENT
except ImportError:
    USER_AGENT = ""

# Cached Liquipedia responses (ignored by git, safe to delete)
CACHE_DIR = PIPELINE_DIR / "cache"
# Re-download cached pages older than this many days (None = never)
CACHE_MAX_AGE_DAYS = 7

# Every tier 1 player and their history (committed, so admin.py works right after cloning)
DATASET_FILE = PIPELINE_DIR / "data" / "players.json"
# The answer banks the game reads (committed, deployed with the website)
OUTPUT_FILE = REPO_DIR / "client" / "public" / "data" / "dive.json"

# ---- What counts as "international" (Masters / Champions / LOCK//IN) ----
INTERNATIONAL_NAVBOXES = ["Template:VCT Masters Navbox", "Template:VCT Champions Navbox"]
EXTRA_INTERNATIONAL = ["VCT/2023/LOCK_IN_São_Paulo"]

# ---- What counts as "tier 1" ----
# On a roster (TeamCard) at an international or a franchised VCT league event.
FIRST_LEAGUE_YEAR = 2023
LEAGUE_REGIONS = ["Americas", "EMEA", "Pacific", "China"]
LEAGUE_STAGES = ["", "Kickoff", "Stage_1", "Stage_2"]  # "" = e.g. VCT/2023/Americas_League
# Other pages to count as tier 1, e.g. "VCT/2022/North_America/Stage_1/Challengers"
EXTRA_TIER1_EVENTS = []

# If an event's winner can't be read from its prize pool: {"page": "Team"}
WINNER_OVERRIDES = {}

# Port for the admin page (python pipeline/admin.py)
ADMIN_PORT = 8765
