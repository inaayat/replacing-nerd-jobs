/**
 * Client-side .docx of a classic-serif resume. Browser-safe ESM.
 * Uncompressed zip writer, same approach as takeout/workbook.js.
 */

import { resumeBulletParts } from './resume-model.js';

const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i += 1) {
  let c = i;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[i] = c >>> 0;
}

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function u16(n) {
  return Uint8Array.of(n & 0xff, (n >>> 8) & 0xff);
}

function u32(n) {
  return Uint8Array.of(n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff);
}

function concatBytes(chunks) {
  let len = 0;
  for (const c of chunks) len += c.length;
  const out = new Uint8Array(len);
  let off = 0;
  for (const chunk of chunks) {
    out.set(chunk, off);
    off += chunk.length;
  }
  return out;
}

const utf8 = (s) => new TextEncoder().encode(s);

function zipStore(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const file of files) {
    const name = utf8(file.name);
    const data = typeof file.data === 'string' ? utf8(file.data) : file.data;
    const crc = crc32(data);
    const local = concatBytes([
      u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0),
      name, data,
    ]);
    locals.push(local);
    centrals.push(concatBytes([
      u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(crc), u32(data.length), u32(data.length), u16(name.length),
      u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), name,
    ]));
    offset += local.length;
  }
  const central = concatBytes(centrals);
  const eocd = concatBytes([
    u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
    u32(central.length), u32(offset), u16(0),
  ]);
  return concatBytes([...locals, central, eocd]);
}

function xml(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function sz(pt) {
  return Math.round(Number(pt) * 2);
}

function rPr({ bold = false, italic = false, pt = 10, color = '000000', underline = false, font = 'Cambria' } = {}) {
  return `<w:rPr>
    <w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:eastAsia="${font}" w:cs="${font}"/>
    ${bold ? '<w:b/><w:bCs/>' : ''}
    ${italic ? '<w:i/><w:iCs/>' : ''}
    <w:color w:val="${color}"/>
    <w:sz w:val="${sz(pt)}"/><w:szCs w:val="${sz(pt)}"/>
    ${underline ? '<w:u w:val="single"/>' : ''}
  </w:rPr>`;
}

function t(text) {
  const value = String(text ?? '');
  const space = /^\s|\s$/.test(value) ? ' xml:space="preserve"' : '';
  return `<w:t${space}>${xml(value)}</w:t>`;
}

function run(text, opts) {
  if (text == null || text === '') return '';
  return `<w:r>${rPr(opts)}${t(text)}</w:r>`;
}

function p(inner, extraPr = '') {
  return `<w:p><w:pPr>${extraPr}</w:pPr>${inner}</w:p>`;
}

function lrTabs(leftRuns, rightRuns, extraPr = '') {
  return p(
    `${leftRuns}<w:r>${rPr()}<w:tab/></w:r>${rightRuns}`,
    `<w:tabs><w:tab w:val="right" w:pos="10800"/></w:tabs>${extraPr}`
  );
}

function sectionHead(title, bodyPt) {
  return p(
    run(String(title || '').toUpperCase(), { bold: true, pt: 10.5 }),
    `<w:spacing w:before="160" w:after="0" w:line="240" w:lineRule="auto"/>
     <w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="000000"/></w:pBdr>
     <w:rPr><w:spacing w:val="14"/></w:rPr>`
  );
}

function bulletP(inner, line) {
  const lineTwips = Math.round(240 * (line || 1.15));
  return p(
    inner,
    `<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>
     <w:spacing w:before="0" w:after="0" w:line="${lineTwips}" w:lineRule="auto"/>
     <w:ind w:left="720" w:hanging="360"/>
     <w:jc w:val="left"/>`
  );
}

function dates(job) {
  return [job.start, job.end].filter(Boolean).join(' \u2013 ');
}

function experienceXml(section, dropped, bodyPt, bulletLine) {
  const skip = new Set(dropped);
  return (section.jobs || []).map((job) => {
    if (job.included === false) return '';
    const head = [
      lrTabs(run(job.company, { bold: true, pt: bodyPt }), run(dates(job), { bold: true, pt: bodyPt })),
      lrTabs(run(job.title, { bold: true, pt: bodyPt, color: '1F497D' }), run(job.location || '', { pt: bodyPt })),
    ];
    const groups = (job.groups || []).map((group) => {
      const bullets = (group.bullets || []).filter((b) => b.included !== false && !skip.has(b.id));
      if (!bullets.length) return '';
      const heading = group.heading
        ? p(run(group.heading, { italic: true, pt: bodyPt }), '<w:spacing w:before="180" w:after="0"/>')
        : '';
      const items = bullets.map((b) => {
        const parts = resumeBulletParts(b);
        const lead = parts.lead ? run(`${parts.lead}:`, { bold: true, pt: bodyPt }) : '';
        const space = parts.lead && parts.body ? run(' ', { pt: bodyPt }) : '';
        return bulletP(`${lead}${space}${run(parts.body, { pt: bodyPt })}`, bulletLine);
      });
      return heading + items.join('');
    });
    return head.join('') + groups.join('');
  }).join('');
}

function credentialsXml(section, bodyPt) {
  return (section.items || []).map((item) => [
    lrTabs(
      run(item.name, { bold: true, pt: bodyPt }),
      item.issued ? run(`Issued ${item.issued}`, { bold: true, pt: bodyPt }) : ''
    ),
    p(`${item.issuer ? run(item.issuer, { italic: true, pt: bodyPt }) : ''}${item.credentialId ? run(`${item.issuer ? ', ' : ''}Credential ID ${item.credentialId}`, { pt: bodyPt }) : ''}`),
  ].join('')).join('');
}

function educationXml(section, bodyPt) {
  return (section.items || []).map((item) => [
    lrTabs(run(item.school, { bold: true, pt: bodyPt }), item.location ? run(item.location, { bold: true, pt: bodyPt }) : ''),
    p(`${item.degree ? run(`${item.degree}${item.details ? ',' : ''}`, { italic: true, pt: bodyPt }) : ''}${item.details ? run(` ${item.details}`, { pt: bodyPt }) : ''}`),
    item.gpa ? p(run(`Cumulative GPA: ${item.gpa}`, { pt: bodyPt })) : '',
  ].join('')).join('');
}

function additionalXml(section, bodyPt) {
  return (section.rows || []).map((row) => {
    let rest = '';
    if (row.groups?.length) {
      rest = row.groups.map((g, i) => {
        const sep = i ? run(' \u00b7 ', { pt: bodyPt }) : '';
        return `${sep}${run(`${g.label}: `, { italic: true, pt: bodyPt })}${run((g.items || []).join(', '), { pt: bodyPt })}`;
      }).join('');
    } else {
      rest = run((row.items || []).join(' \u00b7 '), { pt: bodyPt });
    }
    return p(`${run(`${row.label}: `, { bold: true, pt: bodyPt })}${rest}`);
  }).join('');
}

const RENDER = {
  experience: experienceXml,
  credentials: (s, _d, pt) => credentialsXml(s, pt),
  education: (s, _d, pt) => educationXml(s, pt),
  additional: (s, _d, pt) => additionalXml(s, pt),
};

function hyperlinkRel(id, url) {
  return `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${xml(url)}" TargetMode="External"/>`;
}

function contactRuns(header, bodyPt, rels) {
  const bits = [];
  const loc = (header.locations || []).filter(Boolean).join(' / ');
  if (loc) bits.push(run(loc, { pt: 11 }));
  if (header.phone) bits.push(run(header.phone, { pt: 11 }));
  if (header.email) {
    const rid = `rIdH${rels.length + 1}`;
    rels.push({ id: rid, url: `mailto:${header.email}` });
    bits.push(`<w:hyperlink r:id="${rid}"><w:r>${rPr({ pt: 11, color: '0000FF', underline: true })}${t(header.email)}</w:r></w:hyperlink>`);
  }
  for (const link of header.links || []) {
    if (!link?.url) continue;
    const rid = `rIdH${rels.length + 1}`;
    rels.push({ id: rid, url: link.url });
    bits.push(`<w:hyperlink r:id="${rid}"><w:r>${rPr({ pt: 11, color: '0000FF', underline: true })}${t(link.label || link.url)}</w:r></w:hyperlink>`);
  }
  const joined = [];
  bits.forEach((bit, i) => {
    if (i) joined.push(run(' \u2022 ', { pt: 11 }));
    joined.push(bit);
  });
  return joined.join('');
}

function documentXml(resume) {
  const bodyPt = resume?.fit?.fontPt || 10;
  const bulletLine = resume?.fit?.bulletLineHeight || 1.15;
  const dropped = resume?.fit?.droppedBulletIds || [];
  const header = resume?.header || {};
  const rels = [];
  const name = [header.name, header.suffix].filter(Boolean).join(', ');
  const parts = [
    p(run(name || 'Resume', { bold: true, pt: 14 }), '<w:jc w:val="center"/><w:spacing w:after="0" w:line="240" w:lineRule="auto"/>'),
    p(contactRuns(header, bodyPt, rels), '<w:jc w:val="center"/><w:spacing w:after="60" w:line="240" w:lineRule="auto"/>'),
  ];
  for (const key of resume?.sectionOrder || []) {
    const section = resume?.sections?.[key];
    if (!section || section.enabled === false) continue;
    const render = RENDER[key];
    if (!render) continue;
    const inner = render(section, dropped, bodyPt, bulletLine);
    if (!String(inner).trim()) continue;
    parts.push(sectionHead(section.title || key, bodyPt));
    parts.push(inner);
  }
  const body = `<w:body>${parts.join('')}
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720" w:header="0" w:footer="0" w:gutter="0"/>
    </w:sectPr>
  </w:body>`;
  const xmlDoc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" mc:Ignorable="w14">
${body}
</w:document>`;
  return { xmlDoc, rels };
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
  <Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault><w:rPr>
      <w:rFonts w:ascii="Cambria" w:hAnsi="Cambria" w:eastAsia="Cambria" w:cs="Cambria"/>
      <w:sz w:val="20"/><w:szCs w:val="20"/>
    </w:rPr></w:rPrDefault>
    <w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault>
  </w:docDefaults>
</w:styles>`;

const NUMBERING = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:abstractNum w:abstractNumId="0">
    <w:nsid w:val="5A5A5A5A"/>
    <w:multiLevelType w:val="hybridMultilevel"/>
    <w:lvl w:ilvl="0">
      <w:start w:val="1"/>
      <w:numFmt w:val="bullet"/>
      <w:lvlText w:val="\u2022"/>
      <w:lvlJc w:val="left"/>
      <w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr>
      <w:rPr><w:rFonts w:ascii="Symbol" w:hAnsi="Symbol" w:hint="default"/></w:rPr>
    </w:lvl>
  </w:abstractNum>
  <w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
</w:numbering>`;

const SETTINGS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:displayBackgroundShape/>
</w:settings>`;

const CORE = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>Resume</dc:title>
  <dc:creator>Brag Book</dc:creator>
</cp:coreProperties>`;

const APP = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">
  <Application>Brag Book</Application>
</Properties>`;

export function resumeDocxBytes(resume) {
  const { xmlDoc, rels } = documentXml(resume);
  const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>
  ${rels.map((rel) => hyperlinkRel(rel.id, rel.url)).join('\n  ')}
</Relationships>`;
  return zipStore([
    { name: '[Content_Types].xml', data: CONTENT_TYPES },
    { name: '_rels/.rels', data: ROOT_RELS },
    { name: 'word/document.xml', data: xmlDoc },
    { name: 'word/_rels/document.xml.rels', data: docRels },
    { name: 'word/styles.xml', data: STYLES },
    { name: 'word/numbering.xml', data: NUMBERING },
    { name: 'word/settings.xml', data: SETTINGS },
    { name: 'docProps/core.xml', data: CORE },
    { name: 'docProps/app.xml', data: APP },
  ]);
}

export function resumeDocxBlob(resume) {
  return new Blob([resumeDocxBytes(resume)], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}
