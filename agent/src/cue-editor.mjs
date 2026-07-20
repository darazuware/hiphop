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
import { spawn } from "child_process";
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

const HTML = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>cue editor — ${slug}</title>
<style>
:root{color-scheme:dark}
*{box-sizing:border-box}
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
.en input{font-weight:600}
.jp input{color:#ffd24a}
.mini{background:none;border:none;color:#8fa3bd;padding:3px 5px;font-size:15px}
.mini:hover{color:#fff;background:#2a3140}
#log{white-space:pre-wrap;color:#8fa3bd;font-size:12px;max-height:80px;overflow:auto}
kbd{background:#232935;border:1px solid #39414f;border-radius:4px;padding:1px 5px;font-size:12px}
.hint{color:#8fa3bd;font-size:12px}
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
      + '<td style="width:96px"><input class="num" data-k="start" data-i="'+i+'" value="'+f2(c.start)+'"></td>'
      + '<td style="width:96px"><input class="num" data-k="end" data-i="'+i+'" value="'+f2(c.end)+'"></td>'
      + '<td class="en"><input data-k="eng" data-i="'+i+'"></td>'
      + '<td class="jp"><input data-k="jpn" data-i="'+i+'"></td>'
      + '<td style="width:120px;white-space:nowrap">'
      + '<button class="mini" data-act="play" data-i="'+i+'" title="この行から再生">▶</button>'
      + '<button class="mini" data-act="here" data-i="'+i+'" title="現在位置をstartに">◎</button>'
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
});
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

server.listen(PORT, () => console.log(`cue editor: http://localhost:${PORT}  (slug: ${slug})`));
