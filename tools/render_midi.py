"""MIDIファイルを簡易ピアノ風の合成音でWAVに書き出す（録音が無い曲のフォールバック）。
音符は楽譜由来のMIDIデータそのもので、推測で音を補わない。
使い方: python tools/render_midi.py in.mid out.wav"""
import sys, wave, numpy as np, mido
SR = 44100
def render(path, out):
    mid = mido.MidiFile(path)
    notes, on, t = [], {}, 0.0
    for msg in mid:  # 再生順（テンポ変化込みの秒）
        t += msg.time
        if msg.type == "note_on" and msg.velocity > 0:
            on[(msg.channel, msg.note)] = (t, msg.velocity)
        elif msg.type in ("note_off", "note_on"):
            k = (msg.channel, msg.note)
            if k in on:
                s, v = on.pop(k); notes.append((s, t, msg.note, v))
    end = max(n[1] for n in notes) + 2
    buf = np.zeros(int(end * SR) + SR, dtype=np.float64)
    for s, e, n, v in notes:
        f = 440 * 2 ** ((n - 69) / 12)
        dur = max(e - s, 0.08) + 0.4
        tt = np.arange(int(dur * SR)) / SR
        decay = np.exp(-tt * (1.2 + n / 40))
        tone = sum(a * np.sin(2 * np.pi * f * h * tt) for h, a in ((1, 1), (2, .45), (3, .2), (4, .1)))
        env = decay * np.minimum(1, tt / 0.005)
        rel = np.ones_like(tt); k = int((e - s) * SR)
        if k < len(tt): rel[k:] = np.exp(-(tt[k:] - tt[k]) * 12)
        i = int(s * SR); seg = tone * env * rel * (v / 127)
        buf[i:i + len(seg)] += seg
    buf /= np.abs(buf).max() * 1.1
    with wave.open(out, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((buf * 32767).astype(np.int16).tobytes())
if __name__ == "__main__":
    render(sys.argv[1], sys.argv[2])
