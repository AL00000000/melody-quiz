import json, sys
sys.path.insert(0,"tools")
from make_clips import download
d=json.load(open("tools/sources_resolved.json",encoding="utf-8"))
for k,v in d.items():
    p=download(v["url"]); print(k, p.rsplit("\\",1)[-1][:60], flush=True)
