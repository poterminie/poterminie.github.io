// Minimalny generator plików .docx i .zip bez zależności (Node 20).
// Treść to lista bloków:
//   { t: 'title' | 'h' | 'p' | 'li' | 'small', text, align?: 'left'|'right'|'center'|'both', space?: liczba pt po akapicie }
//   { t: 'table', rows: [[...komórki]], widths?: [twipy], header?: true }
//   { t: 'sign', left?: 'podpis', right?: 'podpis' }   - linie do podpisu
//   { t: 'gap', n?: 1 }                                - puste wiersze
// W tekście: **pogrubienie**, [[pole do uzupełnienia]] - zaznaczane na żółto.
import { deflateRawSync } from 'node:zlib';

const xmlEsc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function runs(text, base = {}) {
  const out = [];
  const push = (t, o) => {
    if (!t) return;
    const pr = [];
    if (o.bold) pr.push('<w:b/>');
    // kolejność elementów zgodna ze schematem OOXML (b, color, sz, szCs, highlight)
    if (o.color) pr.push(`<w:color w:val="${o.color}"/>`);
    if (o.size) pr.push(`<w:sz w:val="${o.size}"/><w:szCs w:val="${o.size}"/>`);
    if (o.hl) pr.push('<w:highlight w:val="yellow"/>');
    out.push(`<w:r>${pr.length ? `<w:rPr>${pr.join('')}</w:rPr>` : ''}<w:t xml:space="preserve">${xmlEsc(t)}</w:t></w:r>`);
  };
  // **…** może zawierać [[…]], więc pogrubienie przetwarzamy rekurencyjnie
  const parse = (line, o) => {
    const re = o.bold ? /(\[\[[^\]]+\]\])/g : /(\*\*.+?\*\*|\[\[[^\]]+\]\])/g;
    let last = 0, m;
    while ((m = re.exec(line))) {
      push(line.slice(last, m.index), o);
      const tok = m[0];
      if (tok.startsWith('**')) parse(tok.slice(2, -2), { ...o, bold: true });
      else push(tok.slice(2, -2), { ...o, hl: true });
      last = m.index + tok.length;
    }
    push(line.slice(last), o);
  };
  const lines = String(text).split('\n');
  lines.forEach((line, i) => {
    parse(line, base);
    if (i < lines.length - 1) out.push('<w:r><w:br/></w:r>');
  });
  return out.join('');
}

function para(text, { align = 'left', after = 120, before = 0, style = '', ind = '', base = {}, keep = false } = {}) {
  const ppr = [];
  if (style) ppr.push(`<w:pStyle w:val="${style}"/>`);
  if (keep) ppr.push('<w:keepNext/>');
  ppr.push(`<w:spacing w:before="${before}" w:after="${after}"/>`);
  if (ind) ppr.push(ind);
  if (align !== 'left') ppr.push(`<w:jc w:val="${align}"/>`);
  return `<w:p><w:pPr>${ppr.join('')}</w:pPr>${runs(text, base)}</w:p>`;
}

function table(b) {
  const total = 9638;
  const n = b.rows[0].length;
  const widths = b.widths || Array(n).fill(Math.floor(total / n));
  const border = '<w:tblBorders>' + ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((k) => `<w:${k} w:val="single" w:sz="4" w:space="0" w:color="999999"/>`).join('') + '</w:tblBorders>';
  const rows = b.rows.map((r, ri) => `<w:tr>${r.map((c, ci) => `<w:tc><w:tcPr><w:tcW w:w="${widths[ci]}" w:type="dxa"/>${b.header && ri === 0 ? '<w:shd w:val="clear" w:color="auto" w:fill="E3F2EC"/>' : ''}</w:tcPr>${para(c, { after: 40, base: b.header && ri === 0 ? { bold: true } : {} })}</w:tc>`).join('')}</w:tr>`).join('');
  return `<w:tbl><w:tblPr><w:tblW w:w="${total}" w:type="dxa"/>${border}<w:tblCellMar><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${widths.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>${rows}</w:tbl>${para('', { after: 120 })}`;
}

function sign(b) {
  const cell = (label) => `<w:tc><w:tcPr><w:tcW w:w="4819" w:type="dxa"/></w:tcPr>${label ? para('\n\n.......................................................', { align: 'center', after: 0 }) + para(label, { align: 'center', after: 0, base: { size: 18, color: '555555' } }) : para('')}</w:tc>`;
  return `<w:tbl><w:tblPr><w:tblW w:w="9638" w:type="dxa"/><w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders></w:tblPr><w:tblGrid><w:gridCol w:w="4819"/><w:gridCol w:w="4819"/></w:tblGrid><w:tr>${cell(b.left || '')}${cell(b.right || '')}</w:tr></w:tbl>`;
}

function body(blocks) {
  return blocks.map((b) => {
    switch (b.t) {
      case 'title': return para(b.text, { align: 'center', before: 240, after: 240, style: 'Title' });
      case 'h': return para(b.text, { before: 200, after: 80, style: 'Heading1', keep: true });
      case 'li': return para('•  ' + b.text, { after: 60, ind: '<w:ind w:left="360" w:hanging="220"/>', align: b.align || 'left' });
      case 'small': return para(b.text, { after: b.space ?? 80, base: { size: 18, color: '555555' } });
      case 'table': return table(b);
      case 'sign': return sign(b);
      case 'gap': return Array(b.n || 1).fill(para('', { after: 0 })).join('');
      default: return para(b.text, { align: b.align || 'both', after: b.space ?? 120 });
    }
  }).join('');
}

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

export function docx(blocks, { title = '' } = {}) {
  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${W}><w:body>${body(blocks)}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles ${W}>
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="pl-PL"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:qFormat/><w:rPr><w:b/><w:sz w:val="30"/><w:szCs w:val="30"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:color w:val="0A6B4D"/><w:sz w:val="26"/><w:szCs w:val="26"/></w:rPr></w:style>
</w:styles>`;
  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xmlEsc(title)}</dc:title><dc:creator></dc:creator><cp:lastModifiedBy></cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`;
  return zip([
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`],
    ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`],
    ['word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ['word/document.xml', doc],
    ['word/styles.xml', styles],
    ['docProps/core.xml', core]
  ]);
}

/* ---------- ZIP ---------- */
const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc32 = (buf) => { let c = -1; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };

export function zip(entries) {
  const d = new Date();
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  const locals = [], centrals = [];
  let offset = 0;
  for (const [name, content] of entries) {
    const data = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
    const comp = deflateRawSync(data, { level: 9 });
    const nameBuf = Buffer.from(name, 'utf8');
    const crc = crc32(data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(8, 8);
    lh.writeUInt16LE(time, 10); lh.writeUInt16LE(date, 12); lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(nameBuf.length, 26); lh.writeUInt16LE(0, 28);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(8, 10);
    ch.writeUInt16LE(time, 12); ch.writeUInt16LE(date, 14); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(data.length, 24);
    ch.writeUInt16LE(nameBuf.length, 28); ch.writeUInt32LE(offset, 42);
    locals.push(lh, nameBuf, comp);
    centrals.push(ch, nameBuf);
    offset += 30 + nameBuf.length + comp.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}
