"""公開用ビルド: dist/ に personal_only の曲と local_audio/ を含めないコピーを作る。
使い方: python tools/build_public.py [--keep-local-only]
  既定では「音源未同梱(local)」の曲も songs.json から外す（公開サイトでは出題できないため）。"""
import json, os, shutil, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.path.join(ROOT, "dist")
keep_local = "--keep-local-only" in sys.argv
shutil.rmtree(DIST, ignore_errors=True)
os.makedirs(os.path.join(DIST, "audio"))
for f in ("index.html", "app.js", "style.css"):
    shutil.copy(os.path.join(ROOT, f), DIST)
db = json.load(open(os.path.join(ROOT, "songs.json"), encoding="utf-8"))
out = []
for s in db["songs"]:
    if s.get("personal_only"):
        continue
    if s["audio"]["type"] == "local" and not keep_local:
        continue
    if s["audio"]["type"] == "file":
        shutil.copy(os.path.join(ROOT, s["audio"]["src"]), os.path.join(DIST, "audio"))
    out.append(s)
db["songs"] = out
json.dump(db, open(os.path.join(DIST, "songs.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(f"dist/ に {len(out)} 曲を出力（personal_only を除外）")
