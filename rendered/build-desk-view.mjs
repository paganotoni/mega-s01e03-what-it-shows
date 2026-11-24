import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const reports = JSON.parse(fs.readFileSync(path.join(root, 'src/lib/data/reports-4471.json'), 'utf8'));
const notes = JSON.parse(fs.readFileSync(path.join(root, 'src/lib/data/desk-notes.json'), 'utf8'));
const tenants = {};
for (const f of fs.readdirSync(path.join(root, 'src/lib/data/tenants'))) {
  const t = JSON.parse(fs.readFileSync(path.join(root, 'src/lib/data/tenants', f), 'utf8'));
  tenants[t.handle] = t;
}

function dayFirst(locale) {
  const order = new Intl.DateTimeFormat(locale, { year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date(Date.UTC(2026, 0, 2, 12)))
    .map((p) => p.type);
  return order.indexOf('day') < order.indexOf('month');
}
const DATE_HINT = { 'booking-v2': 'DD/MM/YYYY', 'booking-v3': 'MM/DD/YYYY' };
function causeOf(r, t) {
  if (!t || !dayFirst(t.locale)) return null;
  return r.channel === 'form' && DATE_HINT[t.form].startsWith('MM') ? 'hint' : 'parser';
}
function uniqueById(rs) {
  return [...new Map(rs.map((r) => [r.id, r])).values()];
}
function groupByCause(rs) {
  const byCause = new Map();
  for (const r of rs) {
    const cause = causeOf(r, tenants[r.tenant]) ?? 'unplaced';
    byCause.set(cause, [...(byCause.get(cause) ?? []), r]);
  }
  return [...byCause.entries()]
    .map(([cause, reports]) => {
      const days = reports.map((r) => r.receivedAt.slice(0, 10)).sort();
      return {
        cause,
        reports,
        taggedAs: reports.reduce((n, r) => ({ ...n, [r.meta.intakeTag]: (n[r.meta.intakeTag] ?? 0) + 1 }), {}),
        tenants: new Set(reports.map((r) => r.tenant)).size,
        firstSeen: days[0],
        lastSeen: days[days.length - 1],
      };
    })
    .sort((a, b) => b.reports.length - a.reports.length);
}
function tags(g) {
  return Object.entries(g.taggedAs)
    .sort((a, b) => b[1] - a[1])
    .map(([tag, n]) => `${tag} ×${n}`)
    .join(' · ');
}
function deskRef(signature) {
  const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  function fnv1a(text, seed) {
    let h = seed >>> 0;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h;
  }
  const t = signature.trim();
  const a = fnv1a(t, 0x811c9dc5);
  const b = fnv1a(t, 0x9e3779b9);
  let bits = (BigInt(a) << 8n) | BigInt(b & 0xff);
  let out = '';
  for (let i = 0; i < 8; i++) {
    out = ALPHABET[Number(bits & 31n)] + out;
    bits >>= 5n;
  }
  return `DR-${out.slice(0, 4)}-${out.slice(4)}`;
}

const ticket = 4471;
const merged = uniqueById(reports).filter((r) => r.mergedInto === ticket);
const groups = groupByCause(merged);
const owner = groups[0]?.cause ?? null;
const signature = 'Antonio Pagano';
const ref = deskRef(signature);
const reviewed = '2026-11-24';
const now = new Date('2026-11-24T12:00:00Z');
const age = Math.floor((now.getTime() - new Date(reviewed).getTime()) / 86_400_000);

const rows = groups
  .map((g) => {
    const wrong = g.cause !== owner;
    const filed = g.cause === owner ? `#${ticket}` : 'not this ticket — no ticket of its own';
    return `<tr class="${wrong ? 'wrong' : ''}">
        <td><code>${g.cause}</code></td>
        <td>${g.reports.length}</td>
        <td class="tags">${tags(g)}</td>
        <td>${g.tenants}</td>
        <td>${g.firstSeen} → ${g.lastSeen}</td>
        <td>${filed}</td>
      </tr>`;
  })
  .join('\n');

const notesHtml = groups
  .map((g) => {
    const moved = g.reports.filter((r) => notes.oneDayMove.includes(r.id)).length;
    if (!moved) return '';
    return `<p class="note">${moved} reports read as a one-day move; filed under <code>${g.cause}</code> by tenant.</p>`;
  })
  .join('\n');

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>#4471 · two problems, not one · support kb</title>
  <style>
    :root {
      --bg: #fbfaf7; --fg: #1d1d1b; --muted: #6b6a66; --line: #e3e0d8;
      --accent: #2f6f5e; --warn: #b4501f; --warn-bg: #fbeee6; --note-bg: #eef5f2;
      --mono: ui-monospace, 'Cascadia Code', Menlo, monospace;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #171716; --fg: #ecebe6; --muted: #9c9a93; --line: #34332f;
        --accent: #6fbfa6; --warn: #f0905d; --warn-bg: #3a2418; --note-bg: #1d2c27;
      }
    }
    body { margin: 0; background: var(--bg); color: var(--fg); font: 16px/1.6 system-ui, sans-serif; }
    .kb { max-width: 760px; margin: 0 auto; padding: 2rem 16px 4rem; }
    .crumb { font: 0.8rem var(--mono); text-decoration: none; color: var(--muted); }
    h1 { margin: 0.25rem 0 0.5rem; line-height: 1.2; }
    h2 { margin: 1.75rem 0 0.5rem; font-size: 1.15rem; }
    .meta { display: flex; flex-wrap: wrap; gap: 0.5rem 1rem; color: var(--muted); font-size: 0.85rem; margin: 0; }
    .status { border: 1px solid var(--line); border-radius: 99px; padding: 0 0.6rem; }
    table { border-collapse: collapse; width: 100%; margin: 1rem 0; font-size: 0.92rem; }
    th, td { border-bottom: 1px solid var(--line); padding: 0.35rem 0.5rem; text-align: left; }
    code { font-family: var(--mono); font-size: 0.88em; }
    a { color: var(--accent); }
    .sum { font-size: 1.1rem; }
    .tags { color: var(--muted); font-size: 0.85em; }
    .note { color: var(--muted); font-size: 0.85em; }
    .wrong td { background: var(--warn-bg); }
    .wrong td:last-child { color: var(--warn); font-weight: 600; }
    aside { border-left: 4px solid var(--accent); padding: 0.5rem 1rem; margin: 1rem 0; background: var(--note-bg); }
    aside.warn { border-color: var(--warn); background: var(--warn-bg); }
    .stamp { margin: 2rem 0 0; font: 0.85rem var(--mono); color: var(--muted); }
    .stamp b { color: var(--accent); letter-spacing: 0.04em; }
    footer { margin-top: 3rem; color: var(--muted); font-size: 0.8rem; border-top: 1px solid var(--line); padding-top: 1rem; }
  </style>
</head>
<body>
  <div class="kb">
    <header>
      <a class="crumb" href="#">support desk · kb</a>
      <h1>#4471 · two problems, not one</h1>
      <p class="meta">
        <span>owner <b>support desk</b></span>
        <span class="status living">living</span>
        <span>reviewed ${reviewed} · ${age} days ago</span>
      </p>
    </header>
    <main>
      <p>#4471 merged every date report into one known parser bug. The reports are two
      causes. Cause follows the tenant (locale and booking form), not the subject
      line and not intake's tag.</p>
      <aside class="warn">#4471 is not one issue. The hint reports have no ticket of their own.</aside>
      <h2>What was merged</h2>
      <p class="sum"><strong>${merged.length}</strong> reports merged into #${ticket} · <strong>${groups.length}</strong> causes</p>
      <table>
        <thead>
          <tr><th>cause</th><th>reports</th><th>tagged as</th><th>tenants</th><th>seen</th><th></th></tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
      ${notesHtml}
      <h2>parser</h2>
      <p>The shared parser reads every date month first. A day-first tenant's dates come
      out flipped: 7 April becomes 4 July. App, email, and booking-v2 forms all hit
      this. That is the bulk of #4471.</p>
      <h2>hint</h2>
      <p>booking-v3 prints <code>MM/DD/YYYY</code> under the date field. People type what the hint
      says. The form still reads the date the tenant's way (day first). The month
      flips for a different reason. Same subject as parser; not the same bug.</p>
      <h2>Why they sat in one ticket</h2>
      <p>Triage merges on subject (decision 0001). Intake tags from the browser locale,
      which often disagrees with the tenant. Neither is the cause. Split #4471: one
      ticket per cause, with the report count from the table.</p>
      <p class="stamp">desk ref <b>${ref}</b></p>
    </main>
    <footer>Pages are written by people. Tables and charts are built from data at render time.</footer>
  </div>
</body>
</html>
`;

const out = path.join(root, 'rendered/kb/incidents/4471-two-problems.html');
fs.writeFileSync(out, html);
console.log('wrote', out);
console.log('merged', merged.length, 'groups', groups.map((g) => `${g.cause}:${g.reports.length}`).join(', '));
console.log('desk ref', ref);
