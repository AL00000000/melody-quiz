"""音源の音量推移(dB)を一定間隔で表示し、静→強の切り替わり点(候補)を出す。開始秒数の当たりを付ける補助。
使い方: python tools/profile.py <file> [step秒=2] [from秒] [to秒]"""
import subprocess, sys, numpy as np
f=sys.argv[1]; step=float(sys.argv[2]) if len(sys.argv)>2 else 2
lo=float(sys.argv[3]) if len(sys.argv)>3 else 0; hi=float(sys.argv[4]) if len(sys.argv)>4 else 1e9
sr=8000
raw=subprocess.run(["ffmpeg","-loglevel","error","-i",f,"-ac","1","-ar",str(sr),"-f","f32le","-"],capture_output=True).stdout
x=np.frombuffer(raw,dtype=np.float32)
n=int(step*sr); peak=None
rows=[]
for i in range(0,len(x)-n,n):
    t=i/sr
    if t<lo or t>hi: continue
    r=np.sqrt(np.mean(x[i:i+n]**2))+1e-9; db=20*np.log10(r); rows.append((t,db))
mx=max(d for _,d in rows)
for t,d in rows:
    bar="#"*max(0,int((d-mx+40)/1.2))
    print(f"{t:7.1f}s {d:6.1f} {bar}")
print("total", len(x)/sr)
