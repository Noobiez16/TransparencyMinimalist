#!/usr/bin/env python3
"""Codebase "brain graph" generator for future understanding.

Scans src/**/*.ts, extracts the relative-import dependency graph, groups modules
into communities by directory (app / engine / tools), and writes a single
self-contained interactive HTML file (dark force-directed graph with search and
a node-info panel). No third-party dependencies.

Usage:  python tools/codegraph.py
Output: docs/architecture-graph.html
"""
from __future__ import annotations
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src"
OUT = ROOT / "docs" / "architecture-graph.html"

# Relative import specifiers: `from './x'`, `from '../engine/y'`, and bare
# side-effect imports `import './z'`.
IMPORT_RE = re.compile(r"""(?:from|import)\s+['"](\.[^'"]+)['"]""")


def module_id(path: Path) -> str:
    """Path relative to src, without extension, using forward slashes."""
    rel = path.relative_to(SRC).with_suffix("")
    return rel.as_posix()


def community_of(mod: str) -> str:
    parts = mod.split("/")
    return parts[0] if len(parts) > 1 else "app"


def resolve(spec: str, from_file: Path) -> str | None:
    target = (from_file.parent / spec).resolve()
    for cand in (target.with_suffix(".ts"), target / "index.ts"):
        if cand.exists():
            return module_id(cand)
    return None


def build() -> dict:
    files = sorted(SRC.rglob("*.ts"))
    if not files:
        sys.exit(f"No .ts files found under {SRC}")

    ids = {module_id(f) for f in files}
    degree: dict[str, int] = {i: 0 for i in ids}
    edges: list[tuple[str, str]] = []
    seen: set[tuple[str, str]] = set()

    for f in files:
        src_id = module_id(f)
        text = f.read_text(encoding="utf-8", errors="replace")
        for spec in IMPORT_RE.findall(text):
            dst_id = resolve(spec, f)
            if dst_id is None or dst_id == src_id or dst_id not in ids:
                continue
            key = (src_id, dst_id)
            if key in seen:
                continue
            seen.add(key)
            edges.append(key)
            degree[src_id] += 1
            degree[dst_id] += 1

    nodes = [
        {"id": i, "label": i.split("/")[-1], "community": community_of(i), "degree": degree[i]}
        for i in sorted(ids)
    ]
    communities = sorted({n["community"] for n in nodes})
    return {
        "nodes": nodes,
        "edges": [{"source": s, "target": t} for s, t in edges],
        "communities": communities,
    }


HTML = """<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>TransparencyTW — Architecture Graph</title>
<style>
  :root { --bg:#0A0A0B; --panel:#151517; --card:#1E1E21; --card-hi:#26262A;
          --line:#2A2A2E; --txt:#F2F2F4; --mut:#85858D; }
  * { box-sizing:border-box; margin:0; }
  html,body { height:100%; }
  body { background:var(--bg); color:var(--txt); font-family:Inter,system-ui,sans-serif;
         display:flex; overflow:hidden; }
  #stage { flex:1; display:block; cursor:grab; }
  #stage:active { cursor:grabbing; }
  aside { width:280px; border-left:1px solid var(--line); background:var(--panel);
          padding:16px; display:flex; flex-direction:column; gap:16px; overflow-y:auto; }
  h1 { font-size:13px; font-weight:600; letter-spacing:.3px; }
  .sub { font-size:11px; color:var(--mut); margin-top:2px; }
  input { width:100%; font-family:inherit; font-size:12px; padding:8px 10px; border:none;
          border-radius:8px; background:var(--card); color:var(--txt); }
  .lbl { font-size:9.5px; text-transform:uppercase; letter-spacing:.8px; color:var(--mut); margin-bottom:8px; }
  #info { font-size:11px; color:var(--mut); line-height:1.6; min-height:70px; }
  #info b { color:var(--txt); }
  .legend { display:flex; flex-direction:column; gap:6px; font-size:11px; color:var(--mut); }
  .legend .row { display:flex; align-items:center; gap:8px; }
  .dot { width:9px; height:9px; border-radius:50%; display:inline-block; }
  footer { margin-top:auto; font-size:10px; color:var(--mut); }
  .deps { font-size:10.5px; color:var(--mut); line-height:1.5; }
</style></head>
<body>
<canvas id="stage"></canvas>
<aside>
  <div><h1>TransparencyTW</h1><div class="sub">Module dependency graph — src/</div></div>
  <input id="search" placeholder="Search modules...">
  <div><div class="lbl">Node info</div><div id="info">Hover or click a node.</div></div>
  <div><div class="lbl">Communities</div><div class="legend" id="legend"></div></div>
  <footer id="footer"></footer>
</aside>
<script>
const DATA = __DATA__;
const COLORS = { app:'#5B9BFF', engine:'#4FD1A5', tools:'#FFA94D' };
const PALETTE = ['#5B9BFF','#4FD1A5','#FFA94D','#FF6B6B','#B98CFF','#F783AC','#63E6BE','#A9B4C2'];
function colorFor(c){ if(COLORS[c]) return COLORS[c];
  const i = DATA.communities.indexOf(c); return PALETTE[i % PALETTE.length]; }

const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d');
let dpr = Math.min(window.devicePixelRatio||1, 2), W=0, H=0;
function resize(){ const r=canvas.getBoundingClientRect(); W=r.width; H=r.height;
  canvas.width=W*dpr; canvas.height=H*dpr; ctx.setTransform(dpr,0,0,dpr,0,0); }
window.addEventListener('resize', ()=>{ resize(); reheat(); });

const nodes = DATA.nodes.map((n,i)=>({ ...n,
  r: 6 + 2.4*Math.sqrt(n.degree),
  x: W/2 + Math.cos(i)*180 + (Math.random()-0.5)*60,
  y: H/2 + Math.sin(i)*180 + (Math.random()-0.5)*60, vx:0, vy:0 }));
const byId = Object.fromEntries(nodes.map(n=>[n.id,n]));
const edges = DATA.edges.map(e=>({ s:byId[e.source], t:byId[e.target] }));
const adj = {}; nodes.forEach(n=>adj[n.id]=[]);
edges.forEach(e=>{ adj[e.s.id].push(e.t.label); adj[e.t.id].push(e.s.label); });

let alpha=1, raf=null, drag=null, hover=null, selected=null, query='';
function reheat(){ alpha=1; if(raf===null) raf=requestAnimationFrame(tick); }

function tick(){
  for(let i=0;i<nodes.length;i++){ const a=nodes[i];
    for(let j=i+1;j<nodes.length;j++){ const b=nodes[j];
      let dx=a.x-b.x, dy=a.y-b.y, d2=dx*dx+dy*dy; if(d2<1){dx=Math.random();dy=Math.random();d2=1;}
      const d=Math.sqrt(d2), f=2600/d2/d;
      a.vx+=dx*f*alpha; a.vy+=dy*f*alpha; b.vx-=dx*f*alpha; b.vy-=dy*f*alpha; } }
  for(const e of edges){ const dx=e.t.x-e.s.x, dy=e.t.y-e.s.y, d=Math.hypot(dx,dy)||.0001;
    const f=(d-140)*0.015*alpha; const ux=dx/d, uy=dy/d;
    e.s.vx+=ux*f; e.s.vy+=uy*f; e.t.vx-=ux*f; e.t.vy-=uy*f; }
  for(const n of nodes){ n.vx+=(W/2-n.x)*0.002*alpha; n.vy+=(H/2-n.y)*0.002*alpha;
    if(n===drag) continue; n.vx*=0.86; n.vy*=0.86; n.x+=n.vx; n.y+=n.vy; }
  alpha*=0.99; render();
  if(alpha>0.02){ raf=requestAnimationFrame(tick); } else { raf=null; }
}

function matched(n){ return query==='' || n.label.toLowerCase().includes(query) || n.id.toLowerCase().includes(query); }

function render(){
  ctx.clearRect(0,0,W,H);
  for(const e of edges){ const on = matched(e.s)||matched(e.t);
    ctx.strokeStyle = on ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(e.s.x,e.s.y); ctx.lineTo(e.t.x,e.t.y); ctx.stroke(); }
  for(const n of nodes){ const on=matched(n);
    ctx.globalAlpha = on ? 1 : 0.2;
    ctx.fillStyle = colorFor(n.community);
    ctx.beginPath(); ctx.arc(n.x,n.y,n.r,0,7); ctx.fill();
    if(n===selected||n===hover){ ctx.globalAlpha=1; ctx.strokeStyle='#fff'; ctx.lineWidth=2; ctx.stroke(); }
    if(n.r>10 || n===hover || n===selected){ ctx.globalAlpha = on?0.9:0.25; ctx.fillStyle='#F2F2F4';
      ctx.font='10px Inter, sans-serif'; ctx.textAlign='center'; ctx.fillText(n.label, n.x, n.y+n.r+11); }
  }
  ctx.globalAlpha=1;
}

function nodeAt(mx,my){ let best=null, bd=Infinity;
  for(const n of nodes){ const d=Math.hypot(n.x-mx,n.y-my); if(d<n.r+4 && d<bd){bd=d;best=n;} } return best; }
function showInfo(n){ const el=document.getElementById('info');
  if(!n){ el.innerHTML='Hover or click a node.'; return; }
  const deps=[...new Set(adj[n.id])].sort();
  el.innerHTML = `<b>${n.label}</b><br>path: src/${n.id}.ts<br>community: ${n.community}`
    + `<br>connections: ${n.degree}`
    + (deps.length?`<div class="deps" style="margin-top:8px">${deps.join(' · ')}</div>`:''); }

canvas.addEventListener('pointerdown', e=>{ const n=nodeAt(e.offsetX,e.offsetY);
  if(n){ drag=n; selected=n; showInfo(n); canvas.setPointerCapture(e.pointerId); reheat(); } });
canvas.addEventListener('pointermove', e=>{ if(drag){ drag.x=e.offsetX; drag.y=e.offsetY; drag.vx=0; drag.vy=0; reheat(); }
  else { const n=nodeAt(e.offsetX,e.offsetY); if(n!==hover){ hover=n; showInfo(n||selected); render(); } } });
canvas.addEventListener('pointerup', ()=>{ drag=null; });
document.getElementById('search').addEventListener('input', e=>{ query=e.target.value.trim().toLowerCase(); render(); });

const legend=document.getElementById('legend');
DATA.communities.forEach(c=>{ const count=DATA.nodes.filter(n=>n.community===c).length;
  const row=document.createElement('div'); row.className='row';
  row.innerHTML=`<span class="dot" style="background:${colorFor(c)}"></span>${c} · ${count}`; legend.appendChild(row); });
document.getElementById('footer').textContent =
  `${DATA.nodes.length} modules · ${DATA.edges.length} imports · ${DATA.communities.length} communities`;

resize(); reheat();
</script>
</body></html>
"""


def main() -> None:
    graph = build()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(HTML.replace("__DATA__", json.dumps(graph)), encoding="utf-8")
    print(f"modules={len(graph['nodes'])} imports={len(graph['edges'])} "
          f"communities={len(graph['communities'])}")
    print(f"wrote {OUT.relative_to(ROOT).as_posix()}")


if __name__ == "__main__":
    main()
