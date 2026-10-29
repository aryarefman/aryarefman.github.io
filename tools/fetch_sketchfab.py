"""Pick and download the best free, CC-licensed Sketchfab model for each creature/prop of the portfolio.

Uses the official Sketchfab Data API v3 with the owner's personal API token (read from ~/.sketchfab_token,
never committed). For each query it searches downloadable models under CC0 / CC BY licences, scores them
(likes, views, textured, animated, a sensible polygon budget for the web) and downloads the glTF of the winner,
recording the author and licence in models/sketchfab/credits.json for attribution on the site.

Usage:  python tools/fetch_sketchfab.py [--dry-run]
"""
import json
import math
import os
import sys
import time
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "models" / "sketchfab"
TOKEN = Path.home().joinpath(".sketchfab_token").read_text(encoding="utf8").strip()
API = "https://api.sketchfab.com/v3"
UA = "aryarefman-portfolio-fetch/1.0"
LICENSES = ["cc0", "by"]           # CC0 and CC BY only: free to use with attribution

# key: (search query, max faces for the web, wants animation)
WANT = {
    "sea_turtle": ("sea turtle swimming", 60000, True),
    "dolphin": ("dolphin swimming", 40000, True),
    "humpback_whale": ("humpback whale", 80000, True),
    "whale_shark": ("whale shark", 80000, True),
    "hammerhead": ("hammerhead shark", 60000, True),
    "manta_ray": ("manta ray", 40000, True),
    "jellyfish": ("jellyfish animated", 60000, True),
    "octopus": ("octopus", 60000, True),
    "clownfish": ("clownfish", 20000, True),
    "anglerfish": ("anglerfish", 60000, False),
    "coral": ("coral reef", 120000, False),
    "seaweed": ("kelp seaweed", 60000, True),
    "pirate_ship": ("pirate ship", 150000, False),
}


def call(url, params=None):
    if params:
        url += "?" + urllib.parse.urlencode(params, doseq=True)
    req = urllib.request.Request(url, headers={"Authorization": f"Token {TOKEN}", "User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())


def score(m, max_faces, animated):
    faces = m.get("faceCount") or 0
    if faces == 0 or faces > max_faces * 3:
        return -1
    s = math.log10(1 + (m.get("likeCount") or 0)) * 3 + math.log10(1 + (m.get("viewCount") or 0))
    if animated and (m.get("animationCount") or 0) > 0:
        s += 3
    if faces > max_faces:
        s -= 2                                            # usable, but heavy for a web page
    if faces < 800:
        s -= 2                                            # too crude to look realistic
    return s


def search(query, max_faces, animated):
    res = call(f"{API}/search", {"type": "models", "q": query, "downloadable": "true", "license": LICENSES,
                                  "sort_by": "-likeCount", "count": 24})
    ranked = sorted(res.get("results", []), key=lambda m: score(m, max_faces, animated), reverse=True)
    return [m for m in ranked if score(m, max_faces, animated) > 0]


def download(uid, dest):
    info = call(f"{API}/models/{uid}/download")
    url = (info.get("gltf") or {}).get("url")
    if not url:
        return False
    dest.mkdir(parents=True, exist_ok=True)
    zpath = dest / "model.zip"
    urllib.request.urlretrieve(url, zpath)
    with zipfile.ZipFile(zpath) as z:
        z.extractall(dest)
    zpath.unlink()
    return True


def main(dry):
    OUT.mkdir(parents=True, exist_ok=True)
    credits_path = OUT / "credits.json"
    credits = json.loads(credits_path.read_text(encoding="utf8")) if credits_path.exists() else {}
    for key, (query, max_faces, animated) in WANT.items():
        try:
            picks = search(query, max_faces, animated)
        except Exception as e:  # noqa: BLE001
            print(f"{key}: search failed: {e}"); continue
        if not picks:
            print(f"{key}: nothing suitable"); continue
        best = picks[0]
        lic = (best.get("license") or {}).get("label", "?")
        line = f"{key}: {best['name']} by {best['user']['username']} · {lic} · {best.get('faceCount')} faces · {best.get('animationCount', 0)} anims · {best['viewerUrl']}"
        print(line, flush=True)
        if dry:
            continue
        if download(best["uid"], OUT / key):
            credits[key] = {"name": best["name"], "author": best["user"]["username"], "author_url": best["user"]["profileUrl"],
                            "license": lic, "url": best["viewerUrl"]}
            credits_path.write_text(json.dumps(credits, indent=2), encoding="utf8")
        time.sleep(1)


if __name__ == "__main__":
    main("--dry-run" in sys.argv)
