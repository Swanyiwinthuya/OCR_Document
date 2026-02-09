import { NextResponse } from "next/server";
import { Document, Packer, Paragraph, HeadingLevel, TextRun } from "docx";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const title = String(body.title ?? "OCR Document");
    const docType = String(body.docType ?? "Other");
    const meanConfidence = Number(body.meanConfidence ?? 0);
    const sections = Array.isArray(body.sections) ? body.sections : [];

    const children: Paragraph[] = [];

    children.push(
      new Paragraph({
        text: title,
        heading: HeadingLevel.TITLE,
      })
    );

    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `Document Type: ${docType}  |  Confidence: ${meanConfidence}%`,
            bold: true,
          }),
        ],
      })
    );

    children.push(new Paragraph({ text: "" }));

    for (const s of sections) {
      children.push(
        new Paragraph({
          text: String(s.heading ?? "Section"),
          heading: HeadingLevel.HEADING_1,
        })
      );

      const content = String(s.content ?? "");
      const lines = content.split("\n").filter(Boolean);
      for (const line of lines) {
        children.push(new Paragraph({ text: line }));
      }
      children.push(new Paragraph({ text: "" }));
    }

    const doc = new Document({ sections: [{ children }] });

    // Buffer (Node) -> Uint8Array (Web BodyInit compatible)
    const buffer = await Packer.toBuffer(doc);
    const bytes = new Uint8Array(buffer);

    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="ocr.docx"`,
      },
    });
  } catch (e: any) {
    return new NextResponse(e?.message || "DOCX export failed", { status: 500 });
  }
}
