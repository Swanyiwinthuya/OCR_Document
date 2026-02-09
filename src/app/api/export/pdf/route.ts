import { PDFDocument, StandardFonts } from "pdf-lib";

export const runtime = "nodejs";

function sanitizePdfText(input: string) {
  if (!input) return "";
  return input
    .normalize("NFKC")
    .replace(/\uFB00/g, "ff")
    .replace(/\uFB01/g, "fi")
    .replace(/\uFB02/g, "fl")
    .replace(/\uFB03/g, "ffi")
    .replace(/\uFB04/g, "ffl")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2022/g, "-")
    .replace(/\u00A0/g, " ")
    .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, "");
}

function wrapLine(text: string, maxChars: number) {
  const out: string[] = [];
  let s = text.trim();
  while (s.length > maxChars) {
    out.push(s.slice(0, maxChars));
    s = s.slice(maxChars);
  }
  if (s.length) out.push(s);
  return out;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const title = sanitizePdfText(String(body.title ?? "OCR Document"));
    const docType = sanitizePdfText(String(body.docType ?? "Other"));
    const meanConfidence = Number(body.meanConfidence ?? 0);
    const sections = Array.isArray(body.sections) ? body.sections : [];

    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const pageSize: [number, number] = [595.28, 841.89]; // A4
    let page = pdfDoc.addPage(pageSize);

    const left = 50;
    const top = 800;
    const bottom = 60;
    const lineHeight = 14;
    let y = top;

    const newPage = () => {
      page = pdfDoc.addPage(pageSize);
      y = top;
    };

    const drawLine = (txt: string, isBold = false, size = 12) => {
      const safe = sanitizePdfText(txt);
      if (!safe) return;
      if (y < bottom) newPage();

      page.drawText(safe, {
        x: left,
        y,
        size,
        font: isBold ? bold : font,
      });
      y -= lineHeight;
    };

    // Header
    drawLine(title, true, 16);
    y -= 6;
    drawLine(`Document Type: ${docType}  |  Confidence: ${meanConfidence}%`, true, 11);
    y -= 10;

    for (const s of sections) {
      drawLine(String(s.heading ?? "Section"), true, 13);

      const content = sanitizePdfText(String(s.content ?? ""));
      const lines = content.split("\n").map((l) => l.trim()).filter(Boolean);

      for (const line of lines) {
        for (const w of wrapLine(line, 95)) {
          drawLine(w, false, 11);
        }
      }
      y -= 8;
    }

    // pdf-lib returns Uint8Array
    const bytes = await pdfDoc.save();

    // ✅ Make a *real* ArrayBuffer copy (NOT ArrayBufferLike / SharedArrayBuffer)
    const ab = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(ab).set(bytes);

    return new Response(ab, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="ocr.pdf"`,
      },
    });
  } catch (e: any) {
    return new Response(e?.message || "PDF export failed", { status: 500 });
  }
}
