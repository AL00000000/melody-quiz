import json, sys, os, urllib.parse
d=json.load(open("tools/sources_resolved.json",encoding="utf-8"))
u=d[sys.argv[1]]["url"].split("?")[0]
n="".join(c for c in urllib.parse.unquote(u.rsplit("/",1)[-1]) if c not in '"<>:|?*')
print(os.path.join("tools","cache",n))
