import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const title = String(body.title ?? "Untitled").slice(0, 120);
    const rawText = String(body.rawText ?? "");
    const sections = body.sections;
    const scannedFound = !!body.scannedFound;
    const docType = String(body.docType ?? "Other");
    const meanConfidence = Number(body.meanConfidence ?? 0);

    if (!rawText.trim() || !Array.isArray(sections)) {
      return new NextResponse("Missing rawText or sections", { status: 400 });
    }

    const sb = supabaseServer();
    const { data, error } = await sb
      .from("documents")
      .insert([
        {
          title,
          raw_text: rawText,
          sections,
          scanned_found: scannedFound,
          doc_type: docType,
          mean_confidence: meanConfidence,
        },
      ])
      .select("*")
      .single();

    if (error) return new NextResponse(error.message, { status: 500 });
    return NextResponse.json(data);
  } catch (e: any) {
    return new NextResponse(e?.message || "Server error", { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const q = (url.searchParams.get("q") || "").trim();
    const from = url.searchParams.get("from"); // YYYY-MM-DD
    const to = url.searchParams.get("to");     // YYYY-MM-DD

    const sb = supabaseServer();

    let query = sb
      .from("documents")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);

    if (q) {
      // Search in title OR raw_text
      // Supabase OR syntax:
      query = query.or(`title.ilike.%${q}%,raw_text.ilike.%${q}%`);
    }

    if (from) query = query.gte("created_at", `${from}T00:00:00.000Z`);
    if (to) query = query.lte("created_at", `${to}T23:59:59.999Z`);

    const { data, error } = await query;
    if (error) return new NextResponse(error.message, { status: 500 });

    return NextResponse.json(data ?? []);
  } catch (e: any) {
    return new NextResponse(e?.message || "Server error", { status: 500 });
  }
}
