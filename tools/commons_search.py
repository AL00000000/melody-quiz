"""Wikimedia Commons で音源を検索し、ライセンス・演奏者・長さを一覧表示する。
使い方: python tools/commons_search.py "検索語" [件数]"""
import sys, json, re, time, requests
UA = {"User-Agent": "melody-quiz-research/0.1 (personal non-commercial)"}
API = "https://commons.wikimedia.org/w/api.php"
def search(q, n=12):
    for attempt in range(5):
      r = requests.get(API, params={"action":"query","format":"json","generator":"search",
        "gsrsearch": f"{q} filetype:audio","gsrnamespace":6,"gsrlimit":n,
        "prop":"imageinfo","iiprop":"url|extmetadata|mediatype|size|mime"}, headers=UA, timeout=30)
      if r.status_code==200 and r.text.startswith('{'): break
      time.sleep(5*(attempt+1))
    time.sleep(1.5)
    pages = r.json().get("query",{}).get("pages",{})
    out=[]
    for p in sorted(pages.values(), key=lambda x:x.get("index",0)):
        ii=p["imageinfo"][0]; m=ii.get("extmetadata",{})
        g=lambda k: re.sub("<[^>]+>","",m.get(k,{}).get("value",""))[:80]
        out.append(dict(title=p["title"],lic=g("LicenseShortName"),artist=g("Artist"),
             dur=ii.get("duration") or 0, size=ii.get("size"), url=ii["url"]))
    return out
if __name__=="__main__":
    for o in search(sys.argv[1], int(sys.argv[2]) if len(sys.argv)>2 else 12):
        print(f"{o['lic'][:14]:14} {float(o['dur'] or 0):6.0f}s | {o['title'][5:85]} | {o['artist'][:40]}")
