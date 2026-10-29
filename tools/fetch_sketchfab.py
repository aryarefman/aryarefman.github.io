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

# key: (search query, words the name/tags must contain, words that disqualify, max faces, wants animation)
WANT = {
    "sea_turtle": ("sea turtle", ["turtle"], ["cartoon", "toon", "monster", "kawaii"], 80000, True),
    "dolphin": ("dolphin", ["dolphin"], ["cartoon", "toon", "cute"], 60000, True),
    "humpback_whale": ("humpback whale", ["humpback", "whale"], ["cartoon", "toon"], 80000, True),
    "whale_shark": ("whale shark", ["whale shark", "whaleshark", "rhincodon"], ["cartoon", "toon"], 100000, True),
    "hammerhead": ("hammerhead shark", ["hammerhead"], ["cartoon", "toon"], 80000, True),
    "manta_ray": ("manta ray", ["manta"], ["cartoon", "toon"], 60000, True),
    "jellyfish": ("jellyfish", ["jellyfish", "jelly fish", "medusa"], ["cartoon", "toon", "spongebob"], 80000, True),
    "octopus": ("octopus", ["octopus"], ["cartoon", "toon", "cute", "character", "girl"], 80000, True),
    "clownfish": ("clownfish", ["clownfish", "clown fish", "amphiprion"], ["cartoon", "toon", "nemo"], 30000, True),
    "anglerfish": ("anglerfish", ["angler"], ["cartoon", "toon"], 80000, False),
    "coral": ("coral", ["coral"], ["cartoon", "toon"], 150000, False),
    "seaweed": ("kelp seaweed", ["kelp", "seaweed"], ["cartoon", "toon"], 80000, False),
    "pirate_ship": ("pirate ship", ["pirate ship", "galleon", "frigate", "brig"], ["cartoon", "toon", "kids"], 200000, False),
}
# models checked by hand during research: preferred when they are still downloadable
PREFERRED = {
    "sea_turtle": "23dcb315dea44f5082b020b04710bd31",
    "dolphin": "f4abb460956240f98b7a6f19cc3037a1",
    "humpback_whale": "f4912be9163a4f45b2480df8ccb8b2c6",
    "hammerhead": "7ff21a2134ef41a483278063f76712e4",
    "jellyfish": "a2645d543a7246b3aad9c352407f6456",
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


def relevant(m, must, never):
    text = (m.get("name", "") + " " + " ".join(t.get("name", "") for t in m.get("tags", []))).lower()
    return any(w in text for w in must) and not any(w in text for w in never)


def search(query, must, never, max_faces, animated):
    found, url, params = [], f"{API}/search", {"type": "models", "q": query, "downloadable": "true", "license": LICENSES, "count": 24}
    for _ in range(3):                                   # up to 72 results
        res = call(url, params)
        found += res.get("results", [])
        url, params = res.get("next"), None
        if not url:
            break
    ok = [m for m in found if relevant(m, must, never) and score(m, max_faces, animated) > 0]
    return sorted(ok, key=lambda m: score(m, max_faces, animated), reverse=True)


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
    for key, (query, must, never, max_faces, animated) in WANT.items():
        try:
            picks = search(query, must, never, max_faces, animated)
            if key in PREFERRED:
                try:
                    pref = call(f"{API}/models/{PREFERRED[key]}")
                    if pref.get("isDownloadable"):
                        picks = [pref] + [m for m in picks if m["uid"] != pref["uid"]]
                except Exception:  # noqa: BLE001
                    pass
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
