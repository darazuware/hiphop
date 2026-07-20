#!/usr/bin/env node
/**
 * cue-editor.mjs
 * full-cues.json をブラウザ上で微調整するローカルエディタ（依存なし・歌詞はstdoutに出さない）。
 * 音を聴きながら「今ここ」で始点を打ち込み(タップ同期)、行の結合/分割、文言修正ができる。
 * 保存すると full-cues.json を上書き（直前版は full-cues.bak.json に退避）。
 * そのまま「再生成＋レンダー」ボタンで gen-full-composition → hyperframes render まで回せる。
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
for (const p of [cuesPath, audioPath]) if (!fs.existsSync(p)) { console.error(`missing: ${path.basename(p)}`); process.exit(1); }

let renderState = { running: false, log: "", done: false, ok: false };

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
header{position:sticky;top:0;z-index:9;background:#12151b;border-bottom:1px solid #262b36;padding:12px 18px}
.row{display:flex;gap:12px;align-items:center;flex-wrap:wrap}
button{background:#232935;color:#e8e8ea;border:1px solid #39414f;border-radius:8px;padding:7px 12px;cursor:pointer;font-size:13px}
button:hover{background:#2e3646}
button.p{background:#ffd24a;color:#111;border-color:#ffd24a;font-weight:700}
#preview{background:#000;border-radius:12px;padding:22px;text-align:center;margin:10px 0 0}
#pv-en{font-size:30px;font-weight:800;color:#fff;min-height:38px}
#pv-jp{font-size:19px;color:#ffd24a;margin-top:8px;min-height:26px}
#t{font-variant-numeric:tabular-nums;font-size:16px;color:#9fb0c8}
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
#log{white-space:pre-wrap;color:#8fa3bd;font-size:12px;max-height:80px;overflow:auto}
kbd{background:#232935;border:1px solid #39414f;border-radius:4px;padding:1px 5px;font-size:12px}
.hint{color:#8fa3bd;font-size:12px}
/* 分割モーダル */
#mask{position:fixed;inset:0;background:rgba(0,0,0,.72);z-index:20;display:none;align-items:center;justify-content:center;padding:16px}
#mask.on{display:flex}
#modal{background:#151a22;border:1px solid #2f3846;border-radius:14px;padding:18px;max-width:900px;width:100%;max-height:92vh;overflow:auto}
#modal h3{margin:0 0 4px;font-size:15px}
#modal .sub{color:#8fa3bd;font-size:12px;margin-bottom:12px}
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
@media (max-width:820px){
  header{padding:10px 10px}
  button{padding:11px 14px;font-size:15px}
  .mini{font-size:22px;padding:8px 10px}
  .hint{display:none}
  #pv-en{font-size:22px}#pv-jp{font-size:16px}
  body{overflow-x:hidden}
  table,tbody,tr,td{display:block;width:auto}
  tr{border:1px solid #232a36;border-radius:12px;margin:10px 8px;padding:8px;background:#141922}
  tr.on{background:#1d2634;border-color:#3a4a63}
  tr.sel{outline:2px solid #ffd24a}
  td{border:0;padding:3px 4px}
  td:first-child{color:#6b7a90;font-size:12px}
  td.times{display:flex;gap:8px;width:auto}
  td.acts{width:auto}
  input.num{width:100%;font-size:16px;padding:9px}
  input{font-size:16px;padding:9px}
  td.acts{display:flex;justify-content:space-between;padding-top:6px}
}
</style></head><body>
<header>
  <div class="row">
    <button class="p" id="play">▶ 再生 / 停止</button>
    <span id="t">0.00s</span>
    <button data-nudge="-5">◀ 5s</button><button data-nudge="5">5s ▶</button>
    <span style="flex:1"></span>
    <button id="save" class="p">保存 (⌘S)</button>
    <button id="srt">SRT書き出し</button>
    <button id="render">再生成＋レンダー</button>
  </div>
  <div id="preview"><div id="pv-en"></div><div id="pv-jp"></div></div>
  <div class="row hint" style="margin-top:8px">
    <span><kbd>Space</kbd> 再生/停止</span><span><kbd>S</kbd> 選択行のstartを現在位置に（打ち込み後、次行へ）</span>
    <span><kbd>↑↓</kbd> 行選択</span><span><kbd>←→</kbd> 選択行を ±0.05s</span><span><kbd>Enter</kbd> 選択行の頭から再生</span>
    <label style="margin-left:auto"><input type="checkbox" id="chain" checked style="width:auto"> endを次のstartに自動追従</label>
  </div>
  <div id="log"></div>
</header>
<table id="tb"></table>
<audio id="au" src="audio.mp3" preload="auto"></audio>
<div id="mask"><div id="modal">
  <h3>行の分割</h3>
  <div class="sub">切りたい位置の｜をタップ（もう一度タップで解除）。青い｜＝語の切れ目として安全な位置。時間は文字数で自動配分し、あとから ◎ や ←→ で微調整できます。</div>
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
<script>
const au = document.getElementById('au');
let cues = [], sel = 0, dirty = false;
const f2 = (n) => Math.round(n*100)/100;
const log = (s) => document.getElementById('log').textContent = s;

fetch('cues.json').then(r=>r.json()).then(c=>{cues=c;draw();});

function draw(){
  const tb = document.getElementById('tb');
  tb.innerHTML = '';
  cues.forEach((c,i)=>{
    const tr = document.createElement('tr'); tr.id='r'+i;
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
    tr.addEventListener('mousedown', ()=>{ sel=i; paint(); });
  });
  paint();
}
document.getElementById('tb').addEventListener('input', e=>{
  const i=+e.target.dataset.i, k=e.target.dataset.k; if(k===undefined) return;
  cues[i][k] = (k==='start'||k==='end') ? parseFloat(e.target.value)||0 : e.target.value;
  dirty=true; log('未保存の変更あり');
});
document.getElementById('tb').addEventListener('click', e=>{
  const b=e.target.closest('button[data-act]'); if(!b) return;
  const i=+b.dataset.i, a=b.dataset.act;
  if(a==='play'){ sel=i; au.currentTime=Math.max(0,cues[i].start-0.4); au.play(); }
  if(a==='here'){ setStart(i, au.currentTime); }
  if(a==='merge' && i<cues.length-1){
    const n=cues[i+1];
    cues[i]={eng:(cues[i].eng+' '+n.eng).trim(), jpn:(cues[i].jpn+n.jpn).trim(), start:cues[i].start, end:n.end};
    cues.splice(i+1,1); dirty=true; draw();
  }
  if(a==='del'){ cues.splice(i,1); dirty=true; draw(); }
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
  renderSplit(); document.getElementById('mask').classList.add('on');
}
function renderSplit(){
  const en=document.getElementById('m-en'), jp=document.getElementById('m-jp');
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
  document.getElementById('m-pv').innerHTML = parts.map((p,n)=>
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
document.getElementById('m-en').addEventListener('click',e=>{ const d=e.target.closest('.cut'); if(!d)return;
  const k=+d.dataset.e; M.ecuts.has(k)?M.ecuts.delete(k):M.ecuts.add(k); renderSplit(); });
document.getElementById('m-jp').addEventListener('click',e=>{ const d=e.target.closest('.cut'); if(!d)return;
  const k=+d.dataset.j; M.jcuts.has(k)?M.jcuts.delete(k):M.jcuts.add(k); renderSplit(); });
document.getElementById('m-auto2').onclick=()=>autoSplit(2);
document.getElementById('m-auto3').onclick=()=>autoSplit(3);
document.getElementById('m-clear').onclick=()=>{ M.ecuts=new Set(); M.jcuts=new Set(); renderSplit(); };
document.getElementById('m-cancel').onclick=()=>document.getElementById('mask').classList.remove('on');
document.getElementById('m-ok').onclick=()=>{
  const parts=buildParts();
  if(parts.length<2){ alert('切る位置を1つ以上えらんでください'); return; }
  cues.splice(M.i,1,...parts); dirty=true;
  document.getElementById('mask').classList.remove('on'); draw(); log('未保存の変更あり');
};
function setStart(i,t){
  cues[i].start=f2(t);
  if(i>0 && document.getElementById('chain').checked) cues[i-1].end=f2(Math.max(cues[i-1].start+0.4, t-0.05));
  if(cues[i].end < cues[i].start+0.4) cues[i].end=f2(cues[i].start+0.4);
  dirty=true; sync(i); log('未保存の変更あり');
}
function sync(i){
  const tr=document.getElementById('r'+i); if(!tr) return;
  tr.querySelector('[data-k=start]').value=f2(cues[i].start);
  tr.querySelector('[data-k=end]').value=f2(cues[i].end);
  if(i>0){ const p=document.getElementById('r'+(i-1)); if(p) p.querySelector('[data-k=end]').value=f2(cues[i-1].end); }
}
function paint(){
  const t=au.currentTime;
  document.getElementById('t').textContent=t.toFixed(2)+'s';
  let cur=-1;
  cues.forEach((c,i)=>{ if(t>=c.start && t<c.end) cur=i; });
  cues.forEach((c,i)=>{ const tr=document.getElementById('r'+i); if(!tr)return;
    tr.className=(i===cur?'on ':'')+(i===sel?'sel':''); });
  const c=cues[cur>=0?cur:sel]||{eng:'',jpn:''};
  document.getElementById('pv-en').textContent=c.eng;
  document.getElementById('pv-jp').textContent=c.jpn;
  if(cur>=0 && document.activeElement===document.body){
    const tr=document.getElementById('r'+cur);
    const r=tr.getBoundingClientRect();
    if(r.top<220||r.bottom>innerHeight-40) tr.scrollIntoView({block:'center'});
  }
}
setInterval(paint,80);
document.getElementById('play').onclick=()=>{ au.paused?au.play():au.pause(); };
document.querySelectorAll('[data-nudge]').forEach(b=>b.onclick=()=>{ au.currentTime=Math.max(0,au.currentTime+ +b.dataset.nudge); });
addEventListener('keydown', e=>{
  const typing = e.target.tagName==='INPUT';
  if(e.metaKey && e.key==='s'){ e.preventDefault(); save(); return; }
  if(typing) return;
  if(e.code==='Space'){ e.preventDefault(); au.paused?au.play():au.pause(); }
  else if(e.key==='s'||e.key==='S'){ e.preventDefault(); setStart(sel, au.currentTime); sel=Math.min(cues.length-1,sel+1); paint(); }
  else if(e.key==='ArrowDown'){ e.preventDefault(); sel=Math.min(cues.length-1,sel+1); paint(); }
  else if(e.key==='ArrowUp'){ e.preventDefault(); sel=Math.max(0,sel-1); paint(); }
  else if(e.key==='ArrowRight'){ e.preventDefault(); setStart(sel, cues[sel].start+0.05); }
  else if(e.key==='ArrowLeft'){ e.preventDefault(); setStart(sel, cues[sel].start-0.05); }
  else if(e.key==='Enter'){ e.preventDefault(); au.currentTime=Math.max(0,cues[sel].start-0.4); au.play(); }
});
function save(){
  fetch('cues.json',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(cues)})
    .then(r=>r.json()).then(j=>{ dirty=false; log('保存しました（'+j.count+'キュー / バックアップ: full-cues.bak.json）'); });
}
document.getElementById('save').onclick=save;
document.getElementById('srt').onclick=()=>fetch('srt',{method:'POST'}).then(r=>r.json()).then(j=>log('SRT: '+j.files.join(' / ')));
document.getElementById('render').onclick=()=>{
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
        fs.copyFileSync(cuesPath, path.join(assets, "full-cues.bak.json"));
        fs.writeFileSync(cuesPath, JSON.stringify(cues, null, 2));
        res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ ok: true, count: cues.length }));
        console.log(`saved ${cues.length} cues`);
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
      const host = (j.Self?.DNSName || "").replace(/\.$/, "") || j.Self?.TailscaleIPs?.[0];
      return host ? `http://${host}:${PORT}` : null;
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
    console.log(`  外出先: ${ts}  (Tailscale ON なら4G/5G・別Wi-Fiでも可)`);
    console.log(`  ※Macがスリープすると切れます。長く使うなら別ターミナルで: caffeinate -dis`);
  }
});
