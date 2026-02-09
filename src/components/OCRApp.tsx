"use client";

import { useEffect, useMemo, useState } from "react";
import Cropper from "react-easy-crop";
import OpenCVScript from "./OpenCVScript";

import { autoScanDocument } from "@/lib/opencvScan";
import { runOCRDetailed, type OcrWord } from "@/lib/ocr";
import { categorizeText } from "@/lib/categorize";
import { classifyDocType } from "@/lib/classifyDocType";

type Section = { heading: string; content: string };

type LocalDoc = {
  id: string;
  createdAt: string;
  title: string;
  scannedFound: boolean;
  docType: string;
  meanConfidence: number;
  rawText: string;
  sections: Section[];
  words: OcrWord[];
};

type CloudDoc = {
  id: string;
  created_at: string;
  title: string;
  raw_text: string;
  sections: Section[];
  scanned_found: boolean;
  doc_type: string;
  mean_confidence: number;
};

function uid(): string {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function downloadFromApi(
  apiPath: string,
  payload: unknown,
  filename: string
): Promise<void> {
  const res = await fetch(apiPath, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const msg = await res.text();
    throw new Error(msg);
  }

  const blob = await res.blob();
  downloadBlob(filename, blob);
}

function buildConfidenceLines(words: OcrWord[]): OcrWord[][] {
  const lines: OcrWord[][] = [];
  let currentKey: string | null = null;
  let current: OcrWord[] = [];

  for (const w of words) {
    const key = `${w.page_num}-${w.block_num}-${w.par_num}-${w.line_num}`;

    if (currentKey === null) currentKey = key;

    if (key !== currentKey) {
      if (current.length) lines.push(current);
      current = [];
      currentKey = key;
    }

    if (w.text?.trim()) current.push(w);
  }

  if (current.length) lines.push(current);
  return lines;
}

export default function OCRApp() {
  // image + scan
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [imageEl, setImageEl] = useState<HTMLImageElement | null>(null);
  const [scannedUrl, setScannedUrl] = useState<string | null>(null);
  const [scannedFound, setScannedFound] = useState<boolean>(true);

  // manual crop fallback
  const [useManualCrop, setUseManualCrop] = useState<boolean>(false);
  const [crop, setCrop] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState<number>(1);
  const [croppedPixels, setCroppedPixels] = useState<{
    width: number;
    height: number;
    x: number;
    y: number;
  } | null>(null);

  // OCR
  const [busy, setBusy] = useState<boolean>(false);
  const [ocrProgress, setOcrProgress] = useState<number>(0);
  const [rawText, setRawText] = useState<string>("");
  const [sections, setSections] = useState<Section[]>([]);
  const [words, setWords] = useState<OcrWord[]>([]);
  const [meanConfidence, setMeanConfidence] = useState<number>(0);

  // classification + highlight settings
  const [docType, setDocType] = useState<string>("Other");
  const [docTypeConfidence, setDocTypeConfidence] = useState<string>("Low");
  const [lowConfThreshold, setLowConfThreshold] = useState<number>(70);

  // Local history
  const [history, setHistory] = useState<LocalDoc[]>([]);

  // Cloud docs + search
  const [cloudDocs, setCloudDocs] = useState<CloudDoc[]>([]);
  const [cloudLoading, setCloudLoading] = useState<boolean>(false);
  const [searchQ, setSearchQ] = useState<string>("");
  const [searchFrom, setSearchFrom] = useState<string>("");
  const [searchTo, setSearchTo] = useState<string>("");

  const displayUrl = useMemo(() => scannedUrl ?? fileUrl, [scannedUrl, fileUrl]);
  const confidenceLines = useMemo(() => buildConfidenceLines(words), [words]);

  // Load local history
  useEffect(() => {
    const saved = localStorage.getItem("ocr_docs_v2");
    if (saved) {
      try {
        setHistory(JSON.parse(saved) as LocalDoc[]);
      } catch {
        setHistory([]);
      }
    }
  }, []);

  // Save local history
  useEffect(() => {
    localStorage.setItem("ocr_docs_v2", JSON.stringify(history));
  }, [history]);

  // Cleanup object URL
  useEffect(() => {
    return () => {
      if (fileUrl) URL.revokeObjectURL(fileUrl);
    };
  }, [fileUrl]);

  async function onPickFile(file: File): Promise<void> {
    const url = URL.createObjectURL(file);
    setFileUrl(url);

    // reset
    setScannedUrl(null);
    setScannedFound(true);
    setUseManualCrop(false);
    setCroppedPixels(null);

    setRawText("");
    setSections([]);
    setWords([]);
    setMeanConfidence(0);
    setDocType("Other");
    setDocTypeConfidence("Low");
    setOcrProgress(0);

    const img = new Image();
    img.onload = () => setImageEl(img);
    img.src = url;
  }

  async function doAutoScan(): Promise<void> {
    if (!imageEl) return;
    setBusy(true);
    try {
      const res = await autoScanDocument(imageEl);
      setScannedUrl(res.warpedDataUrl);
      setScannedFound(res.found);

      // enable manual crop if scan failed
      setUseManualCrop(!res.found);
      setCroppedPixels(null);
    } catch (e) {
      console.error(e);
      alert("Auto crop failed. Turn on manual crop and try again.");
      setUseManualCrop(true);
    } finally {
      setBusy(false);
    }
  }

  async function getCroppedImageDataUrl(): Promise<string> {
    // If manual crop OFF, use scannedUrl if exists, else original
    if (!useManualCrop) return scannedUrl ?? fileUrl ?? "";

    if (!fileUrl || !croppedPixels) return fileUrl ?? "";

    const img = new Image();
    img.src = fileUrl;
    await new Promise<void>((resolve) => {
      img.onload = () => resolve();
    });

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return fileUrl ?? "";

    const { width, height, x, y } = croppedPixels;
    canvas.width = Math.max(1, Math.floor(width));
    canvas.height = Math.max(1, Math.floor(height));

    ctx.drawImage(
      img,
      Math.floor(x),
      Math.floor(y),
      Math.floor(width),
      Math.floor(height),
      0,
      0,
      Math.floor(width),
      Math.floor(height)
    );

    return canvas.toDataURL("image/jpeg", 0.92);
  }

  async function doOCR(): Promise<void> {
    if (!displayUrl && !fileUrl) return;

    setBusy(true);
    setOcrProgress(0);

    try {
      const imgUrl = await getCroppedImageDataUrl();
      const result = await runOCRDetailed(imgUrl, (p) => setOcrProgress(p));

      setRawText(result.text);
      setWords(result.words);
      setMeanConfidence(result.meanConfidence);

      const cats = categorizeText(result.text) as Section[];
      setSections(cats);

      const cls = classifyDocType(result.text);
      setDocType(cls.type);
      setDocTypeConfidence(cls.confidence);
    } catch (e) {
      console.error(e);
      alert("OCR failed. Try clearer photo, or manual crop, or better lighting.");
    } finally {
      setBusy(false);
    }
  }

  function saveLocal(): void {
    if (!rawText) return;

    const title =
      rawText
        .split("\n")
        .map((l) => l.trim())
        .find((l) => l.length > 0)
        ?.slice(0, 60) || "Untitled";

    const doc: LocalDoc = {
      id: uid(),
      createdAt: new Date().toISOString(),
      title,
      scannedFound,
      docType,
      meanConfidence,
      rawText,
      sections,
      words,
    };

    setHistory((h) => [doc, ...h]);
  }

  async function saveCloud(): Promise<void> {
    if (!rawText || sections.length === 0) {
      alert("Run OCR first.");
      return;
    }

    const title =
      rawText.split("\n").find((l) => l.trim().length > 0)?.slice(0, 80) ||
      "Untitled";

    const res = await fetch("/api/documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        rawText,
        sections,
        scannedFound,
        docType,
        meanConfidence,
      }),
    });

    if (!res.ok) {
      const msg = await res.text();
      alert("Cloud save failed: " + msg);
      return;
    }

    alert("Saved to cloud ✅");
    await loadCloud();
  }

  async function loadCloud(): Promise<void> {
    setCloudLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchQ.trim()) params.set("q", searchQ.trim());
      if (searchFrom) params.set("from", searchFrom);
      if (searchTo) params.set("to", searchTo);

      const res = await fetch(`/api/documents?${params.toString()}`);
      if (!res.ok) {
        const msg = await res.text();
        alert("Cloud load failed: " + msg);
        return;
      }

      const data = (await res.json()) as CloudDoc[];
      setCloudDocs(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      alert("Cloud load failed. Check /api/documents route + env vars.");
    } finally {
      setCloudLoading(false);
    }
  }

  async function exportPDF(): Promise<void> {
    if (!sections.length) return alert("Run OCR first.");

    const title =
      rawText.split("\n").find((l) => l.trim())?.slice(0, 80) || "OCR Document";

    try {
      await downloadFromApi(
        "/api/export/pdf",
        { title, docType, meanConfidence, sections },
        "ocr.pdf"
      );
    } catch (e: any) {
      alert("PDF export failed: " + (e?.message || String(e)));
    }
  }

  async function exportDOCX(): Promise<void> {
    if (!sections.length) return alert("Run OCR first.");

    const title =
      rawText.split("\n").find((l) => l.trim())?.slice(0, 80) || "OCR Document";

    try {
      await downloadFromApi(
        "/api/export/docx",
        { title, docType, meanConfidence, sections },
        "ocr.docx"
      );
    } catch (e: any) {
      alert("DOCX export failed: " + (e?.message || String(e)));
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <OpenCVScript />

      <div className="mx-auto max-w-6xl p-6 space-y-6">
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold">OCR Document Categorizer (Pro)</h1>
          <p className="text-sm text-gray-300">
            Wide-angle photo → auto crop document → OCR (confidence) → categorize →
            doc type classify → export PDF/DOCX → cloud search.
          </p>
        </header>

        <section className="rounded-2xl border border-gray-800 bg-gray-900/40 p-4 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-gray-100 px-4 py-2 text-gray-900 font-medium">
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onPickFile(f);
                }}
              />
              Upload Photo
            </label>

            <button
              onClick={doAutoScan}
              disabled={!imageEl || busy}
              className="rounded-xl border border-gray-700 px-4 py-2 hover:bg-gray-800 disabled:opacity-50"
            >
              Auto Crop Document
            </button>

            <button
              onClick={doOCR}
              disabled={(!displayUrl && !fileUrl) || busy}
              className="rounded-xl bg-indigo-500 px-4 py-2 font-medium text-white hover:bg-indigo-600 disabled:opacity-50"
            >
              Run OCR
            </button>

            <button
              onClick={saveLocal}
              disabled={!rawText || busy}
              className="rounded-xl border border-gray-700 px-4 py-2 hover:bg-gray-800 disabled:opacity-50"
            >
              Save Local
            </button>

            <button
              onClick={saveCloud}
              disabled={!rawText || busy}
              className="rounded-xl border border-gray-700 px-4 py-2 hover:bg-gray-800 disabled:opacity-50"
            >
              Save Cloud
            </button>

            <button
              onClick={exportPDF}
              disabled={!sections.length || busy}
              className="rounded-xl border border-gray-700 px-4 py-2 hover:bg-gray-800 disabled:opacity-50"
            >
              Export PDF
            </button>

            <button
              onClick={exportDOCX}
              disabled={!sections.length || busy}
              className="rounded-xl border border-gray-700 px-4 py-2 hover:bg-gray-800 disabled:opacity-50"
            >
              Export DOCX
            </button>
          </div>

          {busy && (
            <div className="text-sm text-gray-300">
              Working… OCR progress: {Math.round(ocrProgress * 100)}%
              <div className="mt-2 h-2 w-full rounded bg-gray-800">
                <div
                  className="h-2 rounded bg-indigo-500"
                  style={{ width: `${Math.round(ocrProgress * 100)}%` }}
                />
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2 text-sm">
            <span className="rounded-full border border-gray-800 px-3 py-1">
              Auto Crop: {scannedUrl ? (scannedFound ? "✅ Found" : "⚠️ Not Found") : "—"}
            </span>
            <span className="rounded-full border border-gray-800 px-3 py-1">
              Doc Type: <b>{docType}</b> ({docTypeConfidence})
            </span>
            <span className="rounded-full border border-gray-800 px-3 py-1">
              OCR Confidence: <b>{meanConfidence}%</b>
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="text-gray-300">Low-confidence highlight threshold:</span>
            <input
              type="range"
              min={40}
              max={95}
              value={lowConfThreshold}
              onChange={(e) => setLowConfThreshold(Number(e.target.value))}
            />
            <span className="rounded-lg border border-gray-800 px-2 py-1">
              &lt; {lowConfThreshold}
            </span>
          </div>

          {(displayUrl || fileUrl) && (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <div className="text-sm text-gray-300">Image Preview</div>
                <div className="rounded-xl overflow-hidden border border-gray-800 bg-black">
                  <img
                    src={displayUrl || fileUrl || ""}
                    alt="preview"
                    className="w-full object-contain"
                  />
                </div>

                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <input
                    type="checkbox"
                    checked={useManualCrop}
                    onChange={(e) => setUseManualCrop(e.target.checked)}
                  />
                  Manual crop mode (fallback if auto crop fails)
                </div>

                {useManualCrop && fileUrl && (
                  <div className="relative h-[320px] w-full overflow-hidden rounded-xl border border-gray-800">
                    <Cropper
                      image={fileUrl}
                      crop={crop}
                      zoom={zoom}
                      aspect={3 / 4}
                      onCropChange={setCrop}
                      onZoomChange={setZoom}
                      onCropComplete={(_, pixels) =>
                        setCroppedPixels({
                          width: pixels.width,
                          height: pixels.height,
                          x: pixels.x,
                          y: pixels.y,
                        })
                      }
                    />
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <div className="text-sm text-gray-300">OCR Text (Confidence Highlight)</div>

                {words.length === 0 ? (
                  <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-4 text-sm text-gray-400">
                    Run OCR to see confidence highlighting.
                  </div>
                ) : (
                  <div className="max-h-[220px] overflow-auto rounded-xl border border-gray-800 bg-gray-900/40 p-4 text-sm leading-6">
                    {confidenceLines.map((line, i) => (
                      <div key={i}>
                        {line.map((w, j) => {
                          const low = w.confidence < lowConfThreshold;
                          return (
                            <span
                              key={`${i}-${j}`}
                              className={low ? "mr-1 rounded bg-yellow-500/30 px-1" : "mr-1"}
                              title={`conf: ${Math.round(w.confidence)}%`}
                            >
                              {w.text}
                            </span>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                )}

                <div className="text-sm text-gray-300">Categorized Headings</div>

                {sections.length === 0 ? (
                  <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-4 text-sm text-gray-400">
                    After OCR, extracted content will be grouped into headings here.
                  </div>
                ) : (
                  <div className="max-h-[320px] overflow-auto space-y-3 rounded-xl border border-gray-800 bg-gray-900/40 p-4">
                    {sections.map((s, idx) => (
                      <div key={idx} className="space-y-1">
                        <div className="text-sm font-semibold text-indigo-300">{s.heading}</div>
                        <pre className="whitespace-pre-wrap text-sm text-gray-200">{s.content}</pre>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-gray-800 bg-gray-900/40 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Cloud Search (Supabase)</h2>
            <button
              onClick={loadCloud}
              disabled={cloudLoading}
              className="rounded-xl border border-gray-700 px-4 py-2 hover:bg-gray-800 disabled:opacity-50"
            >
              {cloudLoading ? "Loading..." : "Search"}
            </button>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <input
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              placeholder="Keyword (title or text)"
              className="rounded-xl border border-gray-800 bg-gray-950 px-3 py-2 text-sm"
            />
            <input
              type="date"
              value={searchFrom}
              onChange={(e) => setSearchFrom(e.target.value)}
              className="rounded-xl border border-gray-800 bg-gray-950 px-3 py-2 text-sm"
            />
            <input
              type="date"
              value={searchTo}
              onChange={(e) => setSearchTo(e.target.value)}
              className="rounded-xl border border-gray-800 bg-gray-950 px-3 py-2 text-sm"
            />
          </div>

          {cloudDocs.length === 0 ? (
            <p className="text-sm text-gray-400">No cloud docs loaded yet. Use search and press Search.</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {cloudDocs.map((d) => (
                <button
                  key={d.id}
                  className="text-left rounded-xl border border-gray-800 p-3 hover:bg-gray-800/50"
                  onClick={() => {
                    setRawText(d.raw_text);
                    setSections(d.sections);
                    setScannedFound(d.scanned_found);
                    setDocType(d.doc_type || "Other");
                    setMeanConfidence(d.mean_confidence || 0);
                  }}
                >
                  <div className="font-medium">{d.title}</div>
                  <div className="text-xs text-gray-400">{new Date(d.created_at).toLocaleString()}</div>
                  <div className="mt-1 text-xs text-gray-500">
                    Type: {d.doc_type || "Other"} | Confidence: {d.mean_confidence || 0}%
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-gray-800 bg-gray-900/40 p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Local History</h2>
            <button
              className="text-sm text-gray-300 hover:text-white"
              onClick={() => {
                if (confirm("Clear local history?")) setHistory([]);
              }}
            >
              Clear
            </button>
          </div>

          {history.length === 0 ? (
            <p className="mt-2 text-sm text-gray-400">No saved documents yet.</p>
          ) : (
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {history.map((d) => (
                <button
                  key={d.id}
                  className="text-left rounded-xl border border-gray-800 p-3 hover:bg-gray-800/50"
                  onClick={() => {
                    setRawText(d.rawText);
                    setSections(d.sections);
                    setScannedFound(d.scannedFound);
                    setDocType(d.docType || "Other");
                    setMeanConfidence(d.meanConfidence || 0);
                    setWords(d.words || []);
                  }}
                >
                  <div className="font-medium">{d.title}</div>
                  <div className="text-xs text-gray-400">{new Date(d.createdAt).toLocaleString()}</div>
                  <div className="mt-1 text-xs text-gray-500">
                    Type: {d.docType} | Confidence: {d.meanConfidence}%
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
