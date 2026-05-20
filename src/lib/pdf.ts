// Server-side HTML -> PDF using Puppeteer.
//
// EasyDo's API rejects anything but PDFs, so we render contract HTML
// (from `contract-render.ts`) to a real PDF before uploading. Hebrew RTL
// works because the HTML sets `dir="rtl"` and the font stack falls back
// to the system's Hebrew-capable sans (Heebo / Arial / DejaVu Sans).
//
// Puppeteer downloads its bundled Chromium on `npm install`. On Render's
// default Node image the required system libs (libnss3, libatk, etc.) are
// already present, so no apt-get is needed.

import puppeteer, { type Browser } from "puppeteer";

let browserPromise: Promise<Browser> | null = null;

function getBrowser(): Promise<Browser> {
  // Reuse one browser across requests — launching is ~500ms each time.
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });
  }
  return browserPromise;
}

export async function htmlToPdf(html: string): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: "load" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "20mm", right: "15mm", bottom: "20mm", left: "15mm" },
    });
    return Buffer.from(pdf);
  } finally {
    await page.close();
  }
}
