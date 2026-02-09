function scoreByKeywords(text, keywords) {
  const t = text.toLowerCase();
  let score = 0;
  for (const k of keywords) {
    if (t.includes(k)) score += 2;
  }
  return score;
}

export function classifyDocType(rawText) {
  const text = (rawText || "").toLowerCase();

  // Strong patterns
  const hasMoney = /(\$|฿|บาท|usd|thb|total|subtotal|tax|vat)/i.test(text);
  const hasInvoiceNo = /(invoice\s*(no|#|number)|inv\s*(no|#))/i.test(text);
  const hasReceipt = /(receipt|thank you for your purchase|cashier)/i.test(text);
  const hasContract = /(agreement|party\s*a|party\s*b|hereby|terms and conditions|witnesseth|governing law|signature)/i.test(text);
  const hasId = /(national id|id no|passport|date of birth|dob|expiry|issued|sex|height)/i.test(text);

  const receiptScore =
    scoreByKeywords(text, ["receipt", "cashier", "change", "store", "branch"]) +
    (hasMoney ? 2 : 0) +
    (hasReceipt ? 4 : 0);

  const invoiceScore =
    scoreByKeywords(text, ["invoice", "bill to", "ship to", "due date", "terms", "purchase order"]) +
    (hasInvoiceNo ? 5 : 0) +
    (hasMoney ? 2 : 0);

  const contractScore =
    scoreByKeywords(text, ["agreement", "hereby", "whereas", "liability", "indemnify", "governing law", "jurisdiction", "signature"]) +
    (hasContract ? 6 : 0);

  const idScore =
    scoreByKeywords(text, ["passport", "national", "identity", "citizen", "dob", "date of birth", "expiry", "issued"]) +
    (hasId ? 6 : 0);

  const scores = [
    { type: "Receipt", score: receiptScore },
    { type: "Invoice", score: invoiceScore },
    { type: "Contract", score: contractScore },
    { type: "ID", score: idScore },
  ].sort((a, b) => b.score - a.score);

  const best = scores[0];
  if (!best || best.score < 4) return { type: "Other", confidence: "Low" };

  const confidence =
    best.score >= 10 ? "High" : best.score >= 7 ? "Medium" : "Low";

  return { type: best.type, confidence };
}
