/**
 * ============================================================
 *  RIDERS ADMIN PAGE  — review & verify rider applications
 *  Exported as a function returning the full HTML page.
 *  Served at  GET /admin/riders?token=...
 * ============================================================
 */
module.exports = function RIDERS_HTML(token) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Rider applications · HaloRide</title>
<style>
  :root{--bg:#0f1115;--card:#181b22;--card2:#1f232c;--line:#2a2e38;--txt:#e9e6df;--dim:#8b9099;--gold:#e0a92b;--green:#1f9d57;--red:#e0533d;--amber:#e0a92b}
  *{box-sizing:border-box}
  body{margin:0;font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:var(--bg);color:var(--txt)}
  header{position:sticky;top:0;z-index:10;background:rgba(15,17,21,.95);backdrop-filter:blur(8px);border-bottom:1px solid var(--line);padding:.9rem 1.1rem;display:flex;align-items:center;gap:.8rem;flex-wrap:wrap}
  header h1{font-size:1.05rem;margin:0;font-weight:700}
  header .sp{flex:1}
  a.back{color:var(--dim);text-decoration:none;font-size:.85rem;font-weight:600;border:1px solid var(--line);padding:.45rem .8rem;border-radius:999px}
  a.back:hover{color:var(--txt)}
  .wrap{padding:1.1rem;max-width:1100px;margin:0 auto}
  .stats{display:flex;gap:.7rem;flex-wrap:wrap;margin-bottom:1rem}
  .stat{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:.7rem 1rem;min-width:120px}
  .stat .n{font-size:1.4rem;font-weight:800}
  .stat .l{font-size:.74rem;color:var(--dim);text-transform:uppercase;letter-spacing:.04em}
  .stat.pend .n{color:var(--amber)} .stat.appr .n{color:var(--green)} .stat.rej .n{color:var(--red)}
  .tabs{display:flex;gap:.4rem;flex-wrap:wrap;margin-bottom:1rem}
  .tab{background:var(--card);border:1px solid var(--line);color:var(--dim);border-radius:999px;padding:.45rem .9rem;font-size:.82rem;font-weight:600;cursor:pointer}
  .tab.on{background:var(--txt);color:var(--bg);border-color:var(--txt)}
  .rider{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:1rem;margin-bottom:1rem}
  .rider.pending{border-left:3px solid var(--amber)}
  .rider.approved{border-left:3px solid var(--green)}
  .rider.rejected{border-left:3px solid var(--red)}
  .rhead{display:flex;align-items:center;gap:.7rem;flex-wrap:wrap;margin-bottom:.7rem}
  .rhead .nm{font-weight:700;font-size:1.05rem}
  .badge{font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.04em;padding:.2rem .55rem;border-radius:999px}
  .badge.pending{background:rgba(224,169,43,.16);color:var(--amber)}
  .badge.approved{background:rgba(31,157,87,.16);color:var(--green)}
  .badge.rejected{background:rgba(224,83,61,.16);color:var(--red)}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:1rem}
  @media(max-width:720px){.grid{grid-template-columns:1fr}}
  .kv{display:flex;justify-content:space-between;gap:1rem;padding:.3rem 0;border-bottom:1px dashed var(--line);font-size:.88rem}
  .kv .k{color:var(--dim)} .kv .v{font-weight:600;text-align:right}
  .docs{display:flex;gap:.6rem;flex-wrap:wrap;margin-top:.6rem}
  .doc{border:1px solid var(--line);border-radius:10px;overflow:hidden;width:140px;background:var(--card2)}
  .doc img{width:100%;height:96px;object-fit:cover;display:block;cursor:zoom-in;background:#000}
  .doc .cap{font-size:.7rem;color:var(--dim);padding:.3rem .4rem;text-align:center}
  .doc.none{display:flex;align-items:center;justify-content:center;height:96px;color:var(--dim);font-size:.75rem}
  .actions{display:flex;gap:.5rem;flex-wrap:wrap;margin-top:.9rem}
  button.act{border:none;border-radius:9px;padding:.55rem .9rem;font-weight:700;font-size:.85rem;cursor:pointer}
  .approve{background:var(--green);color:#fff}
  .reject{background:transparent;color:var(--red);border:1px solid var(--red)}
  .note-in{flex:1;min-width:160px;background:var(--bg);border:1px solid var(--line);color:var(--txt);border-radius:9px;padding:.55rem .7rem;font-size:.85rem}
  .empty{text-align:center;color:var(--dim);padding:3rem 1rem}
  .rnote{margin-top:.6rem;font-size:.82rem;color:var(--dim)}
  .lightbox{position:fixed;inset:0;background:rgba(0,0,0,.85);display:none;align-items:center;justify-content:center;z-index:50;padding:1rem}
  .lightbox.show{display:flex} .lightbox img{max-width:100%;max-height:100%;border-radius:8px}
</style>
</head>
<body>
<header>
  <h1>🏍️ Rider applications</h1>
  <div class="sp"></div>
  <a class="back" href="/admin?token=${token}">← Orders dashboard</a>
</header>

<div class="wrap">
  <div class="stats" id="stats"></div>
  <div class="tabs">
    <button class="tab on" data-f="pending" onclick="setTab('pending')">Pending review</button>
    <button class="tab" data-f="approved" onclick="setTab('approved')">Approved</button>
    <button class="tab" data-f="rejected" onclick="setTab('rejected')">Rejected</button>
    <button class="tab" data-f="all" onclick="setTab('all')">All</button>
  </div>
  <div id="list"></div>
</div>

<div class="lightbox" id="lightbox" onclick="this.classList.remove('show')"><img id="lbimg" src="" alt=""/></div>

<script>
const TOKEN = ${JSON.stringify(token)};
let RIDERS = [], tab = "pending";

async function load(){
  const r = await fetch("/admin/riders.json?token="+encodeURIComponent(TOKEN));
  const d = await r.json();
  RIDERS = d.riders || [];
  renderStats(); render();
}
function renderStats(){
  const c = {pending:0,approved:0,rejected:0};
  RIDERS.forEach(r=>{ c[r.status] = (c[r.status]||0)+1; });
  document.getElementById("stats").innerHTML =
    '<div class="stat pend"><div class="n">'+c.pending+'</div><div class="l">Pending</div></div>'+
    '<div class="stat appr"><div class="n">'+c.approved+'</div><div class="l">Approved</div></div>'+
    '<div class="stat rej"><div class="n">'+c.rejected+'</div><div class="l">Rejected</div></div>'+
    '<div class="stat"><div class="n">'+RIDERS.length+'</div><div class="l">Total</div></div>';
}
function setTab(t){ tab=t; document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("on",b.dataset.f===t)); render(); }
function esc(s){ return String(s==null?"":s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

function docTile(r, which, label){
  if((which==="id"&&r.hasIdPhoto)||(which==="license"&&r.hasLicensePhoto)||(which==="bike"&&r.hasBikePhoto)){
    const src = "/admin/rider-doc?token="+encodeURIComponent(TOKEN)+"&id="+r.id+"&which="+which;
    return '<div class="doc"><img src="'+src+'" onclick="zoom(this.src)" alt="'+label+'"/><div class="cap">'+label+'</div></div>';
  }
  return '<div class="doc none">No '+label.toLowerCase()+'</div>';
}
function kv(k,v){ return '<div class="kv"><span class="k">'+esc(k)+'</span><span class="v">'+esc(v||"—")+'</span></div>'; }

function render(){
  const list = RIDERS.filter(r=> tab==="all" ? true : r.status===tab);
  const box = document.getElementById("list");
  if(!list.length){ box.innerHTML = '<div class="empty">No '+tab+' riders.</div>'; return; }
  box.innerHTML = list.map(r=>{
    const docs = '<div class="docs">'+docTile(r,"id","ID document")+docTile(r,"license","Rider licence")+docTile(r,"bike","Motorbike")+'</div>';
    const left = kv("Phone",r.phone)+kv("Email",r.email)+kv("ID type",r.idType)+kv("ID number",r.idNumber)+kv("Applied",(r.createdAt||"").replace("T"," ").slice(0,16));
    const right = kv("Bike",[r.bikeMake,r.bikeModel,r.bikeYear].filter(Boolean).join(" "))+kv("Colour",r.bikeColor)+kv("Plate number",r.plateNumber)+kv("Licence number",r.licenseNumber);
    let acts = "";
    if(r.status==="pending"){
      acts = '<div class="actions"><input class="note-in" id="note-'+r.id+'" placeholder="Optional note (reason if rejecting)"/>'+
             '<button class="act approve" onclick="review('+r.id+',\\'approve\\')">✓ Approve rider</button>'+
             '<button class="act reject" onclick="review('+r.id+',\\'reject\\')">Reject</button></div>';
    } else {
      acts = '<div class="rnote">'+(r.status==="approved"?"✓ Approved":"✕ Rejected")+(r.reviewedAt?" · "+r.reviewedAt.replace("T"," ").slice(0,16):"")+(r.reviewNote?(" · "+esc(r.reviewNote)):"")+
             ' · <button class="act reject" style="padding:.3rem .6rem" onclick="review('+r.id+',\\''+(r.status==="approved"?"reject":"approve")+'\\')">'+(r.status==="approved"?"Revoke":"Approve now")+'</button></div>';
    }
    return '<div class="rider '+r.status+'"><div class="rhead"><span class="nm">'+esc(r.name)+'</span>'+
      '<span class="badge '+r.status+'">'+r.status+'</span></div>'+
      '<div class="grid"><div>'+left+'</div><div>'+right+'</div></div>'+docs+acts+'</div>';
  }).join("");
}
async function review(id, action){
  const note = (document.getElementById("note-"+id)||{}).value || "";
  await fetch("/admin/rider/review?token="+encodeURIComponent(TOKEN),{
    method:"POST", headers:{"Content-Type":"application/json"},
    body: JSON.stringify({ id, action, note })
  });
  load();
}
function zoom(src){ document.getElementById("lbimg").src=src; document.getElementById("lightbox").classList.add("show"); }
load();
setInterval(load, 60000);
</script>
</body>
</html>`;
};
