/**
 * Apple-style transactional email template.
 *
 * Clean, quiet, generous whitespace, SF system font, a single pill CTA and a
 * light/dark aware surface. Table + inline-CSS layout for broad client support
 * (Outlook, Gmail, Apple Mail); a <style> block adds dark mode + fluid width on
 * clients that honour it (Apple Mail / iOS Mail).
 */

export type AppleEmailContent = {
  /** Hidden inbox preview line. */
  preheader?: string;
  /** Small uppercase label above the title (e.g. the organisation name). */
  eyebrow?: string;
  title: string;
  /** One <p> per entry. */
  paragraphs: string[];
  cta?: { label: string; url: string };
  /** Muted line at the bottom (why they received this). */
  footnote?: string;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const FONT =
  "-apple-system,BlinkMacSystemFont,'SF Pro Text','SF Pro Display','Helvetica Neue',Helvetica,Arial,sans-serif";

export function renderAppleEmail(content: AppleEmailContent): string {
  const { preheader, eyebrow, title, paragraphs, cta, footnote } = content;

  const eyebrowHtml = eyebrow
    ? `<p style="margin:0 0 10px;font-family:${FONT};font-size:12px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#86868b;">${escapeHtml(eyebrow)}</p>`
    : "";

  const bodyHtml = paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font-family:${FONT};font-size:16px;line-height:1.55;color:#1d1d1f;">${escapeHtml(p)}</p>`,
    )
    .join("");

  const ctaHtml = cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 4px;">
            <tr>
              <td class="cta" style="border-radius:980px;background:#0071e3;">
                <a href="${escapeHtml(cta.url)}" target="_blank" rel="noopener" style="display:inline-block;padding:13px 28px;font-family:${FONT};font-size:16px;font-weight:500;line-height:1;color:#ffffff;text-decoration:none;">${escapeHtml(cta.label)}</a>
              </td>
            </tr>
          </table>`
    : "";

  const footnoteHtml = footnote
    ? `<p style="margin:28px 0 0;font-family:${FONT};font-size:13px;line-height:1.5;color:#86868b;">${escapeHtml(footnote)}</p>`
    : "";

  const preheaderHtml = preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${escapeHtml(preheader)}</div>`
    : "";

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(title)}</title>
<style>
  :root { color-scheme: light dark; supported-color-schemes: light dark; }
  body { margin:0; padding:0; width:100% !important; background:#f5f5f7; }
  .card { width:100%; max-width:480px; }
  @media (max-width:520px) {
    .shell { padding:24px 16px !important; }
    .card-pad { padding:32px 24px !important; }
    .title { font-size:24px !important; }
  }
  @media (prefers-color-scheme: dark) {
    body, .shell { background:#000000 !important; }
    .card { background:#1c1c1e !important; }
    .title, .body p { color:#f5f5f7 !important; }
    .hr { border-color:#38383a !important; }
    .cta { background:#0a84ff !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:#f5f5f7;">
${preheaderHtml}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f5f7;">
  <tr>
    <td class="shell" align="center" style="padding:40px 20px;">
      <table role="presentation" class="card" cellpadding="0" cellspacing="0" border="0" width="480" style="max-width:480px;width:100%;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
        <tr>
          <td class="card-pad" style="padding:40px 40px 36px;">
            ${eyebrowHtml}
            <h1 class="title" style="margin:0 0 18px;font-family:${FONT};font-size:28px;line-height:1.2;font-weight:600;letter-spacing:-0.02em;color:#1d1d1f;">${escapeHtml(title)}</h1>
            <div class="body">${bodyHtml}</div>
            ${ctaHtml}
            <hr class="hr" style="border:none;border-top:1px solid #e8e8ed;margin:32px 0 0;">
            ${footnoteHtml}
          </td>
        </tr>
      </table>
      <p style="margin:20px 0 0;font-family:${FONT};font-size:12px;color:#aeaeb2;">Hermes Console</p>
    </td>
  </tr>
</table>
</body>
</html>`;
}
