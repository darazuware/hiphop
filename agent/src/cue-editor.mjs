#!/usr/bin/env node
/**
 * cue-editor.mjs
 * full-cues.json をブラウザ上で微調整するローカルエディタ（依存なし・歌詞はstdoutに出さない）。
 * 波形表示・タップ同期・Undo/Redo・行の分割/結合・一括ずらし・チェック(lint)・履歴復元・
 * 再生速度・行ループ・SRT書き出し・ワンクリック再レンダーまで一気通貫。
 * 保存すると full-cues.json を上書き（assets/cue-history/ に世代バックアップ・直近10件）。
 *
 * Usage: node agent/src/cue-editor.mjs --slug lose-yourself [--port 4577]
 */
import fs from "fs";
import path from "path";
import http from "http";
import os from "os";
import { spawn, execFileSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AGENT = path.resolve(__dirname, "..");
const args = process.argv.slice(2);
const getArg = (n, d) => { const i = args.indexOf(`--${n}`); if (i !== -1) return args[i + 1]; const kv = args.find(a => a.startsWith(`--${n}=`)); return kv ? kv.split("=")[1] : d; };
const slug = getArg("slug");
if (!slug) { console.error("--slug required"); process.exit(1); }
const PORT = parseInt(getArg("port", "4577"), 10);

const assets = path.join(AGENT, slug, "assets");
const cuesPath = path.join(assets, "full-cues.json");
const audioPath = path.join(assets, "audio-full.mp3");
const coverPath = path.join(assets, "cover.jpg");
const histDir = path.join(assets, "cue-history");
for (const p of [cuesPath, audioPath]) if (!fs.existsSync(p)) { console.error(`missing: ${path.basename(p)}`); process.exit(1); }
fs.mkdirSync(histDir, { recursive: true });

let renderState = { running: false, log: "", done: false, ok: false };

function backupToHistory() {
  const ts = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 19);
  fs.copyFileSync(cuesPath, path.join(histDir, `full-cues.${ts}.json`));
  const files = fs.readdirSync(histDir).filter(f => /^full-cues\..+\.json$/.test(f)).sort();
  while (files.length > 10) fs.unlinkSync(path.join(histDir, files.shift()));
}

function toSrtTime(sec) {
  const ms = Math.max(0, Math.round(sec * 1000));
  const h = String(Math.floor(ms / 3600000)).padStart(2, "0");
  const m = String(Math.floor(ms / 60000) % 60).padStart(2, "0");
  const s = String(Math.floor(ms / 1000) % 60).padStart(2, "0");
  return `${h}:${m}:${s},${String(ms % 1000).padStart(3, "0")}`;
}
function writeSrt() {
  const cues = JSON.parse(fs.readFileSync(cuesPath, "utf-8"));
  const mk = (fn) => cues.map((c, i) => `${i + 1}\n${toSrtTime(c.start)} --> ${toSrtTime(c.end)}\n${fn(c)}\n`).join("\n");
  const out = [
    [`${slug}.dual.srt`, mk(c => `${c.eng}\n${c.jpn}`)],
    [`${slug}.en.srt`, mk(c => c.eng)],
    [`${slug}.ja.srt`, mk(c => c.jpn)],
  ];
  for (const [name, body] of out) fs.writeFileSync(path.join(assets, name), body);
  return out.map(([n]) => n);
}

function runRender() {
  if (renderState.running) return;
  renderState = { running: true, log: "", done: false, ok: false };
  const push = (s) => { renderState.log = (renderState.log + s).slice(-4000); };
  const step = (cmd, cmdArgs, cwd) => new Promise((res) => {
    const p = spawn(cmd, cmdArgs, { cwd, env: process.env });
    p.stdout.on("data", d => push(String(d).replace(/\r/g, "\n").split("\n").slice(-1)[0]));
    p.stderr.on("data", d => push(String(d).slice(-200)));
    p.on("close", (code) => res(code === 0));
  });
  (async () => {
    push("compose...\n");
    let ok = await step(process.execPath, [path.join(AGENT, "src", "gen-full-composition.mjs"), "--slug", slug], AGENT);
    if (ok) { push("\nrender...\n"); ok = await step("npx", ["hyperframes@0.6.46", "render", ".", "-o", `renders/${slug}-full.mp4`, "--fps", "30"], path.join(AGENT, slug, "full")); }
    renderState.running = false; renderState.done = true; renderState.ok = ok;
    push(ok ? "\n完了\n" : "\n失敗\n");
  })();
}

const HTML = `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes"><title>cue editor — ${slug}</title>
<style>
:root{color-scheme:dark}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
body{margin:0;background:#0d0f13;color:#e8e8ea;font:14px/1.5 -apple-system,"Hiragino Sans",sans-serif}
header{position:sticky;top:0;z-index:9;background:#12151b;border-bottom:1px solid #262b36;padding:10px 16px}
.row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
button{background:#232935;color:#e8e8ea;border:1px solid #39414f;border-radius:8px;padding:7px 12px;cursor:pointer;font-size:13px}
button:hover{background:#2e3646}
button.p{background:#ffd24a;color:#111;border-color:#ffd24a;font-weight:700}
button.warn{border-color:#7a4a3a;color:#ffb28f}
button:disabled{opacity:.4;cursor:default}
select,input.flt{background:#171b23;border:1px solid #2a3140;color:#e8e8ea;border-radius:8px;padding:6px 8px;font:inherit}
input.flt{width:150px}
#wovr{display:block;width:100%;height:44px;border-radius:8px;margin-top:8px;cursor:pointer;background:#0e1219}
#wzwrap{position:relative;margin-top:6px}
#wzoom{display:block;width:100%;height:96px;border-radius:8px;background:#0e1219;touch-action:none;cursor:crosshair}
#wzbtns{position:absolute;right:6px;top:6px;display:flex;gap:6px}
#wzbtns button{padding:2px 9px;font-size:15px;background:rgba(20,25,34,.85)}
#preview{background:linear-gradient(rgba(0,0,0,.74),rgba(0,0,0,.74)),url("cover.jpg") center/cover;border-radius:12px;padding:16px;text-align:center;margin:8px 0 0}
#pv-en{font-size:26px;font-weight:800;color:#fff;min-height:34px;text-shadow:0 2px 12px rgba(0,0,0,.7)}
#pv-jp{font-size:17px;color:#ffd24a;margin-top:6px;min-height:24px;text-shadow:0 2px 10px rgba(0,0,0,.7)}
#t{font-variant-numeric:tabular-nums;font-size:16px;color:#9fb0c8;min-width:64px}
table{border-collapse:collapse;width:100%}
td{border-bottom:1px solid #1e222b;padding:4px 6px;vertical-align:middle}
tr.on{background:#1b2230}
tr.sel td{background:#243049}
input{background:#171b23;border:1px solid #2a3140;color:#e8e8ea;border-radius:6px;padding:5px 7px;width:100%;font:inherit}
input.num{width:82px;font-variant-numeric:tabular-nums;text-align:right}
td.times{display:flex;gap:6px;width:190px}
td.acts{white-space:nowrap;width:170px}
.en input{font-weight:600}
.jp input{color:#ffd24a}
.mini{background:none;border:none;color:#8fa3bd;padding:3px 5px;font-size:15px}
.mini:hover{color:#fff;background:#2a3140}
#log{white-space:pre-wrap;color:#8fa3bd;font-size:12px;max-height:72px;overflow:auto;margin-top:4px}
kbd{background:#232935;border:1px solid #39414f;border-radius:4px;padding:1px 5px;font-size:12px}
.hint{color:#8fa3bd;font-size:12px}
.modalmask{position:fixed;inset:0;background:rgba(0,0,0,.72);z-index:20;display:none;align-items:center;justify-content:center;padding:16px}
.modalmask.on{display:flex}
.modalbox{background:#151a22;border:1px solid #2f3846;border-radius:14px;padding:18px;max-width:900px;width:100%;max-height:92vh;overflow:auto}
.modalbox h3{margin:0 0 4px;font-size:15px}
.modalbox .sub{color:#8fa3bd;font-size:12px;margin-bottom:12px}
.chips{display:flex;flex-wrap:wrap;align-items:center;gap:0;background:#0e1219;border:1px solid #262d3a;border-radius:10px;padding:10px;margin-bottom:14px}
.chip{padding:6px 3px;font-size:19px;white-space:pre}
.chips.jp .chip{font-size:20px;color:#ffd24a}
.cut{width:16px;height:34px;margin:0 -1px;border-radius:5px;cursor:pointer;position:relative;flex:none}
.cut::after{content:"";position:absolute;left:50%;top:6px;bottom:6px;width:2px;transform:translateX(-50%);background:#39414f;border-radius:2px}
.cut.ok::after{background:#4d6b8f}
.cut:hover::after{background:#8fa3bd}
.cut.on::after{background:#ffd24a;width:4px}
.cut.ng::after{background:#3a2b2b}
.pv{background:#000;border-radius:10px;padding:12px;margin-bottom:6px}
.pv .l{display:flex;gap:10px;align-items:baseline;padding:5px 0;border-bottom:1px solid #1c222c}
.pv .l:last-child{border:0}
.pv .n{color:#6b7a90;font-size:12px;width:56px;font-variant-numeric:tabular-nums}
.pv .e{color:#fff;font-weight:700}.pv .j{color:#ffd24a;font-size:13px}
.lintItem{display:flex;gap:10px;align-items:center;padding:8px 6px;border-bottom:1px solid #1e242f;cursor:pointer;border-radius:8px}
.lintItem:hover{background:#1d2431}
.lintItem .b{font-size:11px;padding:2px 8px;border-radius:99px;flex:none}
.b.err{background:#4a2626;color:#ff9d9d}.b.wrn{background:#4a3d1f;color:#ffd24a}.b.inf{background:#1f3448;color:#8fc3ff}
.histItem{display:flex;gap:10px;align-items:center;padding:8px 6px;border-bottom:1px solid #1e242f}
#bar-m{display:none}
@media (max-width:820px){
  header{padding:8px 8px}
  button{padding:11px 14px;font-size:15px}
  .mini{font-size:22px;padding:8px 10px}
  .hint{display:none}
  #pv-en{font-size:20px}#pv-jp{font-size:15px}
  body{overflow-x:hidden;padding-bottom:96px}
  table,tbody,tr,td{display:block;width:auto}
  tr{border:1px solid #232a36;border-radius:12px;margin:10px 8px;padding:8px;background:#141922}
  tr.on{background:#1d2634;border-color:#3a4a63}
  tr.sel{outline:2px solid #ffd24a}
  td{border:0;padding:3px 4px}
  td:first-child{color:#6b7a90;font-size:12px}
  td.times{display:flex;gap:8px;width:auto}
  td.acts{width:auto;display:flex;justify-content:space-between;padding-top:6px}
  input.num{width:100%;font-size:16px;padding:9px}
  input{font-size:16px;padding:9px}
  input.flt{width:110px}
  #bar-m{display:flex;position:fixed;left:0;right:0;bottom:0;z-index:15;gap:8px;padding:10px 12px calc(10px + env(safe-area-inset-bottom));background:rgba(14,17,23,.94);border-top:1px solid #2a3140;backdrop-filter:blur(10px)}
  #bar-m button{flex:1;padding:13px 0;font-size:15px}
  #mb-sync{flex:1.6;background:#ffd24a;color:#111;font-weight:800;border-color:#ffd24a}
}
</style></head><body>
<header>
  <div class="row">
    <button class="p" id="play">▶ 再生</button>
    <span id="t">0.00s</span>
    <button data-nudge="-5">◀5s</button><button data-nudge="5">5s▶</button>
    <select id="rate"><option value="1">1x</option><option value="0.75">0.75x</option><option value="0.5">0.5x</option></select>
    <label class="hint" style="font-size:13px"><input type="checkbox" id="loop" style="width:auto"> 行ループ</label>
    <button id="undo" title="元に戻す (⌘Z)">↩</button><button id="redo" title="やり直す (⌘⇧Z)">↪</button>
    <button id="lintBtn">✓ チェック</button>
    <button id="shiftBtn">⇧ ずらす</button>
    <button id="histBtn">履歴</button>
    <input class="flt" id="flt" placeholder="検索…">
    <span style="flex:1"></span>
    <button id="save" class="p">保存 (⌘S)</button>
    <button id="srt">SRT</button>
    <button id="render">再生成＋レンダー</button>
  </div>
  <canvas id="wovr"></canvas>
  <div id="wzwrap">
    <canvas id="wzoom"></canvas>
    <div id="wzbtns"><button id="zin">＋</button><button id="zout">−</button></div>
  </div>
  <div id="preview"><div id="pv-en"></div><div id="pv-jp"></div></div>
  <div class="row hint" style="margin-top:6px">
    <span><kbd>Space</kbd> 再生/停止</span><span><kbd>S</kbd> タップ同期（選択行のstart=現在位置→次行へ）</span>
    <span><kbd>↑↓</kbd> 行選択</span><span><kbd>←→</kbd> ±0.05s（Shiftで±0.2s）</span><span><kbd>Enter</kbd> 行頭から再生</span>
    <span><kbd>⌘Z</kbd> 元に戻す</span><span>波形の旗をドラッグでも調整可</span>
    <label style="margin-left:auto"><input type="checkbox" id="chain" checked style="width:auto"> endを次のstartに自動追従</label>
  </div>
  <div id="log"></div>
</header>
<table id="tb"></table>
<audio id="au" src="audio.mp3" preload="auto"></audio>
<div id="bar-m">
  <button id="mb-play">▶</button>
  <button id="mb-back">−0.05</button>
  <button id="mb-sync">● SYNC</button>
  <button id="mb-fwd">＋0.05</button>
  <button id="mb-rate">1x</button>
</div>
<div id="mask" class="modalmask"><div class="modalbox">
  <h3>行の分割</h3>
  <div class="sub">切りたい位置の｜をタップ（もう一度タップで解除）。青い｜＝語の切れ目として安全な位置。時間は文字数で自動配分し、あとから ◎ や波形で微調整できます。</div>
  <div class="chips en" id="m-en"></div>
  <div class="chips jp" id="m-jp"></div>
  <div class="pv" id="m-pv"></div>
  <div class="row" style="margin-top:12px">
    <button id="m-auto2">おまかせ2分割</button>
    <button id="m-auto3">おまかせ3分割</button>
    <button id="m-clear">解除</button>
    <span style="flex:1"></span>
    <button id="m-cancel">やめる</button>
    <button class="p" id="m-ok">分割する</button>
  </div>
</div></div>
<div id="shiftM" class="modalmask"><div class="modalbox" style="max-width:480px">
  <h3>まとめてずらす</h3>
  <div class="sub">全体が一様にズレている時に。開始・終了の両方を動かします。</div>
  <div class="row">
    <button data-sa="-0.5">−0.5</button><button data-sa="-0.2">−0.2</button><button data-sa="-0.05">−0.05</button>
    <input class="num" id="sh-amt" value="0.2" style="width:90px">
    <button data-sa="0.05">＋0.05</button><button data-sa="0.2">＋0.2</button><button data-sa="0.5">＋0.5</button>
  </div>
  <div class="row" style="margin-top:12px">
    <label><input type="radio" name="sh-scope" value="all" checked style="width:auto"> 全体</label>
    <label><input type="radio" name="sh-scope" value="after" style="width:auto"> 選択行から後ろ</label>
    <span style="flex:1"></span>
    <button id="sh-cancel">やめる</button>
    <button class="p" id="sh-ok">適用</button>
  </div>
</div></div>
<div id="lintM" class="modalmask"><div class="modalbox" style="max-width:560px">
  <h3>チェック結果</h3>
  <div class="sub">タップでその行へ移動します。</div>
  <div id="lintList"></div>
  <div class="row" style="margin-top:12px"><span style="flex:1"></span><button id="lint-close">閉じる</button></div>
</div></div>
<div id="histM" class="modalmask"><div class="modalbox" style="max-width:560px">
  <h3>保存履歴（直近10件）</h3>
  <div class="sub">保存するたびに直前の状態がここに残ります。戻すと今の状態も履歴に退避されます。</div>
  <div id="histList"></div>
  <div class="row" style="margin-top:12px"><span style="flex:1"></span><button id="hist-close">閉じる</button></div>
</div></div>
<script>
const au = document.getElementById('au');
const $ = (id) => document.getElementById(id);
let cues = [], sel = 0, dirty = false;
let hist = [], redoS = [], lastPush = { tag: '', t: 0 };
const f2 = (n) => Math.round(n*100)/100;
const log = (s) => $('log').textContent = s;
const snap = () => JSON.parse(JSON.stringify(cues));
const DRAFT_KEY = 'cue-draft-${slug}';

function pushHist(tag){
  const now = Date.now();
  if (tag && tag === lastPush.tag && now - lastPush.t < 1500) { lastPush.t = now; return; }
  hist.push(snap()); if (hist.length > 100) hist.shift();
  redoS = []; lastPush = { tag: tag || '', t: now }; updUndoBtns();
}
function undo(){ if(!hist.length) return; redoS.push(snap()); cues = hist.pop(); dirty = true; draw(); zoomDirty = true; log('元に戻しました'); updUndoBtns(); saveDraft(); }
function redoF(){ if(!redoS.length) return; hist.push(snap()); cues = redoS.pop(); dirty = true; draw(); zoomDirty = true; log('やり直しました'); updUndoBtns(); saveDraft(); }
function updUndoBtns(){ $('undo').disabled = !hist.length; $('redo').disabled = !redoS.length; }
$('undo').onclick = ()=>undo();
$('redo').onclick = ()=>redoF();

let draftT = null;
function saveDraft(){
  clearTimeout(draftT);
  draftT = setTimeout(()=>{ try{ localStorage.setItem(DRAFT_KEY, JSON.stringify({t:Date.now(),cues})); }catch(e){} }, 700);
}
function markDirty(){ dirty = true; log('未保存の変更あり'); saveDraft(); }

fetch('cues.json').then(r=>r.json()).then(c=>{
  cues = c;
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
    if (d && d.cues && JSON.stringify(d.cues) !== JSON.stringify(c)) {
      const when = new Date(d.t);
      if (confirm('未保存の下書きがあります（' + when.getHours() + ':' + String(when.getMinutes()).padStart(2,'0') + ' 時点・' + d.cues.length + 'キュー）。復元しますか？\\n「キャンセル」でサーバーの保存済み版を開きます。')) {
        cues = d.cues; dirty = true;
      } else localStorage.removeItem(DRAFT_KEY);
    }
  } catch(e){}
  draw(); stats(); updUndoBtns(); zoomDirty = true;
});
function stats(){
  if(!cues.length) return;
  const d = cues.map(x=>x.end-x.start).sort((a,b)=>a-b);
  log(cues.length + 'キュー / 表示 中央値 ' + d[d.length>>1].toFixed(2) + 's・最短 ' + d[0].toFixed(2) + 's' + (dirty ? ' / 未保存の変更あり' : ''));
}

/* ---------- 波形 ---------- */
let pcm = null, psr = 8000, ovrCv = null, ZW = 8, zoomDirty = true, lastZoomT = -1;
let dur = 0;
au.addEventListener('loadedmetadata', ()=>{ dur = au.duration; });
(function loadWave(){
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  fetch('audio.mp3').then(r=>r.arrayBuffer()).then(b=>new AC().decodeAudioData(b)).then(ab=>{
    const ch = ab.getChannelData(0);
    const stride = Math.max(1, Math.floor(ab.sampleRate/8000));
    pcm = new Float32Array(Math.floor(ch.length/stride));
    for (let i=0;i<pcm.length;i++) pcm[i] = ch[i*stride];
    psr = ab.sampleRate/stride; dur = ab.duration;
    buildOvr(); zoomDirty = true;
  }).catch(e=>{ log('波形の読み込みに失敗（編集は可能）'); });
})();
const dpr = window.devicePixelRatio || 1;
function fitCanvas(cv){ const w = cv.clientWidth, h = cv.clientHeight; if(cv.width!==w*dpr||cv.height!==h*dpr){cv.width=w*dpr;cv.height=h*dpr;} return [w,h]; }
function buildOvr(){
  const cv = $('wovr'); const [W,H] = fitCanvas(cv);
  ovrCv = document.createElement('canvas'); ovrCv.width = W*dpr; ovrCv.height = H*dpr;
  const g = ovrCv.getContext('2d'); g.scale(dpr,dpr);
  g.fillStyle = '#0e1219'; g.fillRect(0,0,W,H);
  if (!pcm) return;
  const bucket = pcm.length / W;
  g.fillStyle = '#3d5a7a';
  for (let x=0;x<W;x++){
    let mn=0,mx=0;
    const s0=Math.floor(x*bucket), s1=Math.min(pcm.length,Math.floor((x+1)*bucket));
    for (let s=s0;s<s1;s+=2){ const v=pcm[s]; if(v>mx)mx=v; if(v<mn)mn=v; }
    const y0=H/2-mx*H*0.48, y1=H/2-mn*H*0.48;
    g.fillRect(x, y0, 1, Math.max(1,y1-y0));
  }
}
function drawOvr(){
  const cv = $('wovr'); const [W,H] = fitCanvas(cv);
  const g = cv.getContext('2d'); g.setTransform(dpr,0,0,dpr,0,0);
  if (ovrCv) g.drawImage(ovrCv,0,0,W,H); else { g.fillStyle='#0e1219'; g.fillRect(0,0,W,H); }
  if (!dur) return;
  const t = au.currentTime;
  const wx0 = Math.max(0,(t-ZW/2)/dur*W), wx1 = Math.min(W,(t+ZW/2)/dur*W);
  g.fillStyle = 'rgba(255,210,74,0.12)'; g.fillRect(wx0,0,wx1-wx0,H);
  g.fillStyle = '#fff'; g.fillRect(t/dur*W-0.5,0,1.5,H);
}
function drawZoom(){
  const cv = $('wzoom'); const [W,H] = fitCanvas(cv);
  const g = cv.getContext('2d'); g.setTransform(dpr,0,0,dpr,0,0);
  g.fillStyle = '#0e1219'; g.fillRect(0,0,W,H);
  const ctr = au.currentTime, t0 = ctr - ZW/2;
  if (pcm){
    g.fillStyle = '#4d759e';
    for (let x=0;x<W;x++){
      const s0=Math.floor((t0+x/W*ZW)*psr), s1=Math.floor((t0+(x+1)/W*ZW)*psr);
      if (s1<0||s0>=pcm.length) continue;
      let mn=0,mx=0;
      for (let s=Math.max(0,s0);s<Math.min(pcm.length,s1);s++){ const v=pcm[s]; if(v>mx)mx=v; if(v<mn)mn=v; }
      const y0=H/2-mx*H*0.46, y1=H/2-mn*H*0.46;
      g.fillRect(x,y0,1,Math.max(1,y1-y0));
    }
  }
  for (let i=0;i<cues.length;i++){
    const s = cues[i].start;
    if (s<t0-0.2||s>t0+ZW+0.2) continue;
    const x = (s-t0)/ZW*W;
    g.fillStyle = i===sel ? '#ffd24a' : 'rgba(255,210,74,0.55)';
    g.fillRect(x-(i===sel?1.5:0.75),14,i===sel?3:1.5,H-14);
    g.fillStyle = i===sel ? '#ffd24a' : 'rgba(255,210,74,0.75)';
    g.beginPath(); g.moveTo(x-6,2); g.lineTo(x+6,2); g.lineTo(x,14); g.closePath(); g.fill();
    g.fillStyle = '#0d0f13'; g.font = '9px sans-serif'; g.textAlign='center';
    g.fillStyle = i===sel?'#fff':'#9fb0c8'; g.fillText(String(i+1), x, 11);
  }
  g.fillStyle = '#fff'; g.fillRect(W/2-0.75,0,1.5,H);
}
$('zin').onclick = ()=>{ ZW = Math.max(2, ZW/2); zoomDirty = true; };
$('zout').onclick = ()=>{ ZW = Math.min(32, ZW*2); zoomDirty = true; };
$('wovr').addEventListener('pointerdown', e=>{
  if (!dur) return;
  const r = e.target.getBoundingClientRect();
  au.currentTime = (e.clientX-r.left)/r.width*dur; zoomDirty = true;
});
let drag = null;
$('wzoom').addEventListener('pointerdown', e=>{
  const cv = $('wzoom'); const r = cv.getBoundingClientRect();
  const W = r.width, x = e.clientX-r.left;
  const t0 = au.currentTime - ZW/2;
  let best = -1, bd = 14;
  for (let i=0;i<cues.length;i++){
    const s = cues[i].start; if (s<t0||s>t0+ZW) continue;
    const px = (s-t0)/ZW*W, d = Math.abs(px-x);
    if (d<bd){ bd=d; best=i; }
  }
  if (best>=0){ drag = { i:best, t0, W, moved:false }; sel = best; cv.setPointerCapture(e.pointerId); paint(); }
  else drag = { seek:true, t0, W, x0:x, moved:false };
});
$('wzoom').addEventListener('pointermove', e=>{
  if (!drag || drag.seek) return;
  const r = $('wzoom').getBoundingClientRect();
  const x = e.clientX-r.left;
  if (!drag.moved){ pushHist('drag'+drag.i); drag.moved = true; }
  setStart(drag.i, Math.max(0, drag.t0 + x/drag.W*ZW));
  zoomDirty = true;
});
addEventListener('pointerup', e=>{
  if (drag && drag.seek && !drag.moved){
    au.currentTime = Math.max(0, drag.t0 + drag.x0/drag.W*ZW); zoomDirty = true;
  }
  drag = null;
});

/* ---------- テーブル ---------- */
function draw(){
  const tb = $('tb');
  tb.innerHTML = '';
  const q = ($('flt').value||'').toLowerCase();
  cues.forEach((c,i)=>{
    const tr = document.createElement('tr'); tr.id='r'+i;
    if (q && !((c.eng+' '+c.jpn).toLowerCase().includes(q))) tr.style.display='none';
    tr.innerHTML = '<td style="color:#6b7a90;width:38px">'+(i+1)+'</td>'
      + '<td class="times"><input class="num" data-k="start" data-i="'+i+'" value="'+f2(c.start)+'">'
      + '<input class="num" data-k="end" data-i="'+i+'" value="'+f2(c.end)+'"></td>'
      + '<td class="en"><input data-k="eng" data-i="'+i+'"></td>'
      + '<td class="jp"><input data-k="jpn" data-i="'+i+'"></td>'
      + '<td class="acts">'
      + '<button class="mini" data-act="play" data-i="'+i+'" title="この行から再生">▶</button>'
      + '<button class="mini" data-act="here" data-i="'+i+'" title="現在位置をstartに">◎</button>'
      + '<button class="mini" data-act="split" data-i="'+i+'" title="この行を分割">✂</button>'
      + '<button class="mini" data-act="merge" data-i="'+i+'" title="次の行と結合">⤵</button>'
      + '<button class="mini" data-act="del" data-i="'+i+'" title="行を削除">✕</button></td>';
    tb.appendChild(tr);
    tr.querySelector('[data-k=eng]').value = c.eng;
    tr.querySelector('[data-k=jpn]').value = c.jpn;
    tr.addEventListener('mousedown', ()=>{ sel=i; paint(); zoomDirty=true; });
  });
  paint();
}
$('flt').addEventListener('input', ()=>draw());
let preEdit = null;
$('tb').addEventListener('focusin', e=>{ if(e.target.dataset && e.target.dataset.k) preEdit = snap(); });
$('tb').addEventListener('change', e=>{
  if (e.target.dataset && e.target.dataset.k && preEdit){
    hist.push(preEdit); if(hist.length>100)hist.shift(); redoS=[]; preEdit=null; updUndoBtns();
  }
});
$('tb').addEventListener('input', e=>{
  const i=+e.target.dataset.i, k=e.target.dataset.k; if(k===undefined) return;
  cues[i][k] = (k==='start'||k==='end') ? parseFloat(e.target.value)||0 : e.target.value;
  markDirty(); zoomDirty = true;
});
$('tb').addEventListener('click', e=>{
  const b=e.target.closest('button[data-act]'); if(!b) return;
  const i=+b.dataset.i, a=b.dataset.act;
  if(a==='play'){ sel=i; au.currentTime=Math.max(0,cues[i].start-0.4); au.play(); zoomDirty=true; }
  if(a==='here'){ pushHist(); setStart(i, au.currentTime); }
  if(a==='merge' && i<cues.length-1){
    pushHist();
    const n=cues[i+1];
    cues[i]={eng:(cues[i].eng+' '+n.eng).trim(), jpn:(cues[i].jpn+n.jpn).trim(), start:cues[i].start, end:n.end};
    cues.splice(i+1,1); markDirty(); draw(); zoomDirty=true;
  }
  if(a==='del'){ pushHist(); cues.splice(i,1); markDirty(); draw(); zoomDirty=true; }
  if(a==='split'){ openSplit(i); }
});

/* ---------- 行の分割 ---------- */
const isKata=(c)=>/[゠-ヿ]/.test(c), isKanji=(c)=>/[一-鿿]/.test(c), isHira=(c)=>/[぀-ゟ]/.test(c), isLat=(c)=>/[A-Za-z0-9']/.test(c);
const NG_PREV="のなにはがをでとへもっーゃゅょ、・「『（【“‘", NG_NEXT="、。ーっゃゅょ！？」』）】…・”’";
function safeJp(s,b){
  if(b<=0||b>=s.length) return false;
  const p=s[b-1], q=s[b];
  if(p==='、') return true;
  if(NG_PREV.includes(p)||NG_NEXT.includes(q)) return false;
  if(isKata(p)&&isKata(q)) return false;
  if(isLat(p)&&isLat(q)) return false;
  if(isKanji(p)&&isKanji(q)) return false;
  if(isHira(q)) return false;
  return true;
}
let M={i:-1, ew:[], jc:[], ecuts:new Set(), jcuts:new Set()};
function openSplit(i){
  const c=cues[i];
  M={i, ew:c.eng.split(/\\s+/).filter(Boolean), jc:[...c.jpn], ecuts:new Set(), jcuts:new Set()};
  renderSplit(); $('mask').classList.add('on');
}
function renderSplit(){
  const en=$('m-en'), jp=$('m-jp');
  en.innerHTML=''; jp.innerHTML='';
  M.ew.forEach((w,k)=>{
    if(k>0){ const d=document.createElement('div'); d.className='cut ok'+(M.ecuts.has(k)?' on':''); d.dataset.e=k; en.appendChild(d); }
    const s=document.createElement('div'); s.className='chip'; s.textContent=w; en.appendChild(s);
  });
  const js=M.jc.join('');
  M.jc.forEach((ch,k)=>{
    if(k>0){ const ok=safeJp(js,k); const d=document.createElement('div');
      d.className='cut '+(ok?'ok':'ng')+(M.jcuts.has(k)?' on':''); d.dataset.j=k; jp.appendChild(d); }
    const s=document.createElement('div'); s.className='chip'; s.textContent=ch; jp.appendChild(s);
  });
  const parts=buildParts();
  $('m-pv').innerHTML = parts.map((p,n)=>
    '<div class="l"><div class="n">'+f2(p.start)+'s</div><div><div class="e"></div><div class="j"></div></div></div>').join('');
  const ls=document.querySelectorAll('#m-pv .l');
  parts.forEach((p,n)=>{ ls[n].querySelector('.e').textContent=p.eng; ls[n].querySelector('.j').textContent=p.jpn; });
}
function buildParts(){
  const c=cues[M.i];
  const eb=[0,...[...M.ecuts].sort((a,b)=>a-b),M.ew.length];
  const jb=[0,...[...M.jcuts].sort((a,b)=>a-b),M.jc.length];
  const K=Math.max(eb.length,jb.length)-1;
  const eng=[],jpn=[];
  for(let k=0;k<K;k++){
    eng.push(eb[k]!==undefined&&eb[k+1]!==undefined?M.ew.slice(eb[k],eb[k+1]).join(' '):'');
    jpn.push(jb[k]!==undefined&&jb[k+1]!==undefined?M.jc.slice(jb[k],jb[k+1]).join(''):'');
  }
  const tot=eng.reduce((a,x)=>a+x.length,0)||1;
  const span=Math.max(0.8,c.end-c.start);
  const out=[]; let acc=0;
  for(let k=0;k<K;k++){
    const st=c.start+span*acc/tot; acc+=eng[k].length;
    out.push({eng:eng[k],jpn:jpn[k],start:f2(st),end:f2(c.start+span*acc/tot)});
  }
  if(out.length) out[out.length-1].end=f2(c.end);
  return out;
}
function autoSplit(K){
  M.ecuts=new Set(); M.jcuts=new Set();
  const js=M.jc.join('');
  for(let k=1;k<K;k++){
    const ei=Math.round(M.ew.length*k/K); if(ei>0&&ei<M.ew.length) M.ecuts.add(ei);
    const ideal=Math.round(M.jc.length*k/K);
    let best=null;
    for(let d=0;d<=Math.max(4,Math.round(M.jc.length*0.3));d++){
      for(const q of (d===0?[ideal]:[ideal-d,ideal+d])) if(q>0&&q<M.jc.length&&safeJp(js,q)&&!M.jcuts.has(q)){ best=q; break; }
      if(best!=null) break;
    }
    if(best!=null) M.jcuts.add(best);
  }
  renderSplit();
}
$('m-en').addEventListener('click',e=>{ const d=e.target.closest('.cut'); if(!d)return;
  const k=+d.dataset.e; M.ecuts.has(k)?M.ecuts.delete(k):M.ecuts.add(k); renderSplit(); });
$('m-jp').addEventListener('click',e=>{ const d=e.target.closest('.cut'); if(!d)return;
  const k=+d.dataset.j; M.jcuts.has(k)?M.jcuts.delete(k):M.jcuts.add(k); renderSplit(); });
$('m-auto2').onclick=()=>autoSplit(2);
$('m-auto3').onclick=()=>autoSplit(3);
$('m-clear').onclick=()=>{ M.ecuts=new Set(); M.jcuts=new Set(); renderSplit(); };
$('m-cancel').onclick=()=>$('mask').classList.remove('on');
$('m-ok').onclick=()=>{
  const parts=buildParts();
  if(parts.length<2){ alert('切る位置を1つ以上えらんでください'); return; }
  pushHist();
  cues.splice(M.i,1,...parts); markDirty();
  $('mask').classList.remove('on'); draw(); zoomDirty=true;
};

/* ---------- まとめてずらす ---------- */
$('shiftBtn').onclick=()=>$('shiftM').classList.add('on');
$('sh-cancel').onclick=()=>$('shiftM').classList.remove('on');
document.querySelectorAll('[data-sa]').forEach(b=>b.onclick=()=>{ $('sh-amt').value=b.dataset.sa; });
$('sh-ok').onclick=()=>{
  const amt=parseFloat($('sh-amt').value)||0;
  if(!amt){ $('shiftM').classList.remove('on'); return; }
  const scope=document.querySelector('[name=sh-scope]:checked').value;
  const from=scope==='after'?sel:0;
  pushHist();
  for(let i=from;i<cues.length;i++){ cues[i].start=f2(Math.max(0,cues[i].start+amt)); cues[i].end=f2(Math.max(0.4,cues[i].end+amt)); }
  markDirty(); draw(); zoomDirty=true;
  $('shiftM').classList.remove('on');
  log((scope==='after'?('行'+(sel+1)+'以降'):'全体')+'を '+(amt>0?'+':'')+amt+'s ずらしました');
};

/* ---------- チェック(lint) ---------- */
function lint(){
  const out=[];
  for(let i=0;i<cues.length;i++){
    const c=cues[i], d=c.end-c.start;
    if(i>0 && c.start < cues[i-1].end-0.01) out.push({i,lv:'err',msg:'前の行と時間が重なっている'});
    if(d<0.6) out.push({i,lv:'wrn',msg:'表示が短い('+d.toFixed(2)+'s)'});
    if(i>0 && c.start-cues[i-1].end>3) out.push({i,lv:'inf',msg:'前の行との間に '+(c.start-cues[i-1].end).toFixed(1)+'s の空白'});
    if(/^[、。ーっゃゅょ]/.test(c.jpn) || /^[぀-ゟ]、/.test(c.jpn)) out.push({i,lv:'wrn',msg:'日本語が語の途中から始まっている可能性'});
    if(c.eng.split(/\\s+/).length>12) out.push({i,lv:'inf',msg:'英語が長い('+c.eng.split(/\\s+/).length+'語)・分割を検討'});
    if(!c.eng.trim()||!c.jpn.trim()) out.push({i,lv:'err',msg:'英語または日本語が空'});
  }
  return out;
}
$('lintBtn').onclick=()=>{
  const issues=lint();
  const list=$('lintList');
  if(!issues.length){ list.innerHTML='<div style="padding:14px;color:#7fd98f">問題なし ✓</div>'; }
  else {
    list.innerHTML='';
    issues.forEach(it=>{
      const d=document.createElement('div'); d.className='lintItem';
      const lb={err:'重大',wrn:'注意',inf:'情報'}[it.lv];
      d.innerHTML='<span class="b '+it.lv+'">'+lb+'</span><span style="color:#9fb0c8">行'+(it.i+1)+'</span><span></span>';
      d.lastElementChild.textContent=it.msg;
      d.onclick=()=>{ sel=it.i; $('lintM').classList.remove('on'); paint(); zoomDirty=true;
        const tr=$('r'+it.i); if(tr) tr.scrollIntoView({block:'center'}); };
      list.appendChild(d);
    });
  }
  $('lintM').classList.add('on');
};
$('lint-close').onclick=()=>$('lintM').classList.remove('on');

/* ---------- 保存履歴 ---------- */
$('histBtn').onclick=()=>{
  fetch('history').then(r=>r.json()).then(items=>{
    const list=$('histList');
    if(!items.length){ list.innerHTML='<div style="padding:14px;color:#8fa3bd">まだ履歴がありません（保存すると増えます）</div>'; }
    else {
      list.innerHTML='';
      items.forEach(it=>{
        const d=document.createElement('div'); d.className='histItem';
        d.innerHTML='<span style="flex:1">'+it.label+'</span><span style="color:#8fa3bd">'+it.count+'キュー</span><button data-f="'+it.file+'">これに戻す</button>';
        d.querySelector('button').onclick=()=>{
          if(!confirm(it.label+' の状態に戻しますか？（今の状態は履歴に退避されます）')) return;
          fetch('restore',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({file:it.file})})
            .then(r=>r.json()).then(j=>{
              if(j.cues){ pushHist(); cues=j.cues; dirty=false; localStorage.removeItem(DRAFT_KEY); draw(); stats(); zoomDirty=true; $('histM').classList.remove('on'); log('履歴から復元しました'); }
            });
        };
        list.appendChild(d);
      });
    }
    $('histM').classList.add('on');
  });
};
$('hist-close').onclick=()=>$('histM').classList.remove('on');

/* ---------- 再生まわり ---------- */
function setStart(i,t){
  cues[i].start=f2(Math.max(0,t));
  if(i>0 && $('chain').checked) cues[i-1].end=f2(Math.max(cues[i-1].start+0.4, t-0.05));
  if(cues[i].end < cues[i].start+0.4) cues[i].end=f2(cues[i].start+0.4);
  markDirty(); syncRow(i); zoomDirty=true;
}
function syncRow(i){
  const tr=$('r'+i); if(!tr) return;
  tr.querySelector('[data-k=start]').value=f2(cues[i].start);
  tr.querySelector('[data-k=end]').value=f2(cues[i].end);
  if(i>0){ const p=$('r'+(i-1)); if(p) p.querySelector('[data-k=end]').value=f2(cues[i-1].end); }
}
function paint(){
  const t=au.currentTime;
  $('t').textContent=t.toFixed(2)+'s';
  let cur=-1;
  cues.forEach((c,i)=>{ if(t>=c.start && t<c.end) cur=i; });
  cues.forEach((c,i)=>{ const tr=$('r'+i); if(!tr)return;
    tr.className=(i===cur?'on ':'')+(i===sel?'sel':''); });
  const c=cues[cur>=0?cur:sel]||{eng:'',jpn:''};
  $('pv-en').textContent=c.eng;
  $('pv-jp').textContent=c.jpn;
  if($('loop').checked && !au.paused && cues[sel] && t>cues[sel].end){ au.currentTime=Math.max(0,cues[sel].start-0.15); }
  if(cur>=0 && !au.paused && document.activeElement===document.body){
    const tr=$('r'+cur);
    if(tr && tr.style.display!=='none'){
      const r=tr.getBoundingClientRect();
      if(r.top<300||r.bottom>innerHeight-110) tr.scrollIntoView({block:'center'});
    }
  }
  $('play').textContent = au.paused ? '▶ 再生' : '⏸ 停止';
  $('mb-play').textContent = au.paused ? '▶' : '⏸';
  drawOvr();
  if (!au.paused || zoomDirty || Math.abs(t - lastZoomT) > 0.001){ drawZoom(); zoomDirty = false; lastZoomT = t; }
}
setInterval(paint,80);
addEventListener('resize', ()=>{ if(pcm) buildOvr(); zoomDirty=true; });
$('play').onclick=()=>{ au.paused?au.play():au.pause(); };
document.querySelectorAll('[data-nudge]').forEach(b=>b.onclick=()=>{ au.currentTime=Math.max(0,au.currentTime+ +b.dataset.nudge); zoomDirty=true; });
$('rate').onchange=()=>{ au.playbackRate=+$('rate').value; $('mb-rate').textContent=$('rate').value+'x'; };
const RATES=['1','0.75','0.5'];
$('mb-rate').onclick=()=>{
  const cur=RATES.indexOf($('rate').value), nx=RATES[(cur+1)%RATES.length];
  $('rate').value=nx; au.playbackRate=+nx; $('mb-rate').textContent=nx+'x';
};
function tapSync(){
  pushHist('tap');
  setStart(sel, au.currentTime);
  sel=Math.min(cues.length-1,sel+1); paint();
}
$('mb-play').onclick=()=>{ au.paused?au.play():au.pause(); };
$('mb-sync').onclick=tapSync;
$('mb-back').onclick=()=>{ pushHist('nud'+sel); setStart(sel, cues[sel].start-0.05); };
$('mb-fwd').onclick=()=>{ pushHist('nud'+sel); setStart(sel, cues[sel].start+0.05); };
addEventListener('keydown', e=>{
  const typing = e.target.tagName==='INPUT'||e.target.tagName==='SELECT';
  if(e.metaKey && !e.shiftKey && (e.key==='s')){ e.preventDefault(); save(); return; }
  if(e.metaKey && (e.key==='z'||e.key==='Z')){ e.preventDefault(); e.shiftKey?redoF():undo(); return; }
  if(typing) return;
  if(e.code==='Space'){ e.preventDefault(); au.paused?au.play():au.pause(); }
  else if(e.key==='s'||e.key==='S'){ e.preventDefault(); tapSync(); }
  else if(e.key==='ArrowDown'){ e.preventDefault(); sel=Math.min(cues.length-1,sel+1); paint(); zoomDirty=true; }
  else if(e.key==='ArrowUp'){ e.preventDefault(); sel=Math.max(0,sel-1); paint(); zoomDirty=true; }
  else if(e.key==='ArrowRight'){ e.preventDefault(); pushHist('nud'+sel); setStart(sel, cues[sel].start+(e.shiftKey?0.2:0.05)); }
  else if(e.key==='ArrowLeft'){ e.preventDefault(); pushHist('nud'+sel); setStart(sel, cues[sel].start-(e.shiftKey?0.2:0.05)); }
  else if(e.key==='Enter'){ e.preventDefault(); au.currentTime=Math.max(0,cues[sel].start-0.4); au.play(); zoomDirty=true; }
});
function save(){
  fetch('cues.json',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(cues)})
    .then(r=>r.json()).then(j=>{
      dirty=false; localStorage.removeItem(DRAFT_KEY);
      const issues=lint().filter(x=>x.lv!=='inf');
      log('保存しました（'+j.count+'キュー）'+(issues.length?' / ⚠ チェックで'+issues.length+'件の指摘あり':''));
    });
}
$('save').onclick=save;
$('srt').onclick=()=>fetch('srt',{method:'POST'}).then(r=>r.json()).then(j=>log('SRT: '+j.files.join(' / ')));
$('render').onclick=()=>{
  if(dirty && !confirm('未保存の変更があります。保存せずにレンダーしますか？')) return;
  fetch('render',{method:'POST'}); log('レンダー中…（3分ほど）');
  const iv=setInterval(()=>fetch('render').then(r=>r.json()).then(j=>{ log(j.log); if(j.done){clearInterval(iv);} }),1500);
};
addEventListener('beforeunload', e=>{ if(dirty){ e.preventDefault(); e.returnValue=''; } });
</script></body></html>`;

const server = http.createServer((req, res) => {
  const url = (req.url || "/").split("?")[0];
  if (url === "/" ) { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); return res.end(HTML); }
  if (url === "/cues.json" && req.method === "GET") {
    res.writeHead(200, { "content-type": "application/json" }); return res.end(fs.readFileSync(cuesPath));
  }
  if (url === "/cues.json" && req.method === "POST") {
    let body = ""; req.on("data", d => body += d);
    req.on("end", () => {
      try {
        const cues = JSON.parse(body).map(c => ({ eng: c.eng, jpn: c.jpn, start: Math.round(c.start * 100) / 100, end: Math.round(c.end * 100) / 100 }))
          .filter(c => (c.eng || c.jpn)).sort((a, b) => a.start - b.start);
        for (const c of cues) if (c.end < c.start + 0.4) c.end = Math.round((c.start + 0.4) * 100) / 100;
        backupToHistory();
        fs.copyFileSync(cuesPath, path.join(assets, "full-cues.bak.json"));
        fs.writeFileSync(cuesPath, JSON.stringify(cues, null, 2));
        res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ ok: true, count: cues.length }));
        console.log(`saved ${cues.length} cues`);
      } catch (e) { res.writeHead(400); res.end(JSON.stringify({ error: String(e.message) })); }
    });
    return;
  }
  if (url === "/history" && req.method === "GET") {
    const items = fs.readdirSync(histDir).filter(f => /^full-cues\..+\.json$/.test(f)).sort().reverse().map(f => {
      let count = 0;
      try { count = JSON.parse(fs.readFileSync(path.join(histDir, f), "utf-8")).length; } catch {}
      const m = f.match(/^full-cues\.(\d{4})-(\d{2})-(\d{2})-(\d{2})-(\d{2})-(\d{2})\.json$/);
      const label = m ? `${m[2]}/${m[3]} ${m[4]}:${m[5]}:${m[6]}` : f;
      return { file: f, label, count };
    });
    res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify(items));
  }
  if (url === "/restore" && req.method === "POST") {
    let body = ""; req.on("data", d => body += d);
    req.on("end", () => {
      try {
        const { file } = JSON.parse(body);
        if (!/^full-cues\.[\d-]+\.json$/.test(file || "")) { res.writeHead(400); return res.end("{}"); }
        const src = path.join(histDir, file);
        if (!fs.existsSync(src)) { res.writeHead(404); return res.end("{}"); }
        backupToHistory();
        fs.copyFileSync(src, cuesPath);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ cues: JSON.parse(fs.readFileSync(cuesPath, "utf-8")) }));
        console.log(`restored from ${file}`);
      } catch (e) { res.writeHead(400); res.end(JSON.stringify({ error: String(e.message) })); }
    });
    return;
  }
  if (url === "/srt" && req.method === "POST") {
    const files = writeSrt(); console.log(`srt: ${files.join(", ")}`);
    res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify({ files }));
  }
  if (url === "/render") {
    if (req.method === "POST") { runRender(); res.writeHead(200); return res.end("{}"); }
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify({ log: renderState.log, done: renderState.done && !renderState.running, ok: renderState.ok }));
  }
  if (url === "/audio.mp3" || url === "/cover.jpg") {
    const file = url === "/audio.mp3" ? audioPath : coverPath;
    if (!fs.existsSync(file)) { res.writeHead(404); return res.end(); }
    const size = fs.statSync(file).size;
    const type = url === "/audio.mp3" ? "audio/mpeg" : "image/jpeg";
    const range = req.headers.range;
    if (range) {
      const m = /bytes=(\d*)-(\d*)/.exec(range) || [];
      const start = parseInt(m[1] || "0", 10), end = m[2] ? parseInt(m[2], 10) : size - 1;
      res.writeHead(206, { "content-type": type, "content-range": `bytes ${start}-${end}/${size}`, "accept-ranges": "bytes", "content-length": end - start + 1 });
      return fs.createReadStream(file, { start, end }).pipe(res);
    }
    res.writeHead(200, { "content-type": type, "content-length": size, "accept-ranges": "bytes" });
    return fs.createReadStream(file).pipe(res);
  }
  res.writeHead(404); res.end();
});

// Tailscale（入っていれば外出先・モバイル回線からでも同じURLで届く）
function tailscaleUrl() {
  for (const bin of ["/opt/homebrew/bin/tailscale", "/usr/local/bin/tailscale", "/Applications/Tailscale.app/Contents/MacOS/Tailscale"]) {
    if (!fs.existsSync(bin)) continue;
    try {
      const j = JSON.parse(execFileSync(bin, ["status", "--json"], { encoding: "utf-8", timeout: 4000 }));
      if (j.BackendState !== "Running") return null;
      const ip = (j.Self?.TailscaleIPs || []).find(a => a.includes("."));
      const host = (j.Self?.DNSName || "").replace(/\.$/, "");
      return ip ? { ip: `http://${ip}:${PORT}`, host: host ? `http://${host}:${PORT}` : null } : null;
    } catch { return null; }
  }
  return null;
}

server.listen(PORT, "0.0.0.0", () => {
  console.log(`cue editor (slug: ${slug})`);
  console.log(`  PC:     http://localhost:${PORT}`);
  for (const [, list] of Object.entries(os.networkInterfaces())) {
    for (const ni of list || []) {
      if (ni.family !== "IPv4" || ni.internal) continue;
      if (ni.address.startsWith("100.")) continue; // tailscale側は下でまとめて出す
      console.log(`  スマホ: http://${ni.address}:${PORT}  (同じWi-Fi)`);
    }
  }
  const ts = tailscaleUrl();
  if (ts) {
    console.log(`  外出先: ${ts.ip}  ← まずこれ（Tailscale ONなら4G/5G・別Wi-Fiでも可）`);
    if (ts.host) console.log(`          ${ts.host}  (MagicDNS名。Safariが検索に飛ぶ時は上のIPを使う)`);
    console.log(`  ※Macがスリープすると切れます。長く使うなら別ターミナルで: caffeinate -dis`);
  }
});
