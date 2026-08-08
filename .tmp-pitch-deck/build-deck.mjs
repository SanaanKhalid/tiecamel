import fs from "node:fs/promises";
import path from "node:path";
import { Presentation, PresentationFile } from "@oai/artifact-tool";

const ROOT = "/Users/sunny.k/Developer/tiecamel";
const TMP = path.join(ROOT, ".tmp-pitch-deck");
const ASSETS = path.join(TMP, "assets");
const OUT = path.join(ROOT, "output");
const FINAL = path.join(OUT, "TieCamel-for-Mosques-Pitch-Deck.pptx");

const W = 1280;
const H = 720;

const C = {
  ink: "#061A12",
  forest: "#0B2A1E",
  forest2: "#133B2C",
  ivory: "#F7F5E9",
  cream: "#F1F3E9",
  gold: "#C4A650",
  goldLight: "#D8C47F",
  mint: "#8BD8AE",
  muted: "#A6B9AD",
  slate: "#55685E",
  red: "#A74D4D",
  amber: "#B5832F",
  blue: "#2D6F8B",
  white: "#FFFFFF",
};

const FONT = "Avenir Next";
const SERIF = "Georgia";

async function bytes(name) {
  return new Uint8Array(await fs.readFile(path.join(ASSETS, name)));
}

function addText(slide, text, x, y, w, h, opts = {}) {
  const shape = slide.shapes.add({
    geometry: "textbox",
    name: opts.name,
    position: { left: x, top: y, width: w, height: h },
    fill: "none",
    line: { style: "solid", fill: "none", width: 0 },
  });
  shape.text = text;
  shape.text.style = {
    fontFamily: opts.fontFamily || FONT,
    fontSize: opts.fontSize || 24,
    bold: opts.bold || false,
    italic: opts.italic || false,
    color: opts.color || C.ink,
    alignment: opts.align || "left",
    verticalAlignment: opts.valign || "top",
  };
  return shape;
}

function addRect(slide, x, y, w, h, fill, opts = {}) {
  return slide.shapes.add({
    geometry: opts.geometry || "rect",
    name: opts.name,
    position: { left: x, top: y, width: w, height: h },
    fill,
    line: opts.line || { style: "solid", fill: "none", width: 0 },
    borderRadius: opts.radius,
    shadow: opts.shadow,
  });
}

function addRule(slide, x, y, w, color = C.gold, width = 2) {
  return slide.shapes.add({
    geometry: "line",
    position: { left: x, top: y, width: w, height: 0 },
    fill: "none",
    line: { style: "solid", fill: color, width },
  });
}

function addLine(slide, x, y, w, h, color = C.gold, width = 2) {
  return slide.shapes.add({
    geometry: "line",
    position: { left: x, top: y, width: w, height: h },
    fill: "none",
    line: { style: "solid", fill: color, width },
  });
}

function addImage(slide, data, alt, x, y, w, h, opts = {}) {
  return slide.images.add({
    blob: data,
    contentType: "image/png",
    alt,
    fit: opts.fit || "cover",
    position: { left: x, top: y, width: w, height: h },
    crop: opts.crop,
    geometry: opts.geometry || "rect",
    borderRadius: opts.radius,
  });
}

function addLogoLockup(slide, logo, x = 64, y = 42, color = C.white) {
  addImage(slide, logo, "TieCamel logo", x, y, 34, 34, { fit: "contain" });
  addText(slide, "TieCamel", x + 43, y + 2, 160, 30, {
    fontSize: 21,
    bold: true,
    color,
    valign: "middle",
  });
}

function addEyebrow(slide, text, x, y, color = C.gold, w = 420) {
  addRule(slide, x, y + 10, 28, color, 2);
  addText(slide, text.toUpperCase(), x + 42, y, w, 24, {
    fontSize: 13,
    bold: true,
    color,
  });
}

function addFooter(slide, n, dark = false) {
  addText(slide, "TIECAMEL · MOSQUE DESIGN-PARTNER DECK", 64, 680, 430, 16, {
    fontSize: 10,
    bold: true,
    color: dark ? C.muted : C.slate,
  });
  addText(slide, String(n).padStart(2, "0"), 1170, 678, 46, 18, {
    fontSize: 11,
    bold: true,
    color: dark ? C.goldLight : C.forest2,
    align: "right",
  });
}

function notes(slide, body, sources) {
  slide.speakerNotes.textFrame.setText(`${body}\n\n[Sources]\n${sources.map((s) => `- ${s}`).join("\n")}`);
}

function title(slide, text, dark = false, y = 74, w = 1100) {
  return addText(slide, text, 64, y, w, 72, {
    fontSize: 42,
    bold: true,
    color: dark ? C.cream : C.ink,
  });
}

await fs.mkdir(OUT, { recursive: true });
await fs.mkdir(path.join(TMP, "renders"), { recursive: true });

const [hero, logo, home, compliance, issue, publicShot] = await Promise.all([
  bytes("mosque-hero.png"),
  bytes("tiecamel-logo.png"),
  bytes("product-home.png"),
  bytes("product-compliance.png"),
  bytes("product-issue.png"),
  bytes("product-public.png"),
]);

const deck = Presentation.create({ slideSize: { width: W, height: H } });

// 1 — Cover
{
  const s = deck.slides.add();
  s.background.fill = C.ink;
  addImage(s, hero, "Contemporary mosque interior at blue hour", 0, 0, W, H, { fit: "cover" });
  addRect(s, 0, 0, 690, H, C.ink);
  addLogoLockup(s, logo, 68, 54, C.white);
  addEyebrow(s, "Governance infrastructure for mosques", 70, 174, C.mint, 480);
  addText(s, "Stewardship\nyou can prove.", 68, 224, 590, 190, {
    fontSize: 66,
    bold: true,
    color: C.cream,
  });
  addText(s, "Protect entrusted assets. Surface risk early.\nBuild member trust with evidence—not assurances.", 72, 440, 540, 86, {
    fontSize: 23,
    color: C.muted,
  });
  addRule(s, 72, 580, 72, C.gold, 3);
  addText(s, "MOSQUE DESIGN-PARTNER PITCH · 2026", 162, 569, 360, 24, {
    fontSize: 13,
    bold: true,
    color: C.goldLight,
  });
  notes(s, "Open on stewardship: the promise is not simply to manage a mosque, but to protect an amanah and make responsible action visible.", [
    "TieCamel PRODUCT_PLAN.md, accessed 2026-08-02.",
    "AI-generated architecture visual created for this deck with OpenAI image generation, 2026-08-02.",
    "TieCamel repository-local logo asset.",
  ]);
}

// 2 — Complexity of the mission
{
  const s = deck.slides.add();
  s.background.fill = C.ink;
  addEyebrow(s, "The operating reality", 64, 54, C.goldLight);
  addText(s, "Mosques carry more\nthan a mission.", 64, 104, 670, 130, {
    fontSize: 52,
    bold: true,
    color: C.cream,
  });
  addText(s, "Amanah", 66, 286, 520, 112, {
    fontSize: 86,
    italic: true,
    fontFamily: SERIF,
    color: C.gold,
  });
  addText(s, "The trust is sacred. The operating complexity is real.", 70, 410, 600, 48, {
    fontSize: 23,
    color: C.muted,
  });
  addLine(s, 680, 86, 0, 456, C.gold, 2);
  const items = [
    "Property & exemptions",
    "Insurance & safety",
    "Zakat & restricted funds",
    "Schools & youth programs",
    "Payroll, grants & filings",
    "Board decisions & member expectations",
  ];
  items.forEach((item, i) => {
    addText(s, String(i + 1).padStart(2, "0"), 740, 108 + i * 73, 40, 28, {
      fontSize: 13,
      bold: true,
      color: C.gold,
    });
    addText(s, item, 798, 98 + i * 73, 390, 38, {
      fontSize: 24,
      bold: i === 0,
      color: C.cream,
    });
    if (i < items.length - 1) addRule(s, 798, 143 + i * 73, 390, C.forest2, 1);
  });
  addImage(s, logo, "TieCamel camel mark", 1060, 540, 120, 120, { fit: "contain" });
  addFooter(s, 2, true);
  notes(s, "Connect the mission to the operational load carried by mosque boards, staff, volunteers, finance committees, and independent reviewers.", [
    "TieCamel PRODUCT_PLAN.md: obligation categories and faith-based institution use case, accessed 2026-08-02.",
    "TieCamel apps/web/src/pages/index.astro: assets and obligations module copy, accessed 2026-08-02.",
  ]);
}

// 3 — Problem sequence
{
  const s = deck.slides.add();
  s.background.fill = C.ivory;
  addEyebrow(s, "The hidden failure mode", 64, 50, C.forest2);
  title(s, "The risk lives between systems.", false, 92);
  addText(s, "Accounting records the transaction. Email carries the notice. A shared drive holds the file.\nBut none of them guarantees that the full board sees the risk—or that it escalates.", 64, 160, 1080, 76, {
    fontSize: 22,
    color: C.slate,
  });

  const xs = [100, 390, 680, 970];
  for (let i = 0; i < xs.length - 1; i++) addLine(s, xs[i] + 82, 346, xs[i + 1] - xs[i] - 164, 0, C.gold, 3);
  const stages = [
    ["01", "Notice arrives", "A filing, bill, renewal, grant report, or board decision lands."],
    ["02", "One person knows", "The obligation stays inside an inbox, folder, or private conversation."],
    ["03", "The moment slips", "No shared owner, evidence standard, reviewer, or escalation clock."],
    ["04", "Trust breaks late", "Leaders and members learn after cost, conflict, or exposure grows."],
  ];
  stages.forEach(([num, head, body], i) => {
    addRect(s, xs[i], 310, 72, 72, i === 3 ? C.ink : C.forest2, { geometry: "ellipse" });
    addText(s, num, xs[i], 326, 72, 34, {
      fontSize: 20,
      bold: true,
      color: C.cream,
      align: "center",
      valign: "middle",
    });
    addText(s, head, xs[i] - 34, 412, 220, 34, {
      fontSize: 23,
      bold: true,
      color: C.ink,
    });
    addText(s, body, xs[i] - 34, i === 1 ? 482 : 456, 220, i === 1 ? 82 : 104, {
      fontSize: 17,
      color: C.slate,
    });
  });
  addRect(s, 64, 590, 1152, 54, C.ink, { radius: 12 });
  addText(s, "The issue is not a lack of care. It is a lack of shared visibility, evidence, and escalation.", 92, 604, 1100, 28, {
    fontSize: 19,
    bold: true,
    color: C.cream,
    align: "center",
  });
  addFooter(s, 3, false);
  notes(s, "Frame the competitive gap: bookkeeping, board portals, email, and storage each solve a narrow problem, but not the handoff between knowledge, responsibility, evidence, escalation, and disclosure.", [
    "TieCamel PRODUCT_PLAN.md: Why this product should exist, accessed 2026-08-02.",
  ]);
}

// 4 — Observe / Escalate / Prove
{
  const s = deck.slides.add();
  s.background.fill = C.ink;
  addEyebrow(s, "The TieCamel model", 64, 44, C.mint);
  title(s, "One shared system: observe, escalate, prove.", true, 84);
  const cols = [64, 458, 852];
  const pillars = [
    ["01", "Observe", "Bring property, filings, grants, insurance, loans, licenses, legal matters, and financial reporting into one source-labeled view."],
    ["02", "Escalate", "Assign an owner, backup, reviewer, evidence requirement, and an escalation path that cannot end in one silent inbox."],
    ["03", "Prove", "Publish privacy-respecting reports with source labels, reviewer attestations, append-only history, and verifiable proof."],
  ];
  pillars.forEach(([num, head, body], i) => {
    if (i > 0) addLine(s, cols[i] - 32, 190, 0, 146, C.forest2, 2);
    addText(s, num, cols[i], 178, 48, 26, { fontSize: 13, bold: true, color: C.gold });
    addText(s, head, cols[i], 210, 310, 44, { fontSize: 30, bold: true, color: C.cream });
    addText(s, body, cols[i], 264, 310, 88, { fontSize: 17, color: C.muted });
  });
  addRect(s, 64, 390, 1152, 236, C.white, { radius: 20, shadow: "shadow-xl" });
  addImage(s, home, "TieCamel mosque organization workspace", 70, 396, 1140, 224, {
    fit: "cover",
    geometry: "roundRect",
    radius: 16,
    crop: { left: 0, top: 0, right: 0, bottom: 0.18 },
  });
  addFooter(s, 4, true);
  notes(s, "Tie the three-part promise to the actual product workspace. The screenshot uses the seeded Islamic Center of Naperville demo organization.", [
    "TieCamel apps/web/src/pages/index.astro: Observe / Escalate / Prove copy, accessed 2026-08-02.",
    "Local TieCamel seeded demo screenshot: Islamic Center of Naperville organization workspace, captured 2026-08-02.",
  ]);
}

// 5 — Board operating picture
{
  const s = deck.slides.add();
  s.background.fill = C.ivory;
  addEyebrow(s, "Board visibility", 64, 50, C.forest2);
  addText(s, "Your board sees the whole picture—\nbefore the meeting.", 64, 92, 520, 124, {
    fontSize: 42,
    bold: true,
    color: C.ink,
  });
  const bullets = [
    ["01", "Governed work areas", "Governance, compliance, funding, and transparency each carry their own rules and audience."],
    ["02", "What needs attention", "Open issues, review queues, unresolved actions, and close-to-breach items are visible in one place."],
    ["03", "Durable history", "Accepted records cannot be silently overwritten; corrections arrive as reviewed changes."],
  ];
  bullets.forEach(([num, head, body], i) => {
    const y = 260 + i * 118;
    addText(s, num, 66, y, 36, 24, { fontSize: 13, bold: true, color: C.gold });
    addText(s, head, 116, y - 6, 390, 34, { fontSize: 23, bold: true, color: C.ink });
    addText(s, body, 116, y + 32, 410, 70, { fontSize: 17, color: C.slate });
  });
  addRect(s, 574, 104, 642, 502, C.white, { radius: 20, shadow: "shadow-xl", line: { style: "solid", fill: C.goldLight, width: 1 } });
  addImage(s, home, "TieCamel board operating picture for a mosque", 582, 112, 626, 486, {
    fit: "contain",
    geometry: "roundRect",
    radius: 15,
  });
  addFooter(s, 5, false);
  notes(s, "Show how a board member or treasurer can orient quickly across governed repositories, work requiring attention, and recent anchored activity.", [
    "Local TieCamel seeded demo screenshot: Islamic Center of Naperville organization workspace, captured 2026-08-02.",
    "TieCamel README.md and PRODUCT_PLAN.md: repository oversight and correction history, accessed 2026-08-02.",
  ]);
}

// 6 — Obligation resolution workflow
{
  const s = deck.slides.add();
  s.background.fill = C.ink;
  addEyebrow(s, "Controlled follow-through", 64, 44, C.mint);
  addText(s, "Every obligation has\na path to resolution.", 64, 86, 510, 118, {
    fontSize: 44,
    bold: true,
    color: C.cream,
  });
  addLine(s, 90, 266, 0, 256, C.gold, 2);
  const steps = [
    ["1", "Owner", "Someone is responsible."],
    ["2", "Backup", "Silence cannot stop the work."],
    ["3", "Evidence", "Completion requires proof."],
    ["4", "Reviewer", "High-risk closure gets a second set of eyes."],
    ["5", "Escalation", "Unresolved risk reaches the full board."],
  ];
  steps.forEach(([num, head, body], i) => {
    const y = 240 + i * 70;
    addRect(s, 74, y, 32, 32, i === 4 ? C.gold : C.forest2, { geometry: "ellipse", line: { style: "solid", fill: C.gold, width: 1 } });
    addText(s, num, 74, y + 5, 32, 20, { fontSize: 13, bold: true, color: i === 4 ? C.ink : C.goldLight, align: "center", valign: "middle" });
    addText(s, head, 128, y - 2, 126, 26, { fontSize: 20, bold: true, color: C.cream });
    addText(s, body, 258, y, 255, 38, { fontSize: 15, color: C.muted });
  });
  addRect(s, 566, 92, 650, 452, C.white, { radius: 20, shadow: "shadow-xl" });
  addImage(s, issue, "Property tax notice review issue in TieCamel", 574, 100, 634, 436, {
    fit: "contain",
    geometry: "roundRect",
    radius: 15,
  });
  addRect(s, 566, 570, 650, 66, C.forest2, { radius: 12, line: { style: "solid", fill: C.gold, width: 1 } });
  addText(s, "A critical item cannot be quietly closed by the same person who owns it.", 590, 585, 604, 34, {
    fontSize: 18,
    bold: true,
    color: C.cream,
    align: "center",
  });
  addFooter(s, 6, true);
  notes(s, "Use the property-tax-notice demo to make the workflow tangible. TieCamel does not decide legal responsibility; it makes the obligation, evidence, owner, reviewer, and response status visible.", [
    "Local TieCamel seeded demo screenshot: property tax notice issue workflow, captured 2026-08-02.",
    "TieCamel PRODUCT_PLAN.md: obligation lifecycle, independent review, and no-single-point-of-silence principles, accessed 2026-08-02.",
  ]);
}

// 7 — Access model
{
  const s = deck.slides.add();
  s.background.fill = C.ivory;
  addEyebrow(s, "Trust with privacy", 64, 48, C.forest2);
  title(s, "Transparency without oversharing.", false, 90);
  addText(s, "The same truth—presented at the right level for each audience.", 64, 154, 760, 38, { fontSize: 22, color: C.slate });

  const bands = [
    { x: 100, w: 1080, y: 238, fill: "#DDE9E0", label: "PUBLIC", head: "Approved reports, leadership, material-risk summaries, freshness and publication proof", color: C.forest2 },
    { x: 170, w: 940, y: 320, fill: "#BED9C7", label: "VERIFIED MEMBERS", head: "Financial and governance summaries, board actions, structured questions and responses", color: C.ink },
    { x: 240, w: 800, y: 402, fill: "#7FB695", label: "FULL BOARD", head: "Obligations, evidence, decisions, dissent, unresolved actions and scoped financial detail", color: C.ink },
    { x: 310, w: 660, y: 484, fill: C.forest2, label: "RESTRICTED", head: "Donor identities, employee data, credentials and privileged legal strategy stay protected", color: C.cream },
  ];
  bands.forEach((b) => {
    addRect(s, b.x, b.y, b.w, 64, b.fill, { radius: 12 });
    addText(s, b.label, b.x + 24, b.y + 12, 190, 18, { fontSize: 11, bold: true, color: b.color });
    addText(s, b.head, b.x + 220, b.y + 10, b.w - 244, 42, { fontSize: 16, bold: true, color: b.color, valign: "middle" });
  });
  addRule(s, 100, 590, 1080, C.gold, 2);
  addText(s, "Meaningful transparency does not require publishing transactions, donor identities, or privileged strategy.", 148, 608, 984, 36, {
    fontSize: 19,
    bold: true,
    color: C.ink,
    align: "center",
  });
  addFooter(s, 7, false);
  notes(s, "This is a tiered access model, not a one-size-fits-all public portal. Emphasize that transparency and privacy reinforce each other when boundaries are explicit.", [
    "TieCamel PRODUCT_PLAN.md: information-access model and transparency with privacy principle, accessed 2026-08-02.",
  ]);
}

// 8 — Provenance
{
  const s = deck.slides.add();
  s.background.fill = C.ink;
  addEyebrow(s, "Provenance on every claim", 64, 44, C.mint);
  addText(s, "Trust is stronger\nwhen every claim\ncarries its source.", 64, 86, 520, 150, {
    fontSize: 43,
    bold: true,
    color: C.cream,
  });
  const states = [
    [C.mint, "Verified", "Confirmed by an official, connected, or independently reviewed source."],
    [C.gold, "Organization reported", "Submitted by the mosque with its source and reporting date visible."],
    [C.amber, "Unavailable", "Missing, disconnected, stale, or not available for verification."],
    [C.red, "Disputed", "The evidence and each response remain preserved."],
  ];
  states.forEach(([color, head, body], i) => {
    const y = 270 + i * 79;
    addRect(s, 70, y + 4, 12, 12, color, { geometry: "ellipse" });
    addText(s, head, 100, y - 4, 230, 28, { fontSize: 20, bold: true, color: C.cream });
    addText(s, body, 100, y + 28, 430, 42, { fontSize: 15, color: C.muted });
  });
  addRect(s, 620, 98, 596, 396, C.white, { radius: 20, shadow: "shadow-xl" });
  addImage(s, publicShot, "TieCamel public transparency repository", 628, 106, 580, 380, {
    fit: "contain",
    geometry: "roundRect",
    radius: 15,
  });
  addRect(s, 620, 530, 596, 102, C.forest2, { radius: 14, line: { style: "solid", fill: C.gold, width: 1 } });
  addText(s, "Corrections append. Originals remain visible.", 650, 548, 536, 30, { fontSize: 22, bold: true, color: C.cream, align: "center" });
  addText(s, "Published records can change without history disappearing.", 650, 586, 536, 22, { fontSize: 15, color: C.muted, align: "center" });
  addFooter(s, 8, true);
  notes(s, "Explain the trust-state vocabulary and the public boundary: only independently reviewed, board-approved, authorized snapshots appear publicly; internal drafts and review discussion remain excluded.", [
    "TieCamel apps/web/src/pages/index.astro: trust states, accessed 2026-08-02.",
    "TieCamel PRODUCT_PLAN.md: provenance and append-only correction principles, accessed 2026-08-02.",
    "Local TieCamel public transparency repository screenshot, captured 2026-08-02.",
  ]);
}

// 9 — Pilot
{
  const s = deck.slides.add();
  s.background.fill = C.ivory;
  addEyebrow(s, "Proposed design-partner pilot", 64, 48, C.forest2);
  title(s, "A focused 90 days to prove the model.", false, 90);
  addText(s, "Start bounded. Learn with real obligations. Publish one credible result.", 64, 154, 860, 36, { fontSize: 22, color: C.slate });

  const tx = [108, 398, 688, 978];
  for (let i = 0; i < tx.length - 1; i++) addLine(s, tx[i] + 52, 302, tx[i + 1] - tx[i] - 104, 0, C.gold, 3);
  const stages = [
    ["DAYS 1–14", "Align", "Scope, governance, data boundaries, and a draft Transparency Covenant."],
    ["DAYS 15–45", "Configure", "Import priority obligations; assign owners, backups, evidence, and escalation."],
    ["DAYS 46–75", "Operate", "Run alerts, reviews, board decisions, and member-question workflows."],
    ["DAYS 76–90", "Publish", "Release one approved member-facing report with verification proof."],
  ];
  stages.forEach(([days, head, body], i) => {
    addRect(s, tx[i], 272, 60, 60, i === 3 ? C.ink : C.forest2, { geometry: "ellipse" });
    addText(s, String(i + 1), tx[i], 288, 60, 24, { fontSize: 18, bold: true, color: C.cream, align: "center" });
    addText(s, days, tx[i] - 36, 354, 160, 18, { fontSize: 11, bold: true, color: C.gold, align: "center" });
    addText(s, head, tx[i] - 36, 384, 160, 32, { fontSize: 25, bold: true, color: C.ink, align: "center" });
    addText(s, body, tx[i] - 62, 430, 212, 88, { fontSize: 16, color: C.slate, align: "center" });
  });
  addRect(s, 64, 566, 1152, 76, C.ink, { radius: 14 });
  addText(s, "Pilot outcome: one authoritative obligation register · board-level visibility · a member report · tamper-evident publication proof", 92, 584, 1096, 42, {
    fontSize: 17,
    bold: true,
    color: C.cream,
    align: "center",
    valign: "middle",
  });
  addFooter(s, 9, false);
  notes(s, "Position this as a proposed working plan. The exact sequencing should be finalized with the mosque's board, counsel, finance team, and independent reviewer.", [
    "TieCamel PRODUCT_PLAN.md: recommended 90-day design-partner pilot and four pilot outcomes, accessed 2026-08-02.",
    "Pilot stage allocation is a proposed presentation framework derived from the product roadmap, 2026-08-02.",
  ]);
}

// 10 — Close
{
  const s = deck.slides.add();
  s.background.fill = C.ink;
  addImage(s, hero, "Contemporary mosque interior at blue hour", 0, 0, W, H, {
    fit: "cover",
    crop: { left: 0.2, top: 0, right: 0, bottom: 0 },
  });
  addRect(s, 0, 0, 730, H, C.ink);
  addLogoLockup(s, logo, 68, 54, C.white);
  addEyebrow(s, "Become a design partner", 70, 168, C.mint, 430);
  addText(s, "Start with the obligations\nthat keep leaders up at night.", 68, 214, 620, 150, {
    fontSize: 50,
    bold: true,
    color: C.cream,
  });
  addText(s, "Property & exemptions  ·  Insurance & safety\nFilings & grants  ·  Board decisions  ·  Member reporting", 72, 402, 590, 70, {
    fontSize: 19,
    color: C.muted,
  });
  addRect(s, 72, 522, 420, 72, C.gold, { radius: 14 });
  addText(s, "hello@tiecamel.com", 96, 540, 372, 34, {
    fontSize: 24,
    bold: true,
    color: C.ink,
    align: "center",
    valign: "middle",
  });
  addText(s, "A bounded pilot. Real obligations. Trust made visible.", 72, 624, 560, 28, {
    fontSize: 17,
    bold: true,
    color: C.goldLight,
  });
  notes(s, "Close on the next decision: choose a small number of high-consequence obligations and explore a bounded design-partner pilot.", [
    "TieCamel PRODUCT_PLAN.md: pilot recommendation and initial obligation categories, accessed 2026-08-02.",
    "TieCamel apps/web/src/pages/index.astro: design-partner contact and positioning, accessed 2026-08-02.",
    "AI-generated architecture visual created for this deck with OpenAI image generation, 2026-08-02.",
  ]);
}

// Export QA artifacts and final deck.
for (const [index, slide] of deck.slides.items.entries()) {
  const stem = `slide-${String(index + 1).padStart(2, "0")}`;
  const png = await deck.export({ slide, format: "png", scale: 1 });
  await fs.writeFile(path.join(TMP, "renders", `${stem}.png`), new Uint8Array(await png.arrayBuffer()));
  const layout = await slide.export({ format: "layout" });
  await fs.writeFile(path.join(TMP, "renders", `${stem}.layout.json`), await layout.text());
}

const montage = await deck.export({ format: "webp", montage: true, scale: 1 });
await fs.writeFile(path.join(TMP, "renders", "deck-montage.webp"), new Uint8Array(await montage.arrayBuffer()));

const pptx = await PresentationFile.exportPptx(deck);
await pptx.save(FINAL);
console.log(FINAL);
