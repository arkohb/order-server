/**
 * ============================================================
 *  PAYSTACK ORDER SERVER — webhook + verification + order log
 *  Works for both stores (Asaase Gold "AG-" and HaloClip "HC-")
 * ============================================================
 *  ZERO npm dependencies — uses Node's built-in modules only.
 *  Requires Node.js 22.5+ (for node:sqlite).
 *
 *  RUN (Node 22.x needs the flag; Node 23.4+ doesn't):
 *    node --experimental-sqlite server.js
 *
 *  CONFIG — set these environment variables (or edit defaults):
 *    PAYSTACK_SECRET_KEY   your sk_test_... or sk_live_... key
 *    ADMIN_TOKEN           any long random string for /admin access
 *    PORT                  default 3000
 *
 *  On Windows (PowerShell):
 *    $env:PAYSTACK_SECRET_KEY="sk_test_xxx"
 *    $env:ADMIN_TOKEN="change-me-to-something-long"
 *    node --experimental-sqlite server.js
 *
 *  ENDPOINTS:
 *    POST /paystack/webhook        ← set this URL in Paystack dashboard
 *    GET  /verify/:reference       manual re-verification of one order
 *    GET  /admin?token=...         HTML order dashboard
 *    GET  /admin/orders.json?token=...  raw JSON of all orders
 *    GET  /health                  uptime check
 * ============================================================
 */

const http = require("node:http");
const crypto = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");
const ADMIN_HTML = require("./admin-dashboard.js");

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || "sk_test_REPLACE_ME";
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "change-me-to-something-long";
const PORT = process.env.PORT || 3000;

/* ---------------------------------------------------------
   DATABASE — money stored as INTEGER minor units (pesewas/kobo)
--------------------------------------------------------- */
const db = new DatabaseSync("./orders.db");
db.exec(`
  CREATE TABLE IF NOT EXISTS orders (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    reference     TEXT UNIQUE NOT NULL,
    store         TEXT NOT NULL,            -- 'asaase-gold' | 'haloclip' | 'unknown'
    status        TEXT NOT NULL,            -- 'paid' | 'failed' | 'pending-review'
    amount_minor  INTEGER NOT NULL,         -- pesewas or kobo
    currency      TEXT NOT NULL,            -- 'GHS' | 'NGN'
    channel       TEXT,                     -- card, mobile_money, bank_transfer...
    customer_email TEXT,
    customer       TEXT,                    -- "Name · phone" from metadata
    delivery       TEXT,                    -- address + ship option from metadata
    items          TEXT,                    -- "black x1, duo x2 ..."
    notes          TEXT,
    promo          TEXT,
    paid_at        TEXT,
    fulfilled      INTEGER DEFAULT 0,       -- toggle from the admin page
    raw_json       TEXT,                    -- full verified payload, for audit
    created_at     TEXT DEFAULT (datetime('now'))
  );
`);

const insertOrder = db.prepare(`
  INSERT OR IGNORE INTO orders
  (reference, store, status, amount_minor, currency, channel, customer_email,
   customer, delivery, items, notes, promo, paid_at, raw_json)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const listOrders = db.prepare(`SELECT * FROM orders ORDER BY id DESC LIMIT 500`);
const getOrder = db.prepare(`SELECT * FROM orders WHERE reference = ?`);
const toggleFulfilled = db.prepare(`UPDATE orders SET fulfilled = 1 - fulfilled WHERE reference = ?`);
const setFulfilled = db.prepare(`UPDATE orders SET fulfilled = ? WHERE reference = ?`);
const getOneOrder = db.prepare(`SELECT * FROM orders WHERE reference = ?`);
const statsQuery = db.prepare(`
  SELECT
    COUNT(*) AS total_orders,
    COALESCE(SUM(CASE WHEN status='paid' THEN amount_minor ELSE 0 END),0) AS revenue_minor,
    COALESCE(SUM(CASE WHEN status='paid' AND fulfilled=0 THEN 1 ELSE 0 END),0) AS to_ship,
    COALESCE(SUM(CASE WHEN status='pending-review' THEN 1 ELSE 0 END),0) AS need_review,
    COALESCE(SUM(CASE WHEN status='paid' AND fulfilled=1 THEN 1 ELSE 0 END),0) AS shipped,
    COALESCE(SUM(CASE WHEN status='paid' AND date(COALESCE(paid_at,created_at)) = date('now') THEN amount_minor ELSE 0 END),0) AS today_revenue_minor,
    COALESCE(SUM(CASE WHEN status='paid' AND date(COALESCE(paid_at,created_at)) = date('now') THEN 1 ELSE 0 END),0) AS today_orders
  FROM orders
`);

/* ---- customer accounts ---- */
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    email      TEXT UNIQUE NOT NULL,
    name       TEXT NOT NULL,
    phone      TEXT,
    pass_hash  TEXT NOT NULL,
    salt       TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);
const insertUser = db.prepare(`INSERT INTO users (email, name, phone, pass_hash, salt) VALUES (?, ?, ?, ?, ?)`);
const getUserByEmail = db.prepare(`SELECT * FROM users WHERE email = ?`);
const ordersByEmail = db.prepare(`SELECT reference, store, status, amount_minor, currency, items, delivery, paid_at, fulfilled, created_at FROM orders WHERE customer_email = ? ORDER BY id DESC LIMIT 100`);

const AUTH_SECRET = process.env.AUTH_SECRET || ADMIN_TOKEN; // set AUTH_SECRET for extra safety
const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString("hex");
}
function makeToken(email) {
  const payload = Buffer.from(JSON.stringify({ e: email, x: Date.now() + TOKEN_TTL_MS })).toString("base64url");
  const sig = crypto.createHmac("sha256", AUTH_SECRET).update(payload).digest("base64url");
  return payload + "." + sig;
}
function emailFromToken(token) {
  try {
    const [payload, sig] = String(token).split(".");
    const expected = crypto.createHmac("sha256", AUTH_SECRET).update(payload).digest("base64url");
    if (!sig || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    return Date.now() < data.x ? data.e : null;
  } catch { return null; }
}
function authedEmail(req) {
  const h = req.headers["authorization"] || "";
  return h.startsWith("Bearer ") ? emailFromToken(h.slice(7)) : null;
}

/* ---- password recovery ---- */
db.exec(`
  CREATE TABLE IF NOT EXISTS password_resets (
    email      TEXT PRIMARY KEY,
    code_hash  TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    attempts   INTEGER DEFAULT 0
  );
`);
const upsertReset = db.prepare(`INSERT INTO password_resets (email, code_hash, expires_at, attempts) VALUES (?, ?, ?, 0)
  ON CONFLICT(email) DO UPDATE SET code_hash=excluded.code_hash, expires_at=excluded.expires_at, attempts=0`);
const getReset = db.prepare(`SELECT * FROM password_resets WHERE email = ?`);
const bumpResetAttempts = db.prepare(`UPDATE password_resets SET attempts = attempts + 1 WHERE email = ?`);
const deleteReset = db.prepare(`DELETE FROM password_resets WHERE email = ?`);
const updatePassword = db.prepare(`UPDATE users SET pass_hash = ?, salt = ? WHERE email = ?`);

const RESEND_API_KEY = process.env.RESEND_API_KEY || "";   // get one free at resend.com
const MAIL_FROM = process.env.MAIL_FROM || "onboarding@resend.dev"; // use your domain sender once verified
const RESET_TTL_MS = 15 * 60 * 1000; // codes valid 15 minutes

const hashCode = (code) => crypto.createHash("sha256").update(String(code)).digest("hex");

async function sendResetEmail(to, code) {
  if (!RESEND_API_KEY) {
    console.log(`📨 (no RESEND_API_KEY set) Password reset code for ${to}: ${code} — send it to the customer manually (e.g. WhatsApp)`);
    return false; // not emailed, but code exists
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: MAIL_FROM,
      to: [to],
      subject: `Your password reset code: ${code}`,
      html: `<div style="font-family:sans-serif;max-width:420px">
        <h2>Password reset</h2>
        <p>Use this code to reset your password. It expires in 15 minutes.</p>
        <p style="font-size:30px;font-weight:bold;letter-spacing:6px">${code}</p>
        <p style="color:#777;font-size:13px">If you didn't request this, you can safely ignore this email.</p>
      </div>`,
    }),
  });
  if (!res.ok) {
    console.error(`✖ Reset email to ${to} failed (${res.status}) — code is: ${code}`);
    return false;
  }
  return true;
}

/* ---------------------------------------------------------
   HELPERS
--------------------------------------------------------- */
function storeFromReference(ref = "") {
  if (ref.startsWith("AG-")) return "asaase-gold";
  if (ref.startsWith("HC-")) return "haloclip";
  if (ref.startsWith("HM-")) return "halomart";
  return "unknown";
}

function metaField(metadata, name) {
  const f = metadata?.custom_fields?.find(
    (x) => x.variable_name === name || x.display_name?.toLowerCase() === name
  );
  return f ? String(f.value) : null;
}

/** Always confirm with Paystack's verify API — never trust the webhook body alone. */
async function verifyWithPaystack(reference) {
  const res = await fetch(
    `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
    { headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` } }
  );
  if (!res.ok) throw new Error(`Verify API HTTP ${res.status}`);
  const body = await res.json();
  if (!body.status) throw new Error(`Verify API error: ${body.message}`);
  return body.data; // { status, amount, currency, channel, customer, metadata, paid_at, ... }
}

function saveVerifiedOrder(d) {
  const m = d.metadata || {};
  insertOrder.run(
    d.reference,
    storeFromReference(d.reference),
    d.status === "success" ? "paid" : d.status,
    d.amount,                       // already in minor units from Paystack
    d.currency,
    d.channel || null,
    d.customer?.email || null,
    metaField(m, "customer"),
    metaField(m, "delivery"),
    metaField(m, "items"),
    metaField(m, "notes"),
    metaField(m, "promo"),
    d.paid_at || null,
    JSON.stringify(d)
  );
  console.log(`✔ Order saved: ${d.reference} · ${d.currency} ${(d.amount / 100).toLocaleString()} · ${d.channel}`);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => { data += c; if (data.length > 1e6) req.destroy(); });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function json(res, code, obj) {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(obj));
}

const fmtMoney = (minor, cur) =>
  (cur === "GHS" ? "₵" : "₦") + (minor / 100).toLocaleString();

/* ---------------------------------------------------------
   SERVER
--------------------------------------------------------- */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  /* CORS — the stores live on Netlify domains, the API lives here */
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }

  try {
    /* ---------- health ---------- */
    if (req.method === "GET" && url.pathname === "/health") {
      return json(res, 200, { ok: true, time: new Date().toISOString() });
    }

    /* ---------- Paystack webhook ---------- */
    if (req.method === "POST" && url.pathname === "/paystack/webhook") {
      const raw = await readBody(req);

      // 1. Verify the HMAC signature so only Paystack can hit this
      const signature = req.headers["x-paystack-signature"];
      const expected = crypto
        .createHmac("sha512", PAYSTACK_SECRET_KEY)
        .update(raw)
        .digest("hex");
      if (!signature || signature !== expected) {
        console.warn("✖ Webhook rejected: bad signature");
        return json(res, 401, { error: "invalid signature" });
      }

      // 2. Respond 200 fast (Paystack retries if we're slow), then process
      json(res, 200, { received: true });

      const event = JSON.parse(raw);
      if (event.event !== "charge.success") {
        console.log(`· Ignored event: ${event.event}`);
        return;
      }

      // 3. Double-check with the verify API, then log
      const reference = event.data?.reference;
      try {
        const verified = await verifyWithPaystack(reference);
        if (verified.status === "success") saveVerifiedOrder(verified);
        else console.warn(`! ${reference}: webhook said success but verify says '${verified.status}'`);
      } catch (e) {
        console.error(`! Could not verify ${reference}: ${e.message} — flagging for review`);
        insertOrder.run(reference, storeFromReference(reference), "pending-review",
          event.data?.amount || 0, event.data?.currency || "?", event.data?.channel || null,
          event.data?.customer?.email || null, null, null, null, null, null, null, raw);
      }
      return;
    }

    /* ---------- manual verification ---------- */
    if (req.method === "GET" && url.pathname.startsWith("/verify/")) {
      const reference = url.pathname.split("/verify/")[1];
      const verified = await verifyWithPaystack(reference);
      if (verified.status === "success") saveVerifiedOrder(verified);
      return json(res, 200, {
        reference,
        status: verified.status,
        amount: fmtMoney(verified.amount, verified.currency),
        channel: verified.channel,
        paid_at: verified.paid_at,
      });
    }

    /* ---------- admin: auth gate ---------- */
    if (url.pathname.startsWith("/admin")) {
      if (url.searchParams.get("token") !== ADMIN_TOKEN) {
        // a tiny login screen rather than a raw JSON error
        res.writeHead(401, { "Content-Type": "text/html; charset=utf-8" });
        return res.end(`<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Sign in</title>
          <style>body{font-family:system-ui,sans-serif;background:#0f1115;color:#e9e6df;display:grid;place-items:center;height:100vh;margin:0}
          .box{background:#181b22;border:1px solid #2a2e38;border-radius:16px;padding:2rem;width:min(340px,90%);text-align:center}
          input{width:100%;box-sizing:border-box;margin:1rem 0;padding:.7rem;border-radius:9px;border:1px solid #2a2e38;background:#0f1115;color:#fff;font-size:1rem}
          button{width:100%;padding:.7rem;border:none;border-radius:9px;background:#e0a92b;color:#1a1712;font-weight:700;font-size:1rem;cursor:pointer}
          h1{font-size:1.1rem}</style></head><body><div class="box">
          <h1>📦 Store Orders</h1><p style="color:#8b9099;font-size:.85rem">Enter your admin token to continue</p>
          <input id="t" type="password" placeholder="Admin token" autofocus />
          <button onclick="location.href='/admin?token='+encodeURIComponent(document.getElementById('t').value)">Sign in</button>
          </div><script>document.getElementById('t').addEventListener('keydown',e=>{if(e.key==='Enter')document.querySelector('button').click()})</script></body></html>`);
      }

      // --- actions / data endpoints ---
      if (req.method === "POST" && url.pathname === "/admin/fulfil") {
        const body = JSON.parse(await readBody(req) || "{}");
        if (body.fulfilled === 0 || body.fulfilled === 1) setFulfilled.run(body.fulfilled, body.ref);
        else toggleFulfilled.run(body.ref);
        return json(res, 200, { ok: true });
      }
      if (url.pathname === "/admin/data.json") {
        const s = statsQuery.get();
        return json(res, 200, { stats: s, orders: listOrders.all() });
      }
      if (url.pathname === "/admin/orders.json") {
        return json(res, 200, listOrders.all());
      }
      if (url.pathname === "/admin/order.json") {
        const o = getOneOrder.get(url.searchParams.get("ref"));
        return json(res, 200, o || { error: "not found" });
      }

      // --- the dashboard shell (data loads via fetch) ---
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(ADMIN_HTML(ADMIN_TOKEN));
    }

    /* ---------- customer accounts API ---------- */
    if (req.method === "POST" && url.pathname === "/api/signup") {
      const b = JSON.parse(await readBody(req) || "{}");
      const email = String(b.email || "").trim().toLowerCase();
      const name = String(b.name || "").trim().slice(0, 100);
      const phone = String(b.phone || "").trim().slice(0, 30);
      const password = String(b.password || "");
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json(res, 400, { error: "Enter a valid email" });
      if (!name) return json(res, 400, { error: "Enter your name" });
      if (password.length < 6) return json(res, 400, { error: "Password must be at least 6 characters" });
      if (getUserByEmail.get(email)) return json(res, 409, { error: "An account with this email already exists — log in instead" });
      const salt = crypto.randomBytes(16).toString("hex");
      insertUser.run(email, name, phone, hashPassword(password, salt), salt);
      console.log(`✔ New account: ${email}`);
      return json(res, 200, { token: makeToken(email), user: { name, email, phone } });
    }

    if (req.method === "POST" && url.pathname === "/api/login") {
      const b = JSON.parse(await readBody(req) || "{}");
      const email = String(b.email || "").trim().toLowerCase();
      const u = getUserByEmail.get(email);
      const ok = u && crypto.timingSafeEqual(
        Buffer.from(u.pass_hash, "hex"),
        Buffer.from(hashPassword(String(b.password || ""), u.salt), "hex")
      );
      if (!ok) return json(res, 401, { error: "Wrong email or password" });
      return json(res, 200, { token: makeToken(email), user: { name: u.name, email: u.email, phone: u.phone } });
    }

    if (req.method === "GET" && url.pathname === "/api/me") {
      const email = authedEmail(req);
      if (!email) return json(res, 401, { error: "Please log in again" });
      const u = getUserByEmail.get(email);
      if (!u) return json(res, 401, { error: "Account not found" });
      return json(res, 200, { user: { name: u.name, email: u.email, phone: u.phone } });
    }

    if (req.method === "GET" && url.pathname === "/api/my-orders") {
      const email = authedEmail(req);
      if (!email) return json(res, 401, { error: "Please log in again" });
      return json(res, 200, { orders: ordersByEmail.all(email) });
    }

    /* ---------- password recovery ---------- */
    if (req.method === "POST" && url.pathname === "/api/forgot") {
      const b = JSON.parse(await readBody(req) || "{}");
      const email = String(b.email || "").trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json(res, 400, { error: "Enter a valid email" });
      // Always answer the same way so nobody can probe which emails have accounts
      const reply = { ok: true, message: "If that email has an account, a reset code is on its way." };
      const u = getUserByEmail.get(email);
      if (u) {
        const code = String(crypto.randomInt(100000, 1000000)); // 6 digits
        upsertReset.run(email, hashCode(code), Date.now() + RESET_TTL_MS);
        const emailed = await sendResetEmail(email, code);
        if (!emailed) reply.message = "If that email has an account, a code was created — contact us on WhatsApp if it doesn't arrive.";
      }
      return json(res, 200, reply);
    }

    if (req.method === "POST" && url.pathname === "/api/reset") {
      const b = JSON.parse(await readBody(req) || "{}");
      const email = String(b.email || "").trim().toLowerCase();
      const code = String(b.code || "").trim();
      const password = String(b.password || "");
      if (password.length < 6) return json(res, 400, { error: "New password must be at least 6 characters" });
      const r = getReset.get(email);
      if (!r || Date.now() > r.expires_at) return json(res, 400, { error: "Code expired or not found — request a new one" });
      if (r.attempts >= 5) { deleteReset.run(email); return json(res, 429, { error: "Too many tries — request a new code" }); }
      if (hashCode(code) !== r.code_hash) {
        bumpResetAttempts.run(email);
        return json(res, 400, { error: "Wrong code — check and try again" });
      }
      const salt = crypto.randomBytes(16).toString("hex");
      updatePassword.run(hashPassword(password, salt), salt, email);
      deleteReset.run(email);
      console.log(`✔ Password reset for ${email}`);
      const u = getUserByEmail.get(email);
      return json(res, 200, { token: makeToken(email), user: { name: u.name, email: u.email, phone: u.phone } });
    }

    json(res, 404, { error: "not found" });
  } catch (e) {
    console.error("Server error:", e.message);
    json(res, 500, { error: e.message });
  }
});

server.listen(PORT, () => {
  console.log(`
  ─────────────────────────────────────────────
  Paystack order server running on port ${PORT}
  Webhook URL:  POST /paystack/webhook
  Dashboard:    GET  /admin?token=${ADMIN_TOKEN}
  Verify one:   GET  /verify/:reference
  ${PAYSTACK_SECRET_KEY.includes("REPLACE") ? "⚠ Set PAYSTACK_SECRET_KEY before going live!" : "✔ Secret key loaded"}
  ─────────────────────────────────────────────`);
});
