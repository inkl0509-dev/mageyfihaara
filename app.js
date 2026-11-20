// Magey Fihaara — simple point-of-sale for small snack sellers (MVR)
// Firebase Auth + Firestore (works offline, syncs when internet returns)

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, signOut, sendPasswordResetEmail, sendEmailVerification
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, doc, setDoc, updateDoc, deleteDoc, getDoc, getDocs,
  onSnapshot, query, where, orderBy, serverTimestamp, writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

// App owner / admin. Must match ADMIN_EMAIL in firestore.rules
const ADMIN_EMAIL = "iirufan@gmail.com";

const fbApp = initializeApp(firebaseConfig);
const auth = getAuth(fbApp);
const db = initializeFirestore(fbApp, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});

// ---------------- State ----------------
const DEFAULT_SHOP = {
  name: "Magey Fihaara", phone: "", address: "",
  country: "960", footer: "Thank you! Come again 🙏"
};
const S = {
  uid: null,
  shopId: null,
  unsubAdmin: [],
  shop: { ...DEFAULT_SHOP },
  items: [],
  cart: new Map(),       // itemId -> qty
  payment: "cash",
  editItemId: null,
  itemPhoto: "",
  qtyItemId: null,
  billSale: null,        // sale shown in receipt modal
  period: "today",
  periodSales: [],
  unsubItems: null,
};

// ---------------- Helpers ----------------
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const num = (n) => Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 2 });
const CURRENCY = "MVR";
const money = (n) => `${CURRENCY} ${num(n)}`;
const col = (name) => collection(db, "shops", S.shopId, name);
const pad = (n) => String(n).padStart(2, "0");
const fmtDateTime = (d) =>
  `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
const toDateInput = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// ---------------- Dhivehi words ----------------
const DV = {
  // Magey Fihaara
  searchPh: "އައިޓަމް ހޯއްދަވާ ނުވަތަ ބާކޯޑު ޖައްސަވާ…",
  hint: "އައިޓަމަށް ފިއްތާލުމުން = 1+  ·  ޢަދަދަށް ފިއްތާލުމުން = ބޭނުންވާ ޢަދަދު ޖަހާ (މިސާލަކަށް: 20)",
  qtyBtn: "ޢަދަދު",
  add: "އިތުރުކުރޭ",
  addItem: "އައިޓަމް އިތުރުކުރޭ",
  addPhoto: "ފޮޓޯ ލުމަށް ފިއްތާލާ",
  itemName: "އައިޓަމްގެ ނަން",
  itemNamePh: "މިސާލަކަށް: މަސްރޮށި",
  salePrice: "ވިއްކާ އަގު (ދިވެހި ރުފިޔާ)",
  costPrice: "ގަތް އަގު (ދިވެހި ރުފިޔާ) (އިޚްތިޔާރީ)",
  barcode: "ބާކޯޑު",
  scanOrType: "ސްކޭން ނުވަތަ ޓައިޕްކުރޭ",
  makeNew: "އަލުން ހަދާ",
  saveItem: "އައިޓަމް ސޭވްކުރޭ",
  // same words as Naalu
  total: "ޖުމްލަ", cash: "ނަގުދު ފައިސާ", transfer: "ޓްރާންސްފަރ",
  today: "މިއަދު", yesterday: "އިއްޔެ", days7: "7 ދުވަސް", thisMonth: "މި މަސް", custom: "ކަސްޓަމް",
  expenses: "ޚަރަދުތައް", noExpenses: "އެއްވެސް ޚަރަދެއް ނެތް",
  country: "ކަންޓްރީ ކޯޑު (ދިވެހިރާއްޖެ = 960)", saveSettings: "ސެޓިންގްސް ސޭވްކުރޭ", logout: "ލޮގް އައުޓް",
  navItems: "އައިޓަމްތައް", navAccounts: "ހިސާބު ކިތާބު", navSettings: "ސެޓިންގް",
  navSell: "ވިއްކާ",
  searchItems: "ތަކެތި ހޯދާ",
  expPh: "މިސާލަކަށް: ތެޔޮ، ގޭސް، ކުލި",
  mvr: "ރުފިޔާ",
  topItems: "އެންމެ ގިނައިން ވިކުނު ތަކެތި",
  noSales: "މި މުއްދަތުގައި އެއްވެސް ވިޔަފާރިއެއް ނުވޭ",
  bills: "ބިލްތައް",
  downloadCsv: "ޑައުންލޯޑް ސީ.އެސް.ވީ",
  noBills: "އެއްވެސް ބިލެއް ނެތް",
  shopName: "ފިހާރައިގެ ނަން",
  shopNamePh: "ހެދިކާ ފިހާރަ",
  shopPhone: "ފިހާރައިގެ ފޯނު ނަންބަރު",
  address: "އެޑްރެސް",
  footer: "ބިލުގެ ތިރީގައި ހިމަނާ މެސެޖު",
};
const EN = {
  qtyBtn: "Qty", addItem: "Add item", addPhoto: "Tap to add photo",
  cash: "Cash", transfer: "Transfer", expenses: "Expenses", noExpenses: "No expenses",
  noSales: "No sales in this period", noBills: "No bills",
};
// Bill footer suggestions (the bill text is the shop's choice, not each phone's language)
const FOOTERS = ["Thank you! Come again 🙏", "ޝުކުރިއްޔާ! އަލުން ވަޑައިގަންނަވާ! 🙏"];
let LANG = "en";
try { LANG = localStorage.getItem("magey-lang") || "en"; } catch {}
const t = (k) => (LANG === "dv" && DV[k]) || EN[k] || k;
const dvc = () => (LANG === "dv" ? "dv" : "");

let toastTimer;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add("hidden"), 2200);
}
const fail = (e) => toast("Error: " + (e?.message || e));

function openModal(id) { $(id).classList.remove("hidden"); }
function closeModal(el) { el.closest(".modal").classList.add("hidden"); }
document.addEventListener("click", (e) => {
  if (e.target.matches("[data-close]")) closeModal(e.target);
  else if (e.target.classList.contains("modal") && e.target.id !== "scanModal") e.target.classList.add("hidden");
});

function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.frequency.value = 1200; g.gain.value = 0.15;
    o.connect(g); g.connect(ctx.destination); o.start();
    setTimeout(() => { o.stop(); ctx.close(); }, 120);
  } catch {}
  navigator.vibrate?.(60);
}

// Maldives: 7-digit local number (e.g. 7771234) -> 9607771234; keeps numbers that already have a country code
function normalizePhone(p) {
  let d = String(p || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("00")) d = d.slice(2);
  else if (d.startsWith("0")) d = (S.shop.country || "960") + d.slice(1);
  else if (d.length === 7) d = (S.shop.country || "960") + d;
  return d;
}
function waUrl(phone, text) {
  const p = normalizePhone(phone);
  return `https://wa.me/${p}?text=${encodeURIComponent(text)}`;
}

// ---------------- Online / offline ----------------
function updateNet() { $("#netStatus").classList.toggle("hidden", navigator.onLine); }
window.addEventListener("online", updateNet);
window.addEventListener("offline", updateNet);

// ---------------- Auth ----------------
$("#loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  try { await signInWithEmailAndPassword(auth, $("#email").value.trim(), $("#password").value); }
  catch (err) { fail(err); }
});
$("#signupBtn").addEventListener("click", async () => {
  const email = $("#email").value.trim(), pass = $("#password").value;
  if (!email || pass.length < 6) return toast("Enter email and a 6+ letter password");
  try { await createUserWithEmailAndPassword(auth, email, pass); toast("Account created"); }
  catch (err) { fail(err); }
});
$("#resetBtn").addEventListener("click", async () => {
  const email = $("#email").value.trim();
  if (!email) return toast("Type your email first");
  try { await sendPasswordResetEmail(auth, email); toast("Reset email sent"); }
  catch (err) { fail(err); }
});
$("#logoutBtn").addEventListener("click", () => {
  if (confirm("Logout from this phone?")) signOut(auth);
});
$$("[data-logout]").forEach((b) => b.addEventListener("click", () => signOut(auth)));

// ---------------- Screens / routing ----------------
// login → (admin panel) or (enter shop code) → shop POS
const SCREENS = ["#login", "#verifyScreen", "#joinScreen", "#adminScreen", "#app"];
function showScreen(id) { SCREENS.forEach((s) => $(s).classList.toggle("hidden", s !== id)); }

function stopListeners() {
  S.unsubItems?.(); S.unsubItems = null;
  S.unsubAdmin.forEach((u) => u()); S.unsubAdmin = [];
}

onAuthStateChanged(auth, async (user) => {
  stopListeners();
  S.items = []; S.cart.clear(); S.shopId = null;
  if (!user) { S.uid = null; showScreen("#login"); return; }
  S.uid = user.uid;
  updateNet();
  $$(".whoami").forEach((el) => el.textContent = "Logged in as " + user.email);

  try {
    // 1) Admin? (owner email, must be verified so nobody can fake it)
    if ((user.email || "").toLowerCase() === ADMIN_EMAIL) {
      if (!user.emailVerified) { showVerify(); return; }
      await user.getIdToken(true);       // refresh so the server sees "verified"
      startAdmin(); return;
    }
    const adm = await getDoc(doc(db, "admins", user.uid));
    if (adm.exists()) { startAdmin(); return; }
    // 2) Already joined a shop?
    const me = await getDoc(doc(db, "users", user.uid));
    if (me.exists()) { await startShop(me.data().shopId); return; }
    // 3) New user → ask for shop code
    showJoin("");
  } catch (e) {
    showJoin("Could not connect. Check internet and try again. (" + (e.code || e.message) + ")");
  }
});

// ---------------- Admin email verification ----------------
function showVerify() {
  $("#verifyMsg").textContent = "";
  showScreen("#verifyScreen");
}
$("#sendVerifyBtn").addEventListener("click", async () => {
  try {
    await sendEmailVerification(auth.currentUser);
    $("#verifyMsg").textContent = `✅ Link sent to ${auth.currentUser.email}. Open your Gmail and tap the link (check Spam too).`;
  } catch (e) { $("#verifyMsg").textContent = "❌ " + (e.code || e.message); }
});
$("#verifiedBtn").addEventListener("click", async () => {
  const u = auth.currentUser;
  await u.reload();
  if (!u.emailVerified) { $("#verifyMsg").textContent = "Not verified yet. Tap the link in your email first."; return; }
  await u.getIdToken(true);
  startAdmin();
});

// ---------------- Join a shop with a code ----------------
const cleanCode = (c) => String(c || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const prettyCode = (c) => c.length === 8 ? c.slice(0, 4) + "-" + c.slice(4) : c;

function showJoin(msg) {
  $("#joinMsg").textContent = msg || "";
  $("#joinCode").value = "";
  showScreen("#joinScreen");
}
$("#joinForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const code = cleanCode($("#joinCode").value);
  if (code.length < 6) return toast("Enter the code from admin");
  $("#joinMsg").textContent = "Checking…";
  try {
    const c = await getDoc(doc(db, "codes", code));
    if (!c.exists()) { $("#joinMsg").textContent = "❌ Wrong code. Ask admin for the correct code."; return; }
    const shopId = c.data().shopId;
    await setDoc(doc(db, "users", S.uid), {
      shopId, code, email: auth.currentUser.email || "", joinedAt: Date.now()
    });
    await startShop(shopId);
    toast("Welcome! ✔");
  } catch (err) {
    $("#joinMsg").textContent = "❌ Could not join: " + (err.code || err.message);
  }
});

async function startShop(shopId) {
  S.shopId = shopId;
  let snap;
  try { snap = await getDoc(doc(db, "shops", shopId)); }
  catch {
    showJoin("⛔ This shop is turned off or this phone was removed. Contact admin.");
    return;
  }
  if (!snap.exists()) { showJoin("⛔ Shop not found. Contact admin."); return; }
  S.shop = { ...DEFAULT_SHOP, ...snap.data() };
  showScreen("#app");
  applyShop();

  S.unsubItems = onSnapshot(query(col("items"), orderBy("name")), (snap) => {
    S.items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    for (const id of [...S.cart.keys()]) if (!S.items.find((i) => i.id === id)) S.cart.delete(id);
    renderSellGrid(); renderItemList(); renderCartBar();
  }, (e) => {
    if (e.code === "permission-denied") showJoin("⛔ This shop is turned off or this phone was removed. Contact admin.");
    else fail(e);
  });
}

// ---------------- ADMIN ----------------
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I to avoid confusion
function newCode() {
  const r = crypto.getRandomValues(new Uint32Array(8));
  return [...r].map((n) => CODE_CHARS[n % CODE_CHARS.length]).join("");
}
const A = { shops: [], users: [] };

function startAdmin() {
  showScreen("#adminScreen");
  S.unsubAdmin.push(onSnapshot(query(collection(db, "shops"), orderBy("createdAtMs", "desc")), (snap) => {
    A.shops = snap.docs.map((d) => ({ id: d.id, ...d.data() })); renderAdmin();
  }, fail));
  S.unsubAdmin.push(onSnapshot(collection(db, "users"), (snap) => {
    A.users = snap.docs.map((d) => ({ id: d.id, ...d.data() })); renderAdmin();
  }, fail));
}

function renderAdmin() {
  $("#adminCount").textContent = `${A.shops.length} shop${A.shops.length === 1 ? "" : "s"}`;
  $("#shopList").innerHTML = A.shops.length ? A.shops.map((sh) => {
    const members = A.users.filter((u) => u.shopId === sh.id);
    return `<div class="shopcard ${sh.active ? "" : "off"}" data-id="${sh.id}">
      <div class="row between">
        <b class="grow">${esc(sh.name)}</b>
        <span class="tag ${sh.active ? "cash" : "offtag"}">${sh.active ? "Active" : "Turned off"}</span>
      </div>
      <div class="code">${prettyCode(esc(sh.code))}</div>
      <div class="row wrap">
        <button class="btn small wa" data-a="share">Share code</button>
        <button class="btn small" data-a="copy">Copy</button>
        <button class="btn small" data-a="regen">New code</button>
        <button class="btn small ${sh.active ? "danger-outline" : ""}" data-a="toggle">${sh.active ? "Turn off" : "Turn on"}</button>
      </div>
      <div class="muted">📱 ${members.length} phone${members.length === 1 ? "" : "s"} logged in</div>
      ${members.map((u) => `<div class="member"><span class="grow">${esc(u.email || u.id)}</span>
        <button class="x" data-a="kick" data-uid="${u.id}" title="Remove">✕</button></div>`).join("")}
    </div>`;
  }).join("") : `<div class="empty">No shops yet. Create the first one above.</div>`;
}

$("#newShopForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = $("#newShopName").value.trim(); if (!name) return;
  const code = newCode();
  const shopRef = doc(collection(db, "shops"));
  const b = writeBatch(db);
  b.set(shopRef, { ...DEFAULT_SHOP, name, code, active: true, createdAtMs: Date.now() });
  b.set(doc(db, "codes", code), { shopId: shopRef.id, createdAtMs: Date.now() });
  try { await b.commit(); $("#newShopName").value = ""; toast(`Shop created. Code: ${prettyCode(code)}`); }
  catch (err) { fail(err); }
});

$("#shopList").addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-a]"); if (!btn) return;
  const sh = A.shops.find((x) => x.id === btn.closest(".shopcard").dataset.id); if (!sh) return;
  const msg = `Your *Magey Fihaara* shop code for "${sh.name}":\n\n*${prettyCode(sh.code)}*\n\n1. Open ${location.origin}\n2. Create account / login\n3. Enter this code`;
  try {
    switch (btn.dataset.a) {
      case "share": window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank"); break;
      case "copy": await navigator.clipboard.writeText(prettyCode(sh.code)); toast("Code copied"); break;
      case "toggle":
        if (sh.active && !confirm(`Turn off "${sh.name}"? Its phones will stop working until you turn it on.`)) return;
        await updateDoc(doc(db, "shops", sh.id), { active: !sh.active });
        break;
      case "regen": {
        if (!confirm("Make a new code? The old code will stop working for NEW phones. Phones already logged in keep working.")) return;
        const code = newCode();
        const b = writeBatch(db);
        b.delete(doc(db, "codes", sh.code));
        b.set(doc(db, "codes", code), { shopId: sh.id, createdAtMs: Date.now() });
        b.update(doc(db, "shops", sh.id), { code });
        await b.commit();
        toast("New code: " + prettyCode(code));
        break;
      }
      case "kick": {
        const u = A.users.find((x) => x.id === btn.dataset.uid);
        if (!confirm(`Remove ${u?.email || "this phone"} from "${sh.name}"?`)) return;
        await deleteDoc(doc(db, "users", btn.dataset.uid));
        toast("Removed");
        break;
      }
    }
  } catch (err) { fail(err); }
});

// ---------------- Navigation ----------------
$$(".bottomnav button").forEach((b) => b.addEventListener("click", () => {
  $$(".bottomnav button").forEach((x) => x.classList.toggle("active", x === b));
  $$(".view").forEach((v) => v.classList.add("hidden"));
  $("#view-" + b.dataset.view).classList.remove("hidden");
  if (b.dataset.view === "accounts") loadAccounts();
  if (b.dataset.view === "settings") fillSettings();
}));

// ---------------- SELL ----------------
const findByBarcode = (code) => S.items.find((i) => i.barcode && i.barcode === String(code).trim());

function filteredSellItems() {
  const q = $("#search").value.trim().toLowerCase();
  if (!q) return S.items;
  return S.items.filter((i) => i.name.toLowerCase().includes(q) || (i.barcode || "").includes(q));
}

function renderSellGrid() {
  const list = filteredSellItems();
  const grid = $("#sellGrid");
  if (!S.items.length) {
    grid.innerHTML = `<div class="empty">No items yet.<br>Go to <b>📦 Items</b> and add your first item.</div>`;
    return;
  }
  if (!list.length) { grid.innerHTML = `<div class="empty">No match</div>`; return; }
  grid.innerHTML = list.map((i) => {
    const q = S.cart.get(i.id) || 0;
    return `<div class="card ${q ? "in" : ""}" data-id="${i.id}">
      ${q ? `<span class="badge">${q}</span>` : ""}
      ${i.photo ? `<img src="${i.photo}" alt="">` : `<div class="noimg">${esc(i.name.slice(0, 2).toUpperCase())}</div>`}
      <div class="nm">${esc(i.name)}</div>
      <div class="pr">${money(i.price)}</div>
      <button class="qtybtn ${dvc()}" type="button">🔢 ${t("qtyBtn")}</button>
    </div>`;
  }).join("");
}

function setQty(id, qty) {
  qty = Math.max(0, Math.floor(Number(qty) || 0));
  if (qty === 0) S.cart.delete(id); else S.cart.set(id, qty);
  renderSellGrid(); renderCartBar();
  if (!$("#checkoutModal").classList.contains("hidden")) renderCheckout();
}
const addToCart = (id, n = 1) => { setQty(id, (S.cart.get(id) || 0) + n); navigator.vibrate?.(25); };

function cartLines() {
  return [...S.cart].map(([id, qty]) => {
    const it = S.items.find((i) => i.id === id);
    return it ? { id, name: it.name, price: Number(it.price) || 0, cost: Number(it.cost) || 0, qty } : null;
  }).filter(Boolean);
}
const cartSubtotal = () => cartLines().reduce((s, l) => s + l.price * l.qty, 0);

function renderCartBar() {
  const count = [...S.cart.values()].reduce((a, b) => a + b, 0);
  $("#cartCount").textContent = `${count} item${count === 1 ? "" : "s"}`;
  $("#cartTotal").textContent = money(cartSubtotal());
}

// tap = +1, "Qty" button or long-press = type quantity
const grid = $("#sellGrid");
const lp = { t: null, fired: false };
grid.addEventListener("pointerdown", (e) => {
  const card = e.target.closest(".card"); if (!card || e.target.closest(".qtybtn")) return;
  lp.fired = false; clearTimeout(lp.t);
  lp.t = setTimeout(() => { lp.fired = true; openQty(card.dataset.id); }, 550);
});
["pointerup", "pointercancel", "pointerleave"].forEach((ev) =>
  grid.addEventListener(ev, () => clearTimeout(lp.t)));
grid.addEventListener("contextmenu", (e) => e.preventDefault());
grid.addEventListener("click", (e) => {
  const card = e.target.closest(".card"); if (!card) return;
  if (e.target.closest(".qtybtn")) { openQty(card.dataset.id); return; }
  if (lp.fired) { lp.fired = false; return; }
  addToCart(card.dataset.id);
});

$("#search").addEventListener("input", renderSellGrid);
// Enter in search: exact barcode match (works with USB/Bluetooth barcode guns) or single result
$("#search").addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  e.preventDefault();
  const v = $("#search").value.trim(); if (!v) return;
  const byCode = findByBarcode(v);
  const list = filteredSellItems();
  const hit = byCode || (list.length === 1 ? list[0] : null);
  if (hit) { addToCart(hit.id); beep(); toast(`+1 ${hit.name}`); $("#search").value = ""; renderSellGrid(); }
  else toast("Not found: " + v);
});

$("#scanSellBtn").addEventListener("click", () => openScanner((code) => {
  const it = findByBarcode(code);
  if (it) { addToCart(it.id); $("#scanMsg").textContent = `✅ +1 ${it.name}  (in bill: ${S.cart.get(it.id)})`; }
  else $("#scanMsg").textContent = `❌ Not found: ${code}`;
}, true));

$("#clearCartBtn").addEventListener("click", () => {
  if (S.cart.size && confirm("Clear this bill?")) { S.cart.clear(); renderSellGrid(); renderCartBar(); }
});

// Quantity number pad: type how many of this item are in the bill
const qp = { value: "", fresh: true };
function showQty() {
  const it = S.items.find((i) => i.id === S.qtyItemId);
  const n = Number(qp.value) || 0;
  $("#qtyValue").textContent = n;
  $("#qtyLineTotal").textContent = it ? `${n} × ${num(it.price)} = ${money(n * it.price)}` : "";
}
function openQty(id) {
  const it = S.items.find((i) => i.id === id); if (!it) return;
  S.qtyItemId = id;
  $("#qtyTitle").textContent = it.name;
  qp.value = String(S.cart.get(id) || "");
  qp.fresh = true;   // first key press replaces the old number
  showQty();
  openModal("#qtyModal");
}
$("#qtyPad").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  const k = b.dataset.k;
  if (k === "C") qp.value = "";
  else if (k === "B") qp.value = qp.fresh ? "" : qp.value.slice(0, -1);
  else { qp.value = (qp.fresh ? "" : qp.value) + b.textContent; qp.value = qp.value.replace(/^0+(?=\d)/, "").slice(0, 5); }
  qp.fresh = false;
  showQty();
});
$("#qtyQuick").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  qp.value = b.dataset.q; qp.fresh = true; showQty();
});
const confirmQty = () => {
  setQty(S.qtyItemId, qp.value);
  $("#qtyModal").classList.add("hidden");
  const it = S.items.find((i) => i.id === S.qtyItemId);
  if (it) toast(`${Number(qp.value) || 0} × ${it.name}`);
};
$("#qtyOk").addEventListener("click", confirmQty);
// Typing numbers on a keyboard also works (tablet / laptop)
document.addEventListener("keydown", (e) => {
  if ($("#qtyModal").classList.contains("hidden")) return;
  if (/^\d$/.test(e.key)) { qp.value = ((qp.fresh ? "" : qp.value) + e.key).replace(/^0+(?=\d)/, "").slice(0, 5); qp.fresh = false; showQty(); }
  else if (e.key === "Backspace") { qp.value = qp.value.slice(0, -1); qp.fresh = false; showQty(); }
  else if (e.key === "Enter") confirmQty();
});

// ---------------- CHECKOUT ----------------
$("#checkoutBtn").addEventListener("click", () => {
  if (!S.cart.size) return toast("Add items first");
  $("#coDiscount").value = 0; $("#coReceived").value = ""; $("#coRef").value = ""; $("#coPhone").value = "";
  setPayment("cash");
  renderCheckout();
  openModal("#checkoutModal");
});

function totals() {
  const subtotal = cartSubtotal();
  const discount = Math.min(subtotal, Math.max(0, Number($("#coDiscount").value) || 0));
  return { subtotal, discount, total: subtotal - discount };
}

function renderCheckout() {
  const lines = cartLines();
  if (!lines.length) { $("#checkoutModal").classList.add("hidden"); return; }
  $("#cartLines").innerHTML = lines.map((l) => `
    <div class="line" data-id="${l.id}">
      <div class="grow"><b>${esc(l.name)}</b><div class="muted">${money(l.price)} each</div></div>
      <div class="stepper">
        <button data-act="dec">−</button>
        <input type="number" inputmode="numeric" min="0" value="${l.qty}">
        <button data-act="inc">+</button>
      </div>
      <b class="lt">${num(l.price * l.qty)}</b>
    </div>`).join("");
  updateTotalsUI();
}
function updateTotalsUI() {
  const t = totals();
  $("#coSubtotal").textContent = money(t.subtotal);
  $("#coTotal").textContent = money(t.total);
  const rec = Number($("#coReceived").value) || 0;
  $("#coChange").textContent = rec ? money(rec - t.total) : "–";
  $("#coChange").classList.toggle("neg", rec > 0 && rec < t.total);
}
$("#cartLines").addEventListener("click", (e) => {
  const line = e.target.closest(".line"); const act = e.target.dataset.act;
  if (!line || !act) return;
  addToCart(line.dataset.id, act === "inc" ? 1 : -1);
});
$("#cartLines").addEventListener("change", (e) => {
  const line = e.target.closest(".line");
  if (line && e.target.tagName === "INPUT") setQty(line.dataset.id, e.target.value);
});
$("#coDiscount").addEventListener("input", updateTotalsUI);
$("#coReceived").addEventListener("input", updateTotalsUI);

function setPayment(p) {
  S.payment = p;
  $$("#paySeg button").forEach((b) => b.classList.toggle("active", b.dataset.pay === p));
  $("#cashBox").classList.toggle("hidden", p !== "cash");
  $("#transferBox").classList.toggle("hidden", p !== "transfer");
}
$("#paySeg").addEventListener("click", (e) => { if (e.target.dataset.pay) setPayment(e.target.dataset.pay); });

function makeBillNo(d) {
  return `${String(d.getFullYear()).slice(2)}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function saveSale(sendWhatsApp) {
  const lines = cartLines();
  if (!lines.length) return;
  const t = totals();
  const now = new Date();
  const sale = {
    billNo: makeBillNo(now),
    lines,
    subtotal: t.subtotal,
    discount: t.discount,
    total: t.total,
    cost: lines.reduce((s, l) => s + l.cost * l.qty, 0),
    payment: S.payment,
    ref: S.payment === "transfer" ? $("#coRef").value.trim() : "",
    received: S.payment === "cash" ? Number($("#coReceived").value) || 0 : 0,
    customer: $("#coPhone").value.trim(),
    createdAtMs: now.getTime(),
    createdAt: serverTimestamp(),
  };
  const ref = doc(col("sales"));
  // Not awaited on purpose: saves instantly offline and syncs later
  setDoc(ref, sale).catch(fail);
  sale.id = ref.id;

  // Open WhatsApp right away (inside the tap, so the phone doesn't block it)
  if (sendWhatsApp) window.open(waUrl(sale.customer, billText(sale)), "_blank");

  S.cart.clear(); renderSellGrid(); renderCartBar();
  $("#checkoutModal").classList.add("hidden");
  showBill(sale, false);
  toast(`Saved ✔ ${money(sale.total)}`);
}
$("#saveBtn").addEventListener("click", () => saveSale(false));
$("#saveWaBtn").addEventListener("click", () => saveSale(true));

// ---------------- RECEIPT ----------------
function billText(s) {
  const L = [`*${S.shop.name}*`];
  if (S.shop.address) L.push(S.shop.address);
  if (S.shop.phone) L.push(`Ph: ${S.shop.phone}`);
  L.push(`Bill #${s.billNo}`, fmtDateTime(new Date(s.createdAtMs)), "--------------------------");
  s.lines.forEach((l) => L.push(`${l.name}\n   ${l.qty} x ${num(l.price)} = ${num(l.qty * l.price)}`));
  L.push("--------------------------");
  if (s.discount) L.push(`Subtotal: ${money(s.subtotal)}`, `Discount: -${money(s.discount)}`);
  L.push(`*TOTAL: ${money(s.total)}*`);
  L.push(`Paid by: ${s.payment === "cash" ? "Cash" : "Bank Transfer"}${s.ref ? ` (${s.ref})` : ""}`);
  if (s.payment === "cash" && s.received > 0)
    L.push(`Received: ${money(s.received)}  Change: ${money(s.received - s.total)}`);
  if (S.shop.footer) L.push("", S.shop.footer);
  return L.join("\n");
}

function showBill(sale, fromHistory) {
  S.billSale = sale;
  $("#billText").textContent = billText(sale);
  $("#billPhone").value = sale.customer || "";
  $("#billDeleteBtn").classList.toggle("hidden", !fromHistory);
  openModal("#billModal");
}
$("#billWaBtn").addEventListener("click", () => {
  window.open(waUrl($("#billPhone").value, billText(S.billSale)), "_blank");
});
$("#billPrintBtn").addEventListener("click", () => {
  const w = window.open("", "_blank");
  if (!w) return toast("Allow pop-ups to print");
  w.document.write(`<html><head><title>Bill ${esc(S.billSale.billNo)}</title>
    <style>body{font:13px monospace;width:58mm;margin:0 auto;padding:6px}pre{white-space:pre-wrap;margin:0}</style>
    </head><body><pre>${esc(billText(S.billSale).replace(/\*/g, ""))}</pre>
    <script>window.onload=()=>{window.print();}<\/script></body></html>`);
  w.document.close();
});
$("#billDeleteBtn").addEventListener("click", async () => {
  if (!confirm("Delete this bill? This cannot be undone.")) return;
  deleteDoc(doc(col("sales"), S.billSale.id)).catch(fail);
  $("#billModal").classList.add("hidden");
  toast("Bill deleted");
  setTimeout(loadAccounts, 300);
});

// ---------------- ITEMS ----------------
function renderItemList() {
  const q = $("#itemSearch").value.trim().toLowerCase();
  const list = S.items.filter((i) => !q || i.name.toLowerCase().includes(q) || (i.barcode || "").includes(q));
  $("#itemList").innerHTML = list.length ? list.map((i) => `
    <div class="line tap" data-id="${i.id}">
      ${i.photo ? `<img class="thumb" src="${i.photo}" alt="">` : `<div class="thumb noimg">${esc(i.name.slice(0, 2).toUpperCase())}</div>`}
      <div class="grow"><b>${esc(i.name)}</b>
        <div class="muted">${i.barcode ? "▮▯▮ " + esc(i.barcode) : "no barcode"}${i.cost ? ` · cost ${num(i.cost)}` : ""}</div></div>
      <b>${money(i.price)}</b>
    </div>`).join("") : `<div class="empty">No items. Tap <b>+ Add</b>.</div>`;
}
$("#itemSearch").addEventListener("input", renderItemList);
$("#itemList").addEventListener("click", (e) => {
  const line = e.target.closest(".line"); if (line) openItem(line.dataset.id);
});
$("#addItemBtn").addEventListener("click", () => openItem(null));

function openItem(id) {
  const it = id ? S.items.find((i) => i.id === id) : null;
  S.editItemId = id;
  S.itemPhoto = it?.photo || "";
  $("#itemModalTitle").textContent = it ? "Edit item" : t("addItem");
  $("#itemModalTitle").classList.toggle("dv", !it && LANG === "dv");
  $("#itemName").value = it?.name || "";
  $("#itemPrice").value = it?.price ?? "";
  $("#itemCost").value = it?.cost || "";
  $("#itemBarcode").value = it?.barcode || "";
  $("#itemPhoto").value = "";
  $("#deleteItemBtn").classList.toggle("hidden", !it);
  showPhoto(); drawBarcode();
  openModal("#itemModal");
}
function showPhoto() {
  $("#itemPhotoPreview").src = S.itemPhoto || "";
  $("#itemPhotoPreview").classList.toggle("hidden", !S.itemPhoto);
  $("#itemPhotoHint").textContent = S.itemPhoto ? "Tap to change photo" : "📸 " + t("addPhoto");
  $("#itemPhotoHint").classList.toggle("dv", !S.itemPhoto && LANG === "dv");
}

// Shrink photo to a small JPEG so it can live inside Firestore (no paid Storage needed)
function compressImage(file, max = 320) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL("image/jpeg", 0.72));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}
$("#itemPhoto").addEventListener("change", async (e) => {
  const f = e.target.files[0]; if (!f) return;
  try { S.itemPhoto = await compressImage(f); showPhoto(); } catch (err) { fail(err); }
});

function drawBarcode() {
  const code = $("#itemBarcode").value.trim();
  const box = $("#barcodeBox");
  if (!code || !window.JsBarcode) { box.classList.add("hidden"); return; }
  try {
    JsBarcode("#barcodeSvg", code, { format: "CODE128", height: 50, width: 2, fontSize: 14, margin: 6 });
    box.classList.remove("hidden");
  } catch { box.classList.add("hidden"); }
}
$("#itemBarcode").addEventListener("input", drawBarcode);
$("#itemScanBtn").addEventListener("click", () => openScanner((code) => {
  $("#itemBarcode").value = code; drawBarcode();
}, false));
$("#genBarcodeBtn").addEventListener("click", () => {
  let code;
  do { code = "20" + String(Math.floor(Math.random() * 1e10)).padStart(10, "0"); } while (findByBarcode(code));
  $("#itemBarcode").value = code; drawBarcode();
});
$("#printLabelBtn").addEventListener("click", () => {
  const svg = $("#barcodeSvg").outerHTML;
  const name = esc($("#itemName").value), price = esc(money($("#itemPrice").value));
  const w = window.open("", "_blank");
  if (!w) return toast("Allow pop-ups to print");
  const label = `<div class="l"><b>${name}</b><br>${price}<br>${svg}</div>`;
  w.document.write(`<html><head><title>Label</title><style>
    body{font-family:sans-serif;margin:0}.l{display:inline-block;text-align:center;padding:6px;margin:4px;border:1px dashed #aaa}
    @media print{.l{border:none}}</style></head><body>${label.repeat(8)}
    <script>window.onload=()=>window.print()<\/script></body></html>`);
  w.document.close();
});

$("#itemForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const barcode = $("#itemBarcode").value.trim();
  const dupe = barcode && S.items.find((i) => i.barcode === barcode && i.id !== S.editItemId);
  if (dupe) return toast(`Barcode already used by "${dupe.name}"`);
  const data = {
    name: $("#itemName").value.trim(),
    price: Number($("#itemPrice").value) || 0,
    cost: Number($("#itemCost").value) || 0,
    barcode,
    photo: S.itemPhoto || "",
    updatedAt: Date.now(),
  };
  if (!data.name) return toast("Enter item name");
  const ref = S.editItemId ? doc(col("items"), S.editItemId) : doc(col("items"));
  (S.editItemId ? updateDoc(ref, data) : setDoc(ref, data)).catch(fail);
  $("#itemModal").classList.add("hidden");
  toast("Item saved ✔");
});
$("#deleteItemBtn").addEventListener("click", () => {
  if (!confirm("Delete this item? Old bills will still show it.")) return;
  deleteDoc(doc(col("items"), S.editItemId)).catch(fail);
  $("#itemModal").classList.add("hidden");
  toast("Item deleted");
});

// ---------------- SCANNER ----------------
let scanner = null, scanCb = null, scanContinuous = false, lastCode = "", lastTime = 0;

async function openScanner(cb, continuous) {
  if (!window.Html5Qrcode) return toast("Scanner not loaded (check internet)");
  scanCb = cb; scanContinuous = continuous;
  $("#scanMsg").textContent = continuous ? "Scan items one by one. Close when done." : "Point camera at barcode";
  openModal("#scanModal");
  scanner = new Html5Qrcode("reader", { verbose: false, experimentalFeatures: { useBarCodeDetectorIfSupported: true } });
  try {
    await scanner.start(
      { facingMode: "environment" },
      { fps: 12, qrbox: (w, h) => ({ width: Math.max(60, Math.floor(w * 0.85)), height: Math.max(60, Math.floor(Math.min(w, h) * 0.45)) }) },
      onScan, () => {}
    );
  } catch (e) {
    toast("Camera error: " + e);
    closeScanner();
  }
}
function onScan(text) {
  const t = Date.now();
  if (text === lastCode && t - lastTime < 1800) return;   // ignore repeat of same code
  lastCode = text; lastTime = t;
  beep();
  scanCb?.(text);
  if (!scanContinuous) closeScanner();
}
async function closeScanner() {
  try { if (scanner?.isScanning) await scanner.stop(); scanner?.clear(); } catch {}
  scanner = null;
  $("#scanModal").classList.add("hidden");
}
$("#scanClose").addEventListener("click", closeScanner);

// ---------------- ACCOUNTS ----------------
function periodRange() {
  const now = new Date();
  const sod = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  switch (S.period) {
    case "yesterday": return [addDays(sod, -1), sod];
    case "week": return [addDays(sod, -6), addDays(sod, 1)];
    case "month": return [new Date(now.getFullYear(), now.getMonth(), 1), new Date(now.getFullYear(), now.getMonth() + 1, 1)];
    case "custom": {
      const f = $("#fromDate").value ? new Date($("#fromDate").value + "T00:00") : sod;
      const t = $("#toDate").value ? new Date($("#toDate").value + "T00:00") : sod;
      return [f, addDays(t, 1)];
    }
    default: return [sod, addDays(sod, 1)];
  }
}

$("#periodSeg").addEventListener("click", (e) => {
  const p = e.target.dataset.p; if (!p) return;
  S.period = p;
  $$("#periodSeg button").forEach((b) => b.classList.toggle("active", b.dataset.p === p));
  $("#customRange").classList.toggle("hidden", p !== "custom");
  if (p === "custom") {
    const today = toDateInput(new Date());
    if (!$("#fromDate").value) $("#fromDate").value = today;
    if (!$("#toDate").value) $("#toDate").value = today;
  }
  loadAccounts();
});
$("#applyRange").addEventListener("click", loadAccounts);

async function loadAccounts() {
  if (!S.shopId) return;
  const [from, to] = periodRange().map((d) => d.getTime());
  const rangeQ = (name) => query(col(name), where("createdAtMs", ">=", from), where("createdAtMs", "<", to), orderBy("createdAtMs", "desc"));
  let sales = [], expenses = [];
  try {
    const [ss, es] = await Promise.all([getDocs(rangeQ("sales")), getDocs(rangeQ("expenses"))]);
    sales = ss.docs.map((d) => ({ id: d.id, ...d.data() }));
    expenses = es.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) { return fail(e); }
  S.periodSales = sales;

  const sum = (arr, f) => arr.reduce((s, x) => s + (Number(f(x)) || 0), 0);
  const total = sum(sales, (s) => s.total);
  const cash = sum(sales.filter((s) => s.payment === "cash"), (s) => s.total);
  const transfer = sum(sales.filter((s) => s.payment === "transfer"), (s) => s.total);
  const discount = sum(sales, (s) => s.discount);
  const cost = sum(sales, (s) => s.cost);
  const exp = sum(expenses, (e) => e.amount);
  const gross = total - cost;
  const net = gross - exp;

  const stat = (label, value, cls = "") => `<div class="stat ${cls}"><span class="${/[\u0780-\u07BF]/.test(label) ? "dv" : ""}">${label}</span><b>${value}</b></div>`;
  $("#stats").innerHTML =
    stat("Total sales", money(total), "big") +
    stat("Bills", sales.length) +
    stat("💵 " + t("cash"), money(cash)) +
    stat("🏦 " + t("transfer"), money(transfer)) +
    stat("Discounts", money(discount)) +
    stat("Cost of items", money(cost)) +
    stat(t("expenses"), money(exp)) +
    stat("Gross profit", money(gross)) +
    stat("Net profit", money(net), net >= 0 ? "good big" : "bad big");

  // Top items
  const agg = {};
  sales.forEach((s) => s.lines.forEach((l) => {
    const a = agg[l.name] ||= { qty: 0, amt: 0 };
    a.qty += l.qty; a.amt += l.qty * l.price;
  }));
  const top = Object.entries(agg).sort((a, b) => b[1].amt - a[1].amt).slice(0, 10);
  $("#topItems").innerHTML = top.length ? top.map(([n, a]) =>
    `<div class="line"><div class="grow">${esc(n)}</div><span class="muted">${a.qty} sold</span><b>${money(a.amt)}</b></div>`).join("")
    : `<div class="empty ${dvc()}">${t("noSales")}</div>`;

  // Bills
  $("#billList").innerHTML = sales.length ? sales.map((s) => `
    <div class="line tap" data-id="${s.id}">
      <div class="grow"><b>#${esc(s.billNo)}</b>
        <div class="muted">${fmtDateTime(new Date(s.createdAtMs))} · ${s.lines.reduce((a, l) => a + l.qty, 0)} items</div></div>
      <span class="tag ${s.payment}">${s.payment === "cash" ? "Cash" : "Transfer"}</span>
      <b>${money(s.total)}</b>
    </div>`).join("") : `<div class="empty ${dvc()}">${t("noBills")}</div>`;

  // Expenses
  $("#expenseList").innerHTML = expenses.length ? expenses.map((e) => `
    <div class="line" data-id="${e.id}">
      <div class="grow">${esc(e.title)}<div class="muted">${fmtDateTime(new Date(e.createdAtMs))}</div></div>
      <b>${money(e.amount)}</b><button class="x" data-del-exp="${e.id}">🗑</button>
    </div>`).join("") : `<div class="empty ${dvc()}">${t("noExpenses")}</div>`;
}

$("#billList").addEventListener("click", (e) => {
  const line = e.target.closest(".line"); if (!line) return;
  const s = S.periodSales.find((x) => x.id === line.dataset.id);
  if (s) showBill(s, true);
});

$("#expenseForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const data = {
    title: $("#expTitle").value.trim(),
    amount: Number($("#expAmount").value) || 0,
    createdAtMs: Date.now(),
    createdAt: serverTimestamp(),
  };
  setDoc(doc(col("expenses")), data).catch(fail);
  $("#expTitle").value = ""; $("#expAmount").value = "";
  toast("Expense added");
  setTimeout(loadAccounts, 300);
});
$("#expenseList").addEventListener("click", (e) => {
  const id = e.target.dataset.delExp; if (!id) return;
  if (!confirm("Delete this expense?")) return;
  deleteDoc(doc(col("expenses"), id)).catch(fail);
  setTimeout(loadAccounts, 300);
});

$("#exportCsv").addEventListener("click", () => {
  if (!S.periodSales.length) return toast("No bills in this period");
  const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = [["Bill", "Date", "Item", "Qty", "Price", "Line total", "Bill total", "Payment", "Customer"]];
  S.periodSales.forEach((s) => s.lines.forEach((l) =>
    rows.push([s.billNo, fmtDateTime(new Date(s.createdAtMs)), l.name, l.qty, l.price, l.qty * l.price, s.total, s.payment, s.customer])));
  const blob = new Blob([rows.map((r) => r.map(q).join(",")).join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `sales-${S.period}-${toDateInput(new Date())}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
});

// ---------------- SETTINGS ----------------
function applyShop() {
  $("#shopTitle").textContent = S.shop.name;
  document.title = S.shop.name + " · POS";
  renderCartBar(); renderSellGrid(); renderItemList();
}
function fillSettings() {
  $("#setName").value = S.shop.name;
  $("#setPhone").value = S.shop.phone;
  $("#setAddress").value = S.shop.address;
  $("#setCountry").value = S.shop.country;
  $("#setFooter").value = S.shop.footer;
}
$("#settingsForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const changes = {
    name: $("#setName").value.trim() || "Magey Fihaara",
    phone: $("#setPhone").value.trim(),
    address: $("#setAddress").value.trim(),
    country: $("#setCountry").value.replace(/\D/g, "") || "960",
    footer: $("#setFooter").value.trim(),
  };
  S.shop = { ...S.shop, ...changes };
  updateDoc(doc(db, "shops", S.shopId), changes).catch(fail);
  applyShop();
  toast("Settings saved ✔");
});

// ---------------- LANGUAGE (English / Dhivehi) ----------------
// Same words as the Naalu app where the English is the same.
function applyLang() {
  const dv = LANG === "dv";
  $$("[data-i18n]").forEach((el) => {
    if (el.dataset.en === undefined) el.dataset.en = el.textContent;
    el.textContent = dv && DV[el.dataset.i18n] ? DV[el.dataset.i18n] : el.dataset.en;
    el.classList.toggle("dv", dv && !!DV[el.dataset.i18n]);
  });
  $$("[data-i18n-ph]").forEach((el) => {
    if (el.dataset.enPh === undefined) el.dataset.enPh = el.placeholder;
    el.placeholder = dv && DV[el.dataset.i18nPh] ? DV[el.dataset.i18nPh] : el.dataset.enPh;
    el.classList.toggle("dv-ph", dv);
  });
  $("#langBtn").textContent = dv ? "EN" : "ދިވެހި";
  $("#langBtn").classList.toggle("dv", !dv);
  renderSellGrid();
  if (S.shopId && !$("#view-accounts").classList.contains("hidden")) loadAccounts();
}
$("#footerChips").innerHTML = FOOTERS.map((f) => `<button type="button" class="chip" dir="auto" data-footer="${esc(f)}">${esc(f)}</button>`).join("");
$("#footerChips").addEventListener("click", (e) => {
  const b = e.target.closest("[data-footer]"); if (b) $("#setFooter").value = b.dataset.footer;
});
$("#langBtn").addEventListener("click", () => {
  LANG = LANG === "dv" ? "en" : "dv";
  try { localStorage.setItem("magey-lang", LANG); } catch {}
  applyLang();
});
applyLang();
