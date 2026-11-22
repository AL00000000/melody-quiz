"""曲ID → (検索語, ファイル名に含まれる文字列) から Commons のファイルを特定し、詳細メタデータを tools/sources_resolved.json に保存"""
import json, re, sys, time, requests
sys.path.insert(0, "tools")
from commons_search import search, UA, API
PICK = json.load(open("tools/sources_pick.json", encoding="utf-8"))
import os
out = json.load(open("tools/sources_resolved.json",encoding="utf-8")) if os.path.exists("tools/sources_resolved.json") else {}
ONLY = sys.argv[1:]
def detail(title):
    for a in range(5):
        r = requests.get(API, params={"action":"query","format":"json","titles":title,"prop":"imageinfo",
            "iiprop":"url|extmetadata|size|mime","iiextmetadatalanguage":"en"}, headers=UA, timeout=30)
        if r.ok and r.text.startswith("{"): break
        time.sleep(5*(a+1))
    time.sleep(1)
    p = list(r.json()["query"]["pages"].values())[0]
    ii = p["imageinfo"][0]; m = ii["extmetadata"]
    g = lambda k: re.sub(r"\s+"," ",re.sub("<[^>]+>","",m.get(k,{}).get("value",""))).strip()
    return dict(title=p["title"], url=ii["url"], page=ii["descriptionurl"], duration=ii.get("duration"),
        license=g("LicenseShortName"), license_url=m.get("LicenseUrl",{}).get("value",""),
        artist=g("Artist")[:300], credit=g("Credit")[:200], desc=g("ImageDescription")[:400],
        usage=g("UsageTerms")[:120], attribution=g("Attribution")[:200], copyrighted=g("Copyrighted"))
for sid, (q, sub) in PICK.items():
    if ONLY and sid not in ONLY: continue
    hits = [h for h in search(q, 15) if sub.lower() in h["title"].lower()]
    if not hits: print("NOT FOUND", sid, q, sub); continue
    d = detail(hits[0]["title"]); out[sid] = d
    print(f"{sid:12} {d['license'][:14]:14} {float(d['duration'] or 0):5.0f}s {d['title'][5:70]} | {d['artist'][:60]}")
json.dump(out, open("tools/sources_resolved.json","w",encoding="utf-8"), ensure_ascii=False, indent=1)
