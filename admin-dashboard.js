/**
 * admin-dashboard.js — the store-owner order dashboard UI.
 * Exported as a function that returns the full HTML page.
 * Data is loaded client-side from /admin/data.json so the page
 * stays fast and refreshes without a full reload.
 */
module.exports = function ADMIN_HTML(token) {
  // token is embedded so the page's fetch calls stay authenticated
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Store Orders · Dashboard</title>
<style>
  :root{
    --bg:#0f1115; --card:#181b22; --card2:#1f232c; --line:#2a2e38;
    --txt:#e9e6df; --dim:#8b9099; --gold:#e0a92b; --green:#3fa56a;
    --red:#d9614b; --blue:#4f8fd6;
  }
  *{box-sizing:border-box}
  body{margin:0;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;background:var(--bg);color:var(--txt);font-size:15px}
  header{position:sticky;top:0;z-index:10;background:rgba(15,17,21,.95);backdrop-filter:blur(8px);border-bottom:1px solid var(--line);padding:.9rem 1.1rem;display:flex;align-items:center;gap:.8rem;flex-wrap:wrap}
  header h1{font-size:1.1rem;margin:0}
  header .sp{flex:1}
  .btn{background:var(--card2);border:1px solid var(--line);color:var(--txt);border-radius:9px;padding:.5rem .85rem;font-weight:600;cursor:pointer;font-size:.85rem}
  .btn:hover{border-color:var(--gold)}
  .btn.gold{background:var(--gold);color:#1a1712;border:none}
  .wrap{padding:1.1rem;max-width:1100px;margin:0 auto}
  /* stat cards */
  .stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:.8rem;margin-bottom:1.2rem}
  .stat{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:1rem 1.1rem}
  .stat .lbl{font-size:.72rem;text-transform:uppercase;letter-spacing:.08em;color:var(--dim);font-weight:700}
  .stat .val{font-size:1.6rem;font-weight:800;margin-top:.3rem}
  .stat.ship .val{color:var(--gold)}
  .stat.review .val{color:var(--red)}
  .stat.rev .val{color:var(--green)}
  /* controls */
  .controls{display:flex;gap:.6rem;flex-wrap:wrap;margin-bottom:1rem;align-items:center}
  .controls input,.controls select{background:var(--card);border:1px solid var(--line);color:var(--txt);border-radius:9px;padding:.55rem .8rem;font-size:.88rem}
  .controls input{flex:1;min-width:160px}
  .tabs{display:flex;gap:.4rem;flex-wrap:wrap}
  .tab{background:var(--card);border:1px solid var(--line);color:var(--dim);border-radius:999px;padding:.45rem .9rem;font-size:.82rem;font-weight:600;cursor:pointer}
  .tab.on{background:var(--txt);color:var(--bg);border-color:var(--txt)}
  /* order cards */
  .order{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:1rem 1.1rem;margin-bottom:.8rem}
  .order.done{opacity:.55}
  .order-top{display:flex;justify-content:space-between;gap:1rem;align-items:flex-start;flex-wrap:wrap}
  .ref{font-weight:800;font-size:.95rem}
  .ref .store{display:inline-block;font-size:.66rem;font-weight:700;letter-spacing:.02em;color:var(--dim);background:var(--card2);border:1px solid var(--line);border-radius:6px;padding:.12rem .45rem;margin-left:.5rem;vertical-align:middle}
  .ref .store[data-store="halomart"]    {color:#7cc4ff;background:rgba(124,196,255,.12);border-color:rgba(124,196,255,.35)}
  .ref .store[data-store="haloclip"]    {color:#ffd56b;background:rgba(255,213,107,.12);border-color:rgba(255,213,107,.35)}
  .ref .store[data-store="asaase-gold"] {color:var(--gold);background:rgba(224,169,43,.14);border-color:rgba(224,169,43,.40)}
  .ref .store[data-store="haloride"]    {color:#ff9e64;background:rgba(255,158,100,.14);border-color:rgba(255,158,100,.40)}
  .amt{font-size:1.15rem;font-weight:800;white-space:nowrap}
  .pill{display:inline-block;font-size:.68rem;font-weight:700;padding:.18rem .5rem;border-radius:6px;text-transform:uppercase;letter-spacing:.04em}
  .pill.paid{background:rgba(63,165,106,.16);color:var(--green)}
  .pill.review{background:rgba(217,97,75,.16);color:var(--red)}
  .pill.failed{background:rgba(217,97,75,.16);color:var(--red)}
  .meta{margin-top:.7rem;display:grid;gap:.45rem;font-size:.86rem}
  .meta .row{display:flex;gap:.5rem}
  .meta .k{color:var(--dim);min-width:74px;flex-shrink:0}
  .meta .v{color:var(--txt)}
  .order-actions{margin-top:.9rem;display:flex;gap:.5rem;flex-wrap:wrap}
  .order-actions a,.order-actions button{font-size:.82rem;text-decoration:none}
  .ship-btn{background:var(--gold);color:#1a1712;border:none;border-radius:9px;padding:.5rem .9rem;font-weight:700;cursor:pointer}
  .ship-btn.undo{background:var(--card2);color:var(--dim);border:1px solid var(--line)}
  .link-btn{background:var(--card2);border:1px solid var(--line);color:var(--txt);border-radius:9px;padding:.5rem .9rem;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:.35rem}
  .link-btn:hover{border-color:var(--gold)}
  .empty{text-align:center;color:var(--dim);padding:3rem 1rem}
  .muted{color:var(--dim);font-size:.85rem}
  .updated{font-size:.75rem;color:var(--dim)}
  @media(max-width:560px){ .stat .val{font-size:1.3rem} }
</style>
</head>
<body>
<header>
  <h1>📦 Store Orders</h1>
  <span class="updated" id="updated"></span>
  <span class="sp"></span>
  <a class="btn" href="/admin/riders?token=${token}" style="text-decoration:none;display:inline-flex;align-items:center">🏍️ Riders</a>
  <button class="btn" onclick="load()">↻ Refresh</button>
  <button class="btn" onclick="exportCSV()">⬇ Export CSV</button>
</header>

<div class="wrap">
  <div class="stats" id="statCards"></div>

  <div class="controls">
    <input id="search" placeholder="Search name, phone, reference, item…" oninput="render()" />
    <select id="storeFilter" onchange="render()">
      <option value="">All stores</option>
    </select>
  </div>
  <div class="tabs" id="tabs">
    <button class="tab on" data-f="toship" onclick="setTab('toship')">To ship</button>
    <button class="tab" data-f="all" onclick="setTab('all')">All paid</button>
    <button class="tab" data-f="shipped" onclick="setTab('shipped')">Shipped</button>
    <button class="tab" data-f="review" onclick="setTab('review')">Needs review</button>
  </div>

  <div id="list" style="margin-top:1rem"></div>
</div>

<script>
const TOKEN = ${JSON.stringify(token)};
let DATA = { stats:{}, orders:[] };
let tab = "toship";

const money = (m,c)=> (c==="GHS"?"₵":"₦") + (Number(m||0)/100).toLocaleString();
const esc = s => String(s==null?"":s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
// Pretty, branded names for the store badge + filter dropdown.
const STORE_LABELS = {
  "halomart":     "🛒 HaloMart",
  "haloclip":     "💡 HaloClip",
  "asaase-gold":  "✨ Asaase Gold",
  "haloride":     "🏍️ HaloRide",
};
const storeLabel = s => STORE_LABELS[s] || ("📦 " + (s ? s.charAt(0).toUpperCase()+s.slice(1) : "Other"));

async function api(path, opts){
  const u = path + (path.includes("?")?"&":"?") + "token=" + encodeURIComponent(TOKEN);
  const r = await fetch(u, opts);
  return r.json();
}

async function load(){
  try{
    DATA = await api("/admin/data.json");
    // build store filter options once
    const sf = document.getElementById("storeFilter");
    const stores = [...new Set(DATA.orders.map(o=>o.store))].sort();
    const current = sf.value;
    sf.innerHTML = '<option value="">All stores</option>' + stores.map(s=>'<option value="'+esc(s)+'">'+esc(storeLabel(s))+'</option>').join("");
    sf.value = current;
    renderStats();
    render();
    document.getElementById("updated").textContent = "Updated " + new Date().toLocaleTimeString();
  }catch(e){
    document.getElementById("list").innerHTML = '<div class="empty">Could not load orders. Check your connection and refresh.</div>';
  }
}

function renderStats(){
  const s = DATA.stats || {};
  const cur = (DATA.orders[0] && DATA.orders[0].currency) || "GHS";
  document.getElementById("statCards").innerHTML = [
    ['rev','Revenue (paid)', money(s.revenue_minor, cur)],
    ['', "Today", money(s.today_revenue_minor, cur) + ' · ' + (s.today_orders||0)],
    ['ship','To ship', s.to_ship||0],
    ['', 'Shipped', s.shipped||0],
    ['review','Needs review', s.need_review||0],
    ['', 'Total orders', s.total_orders||0],
  ].map(([cls,lbl,val])=>'<div class="stat '+cls+'"><div class="lbl">'+lbl+'</div><div class="val">'+val+'</div></div>').join("");
}

function setTab(t){ tab=t; document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("on", b.dataset.f===t)); render(); }

function filtered(){
  const q = document.getElementById("search").value.toLowerCase().trim();
  const store = document.getElementById("storeFilter").value;
  return DATA.orders.filter(o=>{
    if(store && o.store!==store) return false;
    if(tab==="toship"  && !(o.status==="paid" && !o.fulfilled)) return false;
    if(tab==="shipped" && !(o.status==="paid" && o.fulfilled)) return false;
    if(tab==="review"  && o.status!=="pending-review") return false;
    if(tab==="all"     && o.status!=="paid") return false;
    if(q){
      const hay = [o.reference,o.customer,o.customer_email,o.items,o.delivery,o.notes].join(" ").toLowerCase();
      if(!hay.includes(q)) return false;
    }
    return true;
  });
}

function waLink(o){
  // pull a phone out of the "Name · 024..." customer field
  const m = String(o.customer||"").match(/(\\+?\\d[\\d\\s]{7,})/);
  if(!m) return null;
  let num = m[1].replace(/[^\\d]/g,"");
  if(num.startsWith("0")) num = "233" + num.slice(1); // default Ghana; adjust if needed
  const msg = encodeURIComponent("Hi! Update on your order " + o.reference + " from our store:");
  return "https://wa.me/" + num + "?text=" + msg;
}

function render(){
  const list = filtered();
  const box = document.getElementById("list");
  if(!list.length){
    box.innerHTML = '<div class="empty">No orders here yet.<br/><span class="muted">Paid orders appear automatically once Paystack notifies the server.</span></div>';
    return;
  }
  box.innerHTML = list.map(o=>{
    const wa = waLink(o);
    const dateStr = (o.paid_at || o.created_at || "").replace("T"," ").slice(0,16);
    const statusPill = o.status==="paid" ? '<span class="pill paid">paid</span>'
                      : o.status==="pending-review" ? '<span class="pill review">needs review</span>'
                      : '<span class="pill failed">'+esc(o.status)+'</span>';
    return '<div class="order '+(o.fulfilled?"done":"")+'">'
      + '<div class="order-top"><div>'
        + '<span class="ref">'+esc(o.reference)+'<span class="store" data-store="'+esc(o.store)+'">'+esc(storeLabel(o.store))+'</span></span><br/>'
        + '<span class="muted">'+dateStr+' · '+esc(o.channel||"")+' '+statusPill+'</span>'
      + '</div><div class="amt">'+money(o.amount_minor,o.currency)+'</div></div>'
      + '<div class="meta">'
        + row("Customer", o.customer || o.customer_email || "—")
        + (o.customer_email ? row("Email", o.customer_email) : "")
        + row("Items", o.items || "—")
        + row("Deliver", o.delivery || "—")
        + (o.notes && o.notes!=="—" && o.notes!=="-" ? row("Notes", "📝 "+o.notes) : "")
        + (o.promo && o.promo!=="—" && o.promo!=="-" ? row("Promo", o.promo) : "")
      + '</div>'
      + '<div class="order-actions">'
        + (o.status==="paid"
            ? '<button class="ship-btn '+(o.fulfilled?"undo":"")+'" onclick="fulfil(\\''+o.reference+'\\','+(o.fulfilled?0:1)+')">'+(o.fulfilled?"↩ Mark not shipped":"✓ Mark shipped")+'</button>'
            : '<button class="ship-btn" onclick="recheck(\\''+o.reference+'\\')">↻ Re-verify payment</button>')
        + (wa ? '<a class="link-btn" href="'+wa+'" target="_blank" rel="noopener">💬 Message buyer</a>' : "")
        + (o.delivery ? '<button class="link-btn" onclick="copyAddr(\\''+encodeURIComponent(o.delivery)+'\\')">📋 Copy address</button>' : "")
      + '</div>'
    + '</div>';
  }).join("");
}
function row(k,v){ return '<div class="row"><span class="k">'+k+'</span><span class="v">'+esc(v)+'</span></div>'; }

async function fulfil(ref, val){
  await api("/admin/fulfil", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ ref, fulfilled: val }) });
  // optimistic update
  const o = DATA.orders.find(x=>x.reference===ref); if(o) o.fulfilled = val;
  DATA.stats.to_ship += val ? -1 : 1;
  DATA.stats.shipped += val ? 1 : -1;
  renderStats(); render();
}
async function recheck(ref){
  const r = await fetch("/verify/"+encodeURIComponent(ref)+"?token="+encodeURIComponent(TOKEN));
  alert("Re-verify result for "+ref+": see the order list refresh.");
  load();
}
function copyAddr(enc){
  navigator.clipboard.writeText(decodeURIComponent(enc)).then(()=>{
    const old=event.target.textContent; event.target.textContent="✓ Copied";
    setTimeout(()=>event.target.textContent=old,1500);
  });
}
function exportCSV(){
  const rows = [["Reference","Store","Status","Amount","Currency","Channel","Customer","Email","Items","Delivery","Notes","Promo","Fulfilled","Date"]];
  filtered().forEach(o=>rows.push([
    o.reference,o.store,o.status,(o.amount_minor/100),o.currency,o.channel||"",
    o.customer||"",o.customer_email||"",o.items||"",o.delivery||"",o.notes||"",o.promo||"",
    o.fulfilled?"yes":"no",(o.paid_at||o.created_at||"")
  ]));
  const csv = rows.map(r=>r.map(c=>'"'+String(c==null?"":c).replace(/"/g,'""')+'"').join(",")).join("\\n");
  const a=document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv],{type:"text/csv"}));
  a.download = "orders-"+new Date().toISOString().slice(0,10)+".csv";
  a.click();
}

load();
setInterval(load, 60000); // auto-refresh every minute
</script>
</body>
</html>`;
};
