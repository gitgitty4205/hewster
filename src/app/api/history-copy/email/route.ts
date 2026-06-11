import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { appThemes, type ThemeId } from "@/lib/pet-profile";
import { getSupabaseEnv } from "@/lib/supabase";

const resendApiKey = process.env.RESEND_API_KEY;
const resendFromEmail = process.env.RESEND_FROM_EMAIL || "PetNotebook <onboarding@resend.dev>";
const historyReplyToEmail = process.env.INVITE_REPLY_TO_EMAIL;
const petNotebookBrandName = "PetNotebook";

type ReportProfile = {
  petName: string;
  petFirstName: string;
  petLastName: string;
  species: string;
  breed: string;
  birthday: string;
  microchipNumber: string;
  age: string;
  sex: string;
  spayNeuterStatus: string;
  ownerName: string;
  notebookOwnerId: string;
  themeId: ThemeId;
};

type ReportImageReference = {
  id: string;
  activityId: string;
  fileName: string;
  filePath: string;
  contentType: string;
};

type ReportImage = ReportImageReference & {
  bytes: Buffer;
  width: number | null;
  height: number | null;
  pdfName: string;
};

function normalizeText(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function brandedSenderAddress(value: string) {
  const trimmed = normalizeWhitespace(value);
  const emailMatch = trimmed.match(/<([^<>]+)>$/);
  const emailAddress = emailMatch?.[1]?.trim() || trimmed;
  return `${petNotebookBrandName} <${emailAddress}>`;
}

function normalizeReportProfile(value: unknown): ReportProfile {
  const profile = value && typeof value === "object" ? value as Partial<Record<keyof ReportProfile, unknown>> : {};
  return {
    petName: normalizeWhitespace(normalizeText(profile.petName, "Pet")) || "Pet",
    petFirstName: normalizeText(profile.petFirstName),
    petLastName: normalizeText(profile.petLastName),
    species: normalizeText(profile.species),
    breed: normalizeText(profile.breed),
    birthday: normalizeText(profile.birthday),
    microchipNumber: normalizeText(profile.microchipNumber),
    age: normalizeText(profile.age),
    sex: normalizeText(profile.sex),
    spayNeuterStatus: normalizeText(profile.spayNeuterStatus),
    ownerName: normalizeText(profile.ownerName),
    notebookOwnerId: normalizeText(profile.notebookOwnerId),
    themeId: normalizeThemeId(profile.themeId),
  };
}

function normalizeReportImages(value: unknown): ReportImageReference[] {
  if (!Array.isArray(value)) return [];
  const images = new Map<string, ReportImageReference>();

  value.forEach((item) => {
    if (!item || typeof item !== "object") return;
    const record = item as Record<string, unknown>;
    const id = normalizeText(record.id);
    const activityId = normalizeText(record.activityId);
    const fileName = normalizeText(record.fileName, "attachment") || "attachment";
    const filePath = normalizeText(record.filePath);
    const contentType = normalizeText(record.contentType);

    if (!id || !activityId || !filePath) return;

    images.set(id, {
      id,
      activityId,
      fileName,
      filePath,
      contentType: contentType || "application/octet-stream",
    });
  });

  return [...images.values()];
}

function normalizeThemeId(value: unknown): ThemeId {
  return typeof value === "string" && value in appThemes ? value as ThemeId : "slate";
}

function formatReportValue(value: string) {
  return value || "Not listed";
}

function titleCase(value: string) {
  return value ? value[0].toUpperCase() + value.slice(1) : "";
}

function possessiveName(value: string) {
  return value.endsWith("s") ? `${value}'` : `${value}'s`;
}

function userDisplayName(user: { email?: string; user_metadata?: Record<string, unknown> }) {
  const metadata = user.user_metadata ?? {};
  const firstName = normalizeText(metadata.first_name);
  const lastName = normalizeText(metadata.last_name);
  const fullName = normalizeText(metadata.full_name);
  return [firstName, lastName].filter(Boolean).join(" ") || fullName || user.email || "";
}

function displayNameFromEmail(email: string) {
  const localPart = email.split("@")[0] ?? "";
  return localPart
    .split(/[._-]+/)
    .map((part) => titleCase(part))
    .filter(Boolean)
    .join(" ") || email;
}

async function resolveReportOwnerName(
  supabase: SupabaseClient,
  user: { id: string; email?: string; user_metadata?: Record<string, unknown> },
  reportProfile: ReportProfile,
) {
  if (!reportProfile.notebookOwnerId || reportProfile.notebookOwnerId === user.id) {
    return reportProfile.ownerName || userDisplayName(user);
  }

  const { data } = await supabase
    .from("notebook_members")
    .select("member_email, role, status")
    .eq("notebook_owner_id", reportProfile.notebookOwnerId)
    .eq("role", "owner")
    .eq("status", "active")
    .maybeSingle();

  const ownerRow = data as { member_email?: unknown } | null;
  const ownerEmail = typeof ownerRow?.member_email === "string" ? ownerRow.member_email.trim() : "";
  return ownerEmail ? displayNameFromEmail(ownerEmail) : reportProfile.ownerName || userDisplayName(user);
}

function formatProfileDate(value: string) {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function formatGeneratedDate(value: string) {
  if (value) return value;
  return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" }).format(new Date());
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapePdfString(value: string) {
  return value
    .replaceAll("💩", "Poop")
    .replaceAll("💧", "Pee")
    .replace(/[^\x20-\x7E]/g, "")
    .replaceAll("\\", "\\\\")
    .replaceAll("(", "\\(")
    .replaceAll(")", "\\)")
    .replaceAll("\r", "");
}

function wrapPdfLine(line: string, maxChars = 92) {
  const words = line.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  if (!words.length) return [""];

  words.forEach((word) => {
    if (word.length > maxChars) {
      if (current) lines.push(current);
      for (let index = 0; index < word.length; index += maxChars) {
        lines.push(word.slice(index, index + maxChars));
      }
      current = "";
      return;
    }

    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  });

  if (current) lines.push(current);
  return lines;
}

function pdfText(value: string, x: number, y: number, size: number, font = "F1") {
  return `BT /${font} ${size} Tf ${x} ${y} Td (${escapePdfString(value)}) Tj ET`;
}

function pdfTextLines(lines: string[], x: number, y: number, size: number, leading: number, font = "F1") {
  return lines.map((line, index) => pdfText(line, x, y - index * leading, size, font)).join("\n");
}

function pdfRoundedRectPath(x: number, y: number, width: number, height: number, radius: number) {
  const right = x + width;
  const top = y + height;
  const curve = radius * 0.5522847498;

  return [
    `${x + radius} ${y} m`,
    `${right - radius} ${y} l`,
    `${right - radius + curve} ${y} ${right} ${y + radius - curve} ${right} ${y + radius} c`,
    `${right} ${top - radius} l`,
    `${right} ${top - radius + curve} ${right - radius + curve} ${top} ${right - radius} ${top} c`,
    `${x + radius} ${top} l`,
    `${x + radius - curve} ${top} ${x} ${top - radius + curve} ${x} ${top - radius} c`,
    `${x} ${y + radius} l`,
    `${x} ${y + radius - curve} ${x + radius - curve} ${y} ${x + radius} ${y} c`,
    "h",
  ].join(" ");
}

function pdfRoundedRect(x: number, y: number, width: number, height: number, radius: number, paint: "f" | "S") {
  return `${pdfRoundedRectPath(x, y, width, height, radius)} ${paint}`;
}

function hexToPdfRgb(value: string) {
  const hex = value.trim().replace(/^#/, "");
  if (!/^[0-9a-f]{6}$/i.test(hex)) return "0.39 0.43 0.40";

  const parts = [hex.slice(0, 2), hex.slice(2, 4), hex.slice(4, 6)];
  return parts
    .map((part) => (parseInt(part, 16) / 255).toFixed(3).replace(/0+$/, "").replace(/\.$/, ""))
    .join(" ");
}

function pdfColor(value: string, operator: "rg" | "RG") {
  return `${hexToPdfRgb(value)} ${operator}`;
}

function pdfReportTheme(themeId: ThemeId) {
  const theme = appThemes[themeId] ?? appThemes.slate;
  return {
    accent: pdfColor(theme.accent, "rg"),
    accentStroke: pdfColor(theme.accent, "RG"),
    cardFill: pdfColor(theme.activeBg, "rg"),
    cardStroke: pdfColor(theme.ring, "RG"),
    neutral: "0.15 0.15 0.17 rg",
    metadata: "0.45 0.45 0.48 rg",
  };
}

function pdfReportHeader(petName: string, theme = pdfReportTheme("slate")) {
  return [
    `${theme.cardFill} ${pdfRoundedRect(50, 720, 28, 28, 8, "f")}`,
    `${theme.cardStroke} ${pdfRoundedRect(50, 720, 28, 28, 8, "S")}`,
    theme.accent,
    pdfText("PN", 56, 731, 10, "F2"),
    pdfText(petNotebookBrandName, 92, 740, 12, "F2"),
    pdfText(`${petName} History Report`, 92, 720, 18, "F2"),
    `${theme.cardStroke} 50 704 m 562 704 l S`,
    theme.neutral,
  ];
}

function jpegDimensions(bytes: Buffer) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;

  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = bytes[offset + 1];
    if (marker >= 0xc0 && marker <= 0xc3) {
      return {
        height: bytes.readUInt16BE(offset + 5),
        width: bytes.readUInt16BE(offset + 7),
      };
    }

    if (marker === 0xd9 || marker === 0xda) break;
    const segmentLength = bytes.readUInt16BE(offset + 2);
    if (!segmentLength) break;
    offset += 2 + segmentLength;
  }

  return null;
}

function isJpegContentType(value: string) {
  const normalized = value.toLowerCase();
  return normalized === "image/jpeg" || normalized === "image/jpg";
}

function pdfImageDraw(name: string, x: number, y: number, width: number, height: number) {
  return `q ${width} 0 0 ${height} ${x} ${y} cm /${name} Do Q`;
}

function buildHistoryPdf(text: string, options: {
  petName: string;
  reportProfile: ReportProfile;
  ownerName: string;
  filterLabel: string;
  dateRange: string;
  generatedDate: string;
  matchingDays: number;
  reportImages?: ReportImage[];
}) {
  const historyEntries = (text.split("\nHistory\n").pop() ?? text.split("\nFiltered History\n").pop() ?? text.split("\nHistory Entries\n").pop())?.trim() || "No records match this filter.";
  const reportTheme = pdfReportTheme(options.reportProfile.themeId);

  const objects: string[] = [];
  const addObject = (value: string) => {
    objects.push(value);
    return objects.length;
  };

  const catalogObjectId = addObject("<< /Type /Catalog /Pages 2 0 R >>");
  const pagesObjectId = addObject("");
  const fontObjectId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const boldFontObjectId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
  const reportImages = options.reportImages ?? [];
  const reportImagesByActivityId = new Map<string, ReportImage[]>();
  const pdfImageObjects = new Map<string, number>();

  reportImages.forEach((image) => {
    const current = reportImagesByActivityId.get(image.activityId) ?? [];
    reportImagesByActivityId.set(image.activityId, [...current, image]);

    if (!image.width || !image.height || !isJpegContentType(image.contentType)) return;
    const hexData = `${image.bytes.toString("hex")}>`;
    const imageObjectId = addObject(`<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter [ /ASCIIHexDecode /DCTDecode ] /Length ${hexData.length} >>
stream
${hexData}
endstream`);
    pdfImageObjects.set(image.id, imageObjectId);
  });
  const pageStreams: string[] = [];
  const pageObjectIds: number[] = [];

  const addPage = (stream: string) => {
    pageStreams.push(stream);
  };

  const profileRows = [
    ["Name", options.petName],
    ["Species", formatReportValue(options.reportProfile.species)],
    ["Breed", formatReportValue(options.reportProfile.breed)],
    ["Birthdate", formatReportValue(formatProfileDate(options.reportProfile.birthday))],
    ["Microchip #", formatReportValue(options.reportProfile.microchipNumber)],
    ["Age", formatReportValue(options.reportProfile.age)],
    ["Gender", formatReportValue(titleCase(options.reportProfile.sex))],
    ["Spay/Neuter", formatReportValue(titleCase(options.reportProfile.spayNeuterStatus))],
    ["Owner", formatReportValue(options.ownerName)],
  ];
  const summaryRows = [
    ["Filter", options.filterLabel],
    ["Date Range", options.dateRange],
    ["Matching Days", String(options.matchingDays)],
    ["Report Generated", options.generatedDate],
  ];

  const firstPage: string[] = [
    ...pdfReportHeader(options.petName, reportTheme),
    `${reportTheme.cardFill} ${pdfRoundedRect(50, 520, 294, 163, 18, "f")}`,
    `${reportTheme.cardStroke} ${pdfRoundedRect(50, 520, 294, 163, 18, "S")}`,
    reportTheme.accent,
    pdfText("PET INFORMATION", 72, 660, 11, "F2"),
    reportTheme.neutral,
    `${reportTheme.cardFill} ${pdfRoundedRect(356, 520, 206, 163, 18, "f")}`,
    `${reportTheme.cardStroke} ${pdfRoundedRect(356, 520, 206, 163, 18, "S")}`,
    reportTheme.accent,
    pdfText("REPORT SUMMARY", 378, 660, 11, "F2"),
    reportTheme.neutral,
  ];

  profileRows.forEach(([label, value], index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const x = column === 0 ? 72 : 214;
    const y = 638 - row * 22;
    const valueX = x + label.length * 5.1 + 14;
    firstPage.push(pdfText(`${label}:`, x, y, 10, "F2"));
    firstPage.push(pdfTextLines(wrapPdfLine(value, column === 0 ? 22 : 15), valueX, y, 10, 12));
  });

  summaryRows.forEach(([label, value], index) => {
    const y = 638 - index * 26;
    const labelX = 378;
    const valueX = labelX + label.length * 4.7 + 9;
    const maxChars = label === "Date Range" ? 30 : 22;
    const valueLines = wrapPdfLine(value, maxChars);
    firstPage.push(pdfText(`${label}:`, labelX, y, 9, "F2"));
    firstPage.push(pdfTextLines(valueLines, valueX, y, 9, 11));
  });

  firstPage.push(reportTheme.accent);
  firstPage.push(pdfText("HISTORY", 50, 486, 12, "F2"));
  firstPage.push(reportTheme.neutral);

  let y = 462;
  let pageCommands = firstPage;
  const finishPage = () => {
    addPage(pageCommands.join("\n"));
    pageCommands = [
      ...pdfReportHeader(options.petName, reportTheme),
    ];
    y = 690;
  };

  historyEntries.split("\n").forEach((rawLine) => {
    const reportImageMatch = rawLine.match(/^__REPORT_IMAGES__:(.+)$/);
    if (reportImageMatch) {
      const images = reportImagesByActivityId.get(reportImageMatch[1]) ?? [];
      const embeddedImages = images.filter((image) => pdfImageObjects.has(image.id));
      if (!embeddedImages.length) return;

      const thumbnailWidth = 98;
      const gap = 10;
      const rows = Math.ceil(embeddedImages.length / 4);
      const blockHeight = rows * 86 + 10;

      if (y - blockHeight < 54) finishPage();

      embeddedImages.forEach((image, index) => {
        const objectId = pdfImageObjects.get(image.id);
        if (!objectId || !image.width || !image.height) return;

        const column = index % 4;
        const row = Math.floor(index / 4);
        const aspect = image.width / image.height;
        const drawWidth = aspect >= 1 ? thumbnailWidth : Math.min(thumbnailWidth, 74 * aspect);
        const drawHeight = aspect >= 1 ? Math.min(74, thumbnailWidth / aspect) : 74;
        const x = 74 + column * (thumbnailWidth + gap) + (thumbnailWidth - drawWidth) / 2;
        const imageTop = y - row * 86;
        const imageY = imageTop - drawHeight;

        pageCommands.push(pdfImageDraw(image.pdfName, x, imageY, drawWidth, drawHeight));
      });

      y -= blockHeight;
      return;
    }

    const trimmedLine = rawLine.trim();
    const isDateLine = /^[A-Z][a-z]{2},/.test(rawLine);
    const isLoggingDetailsHeader = trimmedLine === "Logging details:";
    const isLoggingMetadata = /^(Logged by|Logged on|Updated by|Updated on|Last edited by|Last edited on):/.test(trimmedLine);
    const fontSize = isDateLine ? 12 : isLoggingMetadata ? 8.5 : isLoggingDetailsHeader ? 9 : 10;
    const lineHeight = isDateLine ? 16 : isLoggingMetadata ? 11 : isLoggingDetailsHeader ? 12 : 13;
    const wrappedLines = wrapPdfLine(rawLine, isDateLine ? 70 : isLoggingMetadata ? 96 : 86);
    const blockHeight = wrappedLines.length * lineHeight + (isDateLine ? 6 : 2);

    if (y - blockHeight < 54) finishPage();

    if (isDateLine) {
      pageCommands.push(reportTheme.neutral);
      pageCommands.push(pdfTextLines(wrappedLines, 50, y, 12, lineHeight, "F2"));
      pageCommands.push(reportTheme.neutral);
    } else if (isLoggingDetailsHeader) {
      pageCommands.push(reportTheme.metadata);
      pageCommands.push(pdfTextLines(wrappedLines, 64, y, fontSize, lineHeight, "F2"));
      pageCommands.push(reportTheme.neutral);
    } else if (isLoggingMetadata) {
      pageCommands.push(reportTheme.metadata);
      pageCommands.push(pdfTextLines(wrappedLines, 76, y, fontSize, lineHeight));
      pageCommands.push(reportTheme.neutral);
    } else if (rawLine.trim()) {
      pageCommands.push(pdfTextLines(wrappedLines, 64, y, fontSize, lineHeight));
    }
    y -= blockHeight;
  });

  addPage(pageCommands.join("\n"));

  pageStreams.forEach((stream, index) => {
    const pageNumberText = `Page ${index + 1} of ${pageStreams.length}`;
    const streamWithFooter = [
      stream,
      reportTheme.accent,
      pdfText(pageNumberText, 510, 28, 9),
    ].join("\n");
    const streamObjectId = addObject(`<< /Length ${Buffer.byteLength(streamWithFooter, "utf8")} >>
stream
${streamWithFooter}
endstream`);
    const xObjectResources = pdfImageObjects.size
      ? ` /XObject << ${[...pdfImageObjects.entries()].map(([imageId, objectId]) => {
          const image = reportImages.find((entry) => entry.id === imageId);
          return image ? `/${image.pdfName} ${objectId} 0 R` : "";
        }).filter(Boolean).join(" ")} >>`
      : "";
    const pageObjectId = addObject(`<< /Type /Page /Parent ${pagesObjectId} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontObjectId} 0 R /F2 ${boldFontObjectId} 0 R >>${xObjectResources} >> /Contents ${streamObjectId} 0 R >>`);
    pageObjectIds.push(pageObjectId);
  });

  objects[pagesObjectId - 1] = `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageObjectIds.length} >>`;

  const bodyParts = ["%PDF-1.4\n"];
  const offsets = [0];

  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(bodyParts.join(""), "utf8"));
    bodyParts.push(`${index + 1} 0 obj\n${object}\nendobj\n`);
  });

  const xrefOffset = Buffer.byteLength(bodyParts.join(""), "utf8");
  bodyParts.push(`xref\n0 ${objects.length + 1}\n`);
  bodyParts.push("0000000000 65535 f \n");
  offsets.slice(1).forEach((offset) => {
    bodyParts.push(`${String(offset).padStart(10, "0")} 00000 n \n`);
  });
  bodyParts.push(`trailer\n<< /Size ${objects.length + 1} /Root ${catalogObjectId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);

  return Buffer.from(bodyParts.join(""), "utf8");
}

function entityRefId(userId: string) {
  const input = `${userId}:history-copy:${new Date().toISOString().slice(0, 10)}`;
  return `pet-notebook-history-${Buffer.from(input, "utf8").toString("base64url")}`;
}

async function fetchReportImages(supabase: SupabaseClient, references: ReportImageReference[]) {
  const images: ReportImage[] = [];

  for (const [index, reference] of references.entries()) {
    const { data, error } = await supabase.storage.from("pet-attachments").download(reference.filePath);
    if (error || !data) continue;

    const bytes = Buffer.from(await data.arrayBuffer());
    const contentType = (data.type || reference.contentType || "image/jpeg").toLowerCase();
    const dimensions = jpegDimensions(bytes);

    images.push({
      ...reference,
      contentType,
      bytes,
      width: dimensions?.width ?? null,
      height: dimensions?.height ?? null,
      pdfName: `Im${index + 1}`,
    });
  }

  return images;
}

export async function POST(request: Request) {
  const { url, anonKey } = getSupabaseEnv();
  const authorization = request.headers.get("authorization");

  if (!url || !anonKey || !authorization) {
    return NextResponse.json({ sent: false, error: "Sign in again before sending the history report." }, { status: 401 });
  }

  const body = await request.json().catch(() => null) as {
    text?: unknown;
    filterLabel?: unknown;
    dateRange?: unknown;
    generatedDate?: unknown;
    matchingDays?: unknown;
    profile?: unknown;
    reportImages?: unknown;
  } | null;
  const historyText = normalizeText(body?.text);
  const filterLabel = normalizeText(body?.filterLabel, "All");
  const dateRange = normalizeText(body?.dateRange, "All dates");
  const generatedDate = formatGeneratedDate(normalizeText(body?.generatedDate));
  const matchingDays = typeof body?.matchingDays === "number" ? body.matchingDays : 0;
  const reportProfile = normalizeReportProfile(body?.profile);
  const reportImageReferences = normalizeReportImages(body?.reportImages);

  if (!historyText) {
    return NextResponse.json({ sent: false, error: "There is no history report to send." }, { status: 400 });
  }

  const supabase = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser();
  const user = userData.user;
  const accountEmail = user?.email?.trim().toLowerCase();

  if (userError || !user || !accountEmail) {
    return NextResponse.json({ sent: false, error: "Sign in again before sending the history report." }, { status: 401 });
  }

  if (!resendApiKey) {
    return NextResponse.json({ sent: false, error: "Email sending is not configured." }, { status: 500 });
  }

  const petName = normalizeWhitespace(reportProfile.petName || "Pet");
  const ownerName = await resolveReportOwnerName(supabase, user, reportProfile);
  const reportImages = await fetchReportImages(supabase, reportImageReferences);

  const pdf = buildHistoryPdf(historyText, { petName, reportProfile, ownerName, filterLabel, dateRange, generatedDate, matchingDays, reportImages });
  const filenamePetName = petName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "pet";
  const filename = `${filenamePetName}-history-report-${new Date().toISOString().slice(0, 10)}.pdf`;
  const safePossessivePetName = escapeHtml(possessiveName(petName));
  const safeFilterLabel = escapeHtml(filterLabel);
  const safeDateRange = escapeHtml(dateRange);
  const safeGeneratedDate = escapeHtml(generatedDate);

  const html = `<!doctype html>
<html>
  <body style="font-family: Arial, sans-serif; color: #27272a; line-height: 1.5; margin: 0; padding: 24px;">
    <p>${petNotebookBrandName}</p>
    <h1 style="font-size: 24px; line-height: 1.2; margin: 0 0 16px;">${safePossessivePetName} History Report is attached</h1>
    <div style="border: 1px solid #e4e4e7; border-radius: 12px; padding: 16px;">
      <h2 style="font-size: 14px; margin: 0 0 10px; text-transform: uppercase; letter-spacing: .08em; color: #71717a;">Report Summary</h2>
      <p style="margin: 4px 0;"><strong>Filter:</strong> ${safeFilterLabel}</p>
      <p style="margin: 4px 0;"><strong>Date Range:</strong> ${safeDateRange}</p>
      <p style="margin: 4px 0;"><strong>Matching Days:</strong> ${matchingDays}</p>
      <p style="margin: 4px 0;"><strong>Report Generated:</strong> ${safeGeneratedDate}</p>
    </div>
  </body>
</html>`;

  const text = `${petNotebookBrandName}\n\n${possessiveName(petName)} History Report is attached.\n\nReport Summary\nFilter: ${filterLabel}\nDate Range: ${dateRange}\nMatching Days: ${matchingDays}\nReport Generated: ${generatedDate}`;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: brandedSenderAddress(resendFromEmail),
      to: accountEmail,
      subject: `${petName} History Report`,
      html,
      text,
      ...(historyReplyToEmail ? { reply_to: historyReplyToEmail } : {}),
      attachments: [
        {
          filename,
          content: pdf.toString("base64"),
        },
        ...reportImages.map((image, index) => ({
          filename: image.fileName || `attachment-${index + 1}`,
          content: image.bytes.toString("base64"),
          content_type: image.contentType,
        })),
      ],
      headers: {
        "Auto-Submitted": "auto-generated",
        "X-Entity-Ref-ID": entityRefId(user.id),
        "X-Pet-Notebook-Message-Type": "history-copy",
      },
      tags: [
        { name: "message_type", value: "history_copy" },
      ],
    }),
  });

  const result = await response.json().catch(() => null);

  if (!response.ok) {
    return NextResponse.json({ sent: false, error: "Email provider rejected the history report.", detail: result }, { status: 502 });
  }

  return NextResponse.json({ sent: true, id: result?.id ?? null, email: accountEmail });
}
