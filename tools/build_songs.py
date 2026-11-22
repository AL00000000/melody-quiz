"""song_meta.py + sources_resolved.json から songs.json を生成する（初回用）。
曲頭から始まる曲は先頭の無音を自動で飛ばす。"""
import json, subprocess, sys, numpy as np
sys.path.insert(0, "tools")
from song_meta import M
from make_clips import download
R = json.load(open("tools/sources_resolved.json", encoding="utf-8"))

# (開始秒, 確認状況)  trace=音高推定で旋律を照合済み / needs_ear=音量推移と曲の構成から推定（要耳確認）
START = {
 "tengoku": (14.0, "needs_ear"), "ieji": (34.5, "trace"), "shinsekai4": (9.5, "needs_ear"),
 "ifudoudou": (80.0, "needs_ear"), "tell": (455.0, "needs_ear"), "danube": (0, "trace"),
 "canon": (8.0, "needs_ear"), "hanawaltz": (85.0, "needs_ear"), "jupiter": (185.0, "trace"),
 "valkyrie": (20.0, "needs_ear"), "hakucho": (5.0, "beginning"), "otome": (0, "needs_ear"),
}
PERF = {
 "eine": "Musopen（演奏者名の記載なし）", "tengoku": "Musopen（演奏者名の記載なし）", "ieji": "Musopen（演奏者名の記載なし）",
 "shinsekai4": "Musopen（演奏者名の記載なし）", "ifudoudou": "アメリカ海兵隊軍楽隊",
 "tell": "アメリカ海兵隊軍楽隊（吹奏楽編曲: Wenzel Sedlak）", "unmei": "フルダ交響楽団（指揮: Simon Schindler）",
 "kanki": "Mutopia Project の MIDI を変換した合成音（Raul654）", "elise": "Jason M. C. Han（ピアノ）",
 "turkish": "Mutopia Project の MIDI を変換した合成音", "radetzky": "アメリカ海兵隊軍楽隊（指揮: John R. Bourgeois）",
 "gsen": "アメリカ空軍バンド エアフォース・ストリングス", "jesu": "Orchestra Gli Armonici",
 "toccata": "Ashtar Moïra（オルガン）", "canon": "Mathsci（Mutopia の楽譜データから作成した音源）",
 "haru": "John Harrison（ヴァイオリン）", "swanlake": "歴史的録音（HMV／CHARM所蔵）",
 "hanawaltz": "アメリカ空軍バンド コンサートバンド（吹奏楽編曲: Lawrence Odom）",
 "konpeito": "Free Classical Music on YouTube（演奏者名の記載なし）",
 "hungarian5": "Lệ Xuân, Leyla Hadžihalilović（ピアノ連弾）", "wedding": "European Archive",
 "bumblebee": "アメリカ空軍バンド ストローリング・ストリングス", "asa": "Musopen Symphony Orchestra",
 "maou": "チェコ国立交響楽団（Musopen Symphony Orchestra 名義）",
 "jupiter": "アメリカ空軍 ヘリテージ・オブ・アメリカ・バンド（吹奏楽編曲）", "soutou": "アメリカ海軍バンド",
 "westminster": "Wikipit（キーニンガー社製時計の打鐘を録音）", "omocha": "アメリカ空軍 ミッドアメリカ・バンド",
 "seijouki": "アメリカ海兵隊軍楽隊", "carmen": "Musopen（演奏者名の記載なし）",
 "aida": "アメリカ海兵隊軍楽隊（指揮: Timothy Foley）の録音から抜粋", "valkyrie": "Philip Milman（制作・指揮）",
 "zarathustra": "Kevin MacLeod（incompetech.com）", "bolero": "モーリス・ラヴェル指揮（1930年録音）",
 "hakucho": "Alisa Weilerstein（チェロ）、Jason Yoder（ピアノ）", "oklahoma": "Grantyny",
 "korobeiniki": "Maxime Lorant", "hallelujah": "Oratorio Chorus（1916年録音）", "trumpetvol": "Orgelputzer（オルガン）",
 "koinu": "Olga Gurevich（ピアノ）", "fantaisie": "Muriel Nguyen Xuan（ピアノ）、録音 Stéphane Magnenat",
 "wakare": "Edward Neeman（ピアノ）", "ainoyume": "Al Goldstein collection（Pandora Music repository）",
 "gymno": "Robin Alciatore（ピアノ）", "tsukinohikari": "Laurens Goedhart（ピアノ）", "traumerei": "Musopen（演奏者名の記載なし）",
 "entertainer": "ピアノロール（自動ピアノ）による演奏", "lullaby": "stephan（オルゴール時計を録音）",
 "tchaipc1": "Musopen（演奏者名の記載なし）", "figaro": "Musopen Symphony Orchestra", "mozart40": "Musopen Symphony Orchestra",
 "czardas": "アメリカ空軍バンド（編曲: Charles Granofsky）", "hotaru": "アメリカ海兵隊軍楽隊",
 "minuet": "Morn（PLATO端末の合成音源で演奏）", "rach2": "Musopen（演奏者名の記載なし）", "campanella": "Romuald Greiss（ピアノ）",
 "gekkou": "Paul Pitman（ピアノ、Musopen）", "danube": "European Archive", "nocturne": "Peter Johnston（ピアノ）",
 "tritsch": "Orchestre Métropolitain de Rennes", "otome": "Michael Bednarek 作成の MIDI を本アプリ付属ツールで合成",
}

def first_sound(path):
    raw = subprocess.run(["ffmpeg", "-loglevel", "error", "-t", "30", "-i", path, "-ac", "1", "-ar", "8000", "-f", "f32le", "-"], capture_output=True).stdout
    x = np.frombuffer(raw, dtype=np.float32)
    n = 800
    r = np.array([np.sqrt(np.mean(x[i:i + n] ** 2)) for i in range(0, len(x) - n, n)]) + 1e-9
    db = 20 * np.log10(r / r.max())
    idx = int(np.argmax(db > -30))
    return max(0.0, round(idx * 0.1 - 0.2, 1))

songs = []
for m in M:
    s = {k: v for k, v in m.items() if k not in ("local",)}
    s.setdefault("personal_only", False)
    s["duration"] = 10
    sid = s["id"]
    if s["personal_only"] or (m.get("local") and sid not in R):
        s["audio"] = {"type": "local", "src": f"local_audio/{sid}.mp3",
                      "note": "音源は同梱していません。自分で用意した音源ファイルを置くと出題されます。"}
        s["start"] = 0; s["start_check"] = "user_file"
        songs.append(s); continue
    r = R[sid]
    is_midi = r["url"].split("?")[0].lower().endswith(".mid")
    src = download(r["url"])
    if is_midi:
        from render_midi import render
        wav = src + ".wav"
        render(src, wav); src = wav
    st, chk = START.get(sid, (None, "beginning"))
    if st is None or (chk == "beginning" and st == 0):
        st = first_sound(src)
    s["start"] = st; s["start_check"] = chk
    lic = r["license"].replace("Public Domain", "Public domain")
    s["audio"] = {
        "type": "file", "src": f"audio/{sid}.mp3",
        "source_title": r["title"].replace("File:", ""), "source_page": r["page"], "source_file_url": r["url"].split("?")[0],
        "performer": PERF.get(sid, ""), "license": lic,
        "license_url": r["license_url"] or r["page"],
        "synth": bool(is_midi), "needs_user_check": bool(is_midi),
    }
    if is_midi:
        s["audio"]["score_source"] = f"{r['title']}（{r['artist']}、{lic}）"
    songs.append(s)
    print(f"{sid:14} start={st:6.1f} {chk}", flush=True)

json.dump({"version": 1, "note": "start は元音源での開始秒数。audio.clip_start〜clip_length は tools/make_clips.py が書き込む。",
           "songs": songs}, open("songs.json", "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print(len(songs), "songs")
