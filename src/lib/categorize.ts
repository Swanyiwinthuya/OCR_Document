export type Section = {
  heading: string;
  content: string;
};

const KEYWORD_HEADINGS: { heading: string; keywords: string[] }[] = [
  { heading: "Contact Info", keywords: ["email", "phone", "tel", "mobile", "address"] },
  { heading: "Dates", keywords: ["date", "issued", "due", "deadline"] },
  { heading: "Payment / Amounts", keywords: ["total", "subtotal", "tax", "vat", "amount", "price", "balance"] },
  { heading: "Company / Organization", keywords: ["company", "ltd", "inc", "co.", "organization"] },
  { heading: "Terms / Notes", keywords: ["terms", "note", "conditions", "policy"] },
];

function isLikelyHeading(line: string) {
  const t = line.trim();
  if (!t) return false;
  if (t.length <= 2) return false;
  if (t.endsWith(":")) return true;
  if (t === t.toUpperCase() && t.length <= 60) return true; // uppercase title
  if (/^#+\s+/.test(t)) return true;
  return false;
}

export function categorizeText(raw: string): Section[] {
  const lines = raw
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l.length > 0);

  // If headings exist in text, use them
  const sections: Section[] = [];
  let currentHeading = "General";
  let buffer: string[] = [];

  const flush = () => {
    if (buffer.length) {
      sections.push({ heading: currentHeading, content: buffer.join("\n") });
      buffer = [];
    }
  };

  for (const line of lines) {
    if (isLikelyHeading(line)) {
      flush();
      currentHeading = line.replace(/[:#]/g, "").trim();
      continue;
    }
    buffer.push(line);
  }
  flush();

  // If everything ended up in one section, do keyword-based split
  if (sections.length <= 1) {
    const buckets: Record<string, string[]> = { General: [] };

    for (const line of lines) {
      const lower = line.toLowerCase();
      let matched = false;

      for (const rule of KEYWORD_HEADINGS) {
        if (rule.keywords.some((k) => lower.includes(k))) {
          if (!buckets[rule.heading]) buckets[rule.heading] = [];
          buckets[rule.heading].push(line);
          matched = true;
          break;
        }
      }
      if (!matched) buckets.General.push(line);
    }

    return Object.entries(buckets)
      .filter(([, arr]) => arr.length > 0)
      .map(([heading, arr]) => ({ heading, content: arr.join("\n") }));
  }

  return sections;
}
