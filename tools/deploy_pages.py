"""公開用ビルド(dist/)を作り、gh-pages ブランチに push する（GitHub Pages はこのブランチから配信）。
使い方: python tools/deploy_pages.py"""
import os, shutil, subprocess, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.path.join(ROOT, "dist")
run = lambda *a, **k: subprocess.run(a, check=True, **k)
run(sys.executable, os.path.join(ROOT, "tools", "build_public.py"))
remote = subprocess.run(["git", "-C", ROOT, "remote", "get-url", "origin"], capture_output=True, text=True, check=True).stdout.strip()
shutil.rmtree(os.path.join(DIST, ".git"), ignore_errors=True)
open(os.path.join(DIST, ".nojekyll"), "w").close()
run("git", "init", "-q", "-b", "gh-pages", cwd=DIST)
run("git", "add", "-A", cwd=DIST)
run("git", "commit", "-q", "-m", "Deploy public build", cwd=DIST)
run("git", "push", "-q", "-f", remote, "gh-pages", cwd=DIST)
print("pushed gh-pages")
