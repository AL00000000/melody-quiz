/* あの曲なんだっけ？クイズ — 静的Webアプリ（ビルド不要） */
"use strict";

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

const STORE_KEY = "mq_stats_v1";
const TUNE_KEY = "mq_tune_v1";
const SETTINGS_KEY = "mq_settings_v1";

// キーボードショートカット：4択は左手ホームポジション、再生と次へは右手の隣り合ったキー
const CHOICE_KEYS = ["a", "s", "d", "f"];
const KEY_PLAY = "j", KEY_NEXT = "k", KEY_EXCLUDE = "l";
const EXCL_KEY = "mq_excluded_v1";

const MODE_PROMPT = {
  title: "この曲の曲名は？",
  composer: "この曲の作曲者は？",
  scene: "この曲、どこで聞く曲？",
};

let DB = { songs: [] };       // songs.json の中身
let available = new Set();    // 再生可能な曲ID
let game = null;              // 進行中のゲーム

/* ---------- localStorage（必ず try/catch） ---------- */
function loadJSON(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch (e) {
    console.warn("localStorage 読み込み失敗", key, e);
    return fallback;
  }
}
function saveJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    console.warn("localStorage 書き込み失敗", key, e);
    return false;
  }
}
const getStats = () => loadJSON(STORE_KEY, { games: [], perSong: {} });
const getTune = () => loadJSON(TUNE_KEY, {});

/* ---------- 小道具 ---------- */
function shuffle(a) {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function show(id) {
  $$(".screen").forEach(s => s.classList.toggle("active", s.id === "screen-" + id));
  window.scrollTo(0, 0);
  if (id === "home") refreshHome();
  if (id === "stats") renderStats();
  if (id === "credits") renderCredits();
  if (id !== "quiz") stopAudio();
}
const songById = id => DB.songs.find(s => s.id === id);
const startOf = s => {
  const t = getTune();
  return typeof t[s.id] === "number" ? t[s.id] : (s.start || 0);
};

/* ---------- 読み込み ---------- */
async function init() {
  try {
    const res = await fetch("songs.json", { cache: "no-cache" });
    DB = await res.json();
  } catch (e) {
    $("#pool-info").textContent = "songs.json を読み込めませんでした。ローカルで開く場合は簡易サーバー経由で開いてください（README参照）。";
    return;
  }
  // 再生できる曲を判定。personal_only は local_audio/ にファイルがある時だけ使う
  await Promise.all(DB.songs.map(async s => {
    if (s.audio?.type === "synth") { available.add(s.id); return; }
    if (!s.audio?.src) return;
    if (s.audio.type !== "local") { available.add(s.id); return; }
    try {
      const r = await fetch(s.audio.src, { method: "HEAD", cache: "no-cache" });
      if (r.ok) available.add(s.id);
    } catch (_) { /* 無ければ出題しない */ }
  }));

  const genres = [...new Set(DB.songs.map(s => s.genre).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ja"));
  const gsel = $("#set-genre");
  genres.forEach(g => gsel.insertAdjacentHTML("beforeend", `<option value="${esc(g)}">${esc(g)}</option>`));

  const st = loadJSON(SETTINGS_KEY, null);
  if (st) {
    $("#set-mode").value = st.mode || "title";
    $("#set-diff").value = String(st.diff || 10);
    $("#set-count").value = st.count || 10;
    $("#set-genre").value = st.genre || "";
    $("#set-personal").checked = !!st.personal;
  }
  refreshHome();
}

/* ---------- ホーム／設定 ---------- */
function readSettings() {
  return {
    mode: $("#set-mode").value,
    diff: Number($("#set-diff").value),
    count: Math.max(1, Math.min(100, Number($("#set-count").value) || 10)),
    genre: $("#set-genre").value,
    personal: $("#set-personal").checked,
  };
}
// 「聞いたことがない曲」を出題から外すリスト（端末ごとに保存）
const getExcluded = () => new Set(loadJSON(EXCL_KEY, []));
function setExcluded(id, on) {
  const ex = getExcluded();
  on ? ex.add(id) : ex.delete(id);
  saveJSON(EXCL_KEY, [...ex]);
}
function poolFor(st) {
  const ex = getExcluded();
  return DB.songs.filter(s =>
    available.has(s.id) && !ex.has(s.id) &&
    (st.personal || !s.personal_only) &&
    (!st.genre || s.genre === st.genre) &&
    (st.mode !== "scene" || (s.scenes && s.scenes.length)));
}
function wrongIds() {
  const per = getStats().perSong;
  const ex = getExcluded();
  return Object.keys(per).filter(id => per[id].last === false && available.has(id) && !ex.has(id));
}
function renderExcludedList() {
  const ids = [...getExcluded()].filter(id => songById(id));
  $("#excluded-count").textContent = ids.length;
  $("#excluded-box").classList.toggle("hidden", ids.length === 0);
  $("#excluded-list").innerHTML = ids.map(id => {
    const s = songById(id);
    return `<li><span>${esc(s.title)} <span class="muted small">／${esc(s.composer_short)}</span></span>
      <button type="button" class="secondary small" data-restore="${esc(id)}">戻す</button></li>`;
  }).join("");
}
function refreshHome() {
  const st = readSettings();
  const pool = poolFor(st);
  const personalCount = DB.songs.filter(s => s.personal_only && available.has(s.id)).length;
  $("#pool-info").textContent =
    `出題できる曲：${pool.length}曲（全${DB.songs.filter(s => !s.personal_only).length}曲＋個人用 ${personalCount}曲を検出${getExcluded().size ? `、除外中 ${getExcluded().size}曲` : ""}）` +
    (pool.length < st.count ? `／問題数は${pool.length}問になります` : "");
  $("#btn-start").disabled = pool.length < 1;
  const w = wrongIds().length;
  $("#review-count").textContent = w;
  $("#btn-review").disabled = w === 0;
  $("#btn-review2").disabled = w === 0;
  renderExcludedList();
}

// Enter で次の入力項目へ。最後の項目ならスタートボタンへ
document.addEventListener("keydown", e => {
  const el = e.target;
  if (e.key !== "Enter" || !el.matches("[data-enter-next]") || e.isComposing) return;
  e.preventDefault();
  const fields = $$("[data-enter-next]", el.form || document).filter(f => f.offsetParent !== null && !f.disabled);
  const i = fields.indexOf(el);
  const next = fields[i + 1] || $("#btn-start");
  next.focus();
  if (next.select && next.type === "number") next.select();
});

/* ---------- 選択肢づくり ---------- */
function similarity(a, b) {
  let sc = 0;
  if (a.composer === b.composer) sc += 3;
  if (a.era === b.era) sc += 2;
  if (a.genre === b.genre) sc += 2;
  const sa = new Set([...(a.scenes || []), ...(a.tags || [])]);
  sc += Math.min(3, [...(b.scenes || []), ...(b.tags || [])].filter(x => sa.has(x)).length);
  return sc;
}
// ハズレは「似ている曲」を優先しつつ、毎回同じにならないよう少し揺らす
function pickSimilar(answer, candidates, keyFn, n) {
  const ansKey = keyFn(answer);
  const scored = candidates
    .filter(c => c.id !== answer.id)
    .map(c => ({ c, k: keyFn(c), sc: similarity(answer, c) + Math.random() * 2.5 }))
    .filter(x => x.k && x.k !== ansKey)
    .sort((x, y) => y.sc - x.sc);
  const out = [], seen = new Set([ansKey]);
  for (const x of scored) {
    if (seen.has(x.k)) continue;
    seen.add(x.k); out.push(x.k);
    if (out.length === n) break;
  }
  return out;
}
function buildChoices(song, mode, personal) {
  const universe = DB.songs.filter(s => personal || !s.personal_only);
  if (mode === "title") {
    const wrong = pickSimilar(song, universe, s => s.title, 3);
    return { answer: song.title, options: shuffle([song.title, ...wrong]) };
  }
  if (mode === "composer") {
    const wrong = pickSimilar(song, universe, s => s.composer_short, 3);
    return { answer: song.composer_short, options: shuffle([song.composer_short, ...wrong]) };
  }
  // scene：その曲が使われる場面は全部正解扱いにならないよう、他曲の場面から重複しないものを選ぶ
  const answer = song.scenes[0];
  const own = new Set(song.scenes);
  const sceneSongs = universe.filter(s => s.scenes && s.scenes.length);
  const scored = sceneSongs
    .filter(s => s.id !== song.id)
    .flatMap(s => s.scenes.map(sc => ({ sc, w: similarity(song, s) + Math.random() * 3 })))
    .filter(x => !own.has(x.sc))
    .sort((a, b) => b.w - a.w);
  const wrong = [];
  for (const x of scored) { if (!wrong.includes(x.sc)) wrong.push(x.sc); if (wrong.length === 3) break; }
  return { answer, options: shuffle([answer, ...wrong]) };
}

/* ---------- ゲーム進行 ---------- */
function startGame(review = false) {
  const st = readSettings();
  saveJSON(SETTINGS_KEY, st);
  let pool;
  if (review) {
    pool = wrongIds().map(songById).filter(Boolean)
      .filter(s => st.mode !== "scene" || (s.scenes && s.scenes.length));
    if (!pool.length) { alert("この出題形式で復習できる曲がありません"); return; }
  } else {
    pool = poolFor(st);
  }
  const songs = shuffle(pool).slice(0, review ? pool.length : st.count); // 同一ゲーム内で重複なし
  game = {
    st, review, idx: 0, score: 0,
    questions: songs.map(s => ({ song: s, ...buildChoices(s, st.mode, st.personal) })),
    log: [],
  };
  show("quiz");
  renderQuestion();
}

function renderQuestion() {
  const q = game.questions[game.idx];
  const n = game.questions.length;
  $("#q-progress").textContent = `${game.idx + 1} / ${n}` + (game.review ? "（復習）" : "");
  $("#q-score").textContent = `正解 ${game.score}`;
  $("#q-bar").style.width = `${(game.idx / n) * 100}%`;
  $("#q-prompt").textContent = MODE_PROMPT[game.st.mode];
  $("#explain").classList.add("hidden");
  $("#btn-next").classList.add("hidden");
  $("#play-meter").style.width = "0";
  setPlayLabel(false, false);
  const box = $("#choices");
  box.innerHTML = "";
  q.options.forEach((opt, i) => {
    const b = document.createElement("button");
    b.className = "choice";
    b.dataset.opt = opt;
    b.innerHTML = `<kbd>${CHOICE_KEYS[i].toUpperCase()}</kbd>${esc(opt)}`;
    b.addEventListener("click", () => answer(opt, b));
    box.appendChild(b);
  });
  prepareAudio(q.song);
}

function answer(opt, btn) {
  const q = game.questions[game.idx];
  if (q.done) return;
  q.done = true;
  const ok = opt === q.answer;
  if (ok) game.score++;
  $$(".choice").forEach(b => {
    b.disabled = true;
    if (b.dataset.opt === q.answer) b.classList.add("correct");
  });
  if (!ok) btn.classList.add("wrong");
  stopAudio();      // 曲を止めて効果音をはっきり聞かせる（「もう一度聴く」で再生できる）
  playEffect(ok);
  game.log.push({ id: q.song.id, ok, picked: opt });
  recordResult(q.song.id, ok);
  $("#q-score").textContent = `正解 ${game.score}`;
  renderExplain(q.song, ok);
  $("#btn-next .label").textContent = game.idx + 1 < game.questions.length ? "次へ ▶▶" : "結果を見る";
  $("#btn-next").classList.remove("hidden");
}

function renderExplain(s, ok) {
  const a = s.audio || {};
  $("#explain").innerHTML = `
    <div class="verdict ${ok ? "ok" : "ng"}">${ok ? "◯ 正解！" : "✕ ざんねん"}</div>
    <h3>${esc(s.title)}</h3>
    <div class="muted">${esc(s.title_full || "")}</div>
    <dl>
      <dt>作曲</dt><dd>${esc(s.composer)}</dd>
      <dt>作曲年</dt><dd>${esc(s.year || "不明")}</dd>
      <dt>どこで聞く</dt><dd>${(s.scenes || []).map(x => `<span class="tag">${esc(x)}</span>`).join("") || "—"}</dd>
    </dl>
    ${s.trivia ? `<p>${esc(s.trivia)}</p>` : ""}
    <p class="muted small">音源：${esc(a.performer || "")}（${esc(a.license || "")}）</p>
    <button type="button" id="btn-exclude" class="secondary small"></button>`;
  updateExcludeButton(s.id);
  $("#explain").classList.remove("hidden");
}
function updateExcludeButton(id) {
  const b = $("#btn-exclude");
  if (!b) return;
  const on = getExcluded().has(id);
  b.innerHTML = (on ? "除外を取り消す" : "聞いたことがない曲なので出題から外す") + `<kbd>${KEY_EXCLUDE.toUpperCase()}</kbd>`;
  b.classList.toggle("excluded", on);
}
function toggleExclude() {
  const q = game?.questions[game.idx];
  if (!q || !q.done) return;
  setExcluded(q.song.id, !getExcluded().has(q.song.id));
  updateExcludeButton(q.song.id);
}
document.addEventListener("click", e => { if (e.target.closest("#btn-exclude")) toggleExclude(); });

function nextQuestion() {
  stopAudio();
  game.idx++;
  if (game.idx >= game.questions.length) return finishGame();
  renderQuestion();
}

function finishGame() {
  const n = game.questions.length;
  const stats = getStats();
  stats.games.push({ at: new Date().toISOString(), mode: game.st.mode, diff: game.st.diff, n, score: game.score, review: game.review });
  stats.games = stats.games.slice(-200);
  saveJSON(STORE_KEY, stats);
  $("#r-score").textContent = `${n}問中 ${game.score}問正解`;
  $("#r-list").innerHTML = game.log.map(l => {
    const s = songById(l.id);
    return `<li><span class="mark ${l.ok ? "ok" : "ng"}">${l.ok ? "◯" : "✕"}</span>${esc(s.title)}
      <span class="muted small">／${esc(s.composer_short)}${l.ok ? "" : `（あなたの回答：${esc(l.picked)}）`}</span></li>`;
  }).join("");
  show("result");
  refreshHome();
}

function recordResult(id, ok) {
  const stats = getStats();
  const p = stats.perSong[id] || { right: 0, wrong: 0 };
  ok ? p.right++ : p.wrong++;
  p.last = ok;
  stats.perSong[id] = p;
  saveJSON(STORE_KEY, stats);
}

/* ---------- 再生 ---------- */
const audio = $("#audio");
let stopTimer = null, meterRAF = null, synthCtx = null, synthNodes = [];

function prepareAudio(song) {
  stopAudio();
  if (song.audio?.type === "synth") return;
  audio.src = song.audio.src;
  audio.load(); // 読み込みだけ。再生はユーザーのタップで開始
}
function setPlayLabel(playing, played) {
  const b = $("#btn-play");
  b.classList.toggle("playing", playing);
  $(".icon", b).textContent = playing ? "■" : (played ? "↻" : "▶");
  $(".label", b).textContent = playing ? "再生中…（タップで停止）" : (played ? "もう一度聴く" : "タップで再生");
}
function stopAudio() {
  clearTimeout(stopTimer); cancelAnimationFrame(meterRAF);
  try { audio.pause(); } catch (_) {}
  synthNodes.forEach(n => { try { n.stop(); } catch (_) {} });
  synthNodes = [];
  if (game) setPlayLabel(false, true);
}
function clipDuration(song) {
  const diff = game ? game.st.diff : 10;
  return diff >= 10 ? (song.duration || 10) : diff;
}
// song を start から dur 秒再生。onTick(0..1) で進捗
async function playSong(song, dur, onTick, onEnd, startOverride) {
  stopAudio();
  if (song.audio?.type === "synth") return playSynth(song, dur, onTick, onEnd);
  const start = startOverride ?? startOf(song);
  const offset = Math.max(0, start - (song.audio.clip_start || 0));
  if (!audio.src.endsWith(song.audio.src.replace(/^\.?\//, ""))) { audio.src = song.audio.src; }
  try {
    if (audio.readyState < 1) await new Promise((res, rej) => {
      audio.addEventListener("loadedmetadata", res, { once: true });
      audio.addEventListener("error", rej, { once: true });
      audio.load();
    });
    audio.currentTime = offset;
    audio.volume = 1;
    await audio.play();
  } catch (e) {
    console.error(e);
    $("#play-note").textContent = "再生できませんでした。もう一度タップしてください。";
    onEnd && onEnd();
    return;
  }
  const t0 = performance.now();
  const tick = () => {
    const p = Math.min(1, (performance.now() - t0) / (dur * 1000));
    onTick && onTick(p);
    if (p > 0.92) audio.volume = Math.max(0, (1 - p) / 0.08); // 最後だけフェードアウト（iOSは音量変更不可）
    if (p < 1) meterRAF = requestAnimationFrame(tick);
  };
  meterRAF = requestAnimationFrame(tick);
  stopTimer = setTimeout(() => { audio.pause(); onTick && onTick(1); onEnd && onEnd(); }, dur * 1000);
}

// 録音が見つからない曲用の簡易シンセ（notes: [["E5",1], ["R",0.5], ...] 拍単位）
const NOTE_IDX = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function noteFreq(n) {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(n);
  if (!m) return 0;
  const semi = NOTE_IDX[m[1]] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0) + (Number(m[3]) + 1) * 12;
  return 440 * Math.pow(2, (semi - 69) / 12);
}
// 正解「ピンポーン」／不正解「ブー」。Web Audio で合成（音源ファイル不要・権利問題なし）
function playEffect(ok) {
  try {
    synthCtx = synthCtx || new (window.AudioContext || window.webkitAudioContext)();
    synthCtx.resume();
    const ctx = synthCtx, t0 = ctx.currentTime + 0.02;
    const out = ctx.createGain();
    out.gain.value = 0.5;
    out.connect(ctx.destination);
    if (ok) {
      // 高い音→低い音のチャイム（E6 → C#6）
      [[1318.5, 0], [1108.7, 0.22]].forEach(([f, dt]) => {
        const t = t0 + dt;
        [[1, 0.5], [2, 0.12], [3, 0.05]].forEach(([h, a]) => {
          const o = ctx.createOscillator(), g = ctx.createGain();
          o.type = "sine"; o.frequency.value = f * h;
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(a, t + 0.008);
          g.gain.exponentialRampToValueAtTime(0.0001, t + (dt ? 1.1 : 0.5));
          o.connect(g).connect(out); o.start(t); o.stop(t + 1.2);
        });
      });
    } else {
      // 低いブザー音（わずかにずらした2本の矩形波でうなりを出す）
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass"; lp.frequency.value = 1200;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.35, t0 + 0.015);
      g.gain.setValueAtTime(0.35, t0 + 0.5);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.6);
      lp.connect(g).connect(out);
      [140, 146].forEach(f => {
        const o = ctx.createOscillator();
        o.type = "square"; o.frequency.value = f;
        o.connect(lp); o.start(t0); o.stop(t0 + 0.65);
      });
    }
  } catch (e) { console.warn("効果音を再生できませんでした", e); }
}

function playSynth(song, dur, onTick, onEnd) {
  const syn = song.audio;
  synthCtx = synthCtx || new (window.AudioContext || window.webkitAudioContext)();
  synthCtx.resume();
  const beat = 60 / (syn.bpm || 100);
  let t = synthCtx.currentTime + 0.05;
  const end = t + dur;
  for (const [n, len] of syn.notes) {
    if (t >= end) break;
    const d = len * beat;
    const f = noteFreq(n);
    if (f) {
      const o = synthCtx.createOscillator(), g = synthCtx.createGain();
      o.type = syn.wave || "triangle";
      o.frequency.value = f;
      const decay = syn.bell ? Math.max(d, 2.2) : d * 0.95;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.35, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
      o.connect(g).connect(synthCtx.destination);
      o.start(t); o.stop(t + decay + 0.05);
      synthNodes.push(o);
    }
    t += d;
  }
  const t0 = performance.now(), total = Math.min(dur, t - synthCtx.currentTime);
  const tick = () => {
    const p = Math.min(1, (performance.now() - t0) / (total * 1000));
    onTick && onTick(p);
    if (p < 1) meterRAF = requestAnimationFrame(tick);
  };
  meterRAF = requestAnimationFrame(tick);
  stopTimer = setTimeout(() => { onEnd && onEnd(); }, total * 1000);
}

$("#btn-play").addEventListener("click", () => {
  const q = game?.questions[game.idx];
  if (!q) return;
  if ($("#btn-play").classList.contains("playing")) { stopAudio(); return; }
  $("#play-note").textContent = "　";
  setPlayLabel(true, true);
  playSong(q.song, clipDuration(q.song),
    p => { $("#play-meter").style.width = `${p * 100}%`; },
    () => setPlayLabel(false, true));
});

/* ---------- 成績 ---------- */
function renderStats() {
  const st = getStats();
  const games = st.games || [];
  const total = games.reduce((a, g) => a + g.n, 0), right = games.reduce((a, g) => a + g.score, 0);
  const rows = Object.entries(st.perSong || {})
    .map(([id, p]) => ({ s: songById(id), ...p }))
    .filter(r => r.s)
    .sort((a, b) => (b.wrong - b.right) - (a.wrong - a.right));
  $("#stats-body").innerHTML = `
    <div class="card">
      <p>プレイ回数：<b>${games.length}</b>回　通算正答率：<b>${total ? Math.round(right / total * 100) : 0}%</b>（${right}/${total}）</p>
    </div>
    <h3>曲ごとの成績</h3>
    ${rows.length ? `<table><thead><tr><th>曲</th><th>正解</th><th>不正解</th><th>直近</th></tr></thead><tbody>
      ${rows.map(r => `<tr><td>${esc(r.s.title)}</td><td>${r.right}</td><td>${r.wrong}</td>
        <td class="${r.last ? "ok" : "ng"}">${r.last ? "◯" : "✕（復習対象）"}</td></tr>`).join("")}
    </tbody></table>` : `<p class="muted">まだ記録がありません</p>`}
    <h3>最近のゲーム</h3>
    <ul class="resultlist">${games.slice(-10).reverse().map(g =>
      `<li>${new Date(g.at).toLocaleString("ja-JP")}　${g.score}/${g.n}　<span class="muted small">${{ title: "曲名", composer: "作曲者", scene: "場面" }[g.mode]}・${g.diff}秒${g.review ? "・復習" : ""}</span></li>`).join("") || "<li class='muted'>なし</li>"}</ul>`;
}
$("#btn-reset-stats").addEventListener("click", () => {
  if (!confirm("成績と復習リストをすべて消します。よろしいですか？")) return;
  try { localStorage.removeItem(STORE_KEY); } catch (_) {}
  renderStats();
});

/* ---------- クレジット＆開始位置チューナー ---------- */
function renderCredits() {
  const list = DB.songs.slice().sort((a, b) => a.title.localeCompare(b.title, "ja"));
  $("#credits-body").innerHTML = list.map(s => {
    const a = s.audio || {};
    if (a.type === "local") {
      const why = s.personal_only
        ? "個人利用のみ。作曲の著作権が存続しているため音源は同梱していません。"
        : "自由ライセンスの録音・楽譜データが見つからなかったため音源は同梱していません。";
      return `<div class="credit"><b>${esc(s.title)}</b>（${esc(s.composer)}）<br>
        <span class="muted">${why}<code>${esc(a.src)}</code> に自分で用意した音源を置くと出題されます。${available.has(s.id) ? "【検出済み】" : "【未配置】"}</span></div>`;
    }
    if (a.type === "synth") {
      return `<div class="credit"><b>${esc(s.title)}</b>（${esc(s.composer)}）<br>
        Web Audio による合成音（録音ではありません）。旋律の出典：${esc(a.score_source || "")}
        ${a.needs_user_check ? '<span class="badge">要ユーザー確認</span>' : ""}</div>`;
    }
    return `<div class="credit"><b>${esc(s.title)}</b>（${esc(s.composer)}）<br>
      演奏：${esc(a.performer)}${a.synth ? '<span class="badge">合成音・要ユーザー確認</span>' : ""}<br>
      ${a.score_source ? `楽譜データ：${esc(a.score_source)}<br>` : ""}
      ライセンス：${a.license_url ? `<a href="${esc(a.license_url)}" target="_blank" rel="noopener">${esc(a.license)}</a>` : esc(a.license)}<br>
      出典：<a href="${esc(a.source_page)}" target="_blank" rel="noopener">${esc(a.source_title || a.source_page)}</a><br>
      <span class="muted small">改変：元ファイルの ${esc(a.clip_start)}秒〜${esc(Math.round(((a.clip_start || 0) + (a.clip_length || 0)) * 10) / 10)}秒を切り出し、音量を揃えて MP3 に変換${a.synth ? "（MIDIから合成した音声を切り出し）" : ""}</span></div>`;
  }).join("");

  const tune = getTune();
  $("#tuner-body").innerHTML = list.filter(s => available.has(s.id) && s.audio?.type === "file").map(s => `
    <div class="tuner" data-id="${esc(s.id)}">
      <span class="name">${esc(s.title)} ${s.start_check === "needs_ear" ? '<span class="badge">要耳確認</span>' : ""}${s.personal_only ? '<span class="badge">個人用</span>' : ""}</span>
      <button data-d="-0.5">−0.5</button>
      <span class="val">${(typeof tune[s.id] === "number" ? tune[s.id] : s.start).toFixed(1)}秒</span>
      <button data-d="0.5">＋0.5</button>
      <button data-play>▶ 10秒</button>
    </div>`).join("");
}
$("#tuner-body").addEventListener("click", e => {
  const row = e.target.closest(".tuner");
  if (!row) return;
  const s = songById(row.dataset.id);
  const tune = getTune();
  let v = typeof tune[s.id] === "number" ? tune[s.id] : s.start;
  if (e.target.dataset.d) {
    const lo = s.audio.clip_start || 0, hi = lo + (s.audio.clip_length || 9999) - 3;
    v = Math.min(hi, Math.max(lo, Math.round((v + Number(e.target.dataset.d)) * 10) / 10));
    tune[s.id] = v;
    saveJSON(TUNE_KEY, tune);
    $(".val", row).textContent = v.toFixed(1) + "秒";
  }
  if (e.target.matches("[data-play]")) {
    audio.src = s.audio.src;
    playSong(s, 10, null, null, v);
  }
});
$("#btn-export-tune").addEventListener("click", () => {
  const tune = getTune();
  const out = $("#tune-out");
  out.value = Object.keys(tune).length
    ? JSON.stringify(tune, null, 2) + "\n\n// tools/apply_tune.py にこのJSONを渡すと songs.json の start を更新し、クリップを作り直します"
    : "調整した曲はまだありません";
  out.classList.remove("hidden");
  out.select();
});

/* ---------- 画面遷移・キー操作 ---------- */
document.addEventListener("click", e => {
  const go = e.target.closest("[data-go]");
  if (go) { e.preventDefault(); show(go.dataset.go); }
});
$("#settings").addEventListener("submit", e => { e.preventDefault(); startGame(false); });
$("#settings").addEventListener("change", refreshHome);
$("#btn-review").addEventListener("click", () => startGame(true));
$("#btn-review2").addEventListener("click", () => startGame(true));
$("#btn-next").addEventListener("click", nextQuestion);
document.addEventListener("keydown", e => {
  if (!$("#screen-quiz").classList.contains("active") || e.target.matches?.("input,select,textarea")) return;
  if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
  const k = e.key.toLowerCase();
  const ci = CHOICE_KEYS.indexOf(k) >= 0 ? CHOICE_KEYS.indexOf(k) : (/^[1-4]$/.test(k) ? Number(k) - 1 : -1);
  const nextVisible = !$("#btn-next").classList.contains("hidden");
  if (k === KEY_PLAY || k === " ") { e.preventDefault(); $("#btn-play").click(); }
  else if (ci >= 0) { const b = $$(".choice")[ci]; b && !b.disabled && b.click(); }
  else if ((k === KEY_NEXT || k === "enter") && nextVisible) { e.preventDefault(); nextQuestion(); }
  else if (k === KEY_EXCLUDE && nextVisible) { e.preventDefault(); toggleExclude(); }
});
$("#excluded-list").addEventListener("click", e => {
  const id = e.target.closest("[data-restore]")?.dataset.restore;
  if (id) { setExcluded(id, false); refreshHome(); }
});

init();
