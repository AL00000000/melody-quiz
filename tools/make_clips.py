"""songs.json の各曲について、元音源をダウンロードして出題用クリップ(audio/<id>.mp3)を作る。

- 元ファイルは tools/cache/ に保存（git管理外）
- クリップ範囲: start の 5 秒前 〜 start + duration + 10 秒（アプリ内の開始位置チューナーで±調整できるよう余白を持たせる）
- songs.json の audio.clip_start / audio.clip_length を書き戻す
使い方:
  python tools/make_clips.py            # 足りないクリップだけ作る
  python tools/make_clips.py --force    # 全部作り直す
  python tools/make_clips.py id1 id2    # 指定の曲だけ作り直す
"""
import json, os, subprocess, sys, time, urllib.parse
import requests
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, "tools", "cache")
UA = {"User-Agent": "melody-quiz-clipper/0.1 (https://github.com/; personal non-commercial)"}
PRE, POST = 5, 10


def download(url):
    os.makedirs(CACHE, exist_ok=True)
    url = url.split("?", 1)[0]
    name = "".join(c for c in urllib.parse.unquote(url.rsplit("/", 1)[-1]) if c not in '"<>:|?*')
    path = os.path.join(CACHE, name)
    if os.path.exists(path) and os.path.getsize(path) > 0:
        return path
    for attempt in range(5):
        r = requests.get(url, headers=UA, timeout=120)
        if r.status_code == 200:
            open(path, "wb").write(r.content)
            time.sleep(3)
            return path
        time.sleep(20 * (attempt + 1))
    raise RuntimeError(f"download failed {r.status_code}: {url}")


def main(argv):
    force = "--force" in argv
    only = [a for a in argv if not a.startswith("--")]
    p = os.path.join(ROOT, "songs.json")
    db = json.load(open(p, encoding="utf-8"))
    for s in db["songs"]:
        a = s.get("audio", {})
        if s.get("personal_only") or a.get("type") != "file" or not a.get("source_file_url"):
            continue
        if only and s["id"] not in only:
            continue
        out = os.path.join(ROOT, a["src"])
        clip_start = max(0.0, float(s["start"]) - PRE)
        clip_len = float(s.get("duration", 10)) + (s["start"] - clip_start) + POST
        if os.path.exists(out) and not force and not only and a.get("clip_start") == clip_start:
            continue
        src = download(a["source_file_url"])
        if src.lower().endswith(".mid"):  # 録音が無くMIDIしか無い曲は合成してから切り出す
            from render_midi import render
            if not os.path.exists(src + ".wav"):
                render(src, src + ".wav")
            src = src + ".wav"
        os.makedirs(os.path.dirname(out), exist_ok=True)
        cmd = ["ffmpeg", "-y", "-loglevel", "error", "-ss", f"{clip_start:.2f}", "-t", f"{clip_len:.2f}",
               "-i", src, "-ac", "1", "-ar", "44100", "-b:a", "96k",
               "-af", "afade=t=in:d=0.3,loudnorm=I=-16:TP=-1.5:LRA=11", out]
        subprocess.run(cmd, check=True)
        real = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", out],
                                    capture_output=True, text=True).stdout.strip() or clip_len)
        a["clip_start"] = round(clip_start, 2)
        a["clip_length"] = round(min(clip_len, real), 2)
        print(f"ok  {s['id']:24} {clip_start:7.1f}s +{clip_len:.0f}s  <- {os.path.basename(src)}")
    json.dump(db, open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=2)


if __name__ == "__main__":
    main(sys.argv[1:])
