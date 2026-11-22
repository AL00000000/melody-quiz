"""音源の主旋律らしき音高を推定し、0.25秒ごとの音名を1秒単位の行で表示する（開始秒数の確認補助）。
使い方: python tools/melody_trace.py <file> <from秒> <to秒>
※多声部の録音では誤検出も多い。最終確認は耳で行うこと。"""
import subprocess, sys, numpy as np
f, lo, hi = sys.argv[1], float(sys.argv[2]), float(sys.argv[3])
sr = 16000
raw = subprocess.run(["ffmpeg","-loglevel","error","-ss",str(lo),"-t",str(hi-lo),"-i",f,"-ac","1","-ar",str(sr),"-f","f32le","-"],capture_output=True).stdout
x = np.frombuffer(raw, dtype=np.float32)
N, H = 4096, 2000  # 0.256s window, 0.125s hop
NAMES = ["C","C#","D","Eb","E","F","F#","G","Ab","A","Bb","B"]
win = np.hanning(N)
freqs = np.fft.rfftfreq(N, 1/sr)
# 半音ごとのビン集約 (MIDI 45..96)
midis = np.arange(int(sys.argv[4]) if len(sys.argv)>4 else 43, 97)
centers = 440*2**((midis-69)/12)
out = []
glob = np.sqrt(np.mean(x**2))+1e-9
for i in range(0, len(x)-N, H):
    fr = x[i:i+N]*win
    rms = np.sqrt(np.mean(fr**2))
    S = np.abs(np.fft.rfft(fr))
    # 各音のサリエンス = 基音+倍音(重み付き)
    sal = []
    for c in centers:
        v = 0
        for h, w in ((1,1.0),(2,0.6),(3,0.4),(4,0.25)):
            b = int(round(c*h/(sr/N)))
            if b < len(S): v += w*S[max(0,b-1):b+2].max()
        sal.append(v)
    sal = np.array(sal)
    m = midis[sal.argmax()]
    tok = "." if rms < glob*0.15 else f"{NAMES[m%12]}{m//12-1}"
    out.append(tok)
step = 8  # 8 hops = 1s
for k in range(0, len(out), step):
    print(f"{lo + k*H/sr:7.1f}s  " + " ".join(f"{t:4}" for t in out[k:k+step]))
