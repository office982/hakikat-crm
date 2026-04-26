/**
 * Render a contract text body as a printable HTML document.
 *
 * EasyDo expects a `pdf_url`. We don't ship a PDF library, so we serve
 * the contract as a self-contained HTML page that any signing service
 * (or browser print-to-PDF) can render. The HTML is RTL, uses a web-safe
 * Hebrew font stack, and is sized for A4.
 */
export function renderContractHtml(params: {
  title: string;
  body: string;
  signerName: string;
  signerId?: string;
}): string {
  const { title, body, signerName, signerId } = params;
  const safeBody = body
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");

  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<title>${title}</title>
<style>
  @page { size: A4; margin: 25mm 20mm; }
  body { font-family: "Heebo", "Arial Hebrew", Arial, sans-serif; font-size: 12pt; line-height: 1.7; color: #111; }
  .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 8mm; margin-bottom: 10mm; }
  .header h1 { font-size: 20pt; margin: 0; }
  .meta { font-size: 10pt; color: #555; margin-top: 4mm; }
  .body { white-space: normal; }
  .signature { margin-top: 20mm; padding-top: 8mm; border-top: 1px dashed #888; }
  .signature .label { font-size: 10pt; color: #666; }
  .signature .line { display: inline-block; min-width: 60mm; border-bottom: 1px solid #000; margin-right: 6mm; height: 14mm; vertical-align: bottom; }
</style>
</head>
<body>
  <div class="header">
    <h1>${title}</h1>
    <div class="meta">${signerName}${signerId ? ` · ת״ז ${signerId}` : ""}</div>
  </div>
  <div class="body">${safeBody}</div>
  <div class="signature">
    <div><span class="label">חתימת השוכר:</span> <span class="line"></span></div>
    <div style="margin-top: 8mm;"><span class="label">חתימת המשכיר:</span> <span class="line"></span></div>
  </div>
</body>
</html>`;
}
