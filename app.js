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
  onSnapshot, query, where, orderBy, serverTimestamp, writeBatch, increment, limit
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
  country: "960", footer: "Thank you! Come again 🙏",
  legalName: "", tin: "", gstRate: 8, gstInclusive: false, taxDefault: false,
  banks: [], showBank: true
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
// whole numbers stay "120"; amounts with cents always show 2 decimals ("9.60")
const num = (n) => { const v = Number(n || 0); return v.toLocaleString("en-US", Number.isInteger(Math.round(v * 100) / 100) ? { maximumFractionDigits: 0 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
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
  // tax — same words as Naalu
  taxInvoice: "🧾 ޓެކްސް އިންވޮއިސް (ޖީ.އެސް.ޓީ {r}%)",
  taxHead: "🧾 ޓެކްސް (ޖީ.އެސް.ޓީ) އިންވޮއިސް",
  legalName: "ރަޖިސްޓްރީކޮށްފައިވާ ވިޔަފާރީގެ ނަން",
  asOnCert: "ޖީ.އެސް.ޓީ ސެޓްފިކެޓުގައިވާ ގޮތަށް",
  tin: "ޓީ.އައި.އެން / ޖީ.އެސް.ޓީ ރަޖިސްޓްރީ ނަންބަރު",
  gstRate: "ޖީ.އެސް.ޓީ ރޭޓް (%)",
  gstIncl: "އަހަރެންގެ އަގުތަކުގައި ޖީ.އެސް.ޓީ ހިމެނިފައި",
  taxDefault: "ކޮންމެ ރަސީދެއް ޓެކްސް އިންވޮއިސްއަކަށް ހަދާ",
  gstInv: "އިންވޮއިސްތަކުގެ ޖީއެސްޓީ",
};
const EN = {
  qtyBtn: "Qty", addItem: "Add item", addPhoto: "Tap to add photo",
  cash: "Cash", transfer: "Transfer", expenses: "Expenses", noExpenses: "No expenses",
  noSales: "No sales in this period", noBills: "No bills",
  taxInvoice: "🧾 Tax invoice (GST {r}%)", gstInv: "GST on invoices",
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

  startAccountingListeners();
  S.unsubItems = onSnapshot(query(col("items"), orderBy("name")), (snap) => {
    S.items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    for (const id of [...S.cart.keys()]) if (!S.items.find((i) => i.id === id)) S.cart.delete(id);
    renderSellGrid(); renderItemList(); renderCartBar();
    if (S.accPage === "stock" && !$("#view-accounts").classList.contains("hidden")) renderStock();
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
  if (b.dataset.view === "accounts") openPage(S.accPage || "hub");
  if (b.dataset.view === "expenses") openExpenses();
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
      ${i.track ? `<div class="stk ${(i.stock || 0) <= 0 ? "out" : ""}">📦 ${num(i.stock || 0)}</div>` : ""}
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
    return it ? { id, name: it.name, price: Number(it.price) || 0, cost: Number(it.cost) || 0, qty, track: !!it.track } : null;
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
  $("#coTax").checked = !!S.shop.taxDefault; $("#coTin").value = ""; $("#coCustName").value = "";
  $("#coTin").classList.toggle("hidden", !$("#coTax").checked);
  renderTaxLbl();
  setPayment("cash");
  renderCheckout();
  openModal("#checkoutModal");
});

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
function totals() {
  const subtotal = cartSubtotal();
  const discount = Math.min(subtotal, Math.max(0, Number($("#coDiscount").value) || 0));
  const net = round2(subtotal - discount);
  const tax = $("#coTax").checked;
  const rate = Number(S.shop.gstRate) || 0;
  if (!tax) return { subtotal, discount, tax, gstRate: 0, taxable: net, gst: 0, total: net };
  if (S.shop.gstInclusive) {           // prices already include GST: take it out
    const gst = round2(net * rate / (100 + rate));
    return { subtotal, discount, tax, gstRate: rate, taxable: round2(net - gst), gst, total: net };
  }
  const gst = round2(net * rate / 100);  // add GST on top
  return { subtotal, discount, tax, gstRate: rate, taxable: net, gst, total: round2(net + gst) };
}
function renderTaxLbl() {
  $("#taxLbl").textContent = t("taxInvoice").replace("{r}", Number(S.shop.gstRate) || 0);
  $("#taxLbl").classList.toggle("dv", LANG === "dv");
}
$("#coTax").addEventListener("change", () => { $("#coTin").classList.toggle("hidden", !$("#coTax").checked); updateTotalsUI(); });

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
  const T = totals();
  $("#coSubtotal").textContent = money(T.subtotal);
  $("#taxableRow").classList.toggle("hidden", !T.tax);
  $("#gstRow").classList.toggle("hidden", !T.tax);
  $("#coTaxable").textContent = money(T.taxable);
  $("#gstLbl").textContent = `GST ${T.gstRate}%${S.shop.gstInclusive ? " (included)" : ""}`;
  $("#coGst").textContent = money(T.gst);
  $("#coTotal").textContent = money(T.total);
  const rec = Number($("#coReceived").value) || 0;
  $("#coChange").textContent = rec ? money(rec - T.total) : "–";
  $("#coChange").classList.toggle("neg", rec > 0 && rec < T.total);
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
  $("#creditBox").classList.toggle("hidden", p !== "credit");
  if (p === "credit") showCustOwes();
}
$("#paySeg").addEventListener("click", (e) => { const b = e.target.closest("[data-pay]"); if (b) setPayment(b.dataset.pay); });

function makeBillNo(d) {
  return `${String(d.getFullYear()).slice(2)}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function saveSale(sendWhatsApp) {
  const lines = cartLines();
  if (!lines.length) return;
  const custName = $("#coCustName").value.trim();
  if (S.payment === "credit" && !custName) return toast("Enter the customer's name for a credit sale");
  const t = totals();
  const now = new Date();
  const ref = doc(col("sales"));
  const sale = {
    billNo: makeBillNo(now),
    lines,
    subtotal: t.subtotal,
    discount: t.discount,
    tax: t.tax, gstRate: t.gstRate, gstInclusive: !!S.shop.gstInclusive,
    taxable: t.taxable, gst: t.gst, customerTin: t.tax ? $("#coTin").value.trim() : "",
    total: t.total,
    cost: lines.reduce((s, l) => s + l.cost * l.qty, 0),
    payment: S.payment,
    ref: S.payment === "transfer" ? $("#coRef").value.trim() : "",
    received: S.payment === "cash" ? Number($("#coReceived").value) || 0 : 0,
    customer: $("#coPhone").value.trim(),
    customerId: "", customerName: "",
    posted: true,
    createdAtMs: now.getTime(),
    createdAt: serverTimestamp(),
  };
  sale.id = ref.id;
  const batch = writeBatch(db);
  if (S.payment === "credit") {
    sale.customerId = partyId(batch, "customers", custName, sale.customer);
    sale.customerName = custName;
    batch.update(doc(col("customers"), sale.customerId), { balance: increment(sale.total) });
  }
  const { id: _omit, ...saleData } = sale;
  batch.set(ref, saleData);
  postEntry(batch, saleEntry(sale));
  lines.filter((l) => l.track).forEach((l) => batch.update(doc(col("items"), l.id), { stock: increment(-l.qty) }));
  // Not awaited on purpose: saves instantly offline and syncs later
  batch.commit().catch(fail);

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
  const L = [];
  if (s.tax) {
    L.push("*TAX INVOICE*", `*${S.shop.legalName || S.shop.name}*`);
    if (S.shop.legalName && S.shop.legalName !== S.shop.name) L.push(S.shop.name);
    if (S.shop.tin) L.push(`TIN: ${S.shop.tin}`);
  } else L.push(`*${S.shop.name}*`);
  if (S.shop.address) L.push(S.shop.address);
  if (S.shop.phone) L.push(`Ph: ${S.shop.phone}`);
  L.push(`${s.tax ? "Invoice" : "Bill"} #${s.billNo}`, fmtDateTime(new Date(s.createdAtMs)));
  if (s.tax && s.customerTin) L.push(`Customer TIN: ${s.customerTin}`);
  L.push("--------------------------");
  s.lines.forEach((l) => L.push(`${l.name}\n   ${l.qty} x ${num(l.price)} = ${num(l.qty * l.price)}`));
  L.push("--------------------------");
  if (s.discount) L.push(`Subtotal: ${money(s.subtotal)}`, `Discount: -${money(s.discount)}`);
  if (s.tax) {
    L.push(`Taxable value: ${money(s.taxable)}`);
    L.push(`GST ${s.gstRate}%${s.gstInclusive ? " (included)" : ""}: ${money(s.gst)}`);
  }
  L.push(`*TOTAL: ${money(s.total)}*`);
  if (s.payment === "credit") L.push(`📒 *On credit – to pay: ${money(s.total)}*${s.customerName ? ` (${s.customerName})` : ""}`);
  else L.push(`Paid by: ${s.payment === "cash" ? "Cash" : "Bank Transfer"}${s.ref ? ` (${s.ref})` : ""}`);
  if (s.payment === "cash" && s.received > 0)
    L.push(`Received: ${money(s.received)}  Change: ${money(s.received - s.total)}`);
  const banks = billBanks();
  if (banks.length) {
    L.push("", "🏦 *Pay by bank transfer:*");
    banks.forEach((b) => { L.push(`${b.bank}${b.currency ? " " + b.currency : ""} – ${b.name}`); L.push(b.number); });
  }
  if (S.shop.footer) L.push("", S.shop.footer);
  return L.join("\n");
}

function showBill(sale, fromHistory) {
  S.billSale = sale;
  S.billBankIdx = 0;
  renderBillBanks();
  makeBillPhoto(sale);
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
  deleteSale(S.billSale);
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
  $("#itemTrack").checked = !!it?.track;
  $("#itemOpen").value = "";
  showStockFields(it);
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
    track: $("#itemTrack").checked,
    updatedAt: Date.now(),
  };
  if (!data.name) return toast("Enter item name");
  const ref = S.editItemId ? doc(col("items"), S.editItemId) : doc(col("items"));
  const old = S.editItemId ? S.items.find((i) => i.id === S.editItemId) : null;
  const openQty = Number($("#itemOpen").value) || 0;
  const batch = writeBatch(db);
  if (data.track && !(old && old.track)) {
    data.stock = (old?.stock || 0) + openQty;
    const v = round2(openQty * data.cost);
    if (v) postEntry(batch, { date: Date.now(), memo: `Opening stock – ${data.name} (${openQty} × ${num(data.cost)})`, source: "opening",
      lines: [{ a: "1200", dr: v }, { a: "3200", cr: v }] });
  }
  S.editItemId ? batch.update(ref, data) : batch.set(ref, data);
  batch.commit().catch(fail);
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
  S.periodSales = sales; S.periodExpenses = expenses;

  const sum = (arr, f) => arr.reduce((s, x) => s + (Number(f(x)) || 0), 0);
  const total = sum(sales, (s) => s.total);
  const cash = sum(sales.filter((s) => s.payment === "cash"), (s) => s.total);
  const credit = sum(sales.filter((s) => s.payment === "credit"), (s) => s.total);
  const transfer = sum(sales.filter((s) => s.payment === "transfer"), (s) => s.total);
  const discount = sum(sales, (s) => s.discount);
  const cost = sum(sales, (s) => s.cost);
  // GST paid on supplier bills is claimed back from MIRA, so it is not a cost
  const exp = sum(expenses, (e) => (Number(e.amount) || 0) - (Number(e.gst) || 0));
  const gst = sum(sales, (s) => s.gst);
  const gross = total - gst - cost;      // GST belongs to MIRA, not the shop
  const net = gross - exp;

  const stat = (label, value, cls = "") => `<div class="stat ${cls}"><span class="${/[\u0780-\u07BF]/.test(label) ? "dv" : ""}">${label}</span><b>${value}</b></div>`;
  $("#stats").innerHTML =
    stat("Total sales", money(total), "big") +
    stat("Bills", sales.length) +
    stat("💵 " + t("cash"), money(cash)) +
    stat("🏦 " + t("transfer"), money(transfer)) +
    stat("📒 Credit (to collect)", money(credit)) +
    stat("Discounts", money(discount)) +
    stat("🧾 " + t("gstInv"), money(gst)) +
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
      ${s.tax ? `<span class="tag">🧾</span>` : ""}<span class="tag ${s.payment === "credit" ? "offtag" : s.payment}">${{ cash: "Cash", transfer: "Transfer", credit: "Credit" }[s.payment] || s.payment}</span>
      <b>${money(s.total)}</b>
    </div>`).join("") : `<div class="empty ${dvc()}">${t("noBills")}</div>`;

  // Expenses
  $("#expenseList").innerHTML = expenses.length ? expenses.map((e) => `
    <div class="line" data-id="${e.id}">
      <div class="grow">${esc(e.title)}<div class="muted">${fmtDateTime(new Date(e.createdAtMs))}${e.gst ? ` · 🧾 GST ${num(e.gst)}` : ""}</div></div>
      <b>${money(e.amount)}</b><button class="x" data-del-exp="${e.id}">🗑</button>
    </div>`).join("") : `<div class="empty ${dvc()}">${t("noExpenses")}</div>`;
}

$("#billList").addEventListener("click", (e) => {
  const line = e.target.closest(".line"); if (!line) return;
  const s = S.periodSales.find((x) => x.id === line.dataset.id);
  if (s) showBill(s, true);
});

$("#goAddExpense").addEventListener("click", () => $('.bottomnav [data-view="expenses"]').click());
$("#expenseList").addEventListener("click", (e) => {
  const id = e.target.dataset.delExp; if (!id) return;
  if (!confirm("Delete this expense?")) return;
  deleteExpense((S.periodExpenses || []).find((x) => x.id === id) || { id });
  setTimeout(loadAccounts, 300);
});

$("#exportCsv").addEventListener("click", () => {
  if (!S.periodSales.length) return toast("No bills in this period");
  const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = [["Bill", "Date", "Item", "Qty", "Price", "Line total", "Tax invoice", "Taxable", "GST", "Bill total", "Payment", "Customer"]];
  S.periodSales.forEach((s) => s.lines.forEach((l, i) =>
    rows.push([s.billNo, fmtDateTime(new Date(s.createdAtMs)), l.name, l.qty, l.price, l.qty * l.price,
      s.tax ? "Yes" : "No", i === 0 ? (s.taxable ?? s.total) : "", i === 0 ? (s.gst || 0) : "", i === 0 ? s.total : "",
      s.payment, s.customer])));
  const blob = new Blob(["\ufeff" + rows.map((r) => r.map(q).join(",")).join("\n")], { type: "text/csv" });
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
  $("#setLegalName").value = S.shop.legalName || "";
  $("#setTin").value = S.shop.tin || "";
  $("#setGst").value = S.shop.gstRate ?? 8;
  $("#setGstIncl").checked = !!S.shop.gstInclusive;
  $("#setTaxDefault").checked = !!S.shop.taxDefault;
}
$("#settingsForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const changes = {
    name: $("#setName").value.trim() || "Magey Fihaara",
    phone: $("#setPhone").value.trim(),
    address: $("#setAddress").value.trim(),
    country: $("#setCountry").value.replace(/\D/g, "") || "960",
    footer: $("#setFooter").value.trim(),
    legalName: $("#setLegalName").value.trim(),
    tin: $("#setTin").value.trim(),
    gstRate: Number($("#setGst").value) || 0,
    gstInclusive: $("#setGstIncl").checked,
    taxDefault: $("#setTaxDefault").checked,
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
  renderSellGrid(); renderTaxLbl();
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

// ================= BANK ACCOUNTS =================
const billBanks = () => (S.shop.showBank === false ? [] : (S.shop.banks || []).filter((b) => b && b.number));
const selBank = () => billBanks()[S.billBankIdx || 0] || null;

function addBankRow(b = {}) {
  const row = document.createElement("div");
  row.className = "box stack bank-row";
  row.innerHTML = `
    <div class="row">
      <input class="b-bank" list="bankNames" placeholder="Bank e.g. BML" value="${esc(b.bank || "")}">
      <select class="b-cur narrow"><option ${b.currency !== "USD" ? "selected" : ""}>MVR</option><option ${b.currency === "USD" ? "selected" : ""}>USD</option></select>
    </div>
    <input class="b-name" placeholder="Account name" value="${esc(b.name || "")}">
    <div class="row">
      <input class="b-num" inputmode="numeric" placeholder="Account number" value="${esc(b.number || "")}">
      <button type="button" class="x" title="Remove">🗑</button>
    </div>`;
  row.querySelector(".x").addEventListener("click", () => row.remove());
  $("#bankRows").appendChild(row);
}
$("#addBankBtn").addEventListener("click", () => addBankRow());
const readBanks = () => $$("#bankRows .bank-row").map((r) => ({
  bank: r.querySelector(".b-bank").value.trim(),
  currency: r.querySelector(".b-cur").value,
  name: r.querySelector(".b-name").value.trim(),
  number: r.querySelector(".b-num").value.replace(/\s+/g, ""),
})).filter((b) => b.number);

function fillBankSettings() {
  $("#bankRows").innerHTML = "";
  (S.shop.banks || []).forEach((b) => addBankRow(b));
  if (!(S.shop.banks || []).length) addBankRow();
  $("#setShowBank").checked = S.shop.showBank !== false;
}
// save bank details together with the other settings
$("#settingsForm").addEventListener("submit", () => {
  const changes = { banks: readBanks(), showBank: $("#setShowBank").checked };
  S.shop = { ...S.shop, ...changes };
  updateDoc(doc(db, "shops", S.shopId), changes).catch(fail);
}, true);
$('.bottomnav [data-view="settings"]').addEventListener("click", fillBankSettings);

// ================= SEND BILL: photo + copyable account number =================
async function copyText(txt) {
  try { await navigator.clipboard.writeText(txt); return true; } catch {}
  const ta = document.createElement("textarea");
  ta.value = txt; ta.style.position = "fixed"; ta.style.opacity = "0";
  document.body.appendChild(ta); ta.select();
  let ok = false; try { ok = document.execCommand("copy"); } catch {}
  ta.remove(); return ok;
}
function renderBillBanks() {
  const banks = billBanks();
  $("#billBankBox").classList.toggle("hidden", banks.length < 2);
  $("#billAccRow").classList.toggle("hidden", !banks.length);
  $("#billBankChips").innerHTML = banks.map((b, i) =>
    `<button type="button" class="chip ${i === (S.billBankIdx || 0) ? "sel" : ""}" data-bi="${i}">${esc(b.bank || "Bank")} ${esc(b.currency || "")}<br><small>${esc(b.number)}</small></button>`).join("");
}
$("#billBankChips").addEventListener("click", (e) => {
  const b = e.target.closest("[data-bi]"); if (!b) return;
  S.billBankIdx = +b.dataset.bi; renderBillBanks();
});
$("#billCopyAccBtn").addEventListener("click", async () => {
  const b = selBank(); if (!b) return;
  toast((await copyText(b.number)) ? `Copied ${b.number}` : "Could not copy");
});
// Separate WhatsApp message with ONLY the number: customer long-presses → Copy → pastes in bank app
$("#billAccWaBtn").addEventListener("click", () => {
  const b = selBank(); if (!b) return;
  window.open(waUrl($("#billPhone").value, b.number), "_blank");
});

// ---- draw the bill as a picture (canvas → PNG)
const THAANA = /[ހ-޿]/;
const FONT = '"FarumaThaana","Noto Sans Thaana",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif';
async function renderBillPng(s) {
  try { await document.fonts.ready; } catch {}
  const W = 720, P = 40, ops = [], rects = [];
  const meas = document.createElement("canvas").getContext("2d");
  let y = P;
  const f = (size, bold, mono) => `${bold ? "700 " : ""}${size}px ${mono ? "ui-monospace,Menlo,Consolas,monospace" : FONT}`;
  const wrap = (str, font, maxW) => {
    meas.font = font;
    const out = []; let line = "";
    String(str).split(" ").forEach((w) => {
      const test = line ? line + " " + w : w;
      if (meas.measureText(test).width > maxW && line) { out.push(line); line = w; } else line = test;
    });
    out.push(line); return out;
  };
  const text = (str, o = {}) => {
    if (!str && str !== 0) return;
    const size = o.size || 24, font = f(size, o.bold, o.mono);
    wrap(str, font, W - 2 * P - (o.indent || 0) * 2).forEach((ln) => {
      ops.push({ str: ln, font, y: y + size, align: o.align || "left", color: o.color || "#1f1b16", indent: o.indent || 0 });
      y += Math.round(size * 1.35);
    });
    y += o.gap ?? 4;
  };
  const row = (l, r, o = {}) => {
    const size = o.size || 24, font = f(size, o.bold);
    ops.push({ str: String(l), font, y: y + size, align: "left", color: o.color || "#1f1b16", indent: 0 });
    ops.push({ str: String(r), font: f(size, o.bold ?? true), y: y + size, align: "right", color: o.rcolor || o.color || "#1f1b16", indent: 0 });
    y += Math.round(size * 1.35) + (o.gap ?? 4);
  };
  const rule = () => { ops.push({ rule: true, y: y + 10 }); y += 24; };
  const muted = "#7a7068", brand = "#c2410c";

  if (s.tax) text("TAX INVOICE", { size: 22, bold: true, align: "center", color: brand });
  text(s.tax ? (S.shop.legalName || S.shop.name) : S.shop.name, { size: 34, bold: true, align: "center" });
  if (s.tax && S.shop.legalName && S.shop.legalName !== S.shop.name) text(S.shop.name, { size: 22, align: "center", color: muted });
  if (s.tax && S.shop.tin) text(`TIN: ${S.shop.tin}`, { size: 22, align: "center" });
  if (S.shop.address) text(S.shop.address, { size: 22, align: "center", color: muted });
  if (S.shop.phone) text(`📞 ${S.shop.phone}`, { size: 22, align: "center", color: muted });
  y += 8;
  row(`${s.tax ? "Invoice" : "Bill"} #${s.billNo}`, fmtDateTime(new Date(s.createdAtMs)), { size: 21, color: muted, bold: false });
  if (s.tax && s.customerTin) text(`Customer TIN: ${s.customerTin}`, { size: 21, color: muted });
  rule();
  s.lines.forEach((l) => {
    row(l.name, num(l.qty * l.price), { size: 25, gap: 0 });
    text(`${l.qty} × ${num(l.price)}`, { size: 20, color: muted, gap: 8 });
  });
  rule();
  if (s.discount) { row("Subtotal", money(s.subtotal), { size: 22, bold: false }); row("Discount", "-" + money(s.discount), { size: 22, bold: false }); }
  if (s.tax) {
    row("Taxable value", money(s.taxable), { size: 22, bold: false });
    row(`GST ${s.gstRate}%${s.gstInclusive ? " (included)" : ""}`, money(s.gst), { size: 22, bold: false });
  }
  y += 6;
  row("TOTAL", money(s.total), { size: 38, bold: true, rcolor: brand, gap: 8 });
  if (s.payment === "credit") text(`On credit – to pay ${money(s.total)}${s.customerName ? " · " + s.customerName : ""}`, { size: 24, bold: true, color: brand });
  else text(`Paid by: ${s.payment === "cash" ? "Cash" : "Bank transfer"}${s.ref ? ` (${s.ref})` : ""}`, { size: 21, color: muted });
  if (s.payment === "cash" && s.received > 0) text(`Received ${money(s.received)} · Change ${money(s.received - s.total)}`, { size: 21, color: muted });

  const banks = billBanks();
  if (banks.length) {
    y += 18; const top = y; y += 18;
    text("🏦 Pay by bank transfer", { size: 24, bold: true, indent: 18, gap: 10 });
    banks.forEach((b) => {
      text(`${b.bank || "Bank"}${b.currency ? " · " + b.currency : ""} – ${b.name}`, { size: 21, color: muted, indent: 18, gap: 0 });
      text(b.number, { size: 34, bold: true, mono: true, indent: 18, gap: 12 });
    });
    rects.push({ y: top, h: y - top + 6 }); y += 10;
  }
  if (S.shop.footer) { y += 14; text(S.shop.footer, { size: 24, align: "center" }); }
  y += P - 4;

  const cv = document.createElement("canvas");
  cv.width = W; cv.height = y;
  const c = cv.getContext("2d");
  c.fillStyle = "#ffffff"; c.fillRect(0, 0, W, y);
  c.fillStyle = "#e8590c"; c.fillRect(0, 0, W, 10);
  rects.forEach((r) => { c.fillStyle = "#fff4ec"; c.strokeStyle = "#e8590c"; c.lineWidth = 2;
    c.beginPath(); c.roundRect ? c.roundRect(P, r.y, W - 2 * P, r.h, 16) : c.rect(P, r.y, W - 2 * P, r.h); c.fill(); c.stroke(); });
  ops.forEach((o) => {
    if (o.rule) { c.strokeStyle = "#cfc6bc"; c.setLineDash([8, 6]); c.lineWidth = 2;
      c.beginPath(); c.moveTo(P, o.y); c.lineTo(W - P, o.y); c.stroke(); c.setLineDash([]); return; }
    c.font = o.font; c.fillStyle = o.color;
    c.direction = THAANA.test(o.str) ? "rtl" : "ltr";
    c.textAlign = o.align;
    const x = o.align === "center" ? W / 2 : o.align === "right" ? W - P - o.indent : P + o.indent;
    c.fillText(o.str, x, o.y);
  });
  return new Promise((res) => cv.toBlob(res, "image/png"));
}

function makeBillPhoto(sale) {
  S.billImg = null;
  $("#billImg").classList.add("hidden");
  $("#billText").classList.remove("hidden");
  S.billImgP = renderBillPng(sale).then((blob) => {
    if (S.billSale !== sale || !blob) return blob;
    S.billImg = blob;
    if (S.billImgUrl) URL.revokeObjectURL(S.billImgUrl);
    S.billImgUrl = URL.createObjectURL(blob);
    $("#billImg").src = S.billImgUrl;
    $("#billImg").classList.remove("hidden");
    $("#billText").classList.add("hidden");
    return blob;
  }).catch(() => null);
}
function downloadBlob(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
// Share sheet → WhatsApp: photo of the bill, caption = ONLY the account number (easy to copy)
$("#billPhotoBtn").addEventListener("click", async () => {
  const blob = S.billImg || (await S.billImgP);
  if (!blob) return toast("Could not make the photo");
  const name = `bill-${S.billSale.billNo}.png`;
  const file = new File([blob], name, { type: "image/png" });
  const acc = selBank();
  const caption = acc ? acc.number : `Bill #${S.billSale.billNo} – ${money(S.billSale.total)}`;
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], text: caption }); return; }
    catch (e) { if (e.name === "AbortError") return; }
  }
  downloadBlob(blob, name);
  if (acc) await copyText(acc.number);
  toast(acc ? "Photo saved & account no. copied – attach in WhatsApp" : "Photo saved – attach it in WhatsApp");
});
$("#billSaveImgBtn").addEventListener("click", async () => {
  const blob = S.billImg || (await S.billImgP);
  if (blob) downloadBlob(blob, `bill-${S.billSale.billNo}.png`);
});

// ================= EXPENSES TAB =================
const EXP_CATS = [
  ["Ingredients", "🥬"], ["Oil", "🛢", "ތެޔޮ"], ["Gas", "🔥", "ގޭސް"], ["Rent", "🏠", "ކުލި"],
  ["Electricity", "💡"], ["Water", "🚰"], ["Salary", "👥"], ["Transport", "🚚"], ["Packaging", "📦"], ["Other", "➕"],
];
const catLabel = (c) => { const k = EXP_CATS.find((x) => x[0] === c); return k ? `${k[1]} ${LANG === "dv" && k[2] ? k[2] : k[0]}` : c; };
const X = { cat: "", pay: "cash", gstEdited: false };

function renderXCats() {
  $("#xCats").innerHTML = EXP_CATS.map(([c]) =>
    `<button type="button" class="chip ${X.cat === c ? "sel" : ""}" data-cat="${c}">${esc(catLabel(c))}</button>`).join("");
}
$("#xCats").addEventListener("click", (e) => {
  const b = e.target.closest("[data-cat]"); if (!b) return;
  X.cat = X.cat === b.dataset.cat ? "" : b.dataset.cat; renderXCats();
});
$("#xPaySeg").addEventListener("click", (e) => {
  const b = e.target.closest("[data-pay]"); if (!b) return;
  X.pay = b.dataset.pay;
  $$("#xPaySeg button").forEach((x) => x.classList.toggle("active", x === b));
});
function autoGst() {
  if (!$("#xGst").checked || X.gstEdited) return;
  const amt = Number($("#xAmount").value) || 0, r = Number(S.shop.gstRate) || 0;
  $("#xGstAmt").value = amt ? round2(amt * r / (100 + r)) : "";
}
$("#xGst").addEventListener("change", () => { $("#xGstBox").classList.toggle("hidden", !$("#xGst").checked); X.gstEdited = false; autoGst(); });
$("#xAmount").addEventListener("input", autoGst);
$("#xGstAmt").addEventListener("input", () => { X.gstEdited = true; });

function resetExpForm() {
  $("#expForm").reset(); X.cat = ""; X.gstEdited = false; renderXCats();
  $("#xGstBox").classList.add("hidden");
  $("#xDate").value = toDateInput(new Date());
  $$("#xPaySeg button").forEach((x) => x.classList.toggle("active", x.dataset.pay === X.pay));
}
function openExpenses() {
  if (!$("#xDate").value) $("#xDate").value = toDateInput(new Date());
  if (!$("#xMonth").value) $("#xMonth").value = toDateInput(new Date()).slice(0, 7);
  renderXCats(); loadExpenses();
}
$("#expForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const amount = round2($("#xAmount").value);
  const details = $("#xTitle").value.trim();
  const supName = $("#xSupplier").value.trim();
  if (!amount) return toast("Enter the amount");
  if (!X.cat && !details) return toast("Choose a category or type details");
  if (X.pay === "credit" && !supName) return toast("Enter the supplier for a credit purchase");
  const d = $("#xDate").value;
  const when = d === toDateInput(new Date()) ? Date.now() : new Date(d + "T12:00").getTime();
  const hasGst = $("#xGst").checked;
  const gst = hasGst ? Math.min(amount, round2($("#xGstAmt").value)) : 0;
  const batch = writeBatch(db);
  const supplierId = supName ? partyId(batch, "suppliers", supName, "") : "";
  if (X.pay === "credit") batch.update(doc(col("suppliers"), supplierId), { balance: increment(amount) });
  const ref = doc(col("expenses"));
  const x = {
    title: [X.cat, details].filter(Boolean).join(" – "),
    category: X.cat || "Other", account: $("#xAcc").value || CAT_ACC[X.cat] || "6900",
    details, amount, paidBy: X.pay,
    gst, supplier: supName, supplierId,
    supplierTin: hasGst ? $("#xSupTin").value.trim() : "", invoiceNo: hasGst ? $("#xInvNo").value.trim() : "",
    posted: true, createdAtMs: when, createdAt: serverTimestamp(),
  };
  batch.set(ref, x);
  postEntry(batch, expenseEntry({ ...x, id: ref.id }));
  batch.commit().catch(fail);
  toast(`Expense saved ✔ ${money(amount)}`);
  resetExpForm();
  $("#xMonth").value = d.slice(0, 7);
  setTimeout(loadExpenses, 300);
});

async function loadExpenses() {
  if (!S.shopId) return;
  const [yy, mm] = ($("#xMonth").value || toDateInput(new Date()).slice(0, 7)).split("-").map(Number);
  const from = new Date(yy, mm - 1, 1).getTime(), to = new Date(yy, mm, 1).getTime();
  let list = [];
  try {
    const snap = await getDocs(query(col("expenses"), where("createdAtMs", ">=", from), where("createdAtMs", "<", to), orderBy("createdAtMs", "desc")));
    list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) { return fail(e); }
  S.xExpenses = list;
  const sum = (arr, f) => round2(arr.reduce((a, x) => a + (Number(f(x)) || 0), 0));
  const total = sum(list, (e) => e.amount);
  const stat = (l, v, c = "") => `<div class="stat ${c}"><span>${l}</span><b>${v}</b></div>`;
  $("#xSummary").innerHTML =
    stat("Total spent", money(total), "big") +
    stat("💵 " + t("cash"), money(sum(list.filter((e) => (e.paidBy || "cash") === "cash"), (e) => e.amount))) +
    stat("🏦 " + t("transfer"), money(sum(list.filter((e) => e.paidBy === "transfer"), (e) => e.amount))) +
    stat("🧾 GST paid (claimable)", money(sum(list, (e) => e.gst))) +
    stat("Entries", list.length);
  const by = {};
  list.forEach((e) => { const k = e.category || "Other"; by[k] = (by[k] || 0) + (Number(e.amount) || 0); });
  $("#xByCat").innerHTML = Object.entries(by).sort((a, b) => b[1] - a[1]).map(([c, v]) =>
    `<div class="line"><div class="grow">${esc(catLabel(c))}</div><b>${money(v)}</b></div>`).join("");
  $("#xList").innerHTML = list.map((e) => `
    <div class="line">
      <div class="grow"><b>${esc(e.category ? catLabel(e.category) : e.title)}</b>${e.details ? ` <span class="muted">${esc(e.details)}</span>` : ""}
        <div class="muted">${fmtDateTime(new Date(e.createdAtMs))} · ${e.paidBy === "transfer" ? "Transfer" : "Cash"}${e.gst ? ` · 🧾 GST ${num(e.gst)}${e.supplier ? " · " + esc(e.supplier) : ""}` : ""}</div></div>
      <b>${money(e.amount)}</b>${e.paidBy === "credit" ? `<span class="tag offtag">Credit</span>` : ""}<button class="x" data-del-x="${e.id}">🗑</button>
    </div>`).join("") || `<div class="empty ${dvc()}">${t("noExpenses")}</div>`;
}
$("#xMonth").addEventListener("change", loadExpenses);
$("#xList").addEventListener("click", (e) => {
  const id = e.target.dataset.delX; if (!id || !confirm("Delete this expense?")) return;
  deleteExpense((S.xExpenses || []).find((x) => x.id === id) || { id });
  setTimeout(loadExpenses, 300);
});

// ================= GST REPORT =================
S.gstPeriod = "month";
$("#gstPeriodSeg").addEventListener("click", (e) => {
  const b = e.target.closest("[data-g]"); if (!b) return;
  S.gstPeriod = b.dataset.g;
  $$("#gstPeriodSeg button").forEach((x) => x.classList.toggle("active", x === b));
  $("#gstCustom").classList.toggle("hidden", S.gstPeriod !== "custom");
  if (S.gstPeriod === "custom") {
    const n = new Date();
    if (!$("#gFrom").value) $("#gFrom").value = toDateInput(new Date(n.getFullYear(), n.getMonth(), 1));
    if (!$("#gTo").value) $("#gTo").value = toDateInput(n);
  }
  loadGst();
});
$("#gApply").addEventListener("click", loadGst);
function gstRange() {
  const n = new Date(), y = n.getFullYear(), m = n.getMonth(), q = Math.floor(m / 3) * 3;
  switch (S.gstPeriod) {
    case "lastMonth": return [new Date(y, m - 1, 1), new Date(y, m, 1)];
    case "quarter": return [new Date(y, q, 1), new Date(y, q + 3, 1)];
    case "lastQuarter": return [new Date(y, q - 3, 1), new Date(y, q, 1)];
    case "custom": {
      const f = new Date(($("#gFrom").value || toDateInput(n)) + "T00:00");
      const t2 = new Date(($("#gTo").value || toDateInput(n)) + "T00:00");
      return [f, new Date(t2.getFullYear(), t2.getMonth(), t2.getDate() + 1)];
    }
    default: return [new Date(y, m, 1), new Date(y, m + 1, 1)];
  }
}
const fmtD = (d) => `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`;

async function loadGst() {
  if (!S.shopId) return;
  const [fd, td] = gstRange(); const from = fd.getTime(), to = td.getTime();
  const rq = (name) => query(col(name), where("createdAtMs", ">=", from), where("createdAtMs", "<", to), orderBy("createdAtMs", "asc"));
  let sales = [], exps = [];
  try {
    const [a, b, c] = await Promise.all([getDocs(rq("sales")), getDocs(rq("expenses")), getDocs(rq("purchases"))]);
    sales = a.docs.map((d) => ({ id: d.id, ...d.data() }));
    exps = [...b.docs, ...c.docs].map((d) => ({ id: d.id, ...d.data() })).sort((x, y) => x.createdAtMs - y.createdAtMs);
  } catch (e) { return fail(e); }
  const sum = (arr, f) => round2(arr.reduce((x, o) => x + (Number(f(o)) || 0), 0));
  const inv = sales.filter((s) => s.tax), plain = sales.filter((s) => !s.tax);
  const buys = exps.filter((e) => Number(e.gst) > 0);
  const R = {
    from: fd, to: new Date(to - 1), inv, buys,
    outTaxable: sum(inv, (s) => s.taxable), outGst: sum(inv, (s) => s.gst), outTotal: sum(inv, (s) => s.total),
    plainTotal: sum(plain, (s) => s.total),
    inTaxable: sum(buys, (e) => e.amount - e.gst), inGst: sum(buys, (e) => e.gst),
  };
  R.net = round2(R.outGst - R.inGst);
  S.gst = R;
  $("#gstPeriodLbl").textContent = `Period: ${fmtD(R.from)} to ${fmtD(R.to)}`;
  const stat = (l, v, c = "") => `<div class="stat ${c}"><span>${l}</span><b>${v}</b></div>`;
  $("#gstStats").innerHTML =
    stat(R.net >= 0 ? "GST to pay MIRA" : "GST refundable / carry forward", money(Math.abs(R.net)), R.net >= 0 ? "bad big" : "good big") +
    stat("Output GST (collected on sales)", money(R.outGst)) +
    stat("Input GST (paid on purchases)", money(R.inGst)) +
    stat("Taxable sales", money(R.outTaxable)) +
    stat("Tax invoices", inv.length) +
    stat("Taxable purchases", money(R.inTaxable)) +
    stat("Sales without tax invoice", money(R.plainTotal));
  $("#gstSales").innerHTML = inv.map((s) => `
    <div class="line tap" data-id="${s.id}">
      <div class="grow"><b>#${esc(s.billNo)}</b><div class="muted">${fmtDateTime(new Date(s.createdAtMs))}${s.customerTin ? " · TIN " + esc(s.customerTin) : ""}</div></div>
      <div class="right"><b>${money(s.total)}</b><span class="muted">GST ${num(s.gst)}</span></div>
    </div>`).join("") || `<div class="empty">No tax invoices in this period</div>`;
  $("#gstBuys").innerHTML = buys.map((e) => `
    <div class="line">
      <div class="grow"><b>${esc(e.supplier || e.title)}</b><div class="muted">${fmtD(new Date(e.createdAtMs))}${e.supplierTin ? " · TIN " + esc(e.supplierTin) : ""}${e.invoiceNo ? " · Inv " + esc(e.invoiceNo) : ""}</div></div>
      <div class="right"><b>${money(e.amount)}</b><span class="muted">GST ${num(e.gst)}</span></div>
    </div>`).join("") || `<div class="empty">No purchases with GST in this period. Add them in 💸 Expenses.</div>`;
}
$("#gstSales").addEventListener("click", (e) => {
  const row = e.target.closest(".line"); if (!row || !S.gst) return;
  const s = S.gst.inv.find((x) => x.id === row.dataset.id); if (s) showBill(s, true);
});
$("#gstCsv").addEventListener("click", () => {
  const R = S.gst; if (!R) return;
  const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = [
    ["GST report", S.shop.legalName || S.shop.name], ["TIN", S.shop.tin || ""], ["Period", `${fmtD(R.from)} to ${fmtD(R.to)}`], [],
    ["Taxable sales", R.outTaxable], ["Output GST", R.outGst], ["Taxable purchases", R.inTaxable], ["Input GST", R.inGst],
    [R.net >= 0 ? "GST payable" : "GST refundable", Math.abs(R.net)], ["Sales without tax invoice", R.plainTotal], [],
    ["SALES TAX INVOICES"], ["Invoice no", "Date", "Customer TIN", "Taxable value", "GST rate %", "GST", "Total"],
    ...R.inv.map((s) => [s.billNo, fmtDateTime(new Date(s.createdAtMs)), s.customerTin || "", s.taxable, s.gstRate, s.gst, s.total]), [],
    ["PURCHASES WITH GST"], ["Date", "Supplier", "Supplier TIN", "Invoice no", "Taxable value", "GST", "Total"],
    ...R.buys.map((e) => [fmtD(new Date(e.createdAtMs)), e.supplier || e.title, e.supplierTin || "", e.invoiceNo || "", round2(e.amount - e.gst), e.gst, e.amount]),
  ];
  const blob = new Blob(["﻿" + rows.map((r) => r.map(q).join(",")).join("\n")], { type: "text/csv" });
  downloadBlob(blob, `gst-report-${toDateInput(R.from)}-to-${toDateInput(R.to)}.csv`);
});
$("#gstPrint").addEventListener("click", () => {
  const R = S.gst; if (!R) return;
  const w = window.open("", "_blank"); if (!w) return toast("Allow pop-ups to print");
  const tr = (cells, th) => `<tr>${cells.map((c) => `<${th ? "th" : "td"}>${esc(c)}</${th ? "th" : "td"}>`).join("")}</tr>`;
  w.document.write(`<html><head><title>GST report</title><style>
    body{font-family:sans-serif;padding:16px;font-size:13px}table{border-collapse:collapse;width:100%;margin:8px 0 18px}
    td,th{border:1px solid #bbb;padding:5px 7px;text-align:left}th{background:#f3f3f3}.big{font-size:18px;font-weight:700}</style></head><body>
    <h2>GST report – ${esc(S.shop.legalName || S.shop.name)}</h2>
    <div>TIN: ${esc(S.shop.tin || "-")} · Period: ${fmtD(R.from)} to ${fmtD(R.to)}</div>
    <table>${tr(["Taxable sales", money(R.outTaxable)])}${tr(["Output GST", money(R.outGst)])}${tr(["Taxable purchases", money(R.inTaxable)])}
      ${tr(["Input GST", money(R.inGst)])}<tr><td class="big">${R.net >= 0 ? "GST payable" : "GST refundable"}</td><td class="big">${money(Math.abs(R.net))}</td></tr>
      ${tr(["Sales without tax invoice", money(R.plainTotal)])}</table>
    <h3>Sales tax invoices</h3><table>${tr(["Invoice", "Date", "Customer TIN", "Taxable", "GST", "Total"], true)}
      ${R.inv.map((s) => tr([s.billNo, fmtDateTime(new Date(s.createdAtMs)), s.customerTin || "", num(s.taxable), num(s.gst), num(s.total)])).join("")}</table>
    <h3>Purchases with GST</h3><table>${tr(["Date", "Supplier", "TIN", "Invoice", "Taxable", "GST", "Total"], true)}
      ${R.buys.map((e) => tr([fmtD(new Date(e.createdAtMs)), e.supplier || e.title, e.supplierTin || "", e.invoiceNo || "", num(e.amount - e.gst), num(e.gst), num(e.amount)])).join("")}</table>
    <script>window.onload=()=>window.print()<\/script></body></html>`);
  w.document.close();
});

// =====================================================================
// =====================  ACCOUNTING (double entry)  ====================
// =====================================================================
// Every money event is a balanced journal entry (debits = credits).
// journal/{id}            → one entry: date, memo, lines [{a: account, dr, cr}]
// ledgerD/{YYYY-MM-DD}    → that day's net movement per account  (dr − cr), kept with increment()
// ledgerM/{YYYY-MM}       → that month's net movement per account
// Reports add up the small day/month docs, so they stay cheap even with thousands of bills.

const COA_DEFAULT = [
  ["1000", "Cash in hand", "asset"], ["1010", "Bank", "asset"], ["1100", "Customers owe us (receivables)", "asset"],
  ["1200", "Stock (inventory)", "asset"], ["1300", "GST paid on purchases (input, claimable)", "asset"],
  ["2000", "We owe suppliers (payables)", "liability"], ["2100", "GST collected (output, to pay MIRA)", "liability"],
  ["3000", "Owner's capital", "equity"], ["3100", "Owner's drawings", "equity"], ["3200", "Opening balance equity", "equity"],
  ["4000", "Sales", "income"], ["4100", "Discounts given", "income"], ["4900", "Other income", "income"],
  ["5000", "Cost of goods sold (stock items)", "cogs"], ["5100", "Ingredients & cooking oil", "cogs"], ["5110", "Packaging", "cogs"],
  ["6000", "Rent", "expense"], ["6010", "Electricity", "expense"], ["6020", "Water", "expense"], ["6030", "Gas", "expense"],
  ["6100", "Salaries & wages", "expense"], ["6200", "Transport", "expense"], ["6800", "Stock loss / adjustment", "expense"],
  ["6900", "Other expenses", "expense"], ["6950", "Cash over / short", "expense"],
];
const CAT_ACC = { Ingredients: "5100", Oil: "5100", Packaging: "5110", Rent: "6000", Electricity: "6010",
  Water: "6020", Gas: "6030", Salary: "6100", Transport: "6200", Other: "6900" };
const TYPE_NAME = { asset: "Assets", liability: "Liabilities", equity: "Equity", income: "Income", cogs: "Cost of sales", expense: "Expenses" };
const DEBIT_TYPES = new Set(["asset", "cogs", "expense"]);
S.coa = COA_DEFAULT.map(([code, name, type]) => ({ code, name, type }));
S.customers = []; S.suppliers = [];

const acc = (code) => S.coa.find((a) => a.code === code) || { code, name: code, type: "expense" };
const accLabel = (code) => `${code} ${acc(code).name}`;
const nb = (bal, code) => round2((bal[code] || 0) * (DEBIT_TYPES.has(acc(code).type) ? 1 : -1)); // normal-side balance
const dayKey = (ms) => toDateInput(new Date(ms));
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const nextDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
const dateMs = (val) => (val === toDateInput(new Date()) ? Date.now() : new Date(val + "T12:00").getTime());
const r2 = (n) => round2(n);
function setToday(...ids) { ids.forEach((id) => { if (!$(id).value) $(id).value = toDateInput(new Date()); }); }

function startAccountingListeners() {
  S.unsubAdmin.push(onSnapshot(query(col("customers"), orderBy("name")), (snap) => {
    S.customers = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    $("#customerList").innerHTML = S.customers.map((c) => `<option value="${esc(c.name)}">`).join("");
    if (S.accPage === "cust") renderCustomers();
  }, () => {}));
  S.unsubAdmin.push(onSnapshot(query(col("suppliers"), orderBy("name")), (snap) => {
    S.suppliers = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    $("#supplierList").innerHTML = S.suppliers.map((c) => `<option value="${esc(c.name)}">`).join("");
    if (S.accPage === "supp") renderSuppliers();
  }, () => {}));
  S.unsubAdmin.push(onSnapshot(col("coa"), (snap) => {
    const custom = snap.docs.map((d) => ({ code: d.id, ...d.data(), custom: true }));
    S.coa = [...COA_DEFAULT.map(([code, name, type]) => ({ code, name, type })), ...custom].sort((a, b) => a.code.localeCompare(b.code));
    fillAccSelects();
  }, () => {}));
}

// ---------- posting ----------
function postEntry(batch, e) {
  const lines = e.lines.map((l) => ({ a: l.a, dr: r2(l.dr || 0), cr: r2(l.cr || 0) })).filter((l) => l.dr || l.cr);
  const dr = r2(lines.reduce((s, l) => s + l.dr, 0)), cr = r2(lines.reduce((s, l) => s + l.cr, 0));
  if (Math.abs(dr - cr) > 0.009) throw new Error(`Entry not balanced (${dr} vs ${cr})`);
  const ref = e.id ? doc(col("journal"), e.id) : doc(col("journal"));
  batch.set(ref, {
    createdAtMs: e.date, memo: e.memo || "", source: e.source || "manual", sourceId: e.sourceId || "",
    partyType: e.partyType || "", partyId: e.partyId || "", lines, total: dr,
    by: auth.currentUser?.email || "", at: Date.now(),
  });
  bumpBalances(batch, e.date, lines, 1);
  return ref.id;
}
function bumpBalances(batch, date, lines, sign) {
  const net = {};
  lines.forEach((l) => { net[l.a] = r2((net[l.a] || 0) + sign * (l.dr - l.cr)); });
  const inc = {};
  Object.entries(net).forEach(([a, v]) => { if (v) inc[a] = increment(v); });
  if (!Object.keys(inc).length) return;
  const d = dayKey(date), m = d.slice(0, 7);
  batch.set(doc(col("ledgerD"), d), { d, m, bal: inc }, { merge: true });
  batch.set(doc(col("ledgerM"), m), { m, bal: inc }, { merge: true });
}
function unpostEntry(batch, e) {
  batch.delete(doc(col("journal"), e.id));
  bumpBalances(batch, e.date ?? e.createdAtMs, e.lines.map((l) => ({ a: l.a, dr: r2(l.dr || 0), cr: r2(l.cr || 0) })), -1);
}
// find a customer / supplier by name (or phone), or create it in the same batch
function partyId(batch, coll, name, phone) {
  const list = coll === "customers" ? S.customers : S.suppliers;
  const p = String(phone || "").replace(/\D/g, "");
  const hit = list.find((c) => c.name.trim().toLowerCase() === name.trim().toLowerCase()) || (p && list.find((c) => (c.phone || "").replace(/\D/g, "") === p));
  if (hit) return hit.id;
  const ref = doc(col(coll));
  batch.set(ref, { name: name.trim(), phone: phone || "", balance: 0, createdAtMs: Date.now() });
  list.push({ id: ref.id, name: name.trim(), phone: phone || "", balance: 0 });  // so a second use before sync finds it
  return ref.id;
}

// ---------- entries made from business events ----------
function saleEntry(s) {
  const pay = s.payment === "transfer" ? "1010" : s.payment === "credit" ? "1100" : "1000";
  const g = s.tax ? r2(s.gst) : 0, disc = r2(s.discount || 0);
  const lines = [{ a: pay, dr: s.total }];
  if (disc) lines.push({ a: "4100", dr: disc });
  lines.push({ a: "4000", cr: r2(s.total + disc - g) });
  if (g) lines.push({ a: "2100", cr: g });
  const cogs = r2(s.lines.filter((l) => l.track).reduce((a, l) => a + l.cost * l.qty, 0));
  if (cogs) lines.push({ a: "5000", dr: cogs }, { a: "1200", cr: cogs });
  return { id: "sale-" + s.id, date: s.createdAtMs, memo: `Bill #${s.billNo}${s.customerName ? " – " + s.customerName : ""}`,
    source: "sale", sourceId: s.id, partyType: s.customerId ? "customer" : "", partyId: s.customerId || "", lines };
}
function expenseEntry(x) {
  const pay = x.paidBy === "transfer" ? "1010" : x.paidBy === "credit" ? "2000" : "1000";
  const g = r2(x.gst || 0);
  return { id: "exp-" + x.id, date: x.createdAtMs, memo: x.title + (x.supplier ? ` – ${x.supplier}` : ""),
    source: "expense", sourceId: x.id, partyType: x.supplierId ? "supplier" : "", partyId: x.supplierId || "",
    lines: [{ a: x.account || CAT_ACC[x.category] || "6900", dr: r2(x.amount - g) }, ...(g ? [{ a: "1300", dr: g }] : []), { a: pay, cr: x.amount }] };
}
function deleteSale(s) {
  const batch = writeBatch(db);
  batch.delete(doc(col("sales"), s.id));
  if (s.posted) {
    unpostEntry(batch, saleEntry(s));
    s.lines.filter((l) => l.track).forEach((l) => { if (S.items.find((i) => i.id === l.id)) batch.update(doc(col("items"), l.id), { stock: increment(l.qty) }); });
    if (s.customerId) batch.update(doc(col("customers"), s.customerId), { balance: increment(-s.total) });
  }
  batch.commit().catch(fail);
}
function deleteExpense(x) {
  const batch = writeBatch(db);
  batch.delete(doc(col("expenses"), x.id));
  if (x.posted) {
    unpostEntry(batch, expenseEntry(x));
    if (x.paidBy === "credit" && x.supplierId) batch.update(doc(col("suppliers"), x.supplierId), { balance: increment(-x.amount) });
  }
  batch.commit().catch(fail);
}

// ---------- reading balances ----------
function sumBal(list) {
  const out = {};
  list.forEach((b) => Object.entries(b || {}).forEach(([a, v]) => { out[a] = (out[a] || 0) + (Number(v) || 0); }));
  Object.keys(out).forEach((a) => { out[a] = r2(out[a]); });
  return out;
}
async function balancesBetween(fromMs, toMs) {          // movement from 00:00 of `from` until (not incl.) `to` day
  const snap = await getDocs(query(col("ledgerD"), where("d", ">=", dayKey(fromMs)), where("d", "<", dayKey(toMs))));
  return sumBal(snap.docs.map((d) => d.data().bal));
}
async function balancesAsOf(endMs) {                     // everything before the day of endMs
  const endKey = dayKey(endMs), mKey = endKey.slice(0, 7);
  const [ms, ds] = await Promise.all([
    getDocs(query(col("ledgerM"), where("m", "<", mKey))),
    getDocs(query(col("ledgerD"), where("m", "==", mKey))),
  ]);
  return sumBal([...ms.docs.map((d) => d.data().bal), ...ds.docs.filter((d) => d.data().d < endKey).map((d) => d.data().bal)]);
}
const tomorrow = () => nextDay(new Date()).getTime();

// ---------- page navigation inside Accounts ----------
const PAGE_TITLES = { sum: "Sales summary", gst: "GST report", pl: "Profit & Loss", bs: "Balance Sheet", tb: "Trial balance",
  cash: "Cash & bank", cust: "Customers (credit)", supp: "Suppliers", party: "", stock: "Stock", buy: "Buy stock",
  count: "Count stock", owner: "Owner money & opening", close: "Day closing", journal: "Journal", ledger: "General ledger",
  coa: "Chart of accounts", manual: "Manual journal entry" };
const PAGE_ID = (p) => (p === "sum" ? "#sumView" : p === "gst" ? "#gstView" : "#pg-" + p);
const PAGE_BACK = { party: () => (S.party?.type === "supplier" ? "supp" : "cust"), buy: () => "stock", count: () => "stock" };
function openPage(p) {
  S.accPage = p;
  $$("#view-accounts .acc-page").forEach((el) => el.classList.add("hidden"));
  $(PAGE_ID(p)).classList.remove("hidden");
  $("#accBar").classList.toggle("hidden", p === "hub");
  $("#accTitle").textContent = p === "party" ? (S.party?.name || "") : PAGE_TITLES[p] || "";
  window.scrollTo(0, 0);
  ({ hub: loadHub, sum: loadAccounts, gst: loadGst, pl: loadPL, bs: loadBS, tb: loadTB, cash: loadCash, cust: renderCustomers,
     supp: renderSuppliers, party: loadParty, stock: renderStock, buy: openBuy, count: renderCount, owner: loadOwner,
     close: loadClose, journal: loadJournal, ledger: loadLedger, coa: loadCoa, manual: openManual }[p] || (() => {}))();
}
$("#pg-hub").addEventListener("click", (e) => { const b = e.target.closest("[data-pg]"); if (b) openPage(b.dataset.pg); });
$("#accBackBtn").addEventListener("click", () => openPage(PAGE_BACK[S.accPage] ? PAGE_BACK[S.accPage]() : "hub"));

const statBox = (l, v, c = "") => `<div class="stat ${c}"><span>${l}</span><b>${v}</b></div>`;
async function loadHub() {
  try {
    const now = new Date();
    const [bal, mon] = await Promise.all([balancesAsOf(tomorrow()), balancesBetween(new Date(now.getFullYear(), now.getMonth(), 1).getTime(), tomorrow())]);
    const profit = profitOf(mon);
    $("#hubKpis").innerHTML =
      statBox("💵 Cash in hand", money(nb(bal, "1000"))) + statBox("🏦 Bank", money(nb(bal, "1010"))) +
      statBox("👥 Customers owe you", money(nb(bal, "1100"))) + statBox("🚚 You owe suppliers", money(nb(bal, "2000"))) +
      statBox("📦 Stock value", money(nb(bal, "1200"))) + (() => { const g = r2(nb(bal, "2100") - nb(bal, "1300")); return statBox(g >= 0 ? "🧾 GST to pay (net)" : "🧾 GST refundable (net)", money(Math.abs(g))); })() +
      statBox("📈 Profit this month", money(profit), profit >= 0 ? "good big" : "bad big");
  } catch (e) { fail(e); }
}

// ---------- period picker (reused) ----------
function periodPicker(el, onChange) {
  const P = { mode: "month" };
  el.innerHTML = `<div class="seg pgrid">${[["month", "This month"], ["lastMonth", "Last month"], ["year", "This year"], ["custom", "Custom"]]
    .map(([k, l]) => `<button type="button" data-pp="${k}" class="${k === "month" ? "active" : ""}">${l}</button>`).join("")}</div>
    <div class="row hidden pp-custom"><input type="date" class="pp-from"><input type="date" class="pp-to"><button type="button" class="btn pp-go">Go</button></div>`;
  el.querySelector(".pgrid").addEventListener("click", (e) => {
    const b = e.target.closest("[data-pp]"); if (!b) return;
    P.mode = b.dataset.pp;
    el.querySelectorAll("[data-pp]").forEach((x) => x.classList.toggle("active", x === b));
    el.querySelector(".pp-custom").classList.toggle("hidden", P.mode !== "custom");
    if (P.mode === "custom") {
      const n = new Date();
      if (!el.querySelector(".pp-from").value) el.querySelector(".pp-from").value = toDateInput(new Date(n.getFullYear(), n.getMonth(), 1));
      if (!el.querySelector(".pp-to").value) el.querySelector(".pp-to").value = toDateInput(n);
    }
    onChange();
  });
  el.querySelector(".pp-go").addEventListener("click", onChange);
  P.range = () => {
    const n = new Date(), y = n.getFullYear(), m = n.getMonth();
    if (P.mode === "lastMonth") return [new Date(y, m - 1, 1), new Date(y, m, 1)];
    if (P.mode === "year") return [new Date(y, 0, 1), new Date(y + 1, 0, 1)];
    if (P.mode === "custom") {
      const f = new Date((el.querySelector(".pp-from").value || toDateInput(n)) + "T00:00");
      const t2 = new Date((el.querySelector(".pp-to").value || toDateInput(n)) + "T00:00");
      return [f, nextDay(t2)];
    }
    return [new Date(y, m, 1), new Date(y, m + 1, 1)];
  };
  P.label = () => { const [f, t2] = P.range(); return `${fmtD(f)} to ${fmtD(new Date(t2 - 1))}`; };
  return P;
}

// ---------- report helpers ----------
const REP = {};   // last report rows for CSV
const trow = (label, val, cls = "") => `<div class="rrow ${cls}"><span>${esc(label)}</span><b>${val}</b></div>`;
function profitOf(bal) {
  return r2(-Object.entries(bal).filter(([a]) => ["income", "cogs", "expense"].includes(acc(a).type)).reduce((s, [, v]) => s + v, 0));
}

// PROFIT & LOSS
const plPick = periodPicker($("#plPeriod"), () => loadPL());
async function loadPL() {
  const [f, t2] = plPick.range();
  let bal; try { bal = await balancesBetween(f.getTime(), t2.getTime()); } catch (e) { return fail(e); }
  const of = (type) => S.coa.filter((a) => a.type === type && bal[a.code]);
  const rows = [["Profit & Loss", plPick.label()]];
  let h = `<div class="rhead">${esc(S.shop.name)} · ${plPick.label()}</div>`;
  const section = (title, list, sign) => {
    h += `<div class="rsec">${title}</div>`; rows.push([title]);
    let t = 0;
    list.forEach((a) => { const v = r2(sign * bal[a.code]); t += v; h += trow(`${a.code} ${a.name}`, money(v)); rows.push([`${a.code} ${a.name}`, v]); });
    if (!list.length) h += `<div class="muted rrow"><span>–</span></div>`;
    return r2(t);
  };
  const inc = section("Income", of("income"), -1);
  h += trow("Net sales / income", money(inc), "rtotal"); rows.push(["Net income", inc]);
  const cos = section("Cost of sales", of("cogs"), 1);
  const gp = r2(inc - cos);
  h += trow("Gross profit", money(gp), "rtotal"); rows.push(["Gross profit", gp]);
  if (inc) h += `<div class="muted rrow"><span>Gross margin</span><span>${num(r2(gp / inc * 100))}%</span></div>`;
  const ex = section("Expenses", of("expense"), 1);
  h += trow("Total expenses", money(ex), "rtotal"); rows.push(["Total expenses", ex]);
  const np = r2(gp - ex);
  h += trow(np >= 0 ? "NET PROFIT" : "NET LOSS", money(np), "rgrand " + (np >= 0 ? "good" : "bad")); rows.push(["Net profit", np]);
  $("#plBody").innerHTML = h; REP.pl = rows;
}

// BALANCE SHEET
$("#bsDate").addEventListener("change", () => loadBS());
async function loadBS() {
  setToday("#bsDate");
  const d = new Date($("#bsDate").value + "T00:00");
  let bal; try { bal = await balancesAsOf(nextDay(d).getTime()); } catch (e) { return fail(e); }
  const rows = [["Balance Sheet as at", fmtD(d)]];
  let h = `<div class="rhead">${esc(S.shop.name)} · as at ${fmtD(d)}</div>`;
  const section = (type) => {
    const list = S.coa.filter((a) => a.type === type && bal[a.code]);
    h += `<div class="rsec">${TYPE_NAME[type]}</div>`; rows.push([TYPE_NAME[type]]);
    let t = 0;
    list.forEach((a) => { const v = nb(bal, a.code); t += v; h += trow(`${a.code} ${a.name}`, money(v)); rows.push([`${a.code} ${a.name}`, v]); });
    return r2(t);
  };
  const A = section("asset");
  h += trow("Total assets", money(A), "rtotal"); rows.push(["Total assets", A]);
  const L = section("liability");
  h += trow("Total liabilities", money(L), "rtotal"); rows.push(["Total liabilities", L]);
  const E0 = section("equity");
  const P = profitOf(bal);
  h += trow("Profit to date (retained)", money(P)); rows.push(["Profit to date", P]);
  const E = r2(E0 + P);
  h += trow("Total equity", money(E), "rtotal"); rows.push(["Total equity", E]);
  const ok = Math.abs(A - (L + E)) < 0.01;
  h += trow("Liabilities + equity", money(r2(L + E)), "rgrand");
  h += `<div class="rcheck ${ok ? "good" : "bad"}">${ok ? "✔ Balanced: assets = liabilities + equity" : "⚠ Not balanced – check the journal"}</div>`;
  $("#bsBody").innerHTML = h; REP.bs = rows;
}

// TRIAL BALANCE
$("#tbDate").addEventListener("change", () => loadTB());
async function loadTB() {
  setToday("#tbDate");
  const d = new Date($("#tbDate").value + "T00:00");
  let bal; try { bal = await balancesAsOf(nextDay(d).getTime()); } catch (e) { return fail(e); }
  let dr = 0, cr = 0;
  const rows = [["Account", "Debit", "Credit"]];
  let h = `<div class="rhead">Trial balance as at ${fmtD(d)}</div><div class="rrow rth"><span>Account</span><span class="c2">Debit</span><span class="c2">Credit</span></div>`;
  S.coa.forEach((a) => {
    const v = r2(bal[a.code] || 0); if (!v) return;
    const D = v > 0 ? v : 0, C = v < 0 ? -v : 0; dr += D; cr += C;
    h += `<div class="rrow"><span>${esc(a.code + " " + a.name)}</span><span class="c2">${D ? num(D) : ""}</span><span class="c2">${C ? num(C) : ""}</span></div>`;
    rows.push([`${a.code} ${a.name}`, D || "", C || ""]);
  });
  dr = r2(dr); cr = r2(cr);
  h += `<div class="rrow rgrand"><span>TOTAL</span><span class="c2">${num(dr)}</span><span class="c2">${num(cr)}</span></div>`;
  h += `<div class="rcheck ${Math.abs(dr - cr) < 0.01 ? "good" : "bad"}">${Math.abs(dr - cr) < 0.01 ? "✔ Debits equal credits" : "⚠ Debits and credits differ"}</div>`;
  rows.push(["TOTAL", dr, cr]);
  $("#tbBody").innerHTML = h; REP.tb = rows;
}

// CASH & BANK
S.move = "dep";
$("#moveSeg").addEventListener("click", (e) => { const b = e.target.closest("[data-mv]"); if (!b) return; S.move = b.dataset.mv; $$("#moveSeg button").forEach((x) => x.classList.toggle("active", x === b)); });
async function loadCash() {
  setToday("#mvDate");
  try {
    const bal = await balancesAsOf(tomorrow());
    $("#cashStats").innerHTML = statBox("💵 Cash in hand", money(nb(bal, "1000")), "big") + statBox("🏦 Bank", money(nb(bal, "1010")), "big");
  } catch (e) { fail(e); }
}
$("#moveForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const amt = r2($("#mvAmt").value); if (!amt) return;
  const dep = S.move === "dep";
  const batch = writeBatch(db);
  postEntry(batch, { date: dateMs($("#mvDate").value), memo: dep ? "Cash deposited to bank" : "Cash withdrawn from bank", source: "transfer",
    lines: [{ a: dep ? "1010" : "1000", dr: amt }, { a: dep ? "1000" : "1010", cr: amt }] });
  batch.commit().catch(fail);
  $("#mvAmt").value = ""; toast("Saved ✔"); setTimeout(loadCash, 300);
});
$("#pg-cash").addEventListener("click", (e) => { const b = e.target.closest("[data-ledger]"); if (b) { S.ledgerAcc = b.dataset.ledger; openPage("ledger"); } });

// CUSTOMERS & SUPPLIERS
function partyRows(list, owesLabel) {
  return list.map((c) => `<div class="line tap" data-party="${c.id}">
      <div class="grow"><b>${esc(c.name)}</b><div class="muted">${esc(c.phone || "")}</div></div>
      <div class="right"><b class="${(c.balance || 0) > 0.009 ? "neg" : ""}">${money(c.balance || 0)}</b><span class="muted">${owesLabel}</span></div>
    </div>`).join("") || `<div class="empty">None yet</div>`;
}
function renderCustomers() {
  const q = $("#cuSearch").value.trim().toLowerCase();
  const list = S.customers.filter((c) => !q || c.name.toLowerCase().includes(q) || (c.phone || "").includes(q))
    .sort((a, b) => (b.balance || 0) - (a.balance || 0));
  const tot = r2(S.customers.reduce((s, c) => s + (c.balance || 0), 0));
  $("#custTotal").innerHTML = statBox("Customers owe you (total)", money(tot), "big") + statBox("Customers with credit", S.customers.filter((c) => (c.balance || 0) > 0.009).length);
  $("#custList").innerHTML = partyRows(list, "owes");
}
function renderSuppliers() {
  const list = [...S.suppliers].sort((a, b) => (b.balance || 0) - (a.balance || 0));
  const tot = r2(S.suppliers.reduce((s, c) => s + (c.balance || 0), 0));
  $("#suppTotal").innerHTML = statBox("You owe suppliers (total)", money(tot), "big");
  $("#suppList").innerHTML = partyRows(list, "you owe");
}
$("#cuSearch").addEventListener("input", renderCustomers);
$("#custForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const name = $("#cuName").value.trim(); if (!name) return;
  if (S.customers.find((c) => c.name.toLowerCase() === name.toLowerCase())) return toast("A customer with this name already exists");
  const open = r2($("#cuOpen").value);
  const batch = writeBatch(db); const ref = doc(col("customers"));
  batch.set(ref, { name, phone: $("#cuPhone").value.trim(), balance: open, createdAtMs: Date.now() });
  if (open) postEntry(batch, { date: Date.now(), memo: `Opening balance – ${name}`, source: "opening", partyType: "customer", partyId: ref.id,
    lines: [{ a: "1100", dr: open }, { a: "3200", cr: open }] });
  batch.commit().catch(fail);
  $("#custForm").reset(); toast("Customer added ✔");
});
$("#suppForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const name = $("#suName").value.trim(); if (!name) return;
  if (S.suppliers.find((c) => c.name.toLowerCase() === name.toLowerCase())) return toast("A supplier with this name already exists");
  const open = r2($("#suOpen").value);
  const batch = writeBatch(db); const ref = doc(col("suppliers"));
  batch.set(ref, { name, phone: $("#suPhone").value.trim(), tin: $("#suTin").value.trim(), balance: open, createdAtMs: Date.now() });
  if (open) postEntry(batch, { date: Date.now(), memo: `Opening balance – ${name}`, source: "opening", partyType: "supplier", partyId: ref.id,
    lines: [{ a: "3200", dr: open }, { a: "2000", cr: open }] });
  batch.commit().catch(fail);
  $("#suppForm").reset(); toast("Supplier added ✔");
});
["#custList", "#suppList"].forEach((sel) => $(sel).addEventListener("click", (e) => {
  const r = e.target.closest("[data-party]"); if (!r) return;
  const sup = sel === "#suppList";
  const p = (sup ? S.suppliers : S.customers).find((c) => c.id === r.dataset.party); if (!p) return;
  S.party = { ...p, type: sup ? "supplier" : "customer" };
  openPage("party");
}));

S.ppPay = "cash";
$("#ppSeg").addEventListener("click", (e) => { const b = e.target.closest("[data-pay]"); if (!b) return; S.ppPay = b.dataset.pay; $$("#ppSeg button").forEach((x) => x.classList.toggle("active", x === b)); });
async function loadParty() {
  const P = S.party; if (!P) return;
  const cur = (P.type === "supplier" ? S.suppliers : S.customers).find((c) => c.id === P.id) || P;
  const cust = P.type === "customer";
  $("#partyHead").innerHTML = statBox(cust ? "Owes you" : "You owe", money(cur.balance || 0), (cur.balance || 0) > 0.009 ? "bad big" : "good big")
    + (cur.phone ? statBox("Phone", esc(cur.phone)) : "");
  $("#partyPayTitle").textContent = cust ? "💰 Receive payment from customer" : "💸 Pay supplier";
  $("#partyWaBtn").classList.toggle("hidden", !cust);
  setToday("#ppDate");
  let es = [];
  try { es = (await getDocs(query(col("journal"), where("partyId", "==", P.id)))).docs.map((d) => ({ id: d.id, ...d.data() })); }
  catch (e) { return fail(e); }
  es.sort((a, b) => a.createdAtMs - b.createdAtMs);
  const ctrl = cust ? "1100" : "2000";
  let run = 0;
  const rows = es.map((e) => {
    const amt = r2(e.lines.filter((l) => l.a === ctrl).reduce((s, l) => s + (cust ? l.dr - l.cr : l.cr - l.dr), 0));
    run = r2(run + amt);
    return { e, amt, run };
  }).filter((r) => r.amt);
  S.partyRows = rows;
  $("#partyStmt").innerHTML = rows.slice().reverse().map(({ e, amt, run }) => `<div class="line">
      <div class="grow"><b>${esc(e.memo)}</b><div class="muted">${fmtD(new Date(e.createdAtMs))}</div></div>
      <div class="right"><b class="${amt > 0 ? "neg" : "pos"}">${amt > 0 ? "+" : "−"}${num(Math.abs(amt))}</b><span class="muted">bal ${num(run)}</span></div>
    </div>`).join("") || `<div class="empty">No transactions yet</div>`;
}
$("#partyPayForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const P = S.party, amt = r2($("#ppAmt").value); if (!P || !amt) return;
  const cust = P.type === "customer", cashAcc = S.ppPay === "transfer" ? "1010" : "1000";
  const note = $("#ppNote").value.trim();
  const batch = writeBatch(db);
  postEntry(batch, { date: dateMs($("#ppDate").value), source: cust ? "receipt" : "payment", partyType: P.type, partyId: P.id,
    memo: `${cust ? "Payment received" : "Paid supplier"} (${S.ppPay === "transfer" ? "transfer" : "cash"})${note ? " – " + note : ""}`,
    lines: cust ? [{ a: cashAcc, dr: amt }, { a: "1100", cr: amt }] : [{ a: "2000", dr: amt }, { a: cashAcc, cr: amt }] });
  batch.update(doc(col(cust ? "customers" : "suppliers"), P.id), { balance: increment(-amt) });
  batch.commit().catch(fail);
  $("#ppAmt").value = ""; $("#ppNote").value = "";
  toast("Payment saved ✔"); setTimeout(loadParty, 400);
});
$("#partyWaBtn").addEventListener("click", () => {
  const P = S.party; if (!P) return;
  const cur = S.customers.find((c) => c.id === P.id) || P;
  const L = [`*${S.shop.name}* – account statement`, `Customer: ${cur.name}`, fmtDateTime(new Date()), "--------------------------"];
  (S.partyRows || []).slice(-15).forEach(({ e, amt, run }) => L.push(`${fmtD(new Date(e.createdAtMs))} ${e.memo}\n   ${amt > 0 ? "+" : "−"}${num(Math.abs(amt))}  (bal ${num(run)})`));
  L.push("--------------------------", `*Balance to pay: ${money(cur.balance || 0)}*`);
  const banks = billBanks();
  if (banks.length) { L.push("", "🏦 *Pay by bank transfer:*"); banks.forEach((b) => { L.push(`${b.bank} – ${b.name}`); L.push(b.number); }); }
  window.open(waUrl(cur.phone || "", L.join("\n")), "_blank");
});
function showCustOwes() {
  const n = $("#coCustName").value.trim().toLowerCase();
  const c = S.customers.find((x) => x.name.toLowerCase() === n);
  $("#coCustOwes").textContent = c ? `${c.name} already owes ${money(c.balance || 0)}` : n ? "New customer – will be added" : "";
  if (c && c.phone && !$("#coPhone").value) $("#coPhone").value = c.phone;
}
$("#coCustName").addEventListener("input", showCustOwes);

// STOCK
const tracked = () => S.items.filter((i) => i.track);
function showStockFields(it) {
  const already = !!it?.track;
  $("#itemOpenLbl").classList.toggle("hidden", already || !$("#itemTrack").checked);
  $("#itemStockInfo").classList.toggle("hidden", !already);
  $("#itemStockInfo").textContent = already ? `In stock: ${num(it.stock || 0)}. Use Accounts → Stock to buy or count.` : "";
}
$("#itemTrack").addEventListener("change", () => showStockFields(S.items.find((i) => i.id === S.editItemId)));
function renderStock() {
  const list = tracked();
  const val = r2(list.reduce((s, i) => s + (i.stock || 0) * (i.cost || 0), 0));
  $("#stockStats").innerHTML = statBox("Stock value (at cost)", money(val), "big") + statBox("Items tracked", list.length)
    + statBox("Out of stock", list.filter((i) => (i.stock || 0) <= 0).length, list.some((i) => (i.stock || 0) <= 0) ? "bad" : "");
  $("#stockList").innerHTML = list.map((i) => `<div class="line">
      <div class="grow"><b>${esc(i.name)}</b><div class="muted">cost ${num(i.cost || 0)} · value ${num(r2((i.stock || 0) * (i.cost || 0)))}</div></div>
      <b class="${(i.stock || 0) <= 0 ? "neg" : ""}">${num(i.stock || 0)}</b></div>`).join("") || `<div class="empty">No items are tracked yet</div>`;
}
$("#goBuy").addEventListener("click", () => openPage("buy"));
$("#goCount").addEventListener("click", () => openPage("count"));

S.buyPay = "cash";
$("#buyPaySeg").addEventListener("click", (e) => { const b = e.target.closest("[data-pay]"); if (!b) return; S.buyPay = b.dataset.pay; $$("#buyPaySeg button").forEach((x) => x.classList.toggle("active", x === b)); });
function buyLine() {
  const row = document.createElement("div");
  row.className = "row buy-line";
  row.innerHTML = `<select class="bl-item">${S.items.map((i) => `<option value="${i.id}">${esc(i.name)}</option>`).join("")}</select>
    <input class="bl-qty narrow" type="number" inputmode="decimal" min="0" step="any" placeholder="Qty">
    <input class="bl-cost narrow" type="number" inputmode="decimal" min="0" step="any" placeholder="Cost each">
    <button type="button" class="x">✕</button>`;
  row.querySelector(".bl-item").addEventListener("change", () => { const it = S.items.find((i) => i.id === row.querySelector(".bl-item").value); if (it?.cost) row.querySelector(".bl-cost").value = it.cost; buyCalc(); });
  row.querySelector(".x").addEventListener("click", () => { row.remove(); buyCalc(); });
  row.querySelectorAll("input").forEach((i) => i.addEventListener("input", buyCalc));
  $("#buyLines").appendChild(row);
  row.querySelector(".bl-item").dispatchEvent(new Event("change"));
}
const readBuy = () => $$("#buyLines .buy-line").map((r) => ({ id: r.querySelector(".bl-item").value, qty: Number(r.querySelector(".bl-qty").value) || 0, cost: Number(r.querySelector(".bl-cost").value) || 0 })).filter((l) => l.qty > 0);
function buyCalc() {
  const net = r2(readBuy().reduce((s, l) => s + l.qty * l.cost, 0));
  if ($("#buyGstChk").checked && !S.buyGstEdited) $("#buyGst").value = r2(net * (Number(S.shop.gstRate) || 0) / 100) || "";
  const g = $("#buyGstChk").checked ? r2($("#buyGst").value) : 0;
  $("#buyNet").textContent = money(net); $("#buyTotal").textContent = money(r2(net + g));
}
$("#buyGstChk").addEventListener("change", () => { $("#buyGstLbl").classList.toggle("hidden", !$("#buyGstChk").checked); S.buyGstEdited = false; buyCalc(); });
$("#buyGst").addEventListener("input", () => { S.buyGstEdited = true; buyCalc(); });
$("#buyAddLine").addEventListener("click", buyLine);
function openBuy() {
  if (!S.items.length) { toast("Add items first in 📦 Items"); return openPage("stock"); }
  $("#buyForm").reset(); $("#buyLines").innerHTML = ""; S.buyGstEdited = false; $("#buyGstLbl").classList.add("hidden");
  $("#buyDate").value = toDateInput(new Date()); buyLine(); buyCalc();
}
$("#buyForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const lines = readBuy(); if (!lines.length) return toast("Enter quantity for at least one item");
  const sup = $("#buySupplier").value.trim();
  if (S.buyPay === "credit" && !sup) return toast("Enter the supplier for a credit purchase");
  const net = r2(lines.reduce((s, l) => s + l.qty * l.cost, 0));
  const g = $("#buyGstChk").checked ? r2($("#buyGst").value) : 0, total = r2(net + g);
  const date = dateMs($("#buyDate").value);
  const batch = writeBatch(db);
  const supplierId = sup ? partyId(batch, "suppliers", sup, "") : "";
  const pRef = doc(col("purchases"));
  const names = lines.map((l) => `${S.items.find((i) => i.id === l.id)?.name || "?"} ×${num(l.qty)}`).join(", ");
  batch.set(pRef, { lines, amount: total, gst: g, title: `Stock: ${names}`, supplier: sup, supplierId, invoiceNo: $("#buyInv").value.trim(),
    supplierTin: S.suppliers.find((s) => s.id === supplierId)?.tin || "", paidBy: S.buyPay, createdAtMs: date });
  const pay = S.buyPay === "transfer" ? "1010" : S.buyPay === "credit" ? "2000" : "1000";
  postEntry(batch, { id: "pur-" + pRef.id, date, memo: `Stock purchase – ${names}${sup ? " – " + sup : ""}`, source: "purchase", sourceId: pRef.id,
    partyType: supplierId ? "supplier" : "", partyId: supplierId, lines: [{ a: "1200", dr: net }, ...(g ? [{ a: "1300", dr: g }] : []), { a: pay, cr: total }] });
  if (S.buyPay === "credit") batch.update(doc(col("suppliers"), supplierId), { balance: increment(total) });
  // weighted average cost
  const byItem = {};
  lines.forEach((l) => { const b = byItem[l.id] ||= { qty: 0, val: 0 }; b.qty += l.qty; b.val += l.qty * l.cost; });
  Object.entries(byItem).forEach(([id, b]) => {
    const it = S.items.find((i) => i.id === id) || {};
    const oldQ = Math.max(0, it.stock || 0), oldC = Number(it.cost) || 0;
    const newCost = r2((oldQ * oldC + b.val) / (oldQ + b.qty));
    batch.update(doc(col("items"), id), { stock: increment(b.qty), cost: newCost, track: true });
  });
  batch.commit().catch(fail);
  toast(`Purchase saved ✔ ${money(total)}`); openPage("stock");
});
function renderCount() {
  $("#countList").innerHTML = tracked().map((i) => `<div class="line">
      <div class="grow"><b>${esc(i.name)}</b><div class="muted">App says: ${num(i.stock || 0)}</div></div>
      <input class="narrow cnt" data-id="${i.id}" type="number" inputmode="decimal" min="0" step="any" value="${i.stock || 0}">
    </div>`).join("") || `<div class="empty">No items are tracked yet</div>`;
}
$("#countSave").addEventListener("click", () => {
  const batch = writeBatch(db); let loss = 0; const notes = [];
  $$("#countList .cnt").forEach((inp) => {
    const it = S.items.find((i) => i.id === inp.dataset.id); if (!it) return;
    const real = Number(inp.value) || 0, diff = r2(real - (it.stock || 0)); if (!diff) return;
    loss = r2(loss - diff * (it.cost || 0)); notes.push(`${it.name} ${diff > 0 ? "+" : ""}${num(diff)}`);
    batch.update(doc(col("items"), it.id), { stock: real });
  });
  if (!notes.length) return toast("No differences");
  if (loss) postEntry(batch, { date: Date.now(), memo: `Stock count: ${notes.join(", ")}`, source: "adjust",
    lines: loss > 0 ? [{ a: "6800", dr: loss }, { a: "1200", cr: loss }] : [{ a: "1200", dr: -loss }, { a: "6800", cr: -loss }] });
  batch.commit().catch(fail);
  toast(loss > 0 ? `Stock loss ${money(loss)} recorded` : loss < 0 ? `Stock gain ${money(-loss)} recorded` : "Stock updated ✔");
  openPage("stock");
});

// OWNER & OPENING
S.own = "in"; S.owPay = "cash";
$("#ownSeg").addEventListener("click", (e) => { const b = e.target.closest("[data-ow]"); if (!b) return; S.own = b.dataset.ow; $$("#ownSeg button").forEach((x) => x.classList.toggle("active", x === b)); });
$("#owPaySeg").addEventListener("click", (e) => { const b = e.target.closest("[data-pay]"); if (!b) return; S.owPay = b.dataset.pay; $$("#owPaySeg button").forEach((x) => x.classList.toggle("active", x === b)); });
async function loadOwner() {
  setToday("#owDate", "#opDate");
  let es = [];
  try { es = (await getDocs(query(col("journal"), where("source", "in", ["capital", "drawing", "opening"])))).docs.map((d) => ({ id: d.id, ...d.data() })); }
  catch (e) { return fail(e); }
  es.sort((a, b) => b.createdAtMs - a.createdAtMs);
  $("#ownerList").innerHTML = es.map((e) => `<div class="line"><div class="grow"><b>${esc(e.memo)}</b><div class="muted">${fmtD(new Date(e.createdAtMs))}</div></div><b>${money(e.total)}</b></div>`).join("") || `<div class="empty">Nothing yet</div>`;
}
$("#ownerForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const amt = r2($("#owAmt").value); if (!amt) return;
  const into = S.own === "in", cashAcc = S.owPay === "transfer" ? "1010" : "1000", note = $("#owNote").value.trim();
  const batch = writeBatch(db);
  postEntry(batch, { date: dateMs($("#owDate").value), source: into ? "capital" : "drawing",
    memo: (into ? "Owner put money in" : "Owner took money out") + (note ? " – " + note : ""),
    lines: into ? [{ a: cashAcc, dr: amt }, { a: "3000", cr: amt }] : [{ a: "3100", dr: amt }, { a: cashAcc, cr: amt }] });
  batch.commit().catch(fail);
  $("#owAmt").value = ""; $("#owNote").value = ""; toast("Saved ✔"); setTimeout(loadOwner, 300);
});
$("#openForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const c = r2($("#opCash").value), b = r2($("#opBank").value);
  if (!c && !b) return toast("Enter cash or bank");
  if (!confirm(`Save opening balances: cash ${money(c)}, bank ${money(b)}?`)) return;
  const batch = writeBatch(db);
  postEntry(batch, { date: new Date($("#opDate").value + "T00:01").getTime(), memo: "Opening balances (cash & bank)", source: "opening",
    lines: [...(c ? [{ a: "1000", dr: c }] : []), ...(b ? [{ a: "1010", dr: b }] : []), { a: "3200", cr: r2(c + b) }] });
  batch.commit().catch(fail);
  $("#opCash").value = ""; $("#opBank").value = ""; toast("Opening balances saved ✔"); setTimeout(loadOwner, 300);
});

// DAY CLOSING
async function loadClose() {
  try {
    const [bal, today, past] = await Promise.all([
      balancesAsOf(tomorrow()),
      balancesBetween(startOfDay(new Date()).getTime(), tomorrow()),
      getDocs(query(col("dayclose"), orderBy("createdAtMs", "desc"), limit(30))),
    ]);
    S.expectedCash = nb(bal, "1000");
    $("#closeStats").innerHTML = statBox("Cash that should be in the drawer", money(S.expectedCash), "big")
      + statBox("Cash in / out today", money(r2(today["1000"] || 0)));
    $("#closeList").innerHTML = past.docs.map((d) => { const c = d.data(); return `<div class="line">
      <div class="grow"><b>${fmtDateTime(new Date(c.createdAtMs))}</b><div class="muted">expected ${num(c.expected)} · counted ${num(c.counted)}${c.note ? " · " + esc(c.note) : ""}</div></div>
      <b class="${c.diff < 0 ? "neg" : c.diff > 0 ? "pos" : ""}">${c.diff ? (c.diff > 0 ? "+" : "") + num(c.diff) : "✔"}</b></div>`; }).join("") || `<div class="empty">No closings yet</div>`;
    clDiff();
  } catch (e) { fail(e); }
}
function clDiff() {
  const v = $("#clCount").value; if (v === "") { $("#clDiff").textContent = "–"; return; }
  const d = r2(Number(v) - (S.expectedCash || 0));
  $("#clDiff").textContent = d === 0 ? "✔ Exact" : `${d > 0 ? "Over +" : "Short −"}${money(Math.abs(d))}`;
  $("#clDiff").className = d < 0 ? "neg" : d > 0 ? "pos" : "";
}
$("#clCount").addEventListener("input", clDiff);
$("#closeForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const counted = r2($("#clCount").value), expected = S.expectedCash || 0, diff = r2(counted - expected);
  const batch = writeBatch(db);
  if (diff) postEntry(batch, { date: Date.now(), memo: `Day closing – cash ${diff > 0 ? "over" : "short"}`, source: "dayclose",
    lines: diff > 0 ? [{ a: "1000", dr: diff }, { a: "6950", cr: diff }] : [{ a: "6950", dr: -diff }, { a: "1000", cr: -diff }] });
  batch.set(doc(col("dayclose")), { createdAtMs: Date.now(), expected, counted, diff, note: $("#clNote").value.trim(), by: auth.currentUser?.email || "" });
  batch.commit().catch(fail);
  $("#closeForm").reset(); toast(diff ? `Day closed – ${diff > 0 ? "over" : "short"} ${money(Math.abs(diff))}` : "Day closed ✔ cash is exact");
  setTimeout(loadClose, 400);
});

// JOURNAL
const jnPick = periodPicker($("#jnPeriod"), () => loadJournal());
const SRC_TAG = { sale: "Sale", expense: "Expense", purchase: "Stock buy", receipt: "Receipt", payment: "Payment", manual: "Manual",
  opening: "Opening", capital: "Capital", drawing: "Drawing", adjust: "Stock adj.", dayclose: "Day close", transfer: "Transfer", gst: "GST" };
async function journalIn(f, t2) {
  const snap = await getDocs(query(col("journal"), where("createdAtMs", ">=", f.getTime()), where("createdAtMs", "<", t2.getTime()), orderBy("createdAtMs", "desc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
async function loadJournal() {
  const [f, t2] = jnPick.range();
  let es; try { es = await journalIn(f, t2); } catch (e) { return fail(e); }
  S.journal = es;
  $("#jnList").innerHTML = es.map((e) => `<div class="jentry">
      <div class="row between"><b>${esc(e.memo)}</b><span class="tag">${SRC_TAG[e.source] || e.source}</span></div>
      <div class="muted">${fmtDateTime(new Date(e.createdAtMs))}${e.by ? " · " + esc(e.by) : ""}</div>
      ${e.lines.map((l) => `<div class="jl"><span>${esc(accLabel(l.a))}</span><span class="c2">${l.dr ? num(l.dr) : ""}</span><span class="c2">${l.cr ? num(l.cr) : ""}</span></div>`).join("")}
      ${e.source === "manual" || e.source === "transfer" || e.source === "capital" || e.source === "drawing" ? `<button class="btn small danger-outline" data-unpost="${e.id}">Delete entry</button>` : ""}
    </div>`).join("") || `<div class="empty">No entries in this period</div>`;
}
$("#jnList").addEventListener("click", (e) => {
  const id = e.target.dataset.unpost; if (!id) return;
  const en = (S.journal || []).find((x) => x.id === id);
  if (!en || !confirm("Delete this journal entry? Balances will be reversed.")) return;
  const batch = writeBatch(db); unpostEntry(batch, en); batch.commit().catch(fail);
  toast("Entry deleted"); setTimeout(loadJournal, 300);
});

// GENERAL LEDGER
const lgPick = periodPicker($("#lgPeriod"), () => loadLedger());
function fillAccSelects() {
  const opts = (types) => S.coa.filter((a) => !types || types.includes(a.type)).map((a) => `<option value="${a.code}">${esc(a.code + " " + a.name)}</option>`).join("");
  const keep = $("#lgAcc").value;
  $("#lgAcc").innerHTML = opts(); $("#lgAcc").value = keep || "1000";
  const xk = $("#xAcc").value;
  $("#xAcc").innerHTML = `<option value="">Account: automatic (from category)</option>` + opts(["expense", "cogs", "asset"]);
  $("#xAcc").value = xk;
  $$("#mjLines .mj-acc").forEach((s) => { const v = s.value; s.innerHTML = opts(); s.value = v; });
}
$("#lgAcc").addEventListener("change", () => { S.ledgerAcc = $("#lgAcc").value; loadLedger(); });
async function loadLedger() {
  if (S.ledgerAcc) $("#lgAcc").value = S.ledgerAcc;
  const a = $("#lgAcc").value || "1000";
  const [f, t2] = lgPick.range();
  let open, es;
  try { [open, es] = await Promise.all([balancesAsOf(f.getTime()), journalIn(f, t2)]); } catch (e) { return fail(e); }
  const sign = DEBIT_TYPES.has(acc(a).type) ? 1 : -1;
  let run = r2((open[a] || 0) * sign);
  const rows = [["Date", "Description", "Debit", "Credit", "Balance"], ["", "Opening balance", "", "", run]];
  let h = `<div class="rhead">${esc(accLabel(a))} · ${lgPick.label()}</div>
    <div class="rrow rth"><span>Date / description</span><span class="c2">Debit</span><span class="c2">Credit</span><span class="c2">Balance</span></div>
    <div class="rrow"><span><i>Opening balance</i></span><span class="c2"></span><span class="c2"></span><span class="c2">${num(run)}</span></div>`;
  es.slice().reverse().forEach((e) => e.lines.filter((l) => l.a === a).forEach((l) => {
    run = r2(run + sign * (l.dr - l.cr));
    h += `<div class="rrow"><span>${fmtD(new Date(e.createdAtMs))} · ${esc(e.memo)}</span><span class="c2">${l.dr ? num(l.dr) : ""}</span><span class="c2">${l.cr ? num(l.cr) : ""}</span><span class="c2">${num(run)}</span></div>`;
    rows.push([fmtD(new Date(e.createdAtMs)), e.memo, l.dr || "", l.cr || "", run]);
  }));
  h += `<div class="rrow rgrand"><span>Closing balance</span><span class="c2"></span><span class="c2"></span><span class="c2">${num(run)}</span></div>`;
  rows.push(["", "Closing balance", "", "", run]);
  $("#lgBody").innerHTML = h; REP.ledger = rows;
}

// CHART OF ACCOUNTS
async function loadCoa() {
  let bal; try { bal = await balancesAsOf(tomorrow()); } catch (e) { return fail(e); }
  let h = "";
  Object.keys(TYPE_NAME).forEach((type) => {
    h += `<div class="rsec">${TYPE_NAME[type]}</div>`;
    S.coa.filter((a) => a.type === type).forEach((a) => {
      h += `<div class="rrow tap" data-acc="${a.code}"><span>${esc(a.code + " " + a.name)}${a.custom ? " ✎" : ""}</span><b>${money(nb(bal, a.code))}</b></div>`;
    });
  });
  $("#coaList").innerHTML = h;
}
$("#coaList").addEventListener("click", (e) => { const r = e.target.closest("[data-acc]"); if (r) { S.ledgerAcc = r.dataset.acc; openPage("ledger"); } });
$("#coaForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const code = $("#coaCode").value.trim(), name = $("#coaName").value.trim();
  if (!/^\d{3,6}$/.test(code)) return toast("Code must be 3–6 digits");
  if (S.coa.find((a) => a.code === code)) return toast("That code is already used");
  setDoc(doc(col("coa"), code), { name, type: $("#coaType").value }).catch(fail);
  $("#coaForm").reset(); toast("Account added ✔"); setTimeout(loadCoa, 300);
});

// MANUAL JOURNAL ENTRY
function mjLine() {
  const row = document.createElement("div");
  row.className = "row mj-line";
  row.innerHTML = `<select class="mj-acc"></select>
    <input class="mj-dr narrow" type="number" inputmode="decimal" min="0" step="any" placeholder="Debit">
    <input class="mj-cr narrow" type="number" inputmode="decimal" min="0" step="any" placeholder="Credit">
    <button type="button" class="x">✕</button>`;
  row.querySelector(".mj-acc").innerHTML = S.coa.map((a) => `<option value="${a.code}">${esc(a.code + " " + a.name)}</option>`).join("");
  row.querySelector(".x").addEventListener("click", () => { row.remove(); mjCalc(); });
  row.querySelectorAll("input").forEach((i) => i.addEventListener("input", mjCalc));
  $("#mjLines").appendChild(row);
}
const readMj = () => $$("#mjLines .mj-line").map((r) => ({ a: r.querySelector(".mj-acc").value, dr: r2(r.querySelector(".mj-dr").value), cr: r2(r.querySelector(".mj-cr").value) })).filter((l) => l.dr || l.cr);
function mjCalc() {
  const ls = readMj(), dr = r2(ls.reduce((s, l) => s + l.dr, 0)), cr = r2(ls.reduce((s, l) => s + l.cr, 0));
  $("#mjDr").textContent = num(dr); $("#mjCr").textContent = num(cr);
  $("#mjOk").textContent = dr && dr === cr ? "✔ Balanced" : dr || cr ? `⚠ Difference ${num(Math.abs(r2(dr - cr)))}` : "";
  $("#mjOk").className = dr && dr === cr ? "pos" : "neg";
}
$("#mjAdd").addEventListener("click", mjLine);
function openManual() { setToday("#mjDate"); if (!$$("#mjLines .mj-line").length) { mjLine(); mjLine(); } mjCalc(); }
$("#mjForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const ls = readMj();
  const dr = r2(ls.reduce((s, l) => s + l.dr, 0)), cr = r2(ls.reduce((s, l) => s + l.cr, 0));
  if (!dr || dr !== cr) return toast("Debits must equal credits");
  if (ls.some((l) => l.dr && l.cr)) return toast("A line can have a debit or a credit, not both");
  const batch = writeBatch(db);
  try { postEntry(batch, { date: dateMs($("#mjDate").value), memo: $("#mjMemo").value.trim(), source: "manual", lines: ls }); }
  catch (err) { return toast(err.message); }
  batch.commit().catch(fail);
  $("#mjMemo").value = ""; $("#mjLines").innerHTML = ""; mjLine(); mjLine(); mjCalc();
  toast("Entry posted ✔");
});

// GST payment to MIRA (clears output GST against input GST, pays the rest from bank)
$("#gstPayBtn").addEventListener("click", () => {
  const R = S.gst; if (!R) return;
  const out = R.outGst, inp = R.inGst;
  if (!out && !inp) return toast("No GST in this period");
  const net = r2(out - inp);
  const msg = net > 0 ? `Record paying ${money(net)} GST to MIRA from the bank for ${fmtD(R.from)} – ${fmtD(R.to)}?`
    : `GST collected ${money(out)} is offset against GST paid. ${money(-net)} stays as claimable for later. Record it?`;
  if (!confirm(msg)) return;
  const lines = net > 0 ? [{ a: "2100", dr: out }, { a: "1300", cr: inp }, { a: "1010", cr: net }] : [{ a: "2100", dr: out }, { a: "1300", cr: out }];
  const batch = writeBatch(db);
  postEntry(batch, { date: Date.now(), memo: `GST return ${fmtD(R.from)} – ${fmtD(R.to)}${net > 0 ? " – paid to MIRA" : " – offset"}`, source: "gst", lines });
  batch.commit().catch(fail);
  toast("GST entry posted ✔");
});

// CSV + print for reports
$("#view-accounts").addEventListener("click", (e) => {
  const c = e.target.closest("[data-csv]");
  if (c) {
    let rows = REP[c.dataset.csv];
    if (c.dataset.csv === "journal") rows = [["Date", "Description", "Source", "Account", "Debit", "Credit"],
      ...(S.journal || []).flatMap((en) => en.lines.map((l) => [fmtDateTime(new Date(en.createdAtMs)), en.memo, en.source, accLabel(l.a), l.dr || "", l.cr || ""]))];
    if (!rows) return;
    const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    downloadBlob(new Blob(["﻿" + rows.map((r) => r.map(q).join(",")).join("\n")], { type: "text/csv" }), `${c.dataset.csv}-${toDateInput(new Date())}.csv`);
  }
  const p = e.target.closest("[data-print]");
  if (p) {
    const w = window.open("", "_blank"); if (!w) return toast("Allow pop-ups to print");
    w.document.write(`<html><head><title>${esc($("#accTitle").textContent)}</title><style>
      body{font-family:sans-serif;padding:18px;font-size:13px;max-width:720px;margin:auto}
      .rrow{display:flex;gap:10px;padding:4px 0;border-bottom:1px solid #eee}.rrow span:first-child{flex:1}.c2{width:90px;text-align:right}
      .rsec{font-weight:700;margin-top:14px;font-size:15px}.rhead{font-size:17px;font-weight:700;margin-bottom:8px}
      .rtotal{font-weight:700;border-top:1px solid #999}.rgrand{font-weight:800;font-size:15px;border-top:2px solid #000}
      .rcheck{margin-top:10px;font-weight:700}</style></head><body><h2>${esc($("#accTitle").textContent)}</h2>${$("#" + p.dataset.print).innerHTML}
      <script>window.onload=()=>window.print()<\/script></body></html>`);
    w.document.close();
  }
});
fillAccSelects();
