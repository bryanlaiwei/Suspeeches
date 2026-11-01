import type { Session } from "./sessions";

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** "Caught by Dana · 0 pts" style line for the footer. */
function resultLine(s: Session, sender: string): { label: string; caught: boolean } {
  const d = s.debrief;
  const caught = s.status === "caught";
  const label = caught ? `Caught by ${s.caughtBy ?? sender}` : d?.endReason === "left" ? "You walked out" : "You made it";
  return { label: d ? `${label} · ${d.score.toLocaleString("en-US")} pts` : label, caught };
}

/**
 * The follow-up as an email: the character's message first (it should read like a real email),
 * then a small Suspeeches footer with the result and a link to the debrief.
 */
export function followupEmail(s: Session): { text: string; html: string } | null {
  const f = s.followup;
  if (!f) return null;
  const link = `${s.appUrl.replace(/\/$/, "")}/debrief?id=${s.id}`;
  const { label, caught } = resultLine(s, f.sender);
  const note = `Sent from Suspeeches, a practice game. ${f.sender} is a fictional character.`;

  const text = [f.body, "", "—", label, `Your debrief: ${link}`, note].join("\n");

  const paragraphs = f.body
    .trim()
    .split(/\n\s*\n/)
    .map((p) => `<p style="margin:0 0 16px">${p.split("\n").map(esc).join("<br>")}</p>`)
    .join("");
  const chip = caught ? "background:#ffe1e1;color:#a32d2d" : "background:#e3f7d4;color:#2f6b00";

  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head><body style="margin:0;padding:0;background:#f4f2ff">
<div style="padding:28px 12px;background:#f4f2ff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e3defb;border-radius:16px;padding:28px 28px 12px;color:#2b2a5c;font-size:15px;line-height:1.6">
    ${paragraphs}
  </div>
  <div style="max-width:560px;margin:16px auto 0;text-align:center;font-size:12px;line-height:1.6;color:#6c6a9c">
    <span style="display:inline-block;padding:4px 12px;border-radius:999px;font-weight:700;${chip}">${esc(label)}</span>
    <div style="margin:12px 0">
      <a href="${esc(link)}" style="display:inline-block;background:#58cc02;color:#ffffff;font-weight:800;text-decoration:none;padding:10px 20px;border-radius:12px">See your debrief</a>
    </div>
    <span style="font-weight:800"><span style="color:#58cc02">Sus</span><span style="color:#2b2a5c">peeches</span></span> · ${esc(note.replace("Sent from Suspeeches, ", ""))}
  </div>
</div>
</body></html>`;

  return { text, html };
}
