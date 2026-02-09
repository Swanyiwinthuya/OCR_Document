type Point = { x: number; y: number };

function orderPoints(pts: Point[]) {
  // top-left has smallest sum, bottom-right has largest sum
  // top-right has smallest diff, bottom-left has largest diff
  const sum = pts.map((p) => p.x + p.y);
  const diff = pts.map((p) => p.x - p.y);

  const tl = pts[sum.indexOf(Math.min(...sum))];
  const br = pts[sum.indexOf(Math.max(...sum))];
  const tr = pts[diff.indexOf(Math.min(...diff))];
  const bl = pts[diff.indexOf(Math.max(...diff))];

  return [tl, tr, br, bl];
}

function distance(a: Point, b: Point) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export async function autoScanDocument(imageEl: HTMLImageElement): Promise<{
  warpedDataUrl: string;
  found: boolean;
}> {
  if (!window.cvReady) throw new Error("OpenCV not loaded");
  await window.cvReady;

  const cv = window.cv;

  // Draw image to canvas
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  canvas.width = imageEl.naturalWidth;
  canvas.height = imageEl.naturalHeight;
  ctx.drawImage(imageEl, 0, 0);

  // Read into OpenCV
  let src = cv.imread(canvas);

  // Resize for speed (keep ratio)
  const maxDim = 1400;
  const scale = Math.min(maxDim / src.cols, maxDim / src.rows, 1);
  if (scale < 1) {
    const dsize = new cv.Size(Math.round(src.cols * scale), Math.round(src.rows * scale));
    const resized = new cv.Mat();
    cv.resize(src, resized, dsize, 0, 0, cv.INTER_AREA);
    src.delete();
    src = resized;
  }

  const gray = new cv.Mat();
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

  const blurred = new cv.Mat();
  cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);

  const edged = new cv.Mat();
  cv.Canny(blurred, edged, 75, 200);

  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  cv.findContours(edged, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

  let bestQuad: Point[] | null = null;
  let bestArea = 0;

  for (let i = 0; i < contours.size(); i++) {
    const cnt = contours.get(i);
    const peri = cv.arcLength(cnt, true);
    const approx = new cv.Mat();
    cv.approxPolyDP(cnt, approx, 0.02 * peri, true);

    if (approx.rows === 4) {
      const area = cv.contourArea(approx);
      if (area > bestArea) {
        bestArea = area;

        // Extract points
        const pts: Point[] = [];
        for (let j = 0; j < 4; j++) {
          const x = approx.intPtr(j, 0)[0];
          const y = approx.intPtr(j, 0)[1];
          pts.push({ x, y });
        }
        bestQuad = pts;
      }
    }
    approx.delete();
    cnt.delete();
  }

  // Cleanup mats
  gray.delete();
  blurred.delete();
  edged.delete();
  contours.delete();
  hierarchy.delete();

  if (!bestQuad) {
    src.delete();
    // No contour found; return original image as fallback
    const fallbackCanvas = document.createElement("canvas");
    fallbackCanvas.width = imageEl.naturalWidth;
    fallbackCanvas.height = imageEl.naturalHeight;
    fallbackCanvas.getContext("2d")!.drawImage(imageEl, 0, 0);
    return { warpedDataUrl: fallbackCanvas.toDataURL("image/jpeg", 0.92), found: false };
  }

  // Order quad points
  const [tl, tr, br, bl] = orderPoints(bestQuad);

  // Compute output size
  const widthA = distance(br, bl);
  const widthB = distance(tr, tl);
  const maxWidth = Math.max(widthA, widthB);

  const heightA = distance(tr, br);
  const heightB = distance(tl, bl);
  const maxHeight = Math.max(heightA, heightB);

  const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
    tl.x, tl.y,
    tr.x, tr.y,
    br.x, br.y,
    bl.x, bl.y
  ]);

  const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
    0, 0,
    maxWidth - 1, 0,
    maxWidth - 1, maxHeight - 1,
    0, maxHeight - 1
  ]);

  const M = cv.getPerspectiveTransform(srcTri, dstTri);
  const warped = new cv.Mat();
  const dsize = new cv.Size(Math.round(maxWidth), Math.round(maxHeight));

  cv.warpPerspective(src, warped, M, dsize, cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar());

  // Export warped to canvas
  const outCanvas = document.createElement("canvas");
  cv.imshow(outCanvas, warped);

  // Cleanup
  srcTri.delete();
  dstTri.delete();
  M.delete();
  warped.delete();
  src.delete();

  const warpedDataUrl = outCanvas.toDataURL("image/jpeg", 0.92);
  return { warpedDataUrl, found: true };
}
