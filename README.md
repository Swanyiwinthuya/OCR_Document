# OCR Document Categorizer (Pro)

A full-stack OCR web app that takes a wide-angle photo of a document, automatically crops the document area, performs OCR to extract editable text, categorizes the content into headings, classifies document type (Receipt / Invoice / Contract / ID), highlights low-confidence OCR words, and saves searchable history to the cloud (Supabase). Includes PDF/DOCX export.

## Demo
- Live: https://YOUR_VERCEL_URL.vercel.app  
- Repo: https://github.com/Swanyiwinthuya/OCR_Document

## Features
✅ **Wide-angle Document Auto-Crop** (OpenCV.js)  
- Detects the largest document contour and applies perspective transform (warp) to isolate the document even when other objects are in the photo.
- Manual crop fallback (react-easy-crop) if auto detection fails.

✅ **OCR with Word Confidence** (Tesseract.js)  
- Extracts text + word-level confidence.
- Highlights low-confidence words to help verify accuracy.

✅ **Document Type Classifier**
- Classifies as: **Receipt / Invoice / Contract / ID / Other** (keyword + pattern scoring).

✅ **Content Categorization**
- Converts extracted text into structured **headings + sections** for easier reading.

✅ **Export**
- **PDF Export** (server-side API route)
- **DOCX Export** (server-side API route)
- Uses text normalization to avoid PDF encoding issues.

✅ **Cloud Storage + Search** (Supabase)
- Save OCR results to Supabase (title, raw text, sections, document type, OCR confidence).
- Search cloud docs by **keyword** and **date range**.

## Tech Stack
- **Next.js (App Router) + TypeScript**
- **OpenCV.js** (document detection + perspective crop)
- **Tesseract.js** (OCR)
- **Supabase** (database storage)
- **pdf-lib** (PDF generation)
- **docx** (DOCX generation)
- **react-easy-crop** (manual crop)

---

## Getting Started (Local Setup)

### 1) Clone & install
```bash
git clone https://github.com/Swanyiwinthuya/OCR_Document.git
cd OCR_Document
npm install
