import { useState, useRef } from "react";

const GREEN = "#1a5c36";
const GOLD = "#C9A227";

function ReceiptModal({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState({ name: "", email: "", address: "", amount: "", date: new Date().toISOString().split("T")[0] });
  const [generated, setGenerated] = useState(false);
  const receiptRef = useRef<HTMLDivElement>(null);
  const receiptNum = useRef("SMDON-" + Date.now().toString().slice(-6));

  const handlePrint = () => {
    const content = receiptRef.current;
    if (!content) return;
    const win = window.open("", "_blank", "width=700,height=900");
    if (!win) return;
    win.document.write(`
      <html><head><title>Donation Receipt — Poultry Mate</title>
      <style>
        body { font-family: 'Helvetica Neue', Arial, sans-serif; margin: 0; padding: 40px; color: #111; }
        .header { background: ${GREEN}; color: #fff; padding: 28px 32px; border-radius: 10px 10px 0 0; }
        .header h1 { margin: 0 0 4px; font-size: 22px; }
        .header p { margin: 0; opacity: 0.8; font-size: 13px; }
        .body { border: 2px solid ${GREEN}; border-top: none; border-radius: 0 0 10px 10px; padding: 28px 32px; }
        .row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #f0f0f0; font-size: 14px; }
        .row:last-child { border-bottom: none; }
        .label { color: #666; }
        .value { font-weight: 600; }
        .amount-row { background: #f0fdf4; border-radius: 8px; padding: 14px 16px; margin: 20px 0; display: flex; justify-content: space-between; align-items: center; }
        .amount-big { font-size: 28px; font-weight: 900; color: ${GREEN}; }
        .notice { background: #fefce8; border: 1px solid #fde68a; border-radius: 8px; padding: 14px 16px; font-size: 12px; color: #92400e; line-height: 1.6; margin-top: 20px; }
        .footer { margin-top: 28px; text-align: center; font-size: 12px; color: #999; border-top: 1px solid #eee; padding-top: 16px; }
        .gold { color: ${GOLD}; font-weight: 700; }
        @media print { body { padding: 20px; } }
      </style></head><body>
      <div class="header">
        <h1>🌾 Poultry Mate — Donation Acknowledgment</h1>
        <p>In partnership with Rural Aid Australia · ruralaid.org.au</p>
      </div>
      <div class="body">
        <div class="row"><span class="label">Receipt Number</span><span class="value">${receiptNum.current}</span></div>
        <div class="row"><span class="label">Date</span><span class="value">${new Date(form.date).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })}</span></div>
        <div class="row"><span class="label">Donor Name</span><span class="value">${form.name}</span></div>
        ${form.email ? `<div class="row"><span class="label">Email</span><span class="value">${form.email}</span></div>` : ""}
        ${form.address ? `<div class="row"><span class="label">Address</span><span class="value">${form.address}</span></div>` : ""}
        <div class="amount-row">
          <span style="font-size:15px;font-weight:600;">Donation Amount</span>
          <span class="amount-big">$${parseFloat(form.amount).toFixed(2)} AUD</span>
        </div>
        <div class="row"><span class="label">Charity</span><span class="value">Rural Aid Australia</span></div>
        <div class="row"><span class="label">Purpose</span><span class="value">General Donation — Farmer Support</span></div>
        <div class="row"><span class="label">Facilitated by</span><span class="value">Poultry Mate Australia</span></div>
        <div class="notice">
          ⚠️ <strong>Tax Deductibility Notice:</strong> Rural Aid Australia holds Deductible Gift Recipient (DGR) status with the Australian Tax Office. For an official tax-deductible receipt, please contact Rural Aid directly at <strong>1300 327 624</strong> or <strong>info@ruralaid.org.au</strong>. This document is an acknowledgment of your charitable contribution facilitated through Poultry Mate and does not constitute an official tax receipt.
        </div>
        <div class="footer">
          Thank you for supporting Australian farmers. <span class="gold">Every dollar makes a difference.</span><br/>
          Poultry Mate Australia · silomate.com.au · Generated ${new Date().toLocaleDateString("en-AU")}
        </div>
      </div>
      </body></html>
    `);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 400);
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 1000,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "#fff", borderRadius: 16, padding: "32px 28px", width: "100%", maxWidth: 480,
        boxShadow: "0 20px 60px rgba(0,0,0,0.2)", maxHeight: "90vh", overflowY: "auto",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <div>
            <h2 style={{ margin: 0, fontWeight: 800, fontSize: 20, color: "#111" }}>Donation Receipt</h2>
            <p style={{ margin: "4px 0 0", color: "#6b7280", fontSize: 13 }}>Generate a contribution acknowledgment</p>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#9ca3af" }}>✕</button>
        </div>

        {!generated ? (
          <>
            {[
              { label: "Full Name *", key: "name", type: "text", placeholder: "John Smith" },
              { label: "Email Address", key: "email", type: "email", placeholder: "john@example.com" },
              { label: "Postal Address", key: "address", type: "text", placeholder: "123 Farm Rd, QLD 4350" },
              { label: "Donation Amount (AUD) *", key: "amount", type: "number", placeholder: "50.00" },
              { label: "Donation Date *", key: "date", type: "date", placeholder: "" },
            ].map(({ label, key, type, placeholder }) => (
              <div key={key} style={{ marginBottom: 16 }}>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 }}>{label}</label>
                <input
                  type={type}
                  placeholder={placeholder}
                  value={form[key as keyof typeof form]}
                  onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                  style={{
                    width: "100%", padding: "10px 14px", borderRadius: 8,
                    border: "1.5px solid #d1d5db", fontSize: 14, outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>
            ))}

            <div style={{
              background: "#fefce8", border: "1px solid #fde68a", borderRadius: 8,
              padding: "12px 14px", fontSize: 12, color: "#92400e", lineHeight: 1.6, marginBottom: 20,
            }}>
              <strong>Note:</strong> This is a contribution acknowledgment only. For an official tax-deductible receipt, contact Rural Aid directly at info@ruralaid.org.au — they hold DGR status with the ATO.
            </div>

            <button
              onClick={() => {
                if (!form.name || !form.amount || !form.date) return;
                setGenerated(true);
              }}
              disabled={!form.name || !form.amount}
              style={{
                width: "100%", background: GREEN, color: "#fff", fontWeight: 700,
                fontSize: 15, padding: "13px 0", borderRadius: 10, border: "none",
                cursor: form.name && form.amount ? "pointer" : "not-allowed",
                opacity: form.name && form.amount ? 1 : 0.5,
              }}
            >
              Generate Receipt
            </button>
          </>
        ) : (
          <>
            <div ref={receiptRef} style={{
              border: `2px solid ${GREEN}`, borderRadius: 12, overflow: "hidden", marginBottom: 20,
            }}>
              <div style={{ background: GREEN, color: "#fff", padding: "20px 24px" }}>
                <div style={{ fontWeight: 800, fontSize: 16 }}>🌾 Poultry Mate — Donation Acknowledgment</div>
                <div style={{ fontSize: 12, opacity: 0.8, marginTop: 3 }}>In partnership with Rural Aid Australia</div>
              </div>
              <div style={{ padding: "20px 24px" }}>
                {[
                  ["Receipt No.", receiptNum.current],
                  ["Date", new Date(form.date).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })],
                  ["Donor", form.name],
                  ...(form.email ? [["Email", form.email]] : []),
                  ...(form.address ? [["Address", form.address]] : []),
                  ["Charity", "Rural Aid Australia"],
                  ["Purpose", "General Donation — Farmer Support"],
                ].map(([label, value]) => (
                  <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #f3f4f6", fontSize: 13 }}>
                    <span style={{ color: "#6b7280" }}>{label}</span>
                    <span style={{ fontWeight: 600 }}>{value}</span>
                  </div>
                ))}
                <div style={{
                  background: "#f0fdf4", borderRadius: 8, padding: "12px 16px",
                  display: "flex", justifyContent: "space-between", alignItems: "center", margin: "16px 0",
                }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>Donation Amount</span>
                  <span style={{ fontSize: 24, fontWeight: 900, color: GREEN }}>${parseFloat(form.amount).toFixed(2)} AUD</span>
                </div>
                <div style={{ background: "#fefce8", borderRadius: 8, padding: "10px 14px", fontSize: 11, color: "#92400e", lineHeight: 1.6 }}>
                  For an official tax-deductible receipt, contact Rural Aid at info@ruralaid.org.au (DGR registered).
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 12 }}>
              <button
                onClick={handlePrint}
                style={{
                  flex: 1, background: GREEN, color: "#fff", fontWeight: 700,
                  fontSize: 14, padding: "12px 0", borderRadius: 10, border: "none", cursor: "pointer",
                }}
              >
                🖨️ Print / Save as PDF
              </button>
              <button
                onClick={() => setGenerated(false)}
                style={{
                  flex: 1, background: "#f3f4f6", color: "#374151", fontWeight: 600,
                  fontSize: 14, padding: "12px 0", borderRadius: 10, border: "none", cursor: "pointer",
                }}
              >
                Edit Details
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Sponsor management ────────────────────────────────────────────────────────
const ADMIN_PASSWORD  = "PoultryMate2025";
const SPONSORS_KEY    = "pm-current-sponsors";

type Sponsor = {
  id: string;
  name: string;
  tier: "gold" | "flock" | "seedling";
  website?: string;
  logoUrl?: string;
};

function loadSponsors(): Sponsor[] {
  try { return JSON.parse(localStorage.getItem(SPONSORS_KEY) || "[]"); } catch { return []; }
}
function saveSponsors(list: Sponsor[]) {
  localStorage.setItem(SPONSORS_KEY, JSON.stringify(list));
}

const TIER_META: Record<Sponsor["tier"], { label: string; colour: string; icon: string; w: number; h: number }> = {
  gold:     { label: "Gold Flock Sponsor", colour: "#dc2626", icon: "🏆", w: 200, h: 90 },
  flock:    { label: "Flock Sponsor",      colour: GOLD,      icon: "🐔", w: 160, h: 75 },
  seedling: { label: "Seedling Sponsor",   colour: "#16a34a", icon: "🌱", w: 130, h: 65 },
};

function SponsorAdminModal({ sponsors, onChange, onClose }: {
  sponsors: Sponsor[];
  onChange: (list: Sponsor[]) => void;
  onClose: () => void;
}) {
  const [authed, setAuthed]     = useState(false);
  const [pw, setPw]             = useState("");
  const [pwErr, setPwErr]       = useState(false);
  const [form, setForm]         = useState<Omit<Sponsor, "id">>({ name: "", tier: "flock", website: "", logoUrl: "" });

  const submit = () => {
    if (pw === ADMIN_PASSWORD) { setAuthed(true); setPwErr(false); }
    else { setPwErr(true); }
  };

  const addSponsor = () => {
    if (!form.name.trim()) return;
    const updated = [...sponsors, { ...form, id: Date.now().toString() }];
    onChange(updated);
    setForm({ name: "", tier: "flock", website: "", logoUrl: "" });
  };

  const remove = (id: string) => onChange(sponsors.filter(s => s.id !== id));

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 1200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, padding: "28px 28px", width: "100%", maxWidth: 480, boxShadow: "0 20px 60px rgba(0,0,0,0.2)", maxHeight: "92vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div>
            <h2 style={{ margin: 0, fontWeight: 900, fontSize: 19, color: "#111" }}>🔧 Manage Sponsors</h2>
            <p style={{ margin: "3px 0 0", color: "#6b7280", fontSize: 12 }}>Admin access required</p>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#9ca3af" }}>×</button>
        </div>

        {!authed ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <label style={{ fontSize: 13, fontWeight: 700, color: "#374151" }}>Admin Password</label>
            <input
              type="password"
              value={pw}
              placeholder="Enter password"
              onChange={e => { setPw(e.target.value); setPwErr(false); }}
              onKeyDown={e => e.key === "Enter" && submit()}
              style={{ border: `1.5px solid ${pwErr ? "#dc2626" : "#e5e7eb"}`, borderRadius: 8, padding: "10px 12px", fontSize: 14, outline: "none" }}
            />
            {pwErr && <p style={{ color: "#dc2626", fontSize: 12, margin: 0 }}>Incorrect password</p>}
            <button onClick={submit} style={{ background: GREEN, color: "#fff", fontWeight: 700, fontSize: 14, padding: "12px 0", borderRadius: 10, border: "none", cursor: "pointer" }}>
              Unlock Admin Panel
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

            {/* Current sponsor list */}
            <div>
              <div style={{ fontWeight: 800, fontSize: 14, color: "#111", marginBottom: 10 }}>Current Sponsors ({sponsors.length})</div>
              {sponsors.length === 0 && <p style={{ color: "#9ca3af", fontSize: 13 }}>No sponsors added yet.</p>}
              {sponsors.map(s => {
                const meta = TIER_META[s.tier];
                return (
                  <div key={s.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", border: `1.5px solid ${meta.colour}33`, borderRadius: 10, marginBottom: 8, background: `${meta.colour}08` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {s.logoUrl ? <img src={s.logoUrl} alt={s.name} style={{ width: 36, height: 36, objectFit: "contain", borderRadius: 6 }} /> : <span style={{ fontSize: 22 }}>{meta.icon}</span>}
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13, color: "#111" }}>{s.name}</div>
                        <div style={{ fontSize: 11, color: "#6b7280" }}>{meta.label}</div>
                      </div>
                    </div>
                    <button onClick={() => remove(s.id)} style={{ background: "#fee2e2", color: "#dc2626", border: "none", borderRadius: 8, padding: "6px 12px", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>Remove</button>
                  </div>
                );
              })}
            </div>

            {/* Add new sponsor */}
            <div style={{ borderTop: "1px solid #f3f4f6", paddingTop: 16 }}>
              <div style={{ fontWeight: 800, fontSize: 14, color: "#111", marginBottom: 12 }}>Add New Sponsor</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {[["Sponsor / Business Name *", "name", "text", "e.g. Smith Ag Supplies"], ["Website (optional)", "website", "url", "https://"], ["Logo Image URL (optional)", "logoUrl", "url", "https://..."]].map(([label, key, type, placeholder]) => (
                  <div key={key as string} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <label style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>{label}</label>
                    <input type={type as string} value={(form as any)[key as string]} placeholder={placeholder as string}
                      onChange={e => setForm(f => ({ ...f, [key as string]: e.target.value }))}
                      style={{ border: "1.5px solid #e5e7eb", borderRadius: 8, padding: "8px 11px", fontSize: 13, outline: "none" }} />
                  </div>
                ))}
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>Tier</label>
                  <select value={form.tier} onChange={e => setForm(f => ({ ...f, tier: e.target.value as Sponsor["tier"] }))}
                    style={{ border: "1.5px solid #e5e7eb", borderRadius: 8, padding: "8px 11px", fontSize: 13, outline: "none" }}>
                    {(Object.entries(TIER_META) as [Sponsor["tier"], typeof TIER_META["gold"]][]).map(([k, v]) => (
                      <option key={k} value={k}>{v.icon} {v.label}</option>
                    ))}
                  </select>
                </div>
                <button onClick={addSponsor} style={{ background: GREEN, color: "#fff", fontWeight: 700, fontSize: 14, padding: "11px 0", borderRadius: 10, border: "none", cursor: "pointer", marginTop: 4 }}>
                  ＋ Add Sponsor
                </button>
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}

const SPONSOR_TIERS = [
  { label: "Seedling Sponsor — $10/mo", value: 10 },
  { label: "Flock Sponsor — $25/mo",    value: 25 },
  { label: "Gold Flock Sponsor — $50/mo", value: 50 },
];

function SponsorReceiptModal({ onClose }: { onClose: () => void }) {
  const invoiceNum = useRef("SMSPON-" + Date.now().toString().slice(-6));
  const [form, setForm] = useState({
    businessName: "", abn: "", contactName: "", email: "", address: "",
    tier: SPONSOR_TIERS[1].value,
    months: 1,
    date: new Date().toISOString().split("T")[0],
  });
  const [generated, setGenerated] = useState(false);

  const exGst   = form.tier * form.months;
  const gst     = parseFloat((exGst * 0.1).toFixed(2));
  const total   = parseFloat((exGst + gst).toFixed(2));
  const tierLabel = SPONSOR_TIERS.find(t => t.value === form.tier)?.label ?? "";

  const handlePrint = () => {
    const win = window.open("", "_blank", "width=720,height=960");
    if (!win) return;
    win.document.write(`
      <html><head><title>Sponsor Tax Invoice — Poultry Mate</title>
      <style>
        * { box-sizing: border-box; }
        body { font-family: 'Helvetica Neue', Arial, sans-serif; margin: 0; padding: 40px; color: #111; font-size: 14px; }
        .page { max-width: 640px; margin: 0 auto; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 24px; border-bottom: 3px solid ${GREEN}; margin-bottom: 28px; }
        .brand { font-size: 22px; font-weight: 900; color: ${GREEN}; }
        .brand-sub { font-size: 12px; color: #6b7280; margin-top: 4px; }
        .invoice-label { text-align: right; }
        .invoice-label h1 { margin: 0; font-size: 28px; font-weight: 900; color: ${GREEN}; letter-spacing: -1px; }
        .invoice-label p { margin: 4px 0 0; color: #6b7280; font-size: 12px; }
        .parties { display: flex; gap: 40px; margin-bottom: 28px; }
        .party { flex: 1; }
        .party-label { font-size: 10px; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase; color: #9ca3af; margin-bottom: 8px; }
        .party-name { font-size: 16px; font-weight: 800; color: #111; margin-bottom: 4px; }
        .party-detail { font-size: 12px; color: #6b7280; line-height: 1.6; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
        thead th { background: ${GREEN}; color: #fff; padding: 10px 12px; text-align: left; font-size: 12px; font-weight: 700; letter-spacing: 0.5px; }
        tbody td { padding: 12px; border-bottom: 1px solid #f3f4f6; font-size: 13px; }
        tbody tr:last-child td { border-bottom: none; }
        .totals { margin-left: auto; width: 260px; }
        .total-row { display: flex; justify-content: space-between; padding: 8px 0; font-size: 13px; border-bottom: 1px solid #f3f4f6; }
        .total-row.grand { background: ${GREEN}0d; border-radius: 8px; padding: 12px 16px; border: 2px solid ${GREEN}33; font-weight: 900; font-size: 16px; margin-top: 8px; }
        .notice { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 14px 16px; font-size: 11px; color: #166534; line-height: 1.7; margin-top: 24px; }
        .footer-note { margin-top: 32px; text-align: center; font-size: 11px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 16px; }
        .gold { color: ${GOLD}; font-weight: 800; }
        @media print { body { padding: 20px; } }
      </style></head><body><div class="page">
        <div class="header">
          <div>
            <div class="brand">🌾 Poultry Mate Australia</div>
            <div class="brand-sub">ABN: (pending registration) · coverdalej72@gmail.com</div>
          </div>
          <div class="invoice-label">
            <h1>TAX INVOICE</h1>
            <p>${invoiceNum.current}</p>
            <p>Date: ${new Date(form.date).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })}</p>
          </div>
        </div>
        <div class="parties">
          <div class="party">
            <div class="party-label">Supplier</div>
            <div class="party-name">Poultry Mate Australia</div>
            <div class="party-detail">ABN: (pending registration)<br/>coverdalej72@gmail.com<br/>Australia</div>
          </div>
          <div class="party">
            <div class="party-label">Bill To</div>
            <div class="party-name">${form.businessName || "—"}</div>
            <div class="party-detail">
              ${form.abn ? `ABN: ${form.abn}<br/>` : ""}
              ${form.contactName ? `Attn: ${form.contactName}<br/>` : ""}
              ${form.email ? `${form.email}<br/>` : ""}
              ${form.address ? form.address.replace(/\n/g, "<br/>") : ""}
            </div>
          </div>
        </div>
        <table>
          <thead><tr>
            <th>Description</th><th>Months</th><th>Unit Price</th><th>Amount (ex GST)</th>
          </tr></thead>
          <tbody>
            <tr>
              <td><strong>${tierLabel}</strong><br/><span style="font-size:11px;color:#6b7280;">Sponsorship services — advertising &amp; brand exposure across Poultry Mate platform</span></td>
              <td>${form.months}</td>
              <td>$${form.tier.toFixed(2)}</td>
              <td>$${exGst.toFixed(2)}</td>
            </tr>
          </tbody>
        </table>
        <div class="totals">
          <div class="total-row"><span>Subtotal (ex GST)</span><span>$${exGst.toFixed(2)}</span></div>
          <div class="total-row"><span>GST (10%)</span><span>$${gst.toFixed(2)}</span></div>
          <div class="total-row grand"><span>TOTAL AUD</span><span class="gold">$${total.toFixed(2)}</span></div>
        </div>
        <div class="notice">
          ✅ <strong>Tax Deductibility:</strong> Sponsorship payments are generally deductible as a business marketing or advertising expense under Australian tax law (ITAA 1997 s 8-1). Please retain this tax invoice for your records. We recommend confirming deductibility with your accountant based on your specific circumstances. This invoice includes GST — please claim your GST credit accordingly if registered for GST.
        </div>
        <div class="footer-note">
          Thank you for supporting Poultry Mate and Australian farmers. <span class="gold">Your sponsorship makes a real difference.</span><br/>
          Poultry Mate Australia · coverdalej72@gmail.com · Invoice generated ${new Date().toLocaleDateString("en-AU")}
        </div>
      </div></body></html>
    `);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 400);
  };

  const field = (label: string, key: keyof typeof form, type = "text", placeholder = "") => (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <label style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>{label}</label>
      <input
        type={type}
        value={String(form[key])}
        placeholder={placeholder}
        onChange={e => setForm(f => ({ ...f, [key]: type === "number" ? Number(e.target.value) : e.target.value }))}
        style={{ border: "1.5px solid #e5e7eb", borderRadius: 8, padding: "9px 12px", fontSize: 13, outline: "none", width: "100%" }}
      />
    </div>
  );

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, padding: "28px 28px", width: "100%", maxWidth: 500, boxShadow: "0 20px 60px rgba(0,0,0,0.2)", maxHeight: "92vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div>
            <h2 style={{ margin: 0, fontWeight: 900, fontSize: 19, color: "#111" }}>🧾 Sponsor Tax Invoice</h2>
            <p style={{ margin: "3px 0 0", color: "#6b7280", fontSize: 12 }}>For your business records — includes GST breakdown</p>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#9ca3af", lineHeight: 1 }}>×</button>
        </div>

        {!generated ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {field("Business / Sponsor Name *", "businessName", "text", "e.g. Smith Ag Supplies Pty Ltd")}
            {field("ABN (optional)", "abn", "text", "e.g. 12 345 678 901")}
            {field("Contact Name", "contactName", "text", "e.g. Jane Smith")}
            {field("Email", "email", "email", "e.g. accounts@yourco.com.au")}
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>Address (optional)</label>
              <textarea
                value={form.address}
                placeholder="Street, Suburb, State, Postcode"
                rows={2}
                onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                style={{ border: "1.5px solid #e5e7eb", borderRadius: 8, padding: "9px 12px", fontSize: 13, outline: "none", resize: "vertical", width: "100%" }}
              />
            </div>
            <div style={{ display: "flex", gap: 12 }}>
              <div style={{ flex: 2, display: "flex", flexDirection: "column", gap: 5 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>Sponsor Tier</label>
                <select
                  value={form.tier}
                  onChange={e => setForm(f => ({ ...f, tier: Number(e.target.value) }))}
                  style={{ border: "1.5px solid #e5e7eb", borderRadius: 8, padding: "9px 12px", fontSize: 13, outline: "none", width: "100%" }}
                >
                  {SPONSOR_TIERS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 5 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>Months</label>
                <input type="number" min={1} max={24} value={form.months} onChange={e => setForm(f => ({ ...f, months: Math.max(1, Number(e.target.value)) }))}
                  style={{ border: "1.5px solid #e5e7eb", borderRadius: 8, padding: "9px 12px", fontSize: 13, outline: "none", width: "100%" }} />
              </div>
            </div>
            {field("Invoice Date", "date", "date")}

            <div style={{ background: "#f8fafc", borderRadius: 10, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
              {[
                ["Subtotal (ex GST)", `$${exGst.toFixed(2)}`],
                ["GST (10%)", `$${gst.toFixed(2)}`],
              ].map(([l, v]) => (
                <div key={l} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#6b7280" }}>
                  <span>{l}</span><span>{v}</span>
                </div>
              ))}
              <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 900, fontSize: 17, color: GREEN, borderTop: "1px solid #e5e7eb", paddingTop: 8, marginTop: 4 }}>
                <span>Total AUD</span><span>${total.toFixed(2)}</span>
              </div>
            </div>

            <button
              onClick={() => { if (!form.businessName) { alert("Please enter a business name"); return; } setGenerated(true); }}
              style={{ background: GREEN, color: "#fff", fontWeight: 700, fontSize: 14, padding: "13px 0", borderRadius: 10, border: "none", cursor: "pointer", width: "100%" }}
            >
              Generate Tax Invoice
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ border: `2px solid ${GREEN}`, borderRadius: 12, overflow: "hidden" }}>
              <div style={{ background: GREEN, color: "#fff", padding: "12px 18px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 900, fontSize: 15 }}>TAX INVOICE</div>
                  <div style={{ fontSize: 11, opacity: 0.8 }}>{invoiceNum.current}</div>
                </div>
                <div style={{ textAlign: "right", fontSize: 12, opacity: 0.85 }}>
                  <div>Poultry Mate Australia</div>
                  <div>{new Date(form.date).toLocaleDateString("en-AU")}</div>
                </div>
              </div>
              <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 8 }}>
                {[
                  ["Bill To", form.businessName],
                  ...(form.abn ? [["ABN", form.abn]] : []),
                  ["Tier", tierLabel],
                  ["Months", String(form.months)],
                  ["Subtotal (ex GST)", `$${exGst.toFixed(2)}`],
                  ["GST (10%)", `$${gst.toFixed(2)}`],
                ].map(([l, v]) => (
                  <div key={l} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, borderBottom: "1px solid #f3f4f6", paddingBottom: 6 }}>
                    <span style={{ color: "#6b7280" }}>{l}</span>
                    <span style={{ fontWeight: 600 }}>{v}</span>
                  </div>
                ))}
                <div style={{ background: "#f0fdf4", borderRadius: 8, padding: "10px 14px", display: "flex", justifyContent: "space-between", fontWeight: 900, fontSize: 18, color: GREEN, marginTop: 4 }}>
                  <span>TOTAL AUD</span><span>${total.toFixed(2)}</span>
                </div>
                <div style={{ background: "#fefce8", borderRadius: 8, padding: "10px 14px", fontSize: 11, color: "#92400e", lineHeight: 1.6 }}>
                  Sponsorship is generally deductible as a marketing/advertising expense (ITAA 1997 s 8-1). GST credit claimable if registered. Confirm with your accountant.
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={handlePrint} style={{ flex: 1, background: GREEN, color: "#fff", fontWeight: 700, fontSize: 14, padding: "12px 0", borderRadius: 10, border: "none", cursor: "pointer" }}>🖨️ Print / Save PDF</button>
              <button onClick={() => setGenerated(false)} style={{ flex: 1, background: "#f3f4f6", color: "#374151", fontWeight: 600, fontSize: 14, padding: "12px 0", borderRadius: 10, border: "none", cursor: "pointer" }}>Edit Details</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const PLANS = [
  {
    id: "bronze",
    name: "Bronze",
    icon: "🥉",
    color: "#cd7f32",
    tagline: "Perfect for solo growers just getting started.",
    monthlyPrice: 20,
    features: [
      "Silo Mate mobile app",
      "Up to 6 sheds / silos",
      "Daily feed readings & alerts",
      "30-day reading history",
      "Works on any phone — no install needed",
    ],
    notIncluded: [
      "Feed Mate spreadsheet",
      "Batch Results & Morts tracking",
      "QR docket scanning",
      "Multi-user access",
    ],
    cta: "Start Free Trial",
    highlight: false,
  },
  {
    id: "silver",
    name: "Silver",
    icon: "🥈",
    color: "#94a3b8",
    tagline: "Full batch management for active farms.",
    monthlyPrice: 50,
    features: [
      "Everything in Bronze",
      "Feed Mate spreadsheet viewer",
      "Batch Results, FCR & Morts tracking",
      "Unlimited reading history",
      "QR docket scanning",
      "Email / share batch reports",
      "Cross-device auto-sync",
    ],
    notIncluded: [
      "Multiple farms / locations",
      "Multi-user access",
    ],
    cta: "Start Free Trial",
    highlight: true,
  },
  {
    id: "gold",
    name: "Gold",
    icon: "🥇",
    color: GOLD,
    tagline: "For large operations and integrators.",
    monthlyPrice: 150,
    features: [
      "Everything in Silver",
      "Multiple farms / locations",
      "Multi-user access (farm hand + manager)",
      "Custom shed & silo configuration",
      "Data export (CSV / Excel)",
      "Priority support",
      "Per-grower integrator pricing available",
    ],
    notIncluded: [],
    cta: "Contact Us",
    highlight: false,
  },
];

const FAQS = [
  {
    q: "Is there a free trial?",
    a: "Yes — every new account starts on a 30-day free trial of Silver. No credit card required to start.",
  },
  {
    q: "Can I switch plans later?",
    a: "Absolutely. You can upgrade or downgrade at any time. Changes take effect at the start of your next billing cycle.",
  },
  {
    q: "What is the annual discount?",
    a: "Pay yearly and get 10% off — equivalent to getting more than one month free every year.",
  },
  {
    q: "Do I need to install an app?",
    a: "No. Poultry Mate is a Progressive Web App (PWA) — it works in any browser on any phone. You can add it to your home screen for an app-like experience.",
  },
  {
    q: "What happens to my data if I cancel?",
    a: "Your data is kept for 60 days after cancellation. You can export everything to CSV / Excel before you leave.",
  },
  {
    q: "Is Gold suitable for integrators?",
    a: "Yes. Integrators can manage multiple grower sites under one Gold account, or ask us about per-grower volume pricing.",
  },
];

function CheckIcon({ color = GREEN }: { color?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
      <circle cx="9" cy="9" r="9" fill={color} fillOpacity={0.12} />
      <path d="M5 9l3 3 5-5" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
      <circle cx="9" cy="9" r="9" fill="#9ca3af" fillOpacity={0.12} />
      <path d="M6.5 6.5l5 5M11.5 6.5l-5 5" stroke="#9ca3af" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function SiloIcon() {
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
      <rect x="8" y="10" width="20" height="20" rx="10" fill={GREEN} />
      <rect x="12" y="6" width="12" height="6" rx="3" fill={GREEN} fillOpacity={0.6} />
      <rect x="14" y="4" width="8" height="4" rx="2" fill={GREEN} fillOpacity={0.3} />
      <rect x="15" y="18" width="6" height="8" rx="1" fill="white" fillOpacity={0.3} />
    </svg>
  );
}

function Faq({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      style={{
        borderBottom: "1px solid #e5e7eb",
        paddingBottom: 16,
        marginBottom: 16,
      }}
    >
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: "100%",
          textAlign: "left",
          background: "none",
          border: "none",
          cursor: "pointer",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          padding: 0,
        }}
      >
        <span style={{ fontWeight: 600, fontSize: 15, color: "#111827" }}>{q}</span>
        <span style={{ fontSize: 20, color: GREEN, flexShrink: 0, transition: "transform 0.2s", transform: open ? "rotate(45deg)" : "none" }}>+</span>
      </button>
      {open && (
        <p style={{ marginTop: 10, color: "#6b7280", fontSize: 14, lineHeight: 1.7 }}>{a}</p>
      )}
    </div>
  );
}

function PlanCard({ plan, yearly }: { plan: typeof PLANS[0]; yearly: boolean }) {
  const discount = yearly ? 0.9 : 1;
  const monthlyBilled = plan.monthlyPrice * discount;
  const annualTotal = Math.round(plan.monthlyPrice * 12 * discount);
  const savedPerYear = Math.round(plan.monthlyPrice * 12 - annualTotal);

  return (
    <div
      style={{
        background: "#fff",
        border: `2px solid ${plan.highlight ? GREEN : "#e5e7eb"}`,
        borderRadius: 16,
        padding: "28px 24px",
        display: "flex",
        flexDirection: "column",
        gap: 0,
        position: "relative",
        boxShadow: plan.highlight ? `0 8px 32px ${GREEN}22` : "0 2px 8px #0001",
        flex: 1,
        minWidth: 260,
        maxWidth: 360,
      }}
    >
      {plan.highlight && (
        <div
          style={{
            position: "absolute",
            top: -14,
            left: "50%",
            transform: "translateX(-50%)",
            background: GREEN,
            color: "#fff",
            fontSize: 12,
            fontWeight: 700,
            padding: "4px 16px",
            borderRadius: 999,
            letterSpacing: "0.05em",
            whiteSpace: "nowrap",
          }}
        >
          MOST POPULAR
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <span style={{ fontSize: 28 }}>{plan.icon}</span>
        <span style={{ fontSize: 22, fontWeight: 800, color: plan.color }}>{plan.name}</span>
      </div>

      <p style={{ color: "#6b7280", fontSize: 14, marginBottom: 20, lineHeight: 1.5 }}>{plan.tagline}</p>

      <div style={{ marginBottom: 8 }}>
        <span style={{ fontSize: 40, fontWeight: 900, color: "#111827" }}>
          ${Math.round(monthlyBilled)}
        </span>
        <span style={{ fontSize: 14, color: "#9ca3af" }}>/mo</span>
      </div>

      {yearly ? (
        <div style={{ marginBottom: 20 }}>
          <span style={{ fontSize: 13, color: "#6b7280" }}>
            Billed annually — ${annualTotal}/yr
          </span>
          {savedPerYear > 0 && (
            <span
              style={{
                marginLeft: 8,
                background: "#d1fae5",
                color: GREEN,
                fontSize: 11,
                fontWeight: 700,
                padding: "2px 8px",
                borderRadius: 999,
              }}
            >
              Save ${savedPerYear}/yr
            </span>
          )}
        </div>
      ) : (
        <div style={{ marginBottom: 20 }}>
          <span style={{ fontSize: 13, color: "#9ca3af" }}>Billed monthly</span>
        </div>
      )}

      <a
        href="mailto:coverdalej72@gmail.com"
        style={{
          display: "block",
          textAlign: "center",
          background: plan.highlight ? GREEN : "transparent",
          color: plan.highlight ? "#fff" : GREEN,
          border: `2px solid ${GREEN}`,
          borderRadius: 10,
          padding: "12px 0",
          fontWeight: 700,
          fontSize: 15,
          textDecoration: "none",
          marginBottom: 24,
          transition: "opacity 0.15s",
        }}
      >
        {plan.cta}
      </a>

      <div style={{ borderTop: "1px solid #f3f4f6", paddingTop: 20, display: "flex", flexDirection: "column", gap: 10 }}>
        {plan.features.map((f) => (
          <div key={f} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <CheckIcon color={plan.highlight ? GREEN : plan.color} />
            <span style={{ fontSize: 14, color: "#374151" }}>{f}</span>
          </div>
        ))}
        {plan.notIncluded.map((f) => (
          <div key={f} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <XIcon />
            <span style={{ fontSize: 14, color: "#9ca3af" }}>{f}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  const [yearly, setYearly] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [showSponsorReceipt, setShowSponsorReceipt] = useState(false);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [sponsors, setSponsors] = useState<Sponsor[]>(loadSponsors);

  const updateSponsors = (list: Sponsor[]) => {
    saveSponsors(list);
    setSponsors(list);
  };
  const [shareLabel, setShareLabel] = useState<"share" | "copied">("share");

  const handleShare = async () => {
    const url = window.location.href;
    const shareData = {
      title: "Poultry Mate — Plans & Pricing",
      text: "Check out Poultry Mate — feed tracking & silo management for poultry producers.",
      url,
    };
    if (navigator.share) {
      try { await navigator.share(shareData); } catch {}
    } else {
      try {
        await navigator.clipboard.writeText(url);
        setShareLabel("copied");
        setTimeout(() => setShareLabel("share"), 2500);
      } catch {}
    }
  };

  return (
    <div style={{ fontFamily: "Inter, system-ui, sans-serif", background: "#f9fafb", minHeight: "100vh" }}>
      {showReceipt && <ReceiptModal onClose={() => setShowReceipt(false)} />}
      {showSponsorReceipt && <SponsorReceiptModal onClose={() => setShowSponsorReceipt(false)} />}
      {showAdminPanel && <SponsorAdminModal sponsors={sponsors} onChange={updateSponsors} onClose={() => setShowAdminPanel(false)} />}

      {/* NAVBAR */}
      <nav style={{
        background: GREEN,
        color: "#fff",
        padding: "0 24px",
        height: 60,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        position: "sticky",
        top: 0,
        zIndex: 100,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <SiloIcon />
          <span style={{ fontWeight: 800, fontSize: 20, letterSpacing: "-0.03em" }}>Poultry Mate</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            onClick={handleShare}
            style={{
              background: shareLabel === "copied" ? "#2d7a4f" : "rgba(255,255,255,0.15)",
              color: "#fff",
              fontWeight: 700,
              fontSize: 14,
              padding: "8px 18px",
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.3)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 7,
              transition: "background 0.2s",
            }}
          >
            {shareLabel === "copied" ? "✅ Copied!" : "🔗 Share"}
          </button>
          <a
            href="mailto:coverdalej72@gmail.com"
            style={{
              background: GOLD,
              color: "#1a1a1a",
              fontWeight: 700,
              fontSize: 14,
              padding: "8px 18px",
              borderRadius: 8,
              textDecoration: "none",
            }}
          >
            Contact Us
          </a>
        </div>
      </nav>

      {/* HERO */}
      <section style={{
        background: `linear-gradient(135deg, ${GREEN} 0%, #2d7a4f 100%)`,
        color: "#fff",
        padding: "72px 24px 64px",
        textAlign: "center",
      }}>
        <div style={{ maxWidth: 640, margin: "0 auto" }}>
          <div style={{
            display: "inline-block",
            background: "rgba(255,255,255,0.15)",
            borderRadius: 999,
            padding: "6px 18px",
            fontSize: 13,
            fontWeight: 600,
            marginBottom: 20,
            letterSpacing: "0.05em",
          }}>
            🐔 Built for Poultry Producers — Large or Small
          </div>
          <h1 style={{
            fontSize: "clamp(32px, 6vw, 52px)",
            fontWeight: 900,
            lineHeight: 1.1,
            marginBottom: 20,
            letterSpacing: "-0.03em",
          }}>
            Track every silo.<br />
            <span style={{ color: GOLD }}>Never run low</span> on feed.
          </h1>
          <p style={{
            fontSize: "clamp(16px, 2.5vw, 20px)",
            opacity: 0.88,
            lineHeight: 1.6,
            marginBottom: 36,
          }}>
            Poultry Mate replaces paper & Excel with a mobile-first app and smart Feed Mate spreadsheet that update automatically — across every device on your farm.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <a
              href="#pricing"
              style={{
                background: GOLD,
                color: "#1a1a1a",
                fontWeight: 800,
                fontSize: 16,
                padding: "14px 32px",
                borderRadius: 10,
                textDecoration: "none",
              }}
            >
              See Plans & Pricing
            </a>
            <a
              href="mailto:coverdalej72@gmail.com"
              style={{
                background: "rgba(255,255,255,0.15)",
                color: "#fff",
                fontWeight: 700,
                fontSize: 16,
                padding: "14px 32px",
                borderRadius: 10,
                textDecoration: "none",
                border: "2px solid rgba(255,255,255,0.3)",
              }}
            >
              Book a Demo
            </a>
          </div>
        </div>
      </section>

      {/* FEATURES STRIP */}
      <section style={{
        background: "#fff",
        borderBottom: "1px solid #e5e7eb",
        padding: "28px 24px",
      }}>
        <div style={{
          maxWidth: 1100,
          margin: "0 auto",
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: "6px 0",
        }}>
          {[
            { icon: "📱", title: "No App Install" },
            { icon: "🔔", title: "Feed Alerts" },
            { icon: "📊", title: "Feed Mate" },
            { icon: "📷", title: "QR Scanning" },
            { icon: "🔄", title: "Cross-device Sync" },
            { icon: "🐥", title: "Batch Tracking" },
            { icon: "🏗️", title: "Multi-shed Support" },
            { icon: "📈", title: "Batch History" },
            { icon: "💧", title: "Water Tracking" },
            { icon: "⚖️", title: "Live Weights" },
            { icon: "📋", title: "Daily Reports" },
            { icon: "🔐", title: "Secure Data" },
          ].map(({ icon, title }, i, arr) => (
            <div key={title} style={{ display: "flex", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "4px 18px" }}>
                <span style={{ fontSize: 20 }}>{icon}</span>
                <span style={{ fontWeight: 600, fontSize: 13, color: "#374151", whiteSpace: "nowrap" }}>{title}</span>
              </div>
              {i < arr.length - 1 && (
                <span style={{ color: "#d1d5db", fontSize: 18, lineHeight: 1, flexShrink: 0 }}>|</span>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* BATCH HISTORY FEATURE */}
      <section style={{ background: "linear-gradient(135deg, #0f3d24 0%, #1a5c36 60%, #217346 100%)", padding: "72px 24px", color: "#fff" }}>
        <div style={{ maxWidth: 960, margin: "0 auto" }}>
          {/* Header */}
          <div style={{ textAlign: "center", marginBottom: 52 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 10, background: "rgba(201,162,39,0.2)", border: "1px solid rgba(201,162,39,0.5)", borderRadius: 999, padding: "6px 20px", marginBottom: 18 }}>
              <span style={{ fontSize: 18 }}>📈</span>
              <span style={{ color: "#C9A227", fontWeight: 700, fontSize: 13, letterSpacing: "0.08em", textTransform: "uppercase" }}>Batch History</span>
            </div>
            <h2 style={{ fontSize: "clamp(26px, 4vw, 40px)", fontWeight: 900, margin: "0 0 16px", letterSpacing: "-0.03em", lineHeight: 1.15 }}>
              Every batch tracked.<br />
              <span style={{ color: "#C9A227" }}>Every result compared.</span>
            </h2>
            <p style={{ fontSize: 17, color: "rgba(255,255,255,0.75)", maxWidth: 560, margin: "0 auto", lineHeight: 1.7 }}>
              Each time you start a new batch, your outgoing data is automatically saved and added to your history. See how this batch stacks up against the last six — at a glance.
            </p>
          </div>

          {/* Metric Cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 16, marginBottom: 52 }}>
            {[
              { icon: "🐣", label: "Birds Placed",    desc: "Total birds in for each batch" },
              { icon: "🌾", label: "Feed Ordered",     desc: "Total kg ordered per batch" },
              { icon: "📉", label: "FCR",              desc: "Feed conversion ratio tracked over time" },
              { icon: "✅", label: "CFCR",             desc: "Corrected FCR comparison batch to batch" },
              { icon: "⚖️", label: "Cage Weight",      desc: "Average cage weight per batch" },
              { icon: "💀", label: "Mortality %",      desc: "Mortality rate trends over batches" },
            ].map(({ icon, label, desc }) => (
              <div key={label} style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 14, padding: "20px 16px", textAlign: "center", backdropFilter: "blur(6px)" }}>
                <div style={{ fontSize: 34, marginBottom: 10 }}>{icon}</div>
                <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 6, color: "#fff" }}>{label}</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", lineHeight: 1.5 }}>{desc}</div>
              </div>
            ))}
          </div>

          {/* Mini bar chart illustration */}
          <div style={{ background: "rgba(0,0,0,0.25)", borderRadius: 16, border: "1px solid rgba(255,255,255,0.1)", padding: "28px 32px", maxWidth: 680, margin: "0 auto" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
              <div style={{ background: "#C9A227", borderRadius: 6, padding: "3px 12px", fontWeight: 800, fontSize: 12, color: "#000", letterSpacing: "0.05em" }}>BATCH HISTORY</div>
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>Last 6 batches — Birds Placed</span>
            </div>
            {/* Fake bar chart */}
            <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 80 }}>
              {[55, 72, 68, 85, 78, 100].map((pct, i) => (
                <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                  <div style={{ width: "100%", background: i === 5 ? "#C9A227" : "rgba(255,255,255,0.25)", borderRadius: "4px 4px 0 0", height: `${pct}%`, transition: "height 0.3s" }} />
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", fontWeight: 600 }}>#{115 + i}</span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.1)", fontSize: 12, color: "rgba(255,255,255,0.5)", textAlign: "center" }}>
              📊 Bar charts for every metric — updated automatically at each new batch
            </div>
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" style={{ padding: "72px 24px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <h2 style={{ fontSize: "clamp(26px, 4vw, 38px)", fontWeight: 900, color: "#111827", marginBottom: 12, letterSpacing: "-0.03em" }}>
              Simple, honest pricing
            </h2>
            <p style={{ color: "#6b7280", fontSize: 16, marginBottom: 32 }}>
              Start free for 30 days. No credit card required.
            </p>

            {/* TOGGLE */}
            <div style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 12,
              background: "#f3f4f6",
              borderRadius: 999,
              padding: "6px 8px",
            }}>
              <button
                onClick={() => setYearly(false)}
                style={{
                  background: !yearly ? "#fff" : "transparent",
                  border: "none",
                  borderRadius: 999,
                  padding: "8px 20px",
                  fontWeight: 600,
                  fontSize: 14,
                  cursor: "pointer",
                  color: !yearly ? "#111827" : "#6b7280",
                  boxShadow: !yearly ? "0 1px 4px #0001" : "none",
                  transition: "all 0.2s",
                }}
              >
                Monthly
              </button>
              <button
                onClick={() => setYearly(true)}
                style={{
                  background: yearly ? "#fff" : "transparent",
                  border: "none",
                  borderRadius: 999,
                  padding: "8px 20px",
                  fontWeight: 600,
                  fontSize: 14,
                  cursor: "pointer",
                  color: yearly ? "#111827" : "#6b7280",
                  boxShadow: yearly ? "0 1px 4px #0001" : "none",
                  transition: "all 0.2s",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                Yearly
                <span style={{
                  background: "#d1fae5",
                  color: GREEN,
                  fontSize: 11,
                  fontWeight: 700,
                  padding: "2px 8px",
                  borderRadius: 999,
                }}>
                  Save 10%
                </span>
              </button>
            </div>
          </div>

          {/* PLAN CARDS */}
          <div style={{
            display: "flex",
            gap: 24,
            flexWrap: "wrap",
            justifyContent: "center",
            alignItems: "flex-start",
          }}>
            {PLANS.map((plan) => (
              <PlanCard key={plan.id} plan={plan} yearly={yearly} />
            ))}
          </div>

          {/* COMPARISON NOTE */}
          <p style={{ textAlign: "center", color: "#9ca3af", fontSize: 13, marginTop: 32 }}>
            All prices in AUD. GST may apply. Yearly plans are billed as one annual payment.
          </p>
        </div>
      </section>

      {/* TESTIMONIAL / TRUST */}
      <section style={{
        background: `linear-gradient(135deg, ${GREEN}11 0%, ${GOLD}11 100%)`,
        borderTop: "1px solid #e5e7eb",
        borderBottom: "1px solid #e5e7eb",
        padding: "56px 24px",
      }}>
        <div style={{ maxWidth: 720, margin: "0 auto", textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>🌾</div>
          <blockquote style={{
            fontSize: "clamp(17px, 2.5vw, 21px)",
            fontStyle: "italic",
            color: "#374151",
            lineHeight: 1.65,
            marginBottom: 20,
          }}>
            "Finally an app that understands how broiler farms actually work. I can check my silos on the phone, and my Feed Mate on the desktop, and they're always in sync."
          </blockquote>
          <p style={{ fontWeight: 700, color: GREEN, fontSize: 14 }}>— Early access grower, Australia</p>
        </div>
      </section>

      {/* GIVING BACK */}
      <section style={{
        background: "#fff",
        borderTop: "1px solid #e5e7eb",
        padding: "72px 24px",
      }}>
        <div style={{ maxWidth: 1060, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 52 }}>
            <div style={{ fontSize: 44, marginBottom: 12 }}>❤️</div>
            <h2 style={{
              fontSize: "clamp(24px, 4vw, 36px)",
              fontWeight: 900,
              color: "#111827",
              marginBottom: 14,
              letterSpacing: "-0.03em",
            }}>
              Giving back — your way
            </h2>
            <p style={{ color: "#6b7280", fontSize: 16, lineHeight: 1.65, maxWidth: 600, margin: "0 auto" }}>
              For every active Poultry Mate subscription, <strong style={{ color: GREEN }}>$1 per month</strong> goes to charity.
              Choose which cause matters most to you — local farmers, global emergencies, or children in need.
            </p>
          </div>

          {/* Three charity cards */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 20,
            marginBottom: 40,
          }}>
            {[
              {
                emoji: "🌾",
                name: "Rural Aid Australia",
                site: "ruralaid.org.au",
                tag: "🇦🇺 Local — Supporting Aussie Farmers",
                tagBg: "#f0fdf4",
                tagColor: GREEN,
                tagBorder: "#bbf7d0",
                desc: "Practical and emotional support for Australian farmers battling drought, floods, and financial hardship. Fodder relief, financial counselling, and mental health support.",
                btnLabel: "💚 Donate to Rural Aid",
                btnColor: GREEN,
                url: "https://www.ruralaid.org.au/donate/",
              },
              {
                emoji: "🔴",
                name: "Australian Red Cross",
                site: "redcross.org.au",
                tag: "🌏 International — Humanitarian Aid",
                tagBg: "#fff5f5",
                tagColor: "#c0392b",
                tagBorder: "#fca5a5",
                desc: "Responding to disasters and emergencies across Australia and around the world — delivering food, water, shelter, and medical aid to people when they need it most.",
                btnLabel: "❤️ Donate to Red Cross",
                btnColor: "#c0392b",
                url: "https://www.redcross.org.au/donate/",
              },
              {
                emoji: "🌍",
                name: "UNICEF Australia",
                site: "unicef.org.au",
                tag: "👶 Global — Children in Need",
                tagBg: "#eff6ff",
                tagColor: "#1d4ed8",
                tagBorder: "#93c5fd",
                desc: "Working in over 190 countries to save children's lives — providing vaccines, clean water, education, and protection for the world's most vulnerable kids.",
                btnLabel: "💙 Donate to UNICEF",
                btnColor: "#1d4ed8",
                url: "https://www.unicef.org.au/donate",
              },
            ].map(({ emoji, name, site, tag, tagBg, tagColor, tagBorder, desc, btnLabel, btnColor, url }) => (
              <div key={name} style={{
                border: "2px solid #e5e7eb",
                borderRadius: 16,
                padding: "24px",
                display: "flex",
                flexDirection: "column",
                gap: 14,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ fontSize: 34 }}>{emoji}</span>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 16, color: "#111827" }}>{name}</div>
                    <div style={{ fontSize: 12, color: "#9ca3af" }}>{site}</div>
                  </div>
                </div>
                <div style={{ background: tagBg, border: `1px solid ${tagBorder}`, borderRadius: 8, padding: "7px 12px", fontSize: 12, color: tagColor, fontWeight: 700 }}>
                  {tag}
                </div>
                <p style={{ fontSize: 13, color: "#374151", lineHeight: 1.7, margin: 0, flex: 1 }}>{desc}</p>
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "block",
                    textAlign: "center",
                    background: btnColor,
                    color: "#fff",
                    fontWeight: 700,
                    fontSize: 14,
                    padding: "12px 0",
                    borderRadius: 10,
                    textDecoration: "none",
                    marginTop: "auto",
                  }}
                >
                  {btnLabel}
                </a>
              </div>
            ))}
          </div>

          {/* How it works + receipt */}
          <div style={{
            display: "flex",
            gap: 20,
            flexWrap: "wrap",
            justifyContent: "center",
          }}>
            <div style={{
              flex: "1 1 340px",
              maxWidth: 520,
              background: `linear-gradient(135deg, ${GREEN}08 0%, ${GOLD}08 100%)`,
              border: `2px solid ${GREEN}22`,
              borderRadius: 16,
              padding: "24px 28px",
              display: "flex",
              flexDirection: "column",
              gap: 16,
            }}>
              <div style={{ fontWeight: 800, fontSize: 16, color: "#111827" }}>How it works</div>
              {[
                { icon: "📱", text: "Subscribe to any Poultry Mate plan" },
                { icon: "💰", text: "$1 from your monthly fee is set aside for your chosen charity" },
                { icon: "📅", text: "Every 3 months we total it up and donate the full amount" },
                { icon: "🎥", text: "We film the cheque handover and post it publicly — full transparency" },
                { icon: "🔁", text: "The more growers join, the bigger the donation grows" },
              ].map(({ icon, text }) => (
                <div key={text} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <span style={{ fontSize: 18, flexShrink: 0 }}>{icon}</span>
                  <span style={{ fontSize: 13, color: "#374151", lineHeight: 1.6 }}>{text}</span>
                </div>
              ))}
            </div>

            <div style={{
              flex: "1 1 260px",
              maxWidth: 320,
              border: "2px solid #e5e7eb",
              borderRadius: 16,
              padding: "24px 28px",
              display: "flex",
              flexDirection: "column",
              gap: 14,
              justifyContent: "center",
            }}>
              <div style={{ fontSize: 36, textAlign: "center" }}>🧾</div>
              <div style={{ fontWeight: 800, fontSize: 16, color: "#111827", textAlign: "center" }}>Donation Receipt</div>
              <p style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.65, textAlign: "center", margin: 0 }}>
                Generate a printable acknowledgment of your charitable contribution through Poultry Mate.
              </p>
              <button
                onClick={() => setShowReceipt(true)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "center",
                  background: "transparent",
                  color: GREEN,
                  border: `2px solid ${GREEN}`,
                  borderRadius: 10,
                  padding: "12px 0",
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: "pointer",
                }}
              >
                🧾 Generate Receipt
              </button>
            </div>
          </div>

          <p style={{ textAlign: "center", color: "#9ca3af", fontSize: 13, marginTop: 32 }}>
            You can donate directly to any of these charities at any time — no Poultry Mate subscription required.
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section style={{ padding: "72px 24px" }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <h2 style={{
            fontSize: "clamp(24px, 3.5vw, 34px)",
            fontWeight: 900,
            color: "#111827",
            marginBottom: 40,
            textAlign: "center",
            letterSpacing: "-0.02em",
          }}>
            Frequently asked questions
          </h2>
          {FAQS.map((f) => <Faq key={f.q} {...f} />)}
        </div>
      </section>

      {/* ── SPONSORS & SUPPORT ── */}
      <section style={{ background: "#f8fafc", padding: "80px 24px", borderTop: "1px solid #e5e7eb" }}>
        <div style={{ maxWidth: 1000, margin: "0 auto" }}>

          {/* Heading */}
          <div style={{ textAlign: "center", marginBottom: 56 }}>
            <span style={{ background: `${GOLD}22`, color: GOLD, fontWeight: 800, fontSize: 12, letterSpacing: 1.5, textTransform: "uppercase", padding: "4px 14px", borderRadius: 20, display: "inline-block", marginBottom: 16 }}>Sponsor Poultry Mate</span>
            <h2 style={{ fontSize: "clamp(24px, 3.5vw, 36px)", fontWeight: 900, color: "#111827", margin: "0 0 16px", letterSpacing: "-0.02em" }}>
              Help us keep building for Australian growers
            </h2>
            <p style={{ fontSize: 16, color: "#6b7280", maxWidth: 600, margin: "0 auto", lineHeight: 1.7 }}>
              Poultry Mate is independently built by a broiler grower, for broiler growers. Sponsorship keeps the app free to develop, supports rural charities, and helps cover the AI tools that power it.
            </p>
          </div>

          {/* How funds are split */}
          <div style={{ background: "#fff", border: `2px solid ${GREEN}22`, borderRadius: 16, padding: "28px 32px", marginBottom: 48, maxWidth: 680, margin: "0 auto 48px" }}>
            <div style={{ fontWeight: 800, fontSize: 15, color: "#111827", marginBottom: 20, textAlign: "center" }}>💰 How every sponsorship dollar is used</div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
              {[
                { pct: "50%", label: "App development & AI tools", colour: GREEN, icon: "🛠" },
                { pct: "30%", label: "Developer income", colour: GOLD, icon: "👨‍💻" },
                { pct: "20%", label: "Rural Aid Australia (charity)", colour: "#2563eb", icon: "🌾" },
              ].map(({ pct, label, colour, icon }) => (
                <div key={label} style={{ flex: "1 1 160px", background: `${colour}0d`, border: `2px solid ${colour}33`, borderRadius: 12, padding: "16px 18px", textAlign: "center" }}>
                  <div style={{ fontSize: 24, marginBottom: 6 }}>{icon}</div>
                  <div style={{ fontSize: 28, fontWeight: 900, color: colour, lineHeight: 1 }}>{pct}</div>
                  <div style={{ fontSize: 12, color: "#6b7280", marginTop: 6, lineHeight: 1.4 }}>{label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Sponsor tiers */}
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap", justifyContent: "center", marginBottom: 56 }}>
            {[
              {
                name: "Seedling Sponsor",
                icon: "🌱",
                price: "$10/mo",
                colour: "#16a34a",
                perks: [
                  "10% off your Poultry Mate subscription",
                  "Name or logo in app footer",
                  "Mentioned in our social media posts",
                  "Our genuine thanks 🙏",
                ],
              },
              {
                name: "Flock Sponsor",
                icon: "🐔",
                price: "$25/mo",
                colour: GOLD,
                featured: true,
                perks: [
                  "20% off your Poultry Mate subscription",
                  "Logo on Plans & Pricing page",
                  "Dedicated thank-you social post",
                  "Priority support response",
                  "Quarterly sponsor update email",
                ],
              },
              {
                name: "Gold Flock Sponsor",
                icon: "🏆",
                price: "$50/mo",
                colour: "#dc2626",
                perks: [
                  "30% off your Poultry Mate subscription",
                  "Featured banner across all pages",
                  "Company bio & backlink on site",
                  "Co-branding in app header",
                  "Quarterly video shoutout",
                  "Charity cheque appearance option",
                ],
              },
            ].map(({ name, icon, price, colour, featured, perks }) => (
              <div key={name} style={{
                flex: "1 1 260px",
                maxWidth: 300,
                background: "#fff",
                border: `2px solid ${featured ? colour : "#e5e7eb"}`,
                borderRadius: 16,
                padding: "28px 24px",
                boxShadow: featured ? `0 8px 32px ${colour}22` : "0 2px 8px rgba(0,0,0,0.06)",
                position: "relative",
                display: "flex",
                flexDirection: "column",
                gap: 16,
              }}>
                {featured && (
                  <div style={{ position: "absolute", top: -14, left: "50%", transform: "translateX(-50%)", background: colour, color: "#fff", fontWeight: 800, fontSize: 11, letterSpacing: 1, textTransform: "uppercase", padding: "4px 14px", borderRadius: 20 }}>Most Popular</div>
                )}
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 36 }}>{icon}</div>
                  <div style={{ fontWeight: 800, fontSize: 17, color: "#111827", marginTop: 8 }}>{name}</div>
                  <div style={{ fontWeight: 900, fontSize: 28, color: colour, marginTop: 4 }}>{price}</div>
                </div>
                <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
                  {perks.map(p => (
                    <li key={p} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13, color: "#374151", lineHeight: 1.5 }}>
                      <span style={{ color: colour, fontWeight: 700, flexShrink: 0 }}>✓</span>{p}
                    </li>
                  ))}
                </ul>
                <a
                  href={`mailto:coverdalej72@gmail.com?subject=Sponsorship Enquiry — ${name}&body=Hi, I'm interested in becoming a ${name} of Poultry Mate.`}
                  style={{
                    display: "block",
                    textAlign: "center",
                    background: featured ? colour : "transparent",
                    color: featured ? "#fff" : colour,
                    border: `2px solid ${colour}`,
                    borderRadius: 10,
                    padding: "12px 0",
                    fontWeight: 700,
                    fontSize: 14,
                    textDecoration: "none",
                    marginTop: "auto",
                  }}
                >
                  Become a Sponsor
                </a>
              </div>
            ))}
          </div>

          {/* Current Sponsors — live managed */}
          <div style={{ textAlign: "center", marginBottom: 32 }}>
            <div style={{ fontWeight: 800, fontSize: 16, color: "#111827", marginBottom: 20 }}>🤝 Current Sponsors</div>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", justifyContent: "center", minHeight: 80, alignItems: "center" }}>
              {sponsors.length === 0 ? (
                /* Empty placeholders */
                ["gold", "flock", "flock", "seedling"].map((tier, i) => {
                  const meta = TIER_META[tier as Sponsor["tier"]];
                  return (
                    <div key={i} style={{ width: meta.w, height: meta.h, border: "2px dashed #d1d5db", borderRadius: 12, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#fff", gap: 4 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 0.5 }}>{meta.label}</div>
                      <div style={{ fontSize: 13, color: "#d1d5db", fontWeight: 600 }}>Your logo here</div>
                    </div>
                  );
                })
              ) : (
                sponsors.map(s => {
                  const meta = TIER_META[s.tier];
                  const card = (
                    <div key={s.id} style={{ width: meta.w, height: meta.h, border: `2px solid ${meta.colour}44`, borderRadius: 12, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#fff", padding: "8px 12px", gap: 4, boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
                      {s.logoUrl
                        ? <img src={s.logoUrl} alt={s.name} style={{ maxHeight: meta.h * 0.55, maxWidth: meta.w - 24, objectFit: "contain" }} />
                        : <span style={{ fontSize: meta.h > 80 ? 28 : 22 }}>{meta.icon}</span>
                      }
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", textAlign: "center", lineHeight: 1.2 }}>{s.name}</div>
                      <div style={{ fontSize: 10, color: meta.colour, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>{meta.label}</div>
                    </div>
                  );
                  return s.website
                    ? <a key={s.id} href={s.website} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>{card}</a>
                    : card;
                })
              )}
            </div>
            <div style={{ marginTop: 20, display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
              <p style={{ fontSize: 13, color: "#9ca3af", margin: 0, alignSelf: "center" }}>
                {sponsors.length === 0 ? <>Be one of the first to support Poultry Mate — <a href="mailto:coverdalej72@gmail.com?subject=Sponsorship Enquiry" style={{ color: GREEN, fontWeight: 700 }}>get in touch</a></> : <>Want your business here? <a href="mailto:coverdalej72@gmail.com?subject=Sponsorship Enquiry" style={{ color: GREEN, fontWeight: 700 }}>Become a sponsor</a></>}
              </p>
            </div>
            <div style={{ marginTop: 12, display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
              <button onClick={() => setShowSponsorReceipt(true)} style={{ background: "transparent", color: GREEN, border: `2px solid ${GREEN}`, borderRadius: 10, padding: "10px 20px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                🧾 Generate Sponsor Tax Invoice
              </button>
              <button onClick={() => setShowAdminPanel(true)} style={{ background: "transparent", color: "#9ca3af", border: "1.5px solid #e5e7eb", borderRadius: 10, padding: "10px 20px", fontWeight: 600, fontSize: 12, cursor: "pointer" }}>
                🔧 Manage Sponsors
              </button>
            </div>
          </div>

        </div>
      </section>

      {/* CTA FOOTER */}
      <section style={{
        background: GREEN,
        color: "#fff",
        padding: "64px 24px",
        textAlign: "center",
      }}>
        <div style={{ maxWidth: 560, margin: "0 auto" }}>
          <h2 style={{
            fontSize: "clamp(24px, 4vw, 36px)",
            fontWeight: 900,
            marginBottom: 14,
            letterSpacing: "-0.03em",
          }}>
            Ready to ditch the paperwork?
          </h2>
          <p style={{ opacity: 0.85, fontSize: 16, lineHeight: 1.6, marginBottom: 32 }}>
            Start your free 30-day trial today. No credit card needed. Cancel anytime.
          </p>
          <a
            href="mailto:coverdalej72@gmail.com"
            style={{
              display: "inline-block",
              background: GOLD,
              color: "#1a1a1a",
              fontWeight: 800,
              fontSize: 17,
              padding: "16px 40px",
              borderRadius: 12,
              textDecoration: "none",
            }}
          >
            Get Started Free
          </a>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{
        background: "#111827",
        color: "#9ca3af",
        padding: "28px 24px",
        textAlign: "center",
        fontSize: 13,
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 8 }}>
          <SiloIcon />
          <span style={{ color: "#fff", fontWeight: 700, fontSize: 15 }}>Poultry Mate</span>
        </div>
        <p>© {new Date().getFullYear()} Poultry Mate Australia · ABN registered · <a href="mailto:coverdalej72@gmail.com" style={{ color: GOLD }}>coverdalej72@gmail.com</a></p>
        <p style={{ marginTop: 6 }}>Proudly built for Australian broiler growers.</p>
      </footer>
    </div>
  );
}
