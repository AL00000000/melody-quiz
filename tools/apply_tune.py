"""アプリの「開始位置の調整」で書き出したJSONを songs.json に反映し、該当曲のクリップを作り直す。
使い方: python tools/apply_tune.py tune.json   （または標準入力にJSONを貼り付け）
反映した曲は start_check を "user" にする（耳で確認済み）。"""
import json, os, re, subprocess, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
text = open(sys.argv[1], encoding="utf-8").read() if len(sys.argv) > 1 else sys.stdin.read()
tune = json.loads(re.split(r"\n\s*//", text)[0])
p = os.path.join(ROOT, "songs.json")
db = json.load(open(p, encoding="utf-8"))
ids = []
for s in db["songs"]:
    if s["id"] in tune:
        s["start"] = float(tune[s["id"]]); s["start_check"] = "user"; ids.append(s["id"])
json.dump(db, open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print("updated:", ids)
if ids:
    subprocess.run([sys.executable, os.path.join(ROOT, "tools", "make_clips.py"), *ids], check=True)
