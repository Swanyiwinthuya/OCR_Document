import { createWorker } from "tesseract.js";

export type OcrWord = {
  text: string;
  confidence: number;
  line_num: number;
  par_num: number;
  block_num: number;
  page_num: number;
  bbox?: { x0: number; y0: number; x1: number; y1: number };
};

export async function runOCRDetailed(
  imageDataUrl: string,
  onProgress?: (p: number) => void
): Promise<{ text: string; words: OcrWord[]; meanConfidence: number }> {
  const worker = await createWorker({
    logger: (m: any) => {
      if (m.status === "recognizing text" && typeof m.progress === "number") {
        onProgress?.(m.progress);
      }
    },
  });

  await worker.loadLanguage("eng");
  await worker.initialize("eng");

  const { data } = (await worker.recognize(imageDataUrl)) as any;
  await worker.terminate();

  const words: OcrWord[] = (data?.words ?? [])
    .map((w: any) => ({
      text: String(w.text ?? ""),
      confidence: typeof w.confidence === "number" ? w.confidence : 0,
      line_num: w.line_num ?? 0,
      par_num: w.par_num ?? 0,
      block_num: w.block_num ?? 0,
      page_num: w.page_num ?? 0,
      bbox: w.bbox
        ? { x0: w.bbox.x0, y0: w.bbox.y0, x1: w.bbox.x1, y1: w.bbox.y1 }
        : undefined,
    }))
    .filter((w: OcrWord) => w.text.trim().length > 0);

  const meanConfidence =
    words.length > 0
      ? Math.round(words.reduce((sum, w) => sum + w.confidence, 0) / words.length)
      : 0;

  return {
    text: String(data?.text ?? "").trim(),
    words,
    meanConfidence,
  };
}

// Optional: keep simple OCR function too (so older code still works)
export async function runOCR(
  imageDataUrl: string,
  onProgress?: (p: number) => void
): Promise<string> {
  const res = await runOCRDetailed(imageDataUrl, onProgress);
  return res.text;
}
