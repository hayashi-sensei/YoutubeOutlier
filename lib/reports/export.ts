import { deflateRawSync } from "node:zlib";
import type { ResearchReportDetail } from "./queries";
import { buildReportExportObjectKey } from "@/lib/storage/keys";

export type ReportExportFileType = "pdf" | "docx";

export type ReportExportBranding = {
  workspaceName: string;
  primaryNiche: string | null;
  brandVoice: string | null;
  cta?: string | null;
};

export function renderResearchReportMarkdown(report: ResearchReportDetail): string {
  const lines: string[] = [
    `# ${report.title}`,
    "",
    `Status: ${report.status}`,
    `Type: ${report.manualRun ? "Manual" : "Daily"}`,
    `Report date: ${formatDate(report.reportDate)}`,
  ];

  if (report.summary) {
    lines.push("", report.summary);
  }

  appendExecutiveSummary(lines, report.sections.executiveSummary);
  appendGenericList(lines, "Competitor Uploads", report.sections.competitorUploads);
  appendGenericList(lines, "Outliers", report.sections.outliers);
  appendGenericList(lines, "Recent Topic Clusters", report.sections.recentTopicClusters);
  appendGenericList(lines, "Industry News", report.sections.industryNews);
  appendStringList(lines, "Content Gaps", report.sections.contentGaps);
  appendRecommendations(lines, report);
  appendStringList(lines, "Recommended Actions", report.sections.recommendedActions);

  return `${lines.join("\n").trim()}\n`;
}

export function renderResearchReportPdf(report: ResearchReportDetail, branding: ReportExportBranding): Buffer {
  const lines = reportPdfLines(report, branding);
  const pages = chunkLines(lines, 42);
  const objects: string[] = [];
  const pageObjectIds: number[] = [];

  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push("");

  for (const pageLines of pages) {
    const pageObjectId = objects.length + 1;
    const contentObjectId = pageObjectId + 1;
    pageObjectIds.push(pageObjectId);
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${contentObjectId + 1} 0 R /F2 ${contentObjectId + 2} 0 R >> >> /Contents ${contentObjectId} 0 R >>`);
    const content = pdfContentStream(pageLines);
    objects.push(`<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`);
    objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
    objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
  }

  objects[1] = `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageObjectIds.length} >>`;
  return buildPdf(objects);
}

export function renderResearchReportDocx(report: ResearchReportDetail, branding: ReportExportBranding): Buffer {
  const documentXml = renderDocumentXml(reportPlainTextLines(report, branding));
  const coreXml = renderCorePropertiesXml(report);
  return buildZip([
    {
      path: "[Content_Types].xml",
      content: xmlBuffer(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`),
    },
    {
      path: "_rels/.rels",
      content: xmlBuffer(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`),
    },
    {
      path: "docProps/core.xml",
      content: xmlBuffer(coreXml),
    },
    {
      path: "docProps/app.xml",
      content: xmlBuffer(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>YTResearch</Application>
  <DocSecurity>0</DocSecurity>
  <ScaleCrop>false</ScaleCrop>
  <Company>YTResearch</Company>
  <LinksUpToDate>false</LinksUpToDate>
  <SharedDoc>false</SharedDoc>
  <HyperlinksChanged>false</HyperlinksChanged>
  <AppVersion>1.0</AppVersion>
</Properties>`),
    },
    {
      path: "word/document.xml",
      content: xmlBuffer(documentXml),
    },
    {
      path: "word/_rels/document.xml.rels",
      content: xmlBuffer(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`),
    },
    {
      path: "word/styles.xml",
      content: xmlBuffer(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:default="1" w:styleId="YTResearchNormal">
    <w:name w:val="YTResearchNormal"/>
    <w:qFormat/>
    <w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos"/><w:sz w:val="22"/></w:rPr>
  </w:style>
</w:styles>`),
    },
  ]);
}

export function reportExportStoragePath(input: {
  workspaceId: string;
  reportId: string;
  exportId: string;
  fileType: ReportExportFileType;
}): string {
  return buildReportExportObjectKey(input);
}

export function reportExportDownloadUrl(input: { reportId: string; exportId: string }): string {
  return `/api/reports/${encodeURIComponent(input.reportId)}/exports/${encodeURIComponent(input.exportId)}/download`;
}

export function reportExportContentType(fileType: ReportExportFileType): string {
  return fileType === "pdf"
    ? "application/pdf"
    : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
}

export function parseReportExportFileType(value: unknown): ReportExportFileType | null {
  return value === "pdf" || value === "docx" ? value : null;
}

export function reportExportFilename(report: Pick<ResearchReportDetail, "title">, fileType: ReportExportFileType): string {
  return `${slugify(report.title)}.${fileType}`;
}

function appendExecutiveSummary(lines: string[], value: unknown): void {
  if (!isRecord(value)) {
    return;
  }

  lines.push("", "## Executive Summary");
  if (typeof value.headline === "string") {
    lines.push("", value.headline);
  }
  appendStringList(lines, "Key Signals", value.keySignals);
}

function reportPlainTextLines(report: ResearchReportDetail, branding: ReportExportBranding): string[] {
  const markdown = renderResearchReportMarkdown(report);
  return [
    branding.workspaceName,
    branding.primaryNiche ? `Niche: ${branding.primaryNiche}` : null,
    branding.brandVoice ? `Brand voice: ${branding.brandVoice}` : null,
    branding.cta ? `CTA: ${branding.cta}` : null,
    "",
    ...markdown
      .split("\n")
      .map((line) => line.replace(/^#{1,6}\s+/, "").replace(/^- /, "* "))
      .filter((line) => line.trim().length > 0),
  ].filter((line): line is string => line !== null);
}

type PdfLine = {
  text: string;
  font: "F1" | "F2";
  size: number;
  leading: number;
  color: string;
  indent?: number;
};

function chunkLines(lines: PdfLine[], size: number): PdfLine[][] {
  const chunks: PdfLine[][] = [];
  for (let index = 0; index < lines.length; index += size) {
    chunks.push(lines.slice(index, index + size));
  }
  return chunks.length > 0 ? chunks : [[pdfLine("Report export", { font: "F2", size: 18 })]];
}

function pdfContentStream(lines: PdfLine[]): string {
  const commands: string[] = ["0.82 0.89 0.87 rg", "48 724 516 44 re", "f"];
  let y = 742;

  for (const line of lines) {
    if (line.text.length === 0) {
      y -= line.leading;
      continue;
    }

    commands.push("BT");
    commands.push(line.color);
    commands.push(`/${line.font} ${line.size} Tf`);
    commands.push(`${50 + (line.indent ?? 0)} ${y} Td`);
    commands.push(`(${escapePdfText(line.text)}) Tj`);
    commands.push("ET");
    y -= line.leading;
  }
  return commands.join("\n");
}

function reportPdfLines(report: ResearchReportDetail, branding: ReportExportBranding): PdfLine[] {
  const lines: PdfLine[] = [
    pdfLine(branding.workspaceName, { font: "F2", size: 12, leading: 16, color: "0.06 0.46 0.43 rg" }),
    pdfLine(branding.primaryNiche ? `Niche: ${branding.primaryNiche}` : "Research intelligence export", {
      size: 9,
      leading: 14,
      color: "0.25 0.30 0.36 rg",
    }),
    pdfLine("", { leading: 16 }),
    pdfLine(report.title, { font: "F2", size: 22, leading: 28, color: "0.06 0.09 0.16 rg" }),
    pdfLine(`${report.manualRun ? "Manual" : "Daily"} report | ${report.status} | ${formatDate(report.reportDate)}`, {
      size: 10,
      leading: 18,
      color: "0.30 0.35 0.42 rg",
    }),
  ];

  if (branding.brandVoice) {
    lines.push(pdfLine(`Brand voice: ${branding.brandVoice}`, { size: 10, leading: 16, color: "0.30 0.35 0.42 rg" }));
  }
  if (branding.cta) {
    lines.push(pdfLine(`CTA: ${branding.cta}`, { size: 10, leading: 16, color: "0.30 0.35 0.42 rg" }));
  }
  lines.push(pdfLine("", { leading: 12 }));

  for (const rawLine of renderResearchReportMarkdown(report).split("\n").slice(1)) {
    const line = rawLine.trim();
    if (!line) {
      lines.push(pdfLine("", { leading: 8 }));
      continue;
    }

    if (line.startsWith("## ")) {
      lines.push(...wrapPdfText(line.replace(/^##\s+/, ""), {
        font: "F2",
        size: 14,
        leading: 20,
        color: "0.06 0.46 0.43 rg",
        width: 72,
      }));
    } else if (line.startsWith("### ")) {
      lines.push(...wrapPdfText(line.replace(/^###\s+/, ""), {
        font: "F2",
        size: 12,
        leading: 17,
        color: "0.06 0.09 0.16 rg",
        width: 82,
      }));
    } else if (line.startsWith("- ")) {
      lines.push(...wrapPdfText(`* ${line.slice(2)}`, {
        size: 10,
        leading: 15,
        color: "0.12 0.16 0.22 rg",
        indent: 14,
        width: 90,
      }));
    } else {
      lines.push(...wrapPdfText(line, {
        size: 10,
        leading: 15,
        color: "0.12 0.16 0.22 rg",
        width: 86,
      }));
    }
  }

  return lines;
}

function pdfLine(
  text: string,
  options: Partial<Omit<PdfLine, "text">> & { width?: number } = {},
): PdfLine {
  return {
    text,
    font: options.font ?? "F1",
    size: options.size ?? 10,
    leading: options.leading ?? 14,
    color: options.color ?? "0.12 0.16 0.22 rg",
    indent: options.indent,
  };
}

function wrapPdfText(
  text: string,
  options: Partial<Omit<PdfLine, "text">> & { width: number },
): PdfLine[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: PdfLine[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > options.width && current) {
      lines.push(pdfLine(current, options));
      current = word;
    } else {
      current = candidate;
    }
  }

  if (current) {
    lines.push(pdfLine(current, options));
  }

  return lines;
}

function buildPdf(objects: string[]): Buffer {
  const parts = ["%PDF-1.4\n"];
  const offsets: number[] = [0];
  let byteLength = Buffer.byteLength(parts[0], "latin1");

  for (const [index, object] of objects.entries()) {
    offsets.push(byteLength);
    const objectText = `${index + 1} 0 obj\n${object}\nendobj\n`;
    parts.push(objectText);
    byteLength += Buffer.byteLength(objectText, "latin1");
  }

  const xrefOffset = byteLength;
  const xref = [
    `xref\n0 ${objects.length + 1}`,
    "0000000000 65535 f ",
    ...offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n `),
    "trailer",
    `<< /Size ${objects.length + 1} /Root 1 0 R >>`,
    "startxref",
    String(xrefOffset),
    "%%EOF",
  ].join("\n");
  parts.push(xref);
  return Buffer.from(parts.join(""), "latin1");
}

function escapePdfText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function renderDocumentXml(lines: string[]): string {
  const paragraphs = lines.map((line) => `<w:p><w:r><w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r></w:p>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>${paragraphs}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body>
</w:document>`;
}

function renderCorePropertiesXml(report: ResearchReportDetail): string {
  const created = (report.generatedAt ?? report.createdAt).toISOString();
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>${escapeXml(report.title)}</dc:title>
  <dc:creator>YTResearch</dc:creator>
  <cp:lastModifiedBy>YTResearch</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${created}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${created}</dcterms:modified>
</cp:coreProperties>`;
}

function xmlBuffer(value: string): Buffer {
  return Buffer.from(value, "utf8");
}

function buildZip(entries: Array<{ path: string; content: Buffer }>): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.path, "utf8");
    const compressed = deflateRawSync(entry.content);
    const crc = crc32(entry.content);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(8, 8);
    localHeader.writeUInt32LE(0, 10);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(entry.content.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    localHeader.writeUInt16LE(0, 28);
    localParts.push(localHeader, name, compressed);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(8, 10);
    centralHeader.writeUInt32LE(0, 12);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(entry.content.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(centralHeader, name);

    offset += localHeader.length + name.length + compressed.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const localFiles = Buffer.concat(localParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(localFiles.length, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([localFiles, centralDirectory, end]);
}

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function appendRecommendations(lines: string[], report: ResearchReportDetail): void {
  if (report.recommendations.length === 0) {
    return;
  }

  lines.push("", "## Recommended Topics");
  for (const recommendation of report.recommendations) {
    lines.push("", `### ${recommendation.topic}`);
    if (typeof recommendation.opportunityScore === "number") {
      lines.push(`Opportunity score: ${recommendation.opportunityScore.toFixed(0)}`);
    }
    if (recommendation.angle) {
      lines.push(`Angle: ${recommendation.angle}`);
    }
    if (recommendation.whyNow) {
      lines.push(`Why now: ${recommendation.whyNow}`);
    }
    if (recommendation.suggestedTitle) {
      lines.push(`Suggested title: ${recommendation.suggestedTitle}`);
    }
    for (const evidence of recommendation.evidences) {
      const label = evidence.video
        ? `${evidence.video.title} (${evidence.video.channel.title})`
        : evidence.sourceItem
          ? `${evidence.sourceItem.title} (${evidence.sourceItem.source.name ?? evidence.sourceItem.source.url})`
          : evidence.evidenceType;
      lines.push(`- Evidence: ${label}${evidence.note ? ` - ${evidence.note}` : ""}`);
    }
  }
}

function appendGenericList(lines: string[], title: string, value: unknown): void {
  if (!Array.isArray(value) || value.length === 0) {
    return;
  }

  lines.push("", `## ${title}`);
  for (const item of value) {
    if (isRecord(item)) {
      const label = stringValue(item.title) ?? stringValue(item.topic) ?? stringValue(item.headline);
      const url = stringValue(item.youtubeUrl) ?? stringValue(item.url);
      const detail = stringValue(item.channelTitle) ?? stringValue(item.sourceName);
      const linkedLabel = label && url ? `[${label}](${url})` : (label ?? JSON.stringify(item));
      lines.push(`- ${linkedLabel}${detail ? ` (${detail})` : ""}`);
    } else if (typeof item === "string") {
      lines.push(`- ${item}`);
    }
  }
}

function appendStringList(lines: string[], title: string, value: unknown): void {
  if (!Array.isArray(value) || value.length === 0) {
    return;
  }

  const items = value.filter((item): item is string => typeof item === "string" && item.length > 0);
  if (items.length === 0) {
    return;
  }

  lines.push("", `## ${title}`);
  for (const item of items) {
    lines.push(`- ${item}`);
  }
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(date);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return slug.length > 0 ? slug : "research-report";
}
