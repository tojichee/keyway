import { useState, useEffect, useMemo } from "react";
import {
  Users, Building2, CalendarDays, ListChecks, Plus, X, Check,
  Clock, Phone, KeyRound, AlertTriangle, Trash2, ArrowRight, MessageCircle,
} from "lucide-react";
import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";
import { getFirestore, doc, getDoc, setDoc } from "firebase/firestore";
import { firebaseConfig } from "./firebaseConfig";

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);

// ---------- design tokens ----------
const C = {
  ink: "#1C2B3A",
  inkLight: "#2E4256",
  paper: "#EEF1EA",
  card: "#FFFFFF",
  brass: "#AD8A3D",
  brassDeep: "#8C6E2C",
  brassSoft: "#F3E9D2",
  sage: "#4F6B4E",
  sageSoft: "#E3EBE0",
  clay: "#A6472F",
  claySoft: "#F5E1DB",
  line: "#DCE0D6",
  text: "#243027",
  muted: "#6E7A6D",
};

const DISPLAY_FONT = "'Fraunces', Georgia, serif";
const BODY_FONT = "'Inter', system-ui, sans-serif";

function useGoogleFonts() {
  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href =
      "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&display=swap";
    document.head.appendChild(link);
    return () => document.head.removeChild(link);
  }, []);
}

// ---------- persistence ----------
// Cloud-synced via Firebase Firestore, scoped by a short workspace code the
// user enters once per device. Same code on two devices = same data. Auth is
// anonymous (invisible sign-in) — it exists only so Firestore's security
// rules can require "must be signed in" and block fully public scraping;
// the actual data boundary is the workspace code itself.
const WORKSPACE_KEY = "keyway:workspaceId";
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no ambiguous 0/O/1/I

function genWorkspaceCode() {
  let id = "";
  for (let i = 0; i < 8; i++) id += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return id;
}

function useWorkspace() {
  const [workspaceId, setWorkspaceIdState] = useState(() => localStorage.getItem(WORKSPACE_KEY) || "");
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) setAuthReady(true);
      else signInAnonymously(auth).catch(() => {});
    });
    return unsub;
  }, []);

  function setWorkspaceId(id) {
    localStorage.setItem(WORKSPACE_KEY, id);
    setWorkspaceIdState(id);
  }

  return { workspaceId, setWorkspaceId, authReady };
}

function useCloudPersisted(workspaceId, authReady, key, initial) {
  const [value, setValue] = useState(initial);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!workspaceId || !authReady) return;
    let cancelled = false;
    setLoaded(false);
    (async () => {
      try {
        const snap = await getDoc(doc(db, "workspaces", workspaceId));
        if (!cancelled) {
          const data = snap.exists() ? snap.data() : {};
          setValue(data[key] !== undefined ? data[key] : initial);
        }
      } catch (e) {
        // couldn't load — keep default, still let the app render
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, authReady, key]);

  useEffect(() => {
    if (!loaded || !workspaceId || !authReady) return;
    setDoc(doc(db, "workspaces", workspaceId), { [key]: value }, { merge: true }).catch(() => {});
  }, [value, loaded, workspaceId, authReady, key]);

  return [value, setValue, loaded];
}

// ---------- time helpers ----------
function uid() { return Math.random().toString(36).slice(2, 10); }
function toMin(t) { const [h, m] = t.split(":").map(Number); return h * 60 + m; }
function toTime(m) {
  const h = Math.floor(m / 60).toString().padStart(2, "0");
  const mm = (m % 60).toString().padStart(2, "0");
  return `${h}:${mm}`;
}
function fmtTime(t) {
  const [h, m] = t.split(":").map(Number);
  const period = h >= 12 ? "pm" : "am";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12}${period}` : `${h12}:${m.toString().padStart(2, "0")}${period}`;
}
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d); // local date, no UTC conversion involved
  dt.setDate(dt.getDate() + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}
function fmtDate(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-SG", { weekday: "short", day: "numeric", month: "short" });
}

function overlapsForDate(clientSlots, listingSlots, date) {
  const cs = clientSlots.filter((s) => s.date === date);
  const ls = listingSlots.filter((s) => s.date === date);
  const windows = [];
  for (const c of cs) {
    for (const l of ls) {
      const start = Math.max(toMin(c.start), toMin(l.start));
      const end = Math.min(toMin(c.end), toMin(l.end));
      if (end > start) windows.push({ start, end });
    }
  }
  return windows.sort((a, b) => a.start - b.start);
}

function findMatch(clientSlots, listingSlots, preferredDate, searchDays = 21) {
  for (let i = 0; i <= searchDays; i++) {
    const dateStr = addDays(preferredDate, i);
    const windows = overlapsForDate(clientSlots, listingSlots, dateStr);
    if (windows.length > 0) {
      return { date: dateStr, window: windows[0], pushedDays: i };
    }
  }
  return null;
}

function suggestSlot(win) {
  const duration = Math.min(45, win.end - win.start);
  return { start: toTime(win.start), end: toTime(win.start + duration) };
}

// ---------- WhatsApp click-to-send ----------
// Builds a wa.me deep link with a pre-filled message. Opens WhatsApp with the
// text already typed — she still taps Send herself, nothing sends automatically.
function toWaLink(phone, message) {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 8) digits = "65" + digits; // bare 8-digit SG mobile -> add country code
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
function clientViewingMessage(client, listing, v) {
  return `Hi ${client.name}, your viewing for ${listing.address} is confirmed for ${fmtDate(v.date)} at ${fmtTime(v.start)}–${fmtTime(v.end)}. See you then!`;
}
function sellerViewingMessage(listing, client, v) {
  const seller = listing.sellerName || "there";
  return `Hi ${seller}, we have a viewing scheduled at ${listing.address} on ${fmtDate(v.date)} at ${fmtTime(v.start)}–${fmtTime(v.end)} with our client ${client.name}.`;
}

// ---------- client property matches (manual paste from a Claude chat) ----------
// The app makes no AI API calls itself — Brendan runs the real search in a
// Claude chat (reliable, checkable), then pastes the reply back in here. This
// avoids depending on a live API call succeeding inside the app.
function lenientParseListings(text) {
  const clean = text.replace(/```json|```/g, "").trim();
  const arrMatch = clean.match(/\[[\s\S]*\]/);
  if (arrMatch) {
    try {
      const parsed = JSON.parse(arrMatch[0]);
      if (Array.isArray(parsed)) return parsed;
    } catch (e) {
      // array may be malformed inside otherwise-fine surrounding text — fall through
    }
  }
  const objMatches = clean.match(/\{[^{}]*\}/g) || [];
  const recovered = [];
  for (const m of objMatches) {
    try {
      const obj = JSON.parse(m);
      if (obj && obj.address) recovered.push(obj);
    } catch (e) {
      // skip the one broken fragment, keep the rest
    }
  }
  return recovered;
}

function copyRequestPrompt(needs) {
  return `Find current HDB resale listings in Singapore matching: "${needs}". Reply with ONLY a JSON array, each item: {"address":"","price":"","size":"","mrt":"","url":""}.`;
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    // Modern Clipboard API blocked (common in sandboxed iframes) — try the older method.
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch (e2) {
    return false;
  }
}

function ClientMatches({ client, onAddMatches, onRemoveMatch }) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [parseError, setParseError] = useState(null);
  const matches = client.matches || [];

  if (!client.needs) return null;

  async function handleCopy() {
    const ok = await copyText(copyRequestPrompt(client.needs));
    if (ok) {
      setCopied(true);
      setCopyError(false);
      setTimeout(() => setCopied(false), 2000);
    } else {
      setCopyError(true);
      setCopied(false);
    }
  }

  function handleAddResults() {
    const found = lenientParseListings(pasteText);
    if (found.length === 0) {
      setParseError("Couldn't find any listings in that text — paste Claude's reply as-is.");
      return;
    }
    onAddMatches(found);
    setPasteText("");
    setPasteOpen(false);
    setParseError(null);
  }

  return (
    <div className="mt-2">
      {matches.length > 0 && (
        <div className="mb-2">
          <div style={{ background: C.brassSoft, color: C.brassDeep, fontFamily: BODY_FONT }}
            className="text-xs rounded-md px-2 py-1.5 mb-2 flex items-start gap-1.5">
            <AlertTriangle size={12} style={{ marginTop: 1, flexShrink: 0 }} />
            <span>Verify each link before sharing with your client.</span>
          </div>
          {matches.map((r, i) => (
            <div key={i} style={{ borderColor: C.line }} className="border rounded-lg p-2 mb-2 flex items-start justify-between gap-2">
              <div>
                <div style={{ color: C.text, fontFamily: BODY_FONT }} className="text-sm font-medium">{r.address}</div>
                <div style={{ color: C.muted, fontFamily: BODY_FONT }} className="text-xs">
                  {[r.price, r.size, r.mrt].filter(Boolean).join(" · ")}
                </div>
                {r.url && (
                  <a href={r.url} target="_blank" rel="noopener noreferrer"
                    style={{ color: C.sage, fontFamily: BODY_FONT }} className="text-xs underline">
                    View listing
                  </a>
                )}
              </div>
              <button onClick={() => onRemoveMatch(i)} className="p-1 flex-shrink-0">
                <X size={13} color={C.muted} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2 flex-wrap items-center">
        <button onClick={handleCopy}
          style={{ color: copied ? C.sage : C.brassDeep, borderColor: copied ? C.sage : C.brass, fontFamily: BODY_FONT }}
          className="text-xs font-medium border rounded-full px-2.5 py-1 active:opacity-70">
          {copied ? "Copied!" : "Copy request for Claude"}
        </button>
        <button onClick={() => setPasteOpen((v) => !v)}
          style={{ color: C.sage, borderColor: C.sage, fontFamily: BODY_FONT }}
          className="text-xs font-medium border rounded-full px-2.5 py-1 active:opacity-70">
          {pasteOpen ? "Cancel" : matches.length > 0 ? "Add more results" : "Paste results"}
        </button>
      </div>

      {copyError && (
        <div style={{ background: C.paper, borderColor: C.line }} className="border rounded-lg p-2 mt-2">
          <div style={{ color: C.muted, fontFamily: BODY_FONT }} className="text-xs mb-1.5">
            Auto-copy is blocked here — tap the text below, then copy from the selection menu:
          </div>
          <textarea
            readOnly
            value={copyRequestPrompt(client.needs)}
            onFocus={(e) => e.target.select()}
            rows={3}
            style={{ fontFamily: BODY_FONT, borderColor: C.line }}
            className="w-full border rounded-md px-2 py-1.5 text-sm bg-white"
          />
        </div>
      )}

      {pasteOpen && (
        <div style={{ background: C.paper, borderColor: C.line }} className="border rounded-lg p-2 mt-2">
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder="Paste Claude's reply here…"
            rows={4}
            style={{ fontFamily: BODY_FONT, borderColor: C.line }}
            className="w-full border rounded-md px-2 py-1.5 text-sm bg-white"
          />
          {parseError && (
            <div style={{ color: C.clay, fontFamily: BODY_FONT }} className="text-xs mt-1">{parseError}</div>
          )}
          <button onClick={handleAddResults}
            style={{ background: C.sage, color: "#fff", fontFamily: BODY_FONT }}
            className="w-full rounded-md py-1.5 text-sm font-medium mt-2 active:opacity-85">
            Add to client
          </button>
        </div>
      )}
    </div>
  );
}

// ---------- generic bits ----------
function TopBar({ title, subtitle, workspaceId }) {
  return (
    <div style={{ background: C.ink }} className="px-5 pt-6 pb-5 sticky top-0 z-10">
      <div className="flex items-center gap-2">
        <KeyRound size={20} color={C.brass} strokeWidth={2.25} />
        <span style={{ fontFamily: DISPLAY_FONT, color: "#F6F4EE" }} className="text-xl font-semibold tracking-tight">
          Keyway
        </span>
      </div>
      {subtitle && (
        <div style={{ color: "#AEB9C4", fontFamily: BODY_FONT }} className="text-sm mt-1">
          {subtitle}
        </div>
      )}
      {workspaceId && (
        <div style={{ color: "#7C8896", fontFamily: BODY_FONT }} className="text-xs mt-1">
          Workspace code: <span style={{ color: C.brass, letterSpacing: "0.05em" }}>{workspaceId}</span>
          {" "}(enter this on your other devices to sync)
        </div>
      )}
    </div>
  );
}

function EmptyState({ icon: Icon, title, body }) {
  return (
    <div className="flex flex-col items-center text-center py-14 px-6">
      <div style={{ background: C.brassSoft }} className="w-14 h-14 rounded-full flex items-center justify-center mb-4">
        <Icon size={24} color={C.brassDeep} />
      </div>
      <div style={{ fontFamily: DISPLAY_FONT, color: C.text }} className="text-lg font-semibold mb-1">{title}</div>
      <div style={{ color: C.muted, fontFamily: BODY_FONT }} className="text-sm max-w-xs">{body}</div>
    </div>
  );
}

function SlotRow({ slot, onRemove }) {
  return (
    <div style={{ borderColor: C.line }} className="flex items-center justify-between border rounded-lg px-3 py-2 mb-2">
      <div className="flex items-center gap-2" style={{ fontFamily: BODY_FONT, color: C.text }}>
        <Clock size={14} color={C.muted} />
        <span className="text-sm font-medium">{fmtDate(slot.date)}</span>
        <span style={{ color: C.muted }} className="text-sm">{fmtTime(slot.start)}–{fmtTime(slot.end)}</span>
      </div>
      <button onClick={onRemove} className="p-1 rounded-full active:opacity-60">
        <X size={15} color={C.muted} />
      </button>
    </div>
  );
}

function SlotAdder({ onAdd }) {
  const [date, setDate] = useState(todayStr());
  const [start, setStart] = useState("14:00");
  const [end, setEnd] = useState("17:00");
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{ borderColor: C.brass, color: C.brassDeep, fontFamily: BODY_FONT }}
        className="w-full border border-dashed rounded-lg py-2 text-sm font-medium flex items-center justify-center gap-1 active:opacity-70"
      >
        <Plus size={14} /> Add availability
      </button>
    );
  }

  return (
    <div style={{ background: C.paper, borderColor: C.line }} className="border rounded-lg p-3 space-y-2">
      <input type="date" value={date} min={todayStr()} onChange={(e) => setDate(e.target.value)}
        style={{ fontFamily: BODY_FONT, borderColor: C.line }} className="w-full border rounded-md px-2 py-1.5 text-sm bg-white" />
      <div className="flex gap-2">
        <input type="time" value={start} onChange={(e) => setStart(e.target.value)}
          style={{ fontFamily: BODY_FONT, borderColor: C.line }} className="w-1/2 border rounded-md px-2 py-1.5 text-sm bg-white" />
        <input type="time" value={end} onChange={(e) => setEnd(e.target.value)}
          style={{ fontFamily: BODY_FONT, borderColor: C.line }} className="w-1/2 border rounded-md px-2 py-1.5 text-sm bg-white" />
      </div>
      <div className="flex gap-2 pt-1">
        <button
          onClick={() => {
            if (toMin(end) > toMin(start)) {
              onAdd({ id: uid(), date, start, end });
              setOpen(false);
            }
          }}
          style={{ background: C.ink, color: "#fff", fontFamily: BODY_FONT }}
          className="flex-1 rounded-md py-1.5 text-sm font-medium active:opacity-80"
        >
          Save slot
        </button>
        <button onClick={() => setOpen(false)} style={{ borderColor: C.line, color: C.muted, fontFamily: BODY_FONT }}
          className="px-3 rounded-md border text-sm">Cancel</button>
      </div>
    </div>
  );
}

// ---------- Clients tab ----------
function ClientsTab({ clients, setClients }) {
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [needs, setNeeds] = useState("");
  const [expanded, setExpanded] = useState(null);

  function addClient() {
    if (!name.trim()) return;
    setClients([...clients, { id: uid(), name, phone, needs, slots: [], matches: [] }]);
    setName(""); setPhone(""); setNeeds(""); setFormOpen(false);
  }

  return (
    <div className="px-4 pt-4 pb-24">
      <div className="flex items-center justify-between mb-3">
        <div style={{ fontFamily: DISPLAY_FONT, color: C.text }} className="text-lg font-semibold">Clients</div>
        <button onClick={() => setFormOpen((v) => !v)} style={{ background: C.ink }} className="w-8 h-8 rounded-full flex items-center justify-center active:opacity-80">
          <Plus size={16} color="#fff" />
        </button>
      </div>

      {formOpen && (
        <div style={{ background: C.card, borderColor: C.line }} className="border rounded-xl p-3 mb-4 space-y-2">
          <input placeholder="Client name" value={name} onChange={(e) => setName(e.target.value)}
            style={{ fontFamily: BODY_FONT, borderColor: C.line }} className="w-full border rounded-md px-3 py-2 text-sm" />
          <input placeholder="Phone, e.g. 9123 4567" value={phone} onChange={(e) => setPhone(e.target.value)}
            style={{ fontFamily: BODY_FONT, borderColor: C.line }} className="w-full border rounded-md px-3 py-2 text-sm" />
          <input placeholder="What they're looking for (e.g. 3-room, near MRT, ~$400k)" value={needs} onChange={(e) => setNeeds(e.target.value)}
            style={{ fontFamily: BODY_FONT, borderColor: C.line }} className="w-full border rounded-md px-3 py-2 text-sm" />
          <button onClick={addClient} style={{ background: C.brass, color: "#fff", fontFamily: BODY_FONT }}
            className="w-full rounded-md py-2 text-sm font-medium active:opacity-85">Add client</button>
        </div>
      )}

      {clients.length === 0 ? (
        <EmptyState icon={Users} title="No clients yet" body="Add a client to start matching them against listings." />
      ) : (
        clients.map((c) => (
          <div key={c.id} style={{ background: C.card, borderColor: C.line }} className="border rounded-xl p-3 mb-3">
            <div className="flex items-start justify-between">
              <div>
                <div style={{ fontFamily: DISPLAY_FONT, color: C.text }} className="font-semibold">{c.name}</div>
                {c.phone && <div style={{ color: C.muted, fontFamily: BODY_FONT }} className="text-xs flex items-center gap-1 mt-0.5"><Phone size={11} />{c.phone}</div>}
                {c.needs && <div style={{ color: C.text, fontFamily: BODY_FONT }} className="text-sm mt-1.5">{c.needs}</div>}
              </div>
              <button onClick={() => setClients(clients.filter((x) => x.id !== c.id))} className="p-1">
                <Trash2 size={15} color={C.muted} />
              </button>
            </div>
            <button
              onClick={() => setExpanded(expanded === c.id ? null : c.id)}
              style={{ color: C.brassDeep, fontFamily: BODY_FONT }}
              className="text-xs font-medium mt-2"
            >
              {c.slots.length} availability slot{c.slots.length === 1 ? "" : "s"} {expanded === c.id ? "▴" : "▾"}
            </button>
            {expanded === c.id && (
              <div className="mt-2">
                {c.slots.map((s) => (
                  <SlotRow key={s.id} slot={s} onRemove={() =>
                    setClients(clients.map((x) => x.id === c.id ? { ...x, slots: x.slots.filter((sl) => sl.id !== s.id) } : x))
                  } />
                ))}
                <SlotAdder onAdd={(slot) =>
                  setClients(clients.map((x) => x.id === c.id ? { ...x, slots: [...x.slots, slot] } : x))
                } />
              </div>
            )}
            <ClientMatches
              client={c}
              onAddMatches={(newMatches) =>
                setClients(clients.map((x) => x.id === c.id ? { ...x, matches: [...(x.matches || []), ...newMatches] } : x))
              }
              onRemoveMatch={(idx) =>
                setClients(clients.map((x) => x.id === c.id ? { ...x, matches: (x.matches || []).filter((_, i) => i !== idx) } : x))
              }
            />
          </div>
        ))
      )}
    </div>
  );
}

// ---------- Listings tab ----------
function ListingsTab({ listings, setListings }) {
  const [formOpen, setFormOpen] = useState(false);
  const [address, setAddress] = useState("");
  const [sellerName, setSellerName] = useState("");
  const [sellerPhone, setSellerPhone] = useState("");
  const [price, setPrice] = useState("");
  const [expanded, setExpanded] = useState(null);

  function addListing() {
    if (!address.trim()) return;
    setListings([...listings, { id: uid(), address, sellerName, sellerPhone, price, slots: [] }]);
    setAddress(""); setSellerName(""); setSellerPhone(""); setPrice(""); setFormOpen(false);
  }

  return (
    <div className="px-4 pt-4 pb-24">
      <div className="flex items-center justify-between mb-3">
        <div style={{ fontFamily: DISPLAY_FONT, color: C.text }} className="text-lg font-semibold">Listings</div>
        <button onClick={() => setFormOpen((v) => !v)} style={{ background: C.ink }} className="w-8 h-8 rounded-full flex items-center justify-center active:opacity-80">
          <Plus size={16} color="#fff" />
        </button>
      </div>

      {formOpen && (
        <div style={{ background: C.card, borderColor: C.line }} className="border rounded-xl p-3 mb-4 space-y-2">
          <input placeholder="Address / block" value={address} onChange={(e) => setAddress(e.target.value)}
            style={{ fontFamily: BODY_FONT, borderColor: C.line }} className="w-full border rounded-md px-3 py-2 text-sm" />
          <input placeholder="Seller name" value={sellerName} onChange={(e) => setSellerName(e.target.value)}
            style={{ fontFamily: BODY_FONT, borderColor: C.line }} className="w-full border rounded-md px-3 py-2 text-sm" />
          <input placeholder="Seller phone, e.g. 9123 4567" value={sellerPhone} onChange={(e) => setSellerPhone(e.target.value)}
            style={{ fontFamily: BODY_FONT, borderColor: C.line }} className="w-full border rounded-md px-3 py-2 text-sm" />
          <input placeholder="Asking price" value={price} onChange={(e) => setPrice(e.target.value)}
            style={{ fontFamily: BODY_FONT, borderColor: C.line }} className="w-full border rounded-md px-3 py-2 text-sm" />
          <button onClick={addListing} style={{ background: C.brass, color: "#fff", fontFamily: BODY_FONT }}
            className="w-full rounded-md py-2 text-sm font-medium active:opacity-85">Add listing</button>
        </div>
      )}

      {listings.length === 0 ? (
        <EmptyState icon={Building2} title="No listings yet" body="Add a listing (with the seller's contact) to start scheduling viewings." />
      ) : (
        listings.map((l) => (
          <div key={l.id} style={{ background: C.card, borderColor: C.line }} className="border rounded-xl p-3 mb-3">
            <div className="flex items-start justify-between">
              <div>
                <div style={{ fontFamily: DISPLAY_FONT, color: C.text }} className="font-semibold">{l.address}</div>
                <div style={{ color: C.muted, fontFamily: BODY_FONT }} className="text-xs mt-0.5">
                  {l.sellerName}{l.sellerPhone ? ` · ${l.sellerPhone}` : ""}
                </div>
                {l.price && <div style={{ color: C.brassDeep, fontFamily: BODY_FONT }} className="text-sm font-medium mt-1">{l.price}</div>}
              </div>
              <button onClick={() => setListings(listings.filter((x) => x.id !== l.id))} className="p-1">
                <Trash2 size={15} color={C.muted} />
              </button>
            </div>
            <button
              onClick={() => setExpanded(expanded === l.id ? null : l.id)}
              style={{ color: C.brassDeep, fontFamily: BODY_FONT }}
              className="text-xs font-medium mt-2"
            >
              {l.slots.length} availability slot{l.slots.length === 1 ? "" : "s"} {expanded === l.id ? "▴" : "▾"}
            </button>
            {expanded === l.id && (
              <div className="mt-2">
                {l.slots.map((s) => (
                  <SlotRow key={s.id} slot={s} onRemove={() =>
                    setListings(listings.map((x) => x.id === l.id ? { ...x, slots: x.slots.filter((sl) => sl.id !== s.id) } : x))
                  } />
                ))}
                <SlotAdder onAdd={(slot) =>
                  setListings(listings.map((x) => x.id === l.id ? { ...x, slots: [...x.slots, slot] } : x))
                } />
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}

// ---------- Schedule tab ----------
function ScheduleTab({ clients, listings, viewings, setViewings }) {
  const [clientId, setClientId] = useState("");
  const [listingId, setListingId] = useState("");
  const [preferredDate, setPreferredDate] = useState(todayStr());
  const [result, setResult] = useState(null);
  const [searched, setSearched] = useState(false);

  const client = clients.find((c) => c.id === clientId);
  const listing = listings.find((l) => l.id === listingId);

  function runMatch() {
    if (!client || !listing) return;
    const match = findMatch(client.slots, listing.slots, preferredDate);
    setResult(match);
    setSearched(true);
  }

  function confirm() {
    if (!result || !client || !listing) return;
    const slot = suggestSlot(result.window);
    setViewings([...viewings, {
      id: uid(), clientId, listingId, date: result.date, start: slot.start, end: slot.end, status: "scheduled",
    }]);
    setResult(null);
    setSearched(false);
  }

  if (clients.length === 0 || listings.length === 0) {
    return <EmptyState icon={CalendarDays} title="Add a client and a listing first" body="You need at least one client and one listing (each with availability) before matching a viewing." />;
  }

  return (
    <div className="px-4 pt-4 pb-24">
      <div style={{ fontFamily: DISPLAY_FONT, color: C.text }} className="text-lg font-semibold mb-3">Schedule a viewing</div>

      <div style={{ background: C.card, borderColor: C.line }} className="border rounded-xl p-3 space-y-2 mb-4">
        <select value={clientId} onChange={(e) => { setClientId(e.target.value); setResult(null); setSearched(false); }}
          style={{ fontFamily: BODY_FONT, borderColor: C.line }} className="w-full border rounded-md px-3 py-2 text-sm bg-white">
          <option value="">Select client…</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={listingId} onChange={(e) => { setListingId(e.target.value); setResult(null); setSearched(false); }}
          style={{ fontFamily: BODY_FONT, borderColor: C.line }} className="w-full border rounded-md px-3 py-2 text-sm bg-white">
          <option value="">Select listing…</option>
          {listings.map((l) => <option key={l.id} value={l.id}>{l.address}</option>)}
        </select>
        <div>
          <div style={{ color: C.muted, fontFamily: BODY_FONT }} className="text-xs mb-1">Preferred date</div>
          <input type="date" value={preferredDate} min={todayStr()}
            onChange={(e) => { setPreferredDate(e.target.value); setResult(null); setSearched(false); }}
            style={{ fontFamily: BODY_FONT, borderColor: C.line }} className="w-full border rounded-md px-3 py-2 text-sm bg-white" />
        </div>
        <button onClick={runMatch} disabled={!client || !listing}
          style={{ background: client && listing ? C.ink : C.line, color: "#fff", fontFamily: BODY_FONT }}
          className="w-full rounded-md py-2.5 text-sm font-medium active:opacity-85">
          Find match
        </button>
      </div>

      {searched && (
        result ? (
          result.pushedDays === 0 ? (
            <div style={{ background: C.sageSoft, borderColor: C.sage }} className="border rounded-xl p-3 mb-3">
              <div className="flex items-center gap-2 mb-1">
                <Check size={16} color={C.sage} />
                <span style={{ color: C.sage, fontFamily: BODY_FONT }} className="text-sm font-semibold">Match found</span>
              </div>
              <div style={{ color: C.text, fontFamily: BODY_FONT }} className="text-sm mb-3">
                {fmtDate(result.date)}, {fmtTime(suggestSlot(result.window).start)}–{fmtTime(suggestSlot(result.window).end)}
              </div>
              <button onClick={confirm} style={{ background: C.sage, color: "#fff", fontFamily: BODY_FONT }}
                className="w-full rounded-md py-2 text-sm font-medium active:opacity-85">Confirm & schedule</button>
            </div>
          ) : (
            <div style={{ background: C.brassSoft, borderColor: C.brass }} className="border rounded-xl p-3 mb-3">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle size={16} color={C.brassDeep} />
                <span style={{ color: C.brassDeep, fontFamily: BODY_FONT }} className="text-sm font-semibold">
                  Seller not free on {fmtDate(preferredDate)}
                </span>
              </div>
              <div style={{ color: C.text, fontFamily: BODY_FONT }} className="text-sm mb-3">
                Pushed {result.pushedDays} day{result.pushedDays > 1 ? "s" : ""} — next match {fmtDate(result.date)}, {fmtTime(suggestSlot(result.window).start)}–{fmtTime(suggestSlot(result.window).end)}
              </div>
              <button onClick={confirm} style={{ background: C.brass, color: "#fff", fontFamily: BODY_FONT }}
                className="w-full rounded-md py-2 text-sm font-medium active:opacity-85">Schedule this instead</button>
            </div>
          )
        ) : (
          <div style={{ background: C.claySoft, borderColor: C.clay }} className="border rounded-xl p-3 mb-3">
            <div className="flex items-center gap-2 mb-1">
              <X size={16} color={C.clay} />
              <span style={{ color: C.clay, fontFamily: BODY_FONT }} className="text-sm font-semibold">No overlap in the next 21 days</span>
            </div>
            <div style={{ color: C.text, fontFamily: BODY_FONT }} className="text-sm">
              Add more availability for {client?.name} or {listing?.address} and try again.
            </div>
          </div>
        )
      )}
    </div>
  );
}

function WhatsAppButton({ phone, message, label }) {
  const link = toWaLink(phone, message);
  if (!link) {
    return (
      <span
        style={{ color: C.muted, borderColor: C.line, fontFamily: BODY_FONT }}
        className="text-xs font-medium border border-dashed rounded-full px-2.5 py-1 flex items-center gap-1 opacity-70"
        title="Add a phone number to enable this"
      >
        <MessageCircle size={12} /> {label}: no phone
      </span>
    );
  }
  return (
    <a
      href={link}
      target="_blank"
      rel="noopener noreferrer"
      style={{ color: C.sage, borderColor: C.sage, fontFamily: BODY_FONT }}
      className="text-xs font-medium border rounded-full px-2.5 py-1 flex items-center gap-1 active:opacity-70"
    >
      <MessageCircle size={12} /> {label}
    </a>
  );
}

// ---------- Viewings tab ----------
function ViewingsTab({ viewings, setViewings, clients, listings }) {
  const sorted = useMemo(
    () => [...viewings].sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start)),
    [viewings]
  );

  function pushToNextDay(v) {
    const client = clients.find((c) => c.id === v.clientId);
    const listing = listings.find((l) => l.id === v.listingId);
    if (!client || !listing) return;
    const match = findMatch(client.slots, listing.slots, addDays(v.date, 1));
    if (!match) return;
    const slot = suggestSlot(match.window);
    setViewings(viewings.map((x) => x.id === v.id ? { ...x, date: match.date, start: slot.start, end: slot.end } : x));
  }

  if (viewings.length === 0) {
    return <EmptyState icon={ListChecks} title="No viewings scheduled" body="Matched viewings will show up here once you schedule one." />;
  }

  return (
    <div className="px-4 pt-4 pb-24">
      <div style={{ fontFamily: DISPLAY_FONT, color: C.text }} className="text-lg font-semibold mb-3">Viewings</div>
      {sorted.map((v) => {
        const client = clients.find((c) => c.id === v.clientId);
        const listing = listings.find((l) => l.id === v.listingId);
        if (!client || !listing) return null;
        return (
          <div key={v.id} style={{ background: C.card, borderColor: C.line }} className="border rounded-xl p-3 mb-3">
            <div className="flex items-center justify-between mb-1">
              <div style={{ fontFamily: DISPLAY_FONT, color: C.text }} className="font-semibold text-sm">
                {fmtDate(v.date)} · {fmtTime(v.start)}–{fmtTime(v.end)}
              </div>
              <button onClick={() => setViewings(viewings.filter((x) => x.id !== v.id))} className="p-1">
                <Trash2 size={14} color={C.muted} />
              </button>
            </div>
            <div style={{ color: C.text, fontFamily: BODY_FONT }} className="text-sm flex items-center gap-1.5">
              {client.name} <ArrowRight size={12} color={C.muted} /> {listing.address}
            </div>
            <button onClick={() => pushToNextDay(v)} style={{ color: C.brassDeep, fontFamily: BODY_FONT, borderColor: C.brass }}
              className="text-xs font-medium mt-2 border rounded-full px-2.5 py-1 active:opacity-70">
              Seller unavailable — push to next day
            </button>
            <div className="flex flex-wrap gap-2 mt-2">
              <WhatsAppButton phone={client.phone} label="Message client" message={clientViewingMessage(client, listing, v)} />
              <WhatsAppButton phone={listing.sellerPhone} label="Message seller" message={sellerViewingMessage(listing, client, v)} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------- workspace setup ----------
function WorkspaceSetup({ onSet }) {
  const [joinCode, setJoinCode] = useState("");
  const newCode = useMemo(() => genWorkspaceCode(), []);

  return (
    <div style={{ background: C.paper, minHeight: "100vh", fontFamily: BODY_FONT }}
      className="max-w-md mx-auto flex flex-col items-center justify-center px-6 py-10">
      <KeyRound size={28} color={C.brass} strokeWidth={2.25} className="mb-2" />
      <div style={{ fontFamily: DISPLAY_FONT, color: C.text }} className="text-2xl font-semibold mb-1">Keyway</div>
      <div style={{ color: C.muted }} className="text-sm mb-8 text-center max-w-xs">
        Set up once per device so your data follows you everywhere.
      </div>

      <div style={{ background: C.card, borderColor: C.line }} className="border rounded-xl p-4 w-full mb-4">
        <div style={{ fontFamily: DISPLAY_FONT, color: C.text }} className="font-semibold mb-1">First time?</div>
        <div style={{ color: C.muted }} className="text-sm mb-3">
          Create a new workspace. You'll get a code to enter on your other devices later.
        </div>
        <button onClick={() => onSet(newCode)} style={{ background: C.ink, color: "#fff" }}
          className="w-full rounded-md py-2.5 text-sm font-medium active:opacity-85">
          Create workspace
        </button>
      </div>

      <div style={{ background: C.card, borderColor: C.line }} className="border rounded-xl p-4 w-full">
        <div style={{ fontFamily: DISPLAY_FONT, color: C.text }} className="font-semibold mb-1">Already have a code?</div>
        <div style={{ color: C.muted }} className="text-sm mb-3">
          Enter the workspace code shown on your other device to sync the same data here.
        </div>
        <input value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
          placeholder="e.g. 7K2M9XQP" maxLength={8}
          style={{ borderColor: C.line, letterSpacing: "0.1em" }}
          className="w-full border rounded-md px-3 py-2 text-sm mb-2 text-center bg-white" />
        <button onClick={() => joinCode.trim() && onSet(joinCode.trim())} disabled={!joinCode.trim()}
          style={{ background: joinCode.trim() ? C.brass : C.line, color: "#fff" }}
          className="w-full rounded-md py-2.5 text-sm font-medium active:opacity-85">
          Join workspace
        </button>
      </div>
    </div>
  );
}

// ---------- root ----------
export default function App() {
  useGoogleFonts();
  const { workspaceId, setWorkspaceId, authReady } = useWorkspace();
  const [clients, setClients, cLoaded] = useCloudPersisted(workspaceId, authReady, "clients", []);
  const [listings, setListings, lLoaded] = useCloudPersisted(workspaceId, authReady, "listings", []);
  const [viewings, setViewings, vLoaded] = useCloudPersisted(workspaceId, authReady, "viewings", []);
  const [tab, setTab] = useState("clients");

  const tabs = [
    { id: "clients", label: "Clients", icon: Users },
    { id: "listings", label: "Listings", icon: Building2 },
    { id: "schedule", label: "Schedule", icon: CalendarDays },
    { id: "viewings", label: "Viewings", icon: ListChecks },
  ];

  if (!workspaceId) {
    return <WorkspaceSetup onSet={setWorkspaceId} />;
  }

  const ready = authReady && cLoaded && lLoaded && vLoaded;

  return (
    <div style={{ background: C.paper, minHeight: "100vh", fontFamily: BODY_FONT }}>
      <TopBar
        workspaceId={workspaceId}
        subtitle={`${clients.length} client${clients.length === 1 ? "" : "s"} · ${listings.length} listing${listings.length === 1 ? "" : "s"} · ${viewings.length} scheduled`}
      />

      <div className="md:flex md:max-w-5xl md:mx-auto">
        {/* Sidebar nav — tablet landscape / laptop only, replaces the bottom bar */}
        <nav className="hidden md:flex md:flex-col md:w-52 md:flex-shrink-0 md:py-6 md:px-3 md:gap-1">
          {tabs.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                style={{ background: active ? C.card : "transparent", color: active ? C.text : C.muted, fontFamily: BODY_FONT }}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-left active:opacity-80">
                <Icon size={18} color={active ? C.brass : C.muted} />
                {t.label}
              </button>
            );
          })}
        </nav>

        {/* Main content */}
        <div className="flex-1 min-w-0 md:py-6 md:px-6">
          <div className="max-w-md md:max-w-2xl mx-auto">
            {!ready ? (
              <div className="py-20 text-center" style={{ color: C.muted, fontFamily: BODY_FONT }}>Syncing…</div>
            ) : (
              <>
                {tab === "clients" && <ClientsTab clients={clients} setClients={setClients} />}
                {tab === "listings" && <ListingsTab listings={listings} setListings={setListings} />}
                {tab === "schedule" && <ScheduleTab clients={clients} listings={listings} viewings={viewings} setViewings={setViewings} />}
                {tab === "viewings" && <ViewingsTab viewings={viewings} setViewings={setViewings} clients={clients} listings={listings} />}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Bottom tab bar — phone only */}
      <div style={{ background: C.ink, borderTop: `1px solid ${C.inkLight}` }} className="md:hidden fixed bottom-0 left-0 right-0 max-w-md mx-auto flex">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)} className="flex-1 flex flex-col items-center gap-1 py-2.5">
              <Icon size={18} color={active ? C.brass : "#8592A0"} />
              <span style={{ color: active ? C.brass : "#8592A0", fontFamily: BODY_FONT }} className="text-[11px] font-medium">
                {t.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
