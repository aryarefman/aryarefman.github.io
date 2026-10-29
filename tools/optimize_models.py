"""Make downloaded Sketchfab glTF models web-ready, in place.

- converts KHR_materials_pbrSpecularGlossiness materials (no longer read by three.js) to metallic-roughness:
  the diffuse map becomes the base colour, gloss becomes roughness
- resizes every texture (default max 1024 px; per-model overrides below) and stores opaque images as JPEG
- deletes texture files no material uses any more

Usage:  python tools/optimize_models.py [model ...]     (default: every folder in models/sketchfab)
"""
import json
import os
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent / "models" / "sketchfab"
MAX = {"pirate_ship": 512, "coral": 512}
NORMAL_MAX = 512


def optimise(folder: Path):
    gpath = folder / "scene.gltf"
    g = json.loads(gpath.read_text(encoding="utf8"))
    # 1. spec-gloss → metal-rough
    for m in g.get("materials", []):
        sg = m.get("extensions", {}).pop("KHR_materials_pbrSpecularGlossiness", None)
        if sg is None:
            continue
        pmr = m.setdefault("pbrMetallicRoughness", {})
        if "diffuseTexture" in sg:
            pmr["baseColorTexture"] = sg["diffuseTexture"]
        if "diffuseFactor" in sg:
            pmr["baseColorFactor"] = sg["diffuseFactor"]
        pmr["metallicFactor"] = 0.0
        pmr["roughnessFactor"] = round(1.0 - float(sg.get("glossinessFactor", 0.4)) * 0.6, 3)
        pmr.pop("metallicRoughnessTexture", None)
        if not m["extensions"]:
            m.pop("extensions")
    for key in ("extensionsUsed", "extensionsRequired"):
        if key in g:
            g[key] = [e for e in g[key] if e != "KHR_materials_pbrSpecularGlossiness"]
            if not g[key]:
                g.pop(key)
    # 2. which images are still used, and how (normal maps can be smaller)
    used, normal = set(), set()
    def tex_image(ti):
        return g["textures"][ti["index"]].get("source")
    for m in g.get("materials", []):
        pmr = m.get("pbrMetallicRoughness", {})
        for k in ("baseColorTexture", "metallicRoughnessTexture"):
            if k in pmr:
                used.add(tex_image(pmr[k]))
        for k in ("normalTexture", "occlusionTexture", "emissiveTexture"):
            if k in m:
                used.add(tex_image(m[k]))
                if k == "normalTexture":
                    normal.add(tex_image(m[k]))
    limit = MAX.get(folder.name, 1024)
    # 3. resize / re-encode used images, delete unused files
    for i, img in enumerate(g.get("images", [])):
        uri = img.get("uri")
        if not uri:
            continue
        path = folder / uri
        if i not in used:
            if path.exists():
                path.unlink()
            continue
        if not path.exists():
            continue
        im = Image.open(path)
        cap = min(limit, NORMAL_MAX) if i in normal else limit
        if max(im.size) > cap:
            im = im.resize((cap, cap) if im.width == im.height else (cap, round(im.height * cap / im.width)), Image.LANCZOS)
        alpha = im.mode in ("RGBA", "LA") and im.getchannel("A").getextrema()[0] < 250
        new = path.with_suffix(".png" if alpha else ".jpg")
        if alpha:
            im.save(new, optimize=True)
        else:
            im.convert("RGB").save(new, quality=82, optimize=True, progressive=True)
        if new != path and path.exists():
            path.unlink()
        img["uri"] = os.path.relpath(new, folder).replace("\\", "/")
        img["mimeType"] = "image/png" if alpha else "image/jpeg"
    gpath.write_text(json.dumps(g, separators=(",", ":")), encoding="utf8")
    size = sum(p.stat().st_size for p in folder.rglob("*") if p.is_file())
    print(f"{folder.name}: {size / 1e6:.1f} MB")


if __name__ == "__main__":
    names = sys.argv[1:] or sorted(p.name for p in ROOT.iterdir() if p.is_dir())
    for n in names:
        optimise(ROOT / n)
