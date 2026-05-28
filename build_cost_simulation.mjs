import fs from "node:fs/promises";
import path from "node:path";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const outputDir = path.resolve("outputs/saas_cost_simulation");
await fs.mkdir(outputDir, { recursive: true });

const wb = Workbook.create();
const dash = wb.worksheets.add("Dashboard");
const model = wb.worksheets.add("Cost Model");
const inputs = wb.worksheets.add("Assumptions");
const questions = wb.worksheets.add("Clarifying Questions");

for (const s of [dash, model, inputs, questions]) {
  s.showGridLines = false;
}

function styleTitle(sheet, range, title) {
  const r = sheet.getRange(range);
  r.merge();
  r.values = [[title]];
  r.format = {
    fill: "#111827",
    font: { bold: true, color: "#FFFFFF", size: 16 },
    horizontalAlignment: "left",
    verticalAlignment: "middle",
  };
  r.format.rowHeightPx = 34;
}

function styleHeader(range) {
  range.format = {
    fill: "#1F2937",
    font: { bold: true, color: "#FFFFFF" },
    horizontalAlignment: "center",
    verticalAlignment: "middle",
    wrapText: true,
  };
}

function styleSection(range) {
  range.format = {
    fill: "#E5E7EB",
    font: { bold: true, color: "#111827" },
  };
}

styleTitle(inputs, "A1:F1", "SaaS Cost Simulation Assumptions");
inputs.getRange("A3:F3").values = [["Category", "Assumption", "Base Value", "Unit", "Rationale", "Editable"]];
styleHeader(inputs.getRange("A3:F3"));

const assumptionRows = [
  ["Commercial", "Blended subscription ARPU", 68.50, "$ / paying user / month", "Weighted across Starter, Pro, Agency plans before credit purchases.", "Yes"],
  ["Commercial", "Average paid credit revenue", 8.00, "$ / paying user / month", "Extra AI/image credits purchased beyond plan allowance.", "Yes"],
  ["Commercial", "Stripe variable fee", 0.029, "% of revenue", "Standard domestic card fee assumption.", "Yes"],
  ["Commercial", "Stripe fixed fee per user", 0.36, "$ / user / month", "Assumes one subscription charge plus some credit purchase activity.", "Yes"],
  ["Usage", "Monthly active usage ratio", 0.35, "% of paying users", "Active enough to trigger meaningful research/generation usage.", "Yes"],
  ["Usage", "Daily report enabled ratio", 0.75, "% of paying users", "Many users keep daily reports on; can be tuned by plan.", "Yes"],
  ["Usage", "Average competitor channels tracked", 15, "channels / user", "Below 25-channel maximum after mixed plan adoption.", "Yes"],
  ["Usage", "Channel dedupe exponent", 0.82, "curve exponent", "Global channel cache: popular competitors overlap across users.", "Yes"],
  ["Usage", "Upload frequency per competitor channel", 12, "videos / channel / month", "AI/marketing channels often post weekly to several times weekly.", "Yes"],
  ["Usage", "Transcript coverage", 0.55, "% of videos", "Not every competitor video has compliant/available transcripts.", "Yes"],
  ["Usage", "Outlines generated", 15, "per user / month", "Structured-outline-first workflow.", "Yes"],
  ["Usage", "Thumbnail image generations", 4, "per user / month", "Credit-metered thumbnail creation.", "Yes"],
  ["Usage", "PDF/DOCX exports", 5, "per user / month", "Reports and content briefs exported on demand.", "Yes"],
  ["AI Unit Cost", "Daily report LLM cost", 0.055, "$ / report", "Deep daily strategy report with clustering, recommendations, and quality reserve.", "Yes"],
  ["AI Unit Cost", "Outline/writing LLM cost", 0.035, "$ / outline", "Structured outline, hooks, titles, captions, and revision reserve.", "Yes"],
  ["AI Unit Cost", "Thumbnail generation cost", 0.085, "$ / image", "Blended image model cost including retries and moderation failures.", "Yes"],
  ["AI Unit Cost", "Transcript acquisition + analysis", 0.075, "$ / covered video", "Transcript provider/compliance reserve plus LLM summarization and embedding.", "Yes"],
  ["AI Unit Cost", "Export generation cost", 0.020, "$ / export", "PDF/DOCX rendering, storage, and bandwidth.", "Yes"],
  ["Platform", "Supabase base", 25, "$ / month", "Pro project baseline before compute/storage growth.", "Yes"],
  ["Platform", "Supabase variable", 0.080, "$ / user / month", "Database, storage, egress, backups, vector usage reserve.", "Yes"],
  ["Platform", "Vercel base", 40, "$ / month", "Two Pro seats baseline.", "Yes"],
  ["Platform", "Vercel variable", 0.050, "$ / user / month", "Functions, bandwidth, build/runtime reserve.", "Yes"],
  ["Platform", "Queue/cron base", 100, "$ / month", "Inngest/Trigger-style scheduled jobs and workers.", "Yes"],
  ["Platform", "Queue/cron variable", 0.090, "$ / user / month", "Daily research jobs, retries, fanout.", "Yes"],
  ["Platform", "Monitoring/admin base", 150, "$ / month", "Sentry/PostHog/logging/admin tooling baseline.", "Yes"],
  ["Platform", "Monitoring/admin variable", 0.060, "$ / user / month", "Events, traces, logs, feature flags, admin activity.", "Yes"],
  ["Platform", "YouTube data/quota reserve base", 500, "$ / month", "Quota application, supplemental data, proxy/compliance reserve.", "Yes"],
  ["Platform", "YouTube data/quota reserve variable", 0.200, "$ / user / month", "Higher refresh volume, quota expansion, source discovery.", "Yes"],
  ["Platform", "Resend base", 90, "$ / month", "Scale plan includes 100k emails/month.", "Yes"],
  ["Platform", "Included Resend emails", 100000, "emails / month", "Scale plan included volume.", "Yes"],
  ["Platform", "Resend overage", 0.0009, "$ / email", "$0.90 per 1,000 emails.", "Yes"],
  ["Team", "Base team payroll/contractors", 35000, "$ / month", "Serious SaaS ops baseline: engineering, support, QA/content ops blend.", "Yes"],
  ["Team", "Support variable", 3.50, "$ / user / month", "Support, abuse review, customer success, source curation.", "Yes"],
  ["Risk", "COGS contingency", 0.20, "% of infra + AI COGS", "Runaway jobs, model price drift, retries, abuse, quota failures.", "Yes"],
];
inputs.getRangeByIndexes(3, 0, assumptionRows.length, 6).values = assumptionRows;
inputs.getRange("C4:C37").format.numberFormat = "0.000";
inputs.getRange("A3:F37").format.wrapText = true;
inputs.getRange("A3:F37").format.verticalAlignment = "top";
inputs.getRange("A:A").format.columnWidthPx = 118;
inputs.getRange("B:B").format.columnWidthPx = 230;
inputs.getRange("C:C").format.columnWidthPx = 105;
inputs.getRange("D:D").format.columnWidthPx = 130;
inputs.getRange("E:E").format.columnWidthPx = 430;
inputs.getRange("F:F").format.columnWidthPx = 80;
inputs.freezePanes.freezeRows(3);

styleTitle(model, "A1:Z1", "Monthly Cost Model: 0 to 15,000 Paying Users");
const headers = [
  "Paying Users", "Active Users", "Revenue", "Stripe Fees", "Net Revenue",
  "Unique Channels", "Covered Transcript Videos", "Daily Reports", "LLM Reports",
  "LLM Outlines", "Image Generation", "Transcript Cost", "Export Cost",
  "AI + Export COGS", "Supabase", "Vercel", "Queue/Cron", "Monitoring/Admin",
  "YouTube/Data Reserve", "Email Cost", "Platform COGS", "Contingency",
  "Total Software COGS", "Gross Margin", "Team/Ops Cost", "Total Operating Cost",
  "Operating Profit"
];
model.getRange("A3:AA3").values = [headers];
styleHeader(model.getRange("A3:AA3"));

const users = [0, 100, 250, 500, 750, 1000, 1500, 2000, 3000, 5000, 7500, 10000, 12500, 15000];
model.getRangeByIndexes(3, 0, users.length, 1).values = users.map(u => [u]);
for (let i = 4; i < 4 + users.length; i++) {
  const row = i;
  const formulas = [
    `=ROUND(A${row}*Assumptions!$C$8,0)`,
    `=A${row}*(Assumptions!$C$4+Assumptions!$C$5)`,
    `=C${row}*Assumptions!$C$6 + A${row}*Assumptions!$C$7`,
    `=C${row}-D${row}`,
    `=IF(B${row}=0,0,MIN(B${row}*Assumptions!$C$10,ROUND((B${row}*Assumptions!$C$10)^Assumptions!$C$11*1.4,0)))`,
    `=ROUND(F${row}*Assumptions!$C$12*Assumptions!$C$13,0)`,
    `=ROUND(A${row}*Assumptions!$C$9*30,0)`,
    `=H${row}*Assumptions!$C$17`,
    `=A${row}*Assumptions!$C$14*Assumptions!$C$18`,
    `=A${row}*Assumptions!$C$15*Assumptions!$C$19`,
    `=G${row}*Assumptions!$C$20`,
    `=A${row}*Assumptions!$C$16*Assumptions!$C$21`,
    `=SUM(I${row}:M${row})`,
    `=Assumptions!$C$22 + A${row}*Assumptions!$C$23`,
    `=Assumptions!$C$24 + A${row}*Assumptions!$C$25`,
    `=Assumptions!$C$26 + A${row}*Assumptions!$C$27`,
    `=Assumptions!$C$28 + A${row}*Assumptions!$C$29`,
    `=Assumptions!$C$30 + A${row}*Assumptions!$C$31`,
    `=Assumptions!$C$32 + MAX(0,(H${row}+A${row}*4)-Assumptions!$C$33)*Assumptions!$C$34`,
    `=SUM(O${row}:T${row})`,
    `=(N${row}+U${row})*Assumptions!$C$37`,
    `=N${row}+U${row}+V${row}`,
    `=IF(C${row}=0,0,(C${row}-W${row})/C${row})`,
    `=Assumptions!$C$35 + A${row}*Assumptions!$C$36 + IF(A${row}>=1000,30000,0) + IF(A${row}>=3000,50000,0) + IF(A${row}>=7500,90000,0) + IF(A${row}>=12500,90000,0)`,
    `=W${row}+Y${row}`,
    `=C${row}-D${row}-Z${row}`,
  ];
  model.getRange(`B${row}:AA${row}`).formulas = [formulas];
}
model.getRange("C4:E17").format.numberFormat = "$#,##0";
model.getRange("I4:W17").format.numberFormat = "$#,##0";
model.getRange("Y4:AA17").format.numberFormat = "$#,##0";
model.getRange("X4:X17").format.numberFormat = "0.0%";
model.getRange("A3:AA17").format.wrapText = true;
model.getRange("A:A").format.columnWidthPx = 105;
model.getRange("B:B").format.columnWidthPx = 100;
model.getRange("C:AA").format.columnWidthPx = 112;
model.freezePanes.freezeRows(3);

styleTitle(dash, "A1:M1", "YouTube Outlier SaaS Cost Simulation: Base Case");
dash.getRange("A3:C9").values = [
  ["Metric", "Result", "Interpretation"],
  ["Break-even users including team", "", "Users needed for operating profit to turn positive."],
  ["Software COGS margin at 15,000 users", "", "Gross margin before team/support payroll."],
  ["Operating profit at 15,000 users", "", "Net monthly result after software COGS, Stripe, and team/ops."],
  ["Estimated software COGS at 15,000 users", "", "Infrastructure, AI, exports, email, monitoring, contingency."],
  ["Estimated total operating cost at 15,000 users", "", "Software COGS plus serious SaaS team/support operations."],
  ["Main feasibility bottleneck", "YouTube quota + transcript access", "Must cache globally and avoid duplicated fetches."],
];
styleHeader(dash.getRange("A3:C3"));
dash.getRange("B4").formulas = [[`=INDEX('Cost Model'!A4:A17,MATCH(TRUE,'Cost Model'!AA4:AA17>0,0))`]];
dash.getRange("B5").formulas = [[`='Cost Model'!X17`]];
dash.getRange("B6").formulas = [[`='Cost Model'!AA17`]];
dash.getRange("B7").formulas = [[`='Cost Model'!W17`]];
dash.getRange("B8").formulas = [[`='Cost Model'!Z17`]];
dash.getRange("B4:B4").format.numberFormat = "#,##0";
dash.getRange("B5").format.numberFormat = "0.0%";
dash.getRange("B6:B8").format.numberFormat = "$#,##0";
dash.getRange("A3:C9").format.wrapText = true;
dash.getRange("A:A").format.columnWidthPx = 250;
dash.getRange("B:B").format.columnWidthPx = 180;
dash.getRange("C:C").format.columnWidthPx = 520;

dash.getRange("A12:F12").values = [["Users", "Revenue", "Software COGS", "Total Operating Cost", "Operating Profit", "Gross Margin"]];
styleHeader(dash.getRange("A12:F12"));
dash.getRange("A13:A26").formulas = users.map((_, idx) => [`='Cost Model'!A${4 + idx}`]);
dash.getRange("B13:F13").formulas = [[`='Cost Model'!C4`, `='Cost Model'!W4`, `='Cost Model'!Z4`, `='Cost Model'!AA4`, `='Cost Model'!X4`]];
dash.getRange("B13:F26").fillDown();
dash.getRange("B13:E26").format.numberFormat = "$#,##0";
dash.getRange("F13:F26").format.numberFormat = "0.0%";

const chart1 = dash.charts.add("line", dash.getRange("A12:E26"));
chart1.title = "Monthly Revenue vs Cost by Paying Users";
chart1.hasLegend = true;
chart1.xAxis = { axisType: "textAxis" };
chart1.yAxis = { numberFormatCode: "$#,##0" };
chart1.setPosition("H12", "M28");

const chart2 = dash.charts.add("line", dash.getRange("A12:A26,F12:F26"));
chart2.title = "Software Gross Margin";
chart2.hasLegend = false;
chart2.xAxis = { axisType: "textAxis" };
chart2.yAxis = { numberFormatCode: "0%" };
chart2.setPosition("H30", "M44");

styleTitle(questions, "A1:D1", "Clarifying Questions Before PRD and Specs");
questions.getRange("A3:D3").values = [["Area", "Question", "Why It Matters", "Decision Needed"]];
styleHeader(questions.getRange("A3:D3"));
const qRows = [
  ["Target customer", "Who is the first paying customer: solo creators, agencies, course sellers, B2B SaaS marketers, or consultants?", "This changes onboarding, pricing, reports, templates, and how deep team/workspace features need to be.", "Pick one primary ICP for v1."],
  ["Data compliance", "Are you willing to use third-party YouTube/transcript data providers, or must v1 rely only on official APIs and user-provided data?", "Transcript analysis at scale is the biggest compliance and reliability risk.", "Choose official-only, provider-assisted, or hybrid."],
  ["Report depth", "Should daily reports be brief executive recommendations or long research dossiers?", "LLM cost, perceived value, and email/export size depend on this.", "Define report format and max length."],
  ["Credit economy", "Should credits be consumed by every AI action or only expensive actions like deep reports and images?", "This affects margin, user trust, and pricing UX.", "Define credit meter rules."],
  ["Thumbnail editor", "Do you need a full Canva-like editor in v1, or generation plus editable templates/export is enough?", "A full editor is a major product surface.", "Choose template editor scope."],
  ["News ingestion", "Are sources RSS-friendly, or do we need extraction from pages without feeds?", "Scraping/extraction complexity and monitoring costs vary heavily.", "Provide source list and ingestion type."],
  ["Admin operations", "What admin controls are must-have on day one: user impersonation, credit adjustment, job replay, prompt audit, abuse review, billing support?", "Serious SaaS operations need internal tooling, not just user screens.", "Rank admin requirements."],
  ["Scale target", "Is 15,000 users the 12-month goal, 24-month goal, or technical design ceiling?", "This changes upfront architecture and spend tolerance.", "Set target timeline."],
  ["Plan mix", "What pricing do you want to test: $29/$79/$199, higher, or usage-first?", "ARPU is the biggest lever in the feasibility model.", "Approve or revise pricing."],
  ["Data retention", "How long should video snapshots, transcripts, reports, and generated assets be retained?", "Storage, privacy, and retrieval costs depend on retention.", "Define retention by plan."],
  ["Source recommendation", "Should the app recommend sources automatically from web search, competitor links, user niche graph, or curated admin lists?", "Automatic discovery adds cost and quality risk.", "Pick source discovery method."],
  ["LLM providers", "Do users bring their own keys, or does the SaaS always pay model costs and resell credits?", "BYOK lowers COGS but complicates UX and support.", "Choose managed-only, BYOK, or both."],
];
questions.getRangeByIndexes(3, 0, qRows.length, 4).values = qRows;
questions.getRange("A3:D15").format.wrapText = true;
questions.getRange("A:A").format.columnWidthPx = 150;
questions.getRange("B:B").format.columnWidthPx = 390;
questions.getRange("C:C").format.columnWidthPx = 390;
questions.getRange("D:D").format.columnWidthPx = 220;
questions.freezePanes.freezeRows(3);

for (const sheet of [dash, model, inputs, questions]) {
  const used = sheet.getUsedRange();
  used.format.font = { name: "Arial", size: 10 };
  used.format.verticalAlignment = "top";
}
dash.getRange("A1:M1").format.font = { name: "Arial", size: 16, bold: true, color: "#FFFFFF" };
model.getRange("A1:Z1").format.font = { name: "Arial", size: 16, bold: true, color: "#FFFFFF" };
inputs.getRange("A1:F1").format.font = { name: "Arial", size: 16, bold: true, color: "#FFFFFF" };
questions.getRange("A1:D1").format.font = { name: "Arial", size: 16, bold: true, color: "#FFFFFF" };

const previewSheets = ["Dashboard", "Cost Model", "Assumptions", "Clarifying Questions"];
for (const name of previewSheets) {
  const png = await wb.render({ sheetName: name, autoCrop: "all", scale: 1, format: "png" });
  await fs.writeFile(path.join(outputDir, `${name.replaceAll(" ", "_")}.png`), new Uint8Array(await png.arrayBuffer()));
}

const errors = await wb.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 100 },
  summary: "formula error scan",
});
console.log(errors.ndjson);

const summary = await wb.inspect({
  kind: "table",
  range: "Dashboard!A3:C9",
  include: "values,formulas",
  tableMaxRows: 10,
  tableMaxCols: 4,
});
console.log(summary.ndjson);

const out = await SpreadsheetFile.exportXlsx(wb);
const outPath = path.join(outputDir, "youtube_outlier_saas_cost_simulation.xlsx");
await out.save(outPath);
console.log(outPath);
