/**
 * Classic-serif resume HTML. Browser-safe ESM — no node: imports.
 * Preview and print/PDF share this renderer.
 */

export const TOKENS = {
  page: { width: '8.5in', height: '11in', margin: '0.5in' },
  font: { family: "Cambria, Caladea, 'Times New Roman', serif", body: 10, name: 14, contact: 11, section: 10.5 },
  color: { text: '#000000', title: '#1F497D', link: '#0000FF', rule: '#000000' },
};

export const CALADEA_HREF =
  'https://fonts.googleapis.com/css2?family=Caladea:ital,wght@0,400;0,700;1,400;1,700&display=swap';

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}

/** Only **bold** is allowed inline; everything else is escaped. */
export function inline(s) {
  return esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
}

function lr(left, right, cls = '') {
  return `<div class="lr${cls ? ` ${cls}` : ''}"><span class="l">${left}</span><span class="r">${right}</span></div>`;
}

function dateLine(job) {
  return [job.start, job.end].filter(Boolean).join(' \u2013 ');
}

const SECTIONS = {
  experience: (section, dropped) => (section.jobs || []).map((job) => {
    if (job.included === false) return '';
    const groups = (job.groups || []).map((group) => {
      const bullets = (group.bullets || []).filter((b) => (
        b.included !== false && !dropped.has(b.id) && (b.lead || b.body)
      ));
      if (!bullets.length) return '';
      const heading = group.heading ? `<div class="subhead">${esc(group.heading)}</div>` : '';
      const items = bullets.map((b) => {
        const lead = b.lead ? `<b>${inline(b.lead)}:</b> ` : '';
        return `<li data-bullet-id="${esc(b.id)}" data-job-id="${esc(job.id)}" data-priority="${b.priority ?? 1}" data-pinned="${b.pinned ? '1' : '0'}">${lead}${inline(b.body)}</li>`;
      }).join('');
      return `${heading}<ul>${items}</ul>`;
    }).join('');
    return `<div class="job" data-job-id="${esc(job.id)}">
      ${lr(`<b>${esc(job.company)}</b>`, `<b>${esc(dateLine(job))}</b>`)}
      ${lr(`<b class="title">${esc(job.title)}</b>`, esc(job.location || ''))}
      ${groups}
    </div>`;
  }).join(''),

  credentials: (section) => (section.items || []).map((item) => `
    ${lr(`<b>${esc(item.name)}</b>`, item.issued ? `<b>Issued ${esc(item.issued)}</b>` : '')}
    <div>${item.issuer ? `<i>${esc(item.issuer)}</i>` : ''}${item.credentialId ? `${item.issuer ? ', ' : ''}Credential ID ${esc(item.credentialId)}` : ''}</div>
  `).join(''),

  education: (section) => (section.items || []).map((item) => `
    ${lr(`<b>${esc(item.school)}</b>`, item.location ? `<b>${esc(item.location)}</b>` : '')}
    <div>${item.degree ? `<i>${esc(item.degree)}${item.details ? ',' : ''}</i>` : ''}${item.details ? ` ${esc(item.details)}` : ''}</div>
    ${item.gpa ? `<div>Cumulative GPA: ${esc(item.gpa)}</div>` : ''}
  `).join(''),

  additional: (section) => (section.rows || []).map((row) => {
    const body = row.groups?.length
      ? row.groups.map((g) => `<i>${esc(g.label)}</i>: ${(g.items || []).map(esc).join(', ')}`).join(' \u00b7 ')
      : (row.items || []).map(esc).join(' \u00b7 ');
    return `<div class="addl"><b>${esc(row.label)}:</b> ${body}</div>`;
  }).join(''),
};

export function renderResumeHtml(resume, { droppedBulletIds } = {}) {
  const dropped = new Set(droppedBulletIds || resume?.fit?.droppedBulletIds || []);
  const header = resume?.header || {};
  const name = [header.name, header.suffix].filter(Boolean).join(', ');
  const contact = [
    (header.locations || []).filter(Boolean).join(' / '),
    header.phone,
    header.email && `<a href="mailto:${esc(header.email)}">${esc(header.email)}</a>`,
    ...(header.links || []).map((link) => (
      link?.url ? `<a href="${esc(link.url)}">${esc(link.label || link.url)}</a>` : ''
    )),
  ].filter(Boolean).join(' \u2022 ');

  const order = Array.isArray(resume?.sectionOrder) ? resume.sectionOrder : [];
  const body = order
    .map((key) => {
      const section = resume?.sections?.[key];
      if (!section || section.enabled === false) return '';
      const render = SECTIONS[key];
      if (!render) return '';
      const inner = render(section, dropped);
      if (!String(inner).trim()) return '';
      return `<section class="sec sec-${esc(key)}"><h2>${esc(section.title || key)}</h2>${inner}</section>`;
    })
    .join('');

  return `<header><h1>${esc(name || 'Resume')}</h1><div class="contact">${contact}</div></header>${body}`;
}

export function resumeDocument(innerHtml, { fittedVars = {}, print = false } = {}) {
  const vars = Object.entries(fittedVars)
    .map(([key, value]) => `${key}: ${value}`)
    .join('; ');
  const pageStyle = vars ? ` style="${esc(vars)}"` : '';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Resume</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link rel="stylesheet" href="${CALADEA_HREF}" />
  <link rel="stylesheet" href="/brag-book/resume.css" />
</head>
<body class="bb-resume-print">
  <div class="sheet"${print ? '' : ''}>
    <div class="page" id="page"${pageStyle}>${innerHtml}</div>
  </div>
</body>
</html>`;
}
