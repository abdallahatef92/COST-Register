'use strict';
// Turn formula cells into Excel 365 DYNAMIC array formulas (they spill and resize themselves).
// ExcelJS writes ordinary formulas; this marks each anchor cell as an array formula over its current size (ref)
// with the dynamic-array cell metadata (cm="1" -> xl/metadata.xml XLDAPR), as Excel itself stores them.
const fs = require('fs');
const JSZip = require('jszip');

const META =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<metadata xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:xda="http://schemas.microsoft.com/office/spreadsheetml/2017/dynamicarray">' +
  '<metadataTypes count="1"><metadataType name="XLDAPR" minSupportedVersion="120000" copy="1" pasteAll="1" pasteValues="1" merge="1" splitFirst="1" rowColShift="1" clearFormats="1" clearComments="1" assign="1" coerce="1" cellMeta="1"/></metadataTypes>' +
  '<futureMetadata name="XLDAPR" count="1"><bk><extLst><ext uri="{bdbb8cdc-fa1e-496e-a857-3c3f30c029c3}"><xda:dynamicArrayProperties fDynamic="1" fCollapsed="0"/></ext></extLst></bk></futureMetadata>' +
  '<cellMetadata count="1"><bk><rc t="1" v="0"/></bk></cellMetadata></metadata>';
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

async function markDynamic(file, anchors) {
  if (!anchors || !anchors.length) return;
  const z = await JSZip.loadAsync(fs.readFileSync(file));
  const wbx = await z.file('xl/workbook.xml').async('string'),
    rels = await z.file('xl/_rels/workbook.xml.rels').async('string');
  const rid = new Map();
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = /Id="([^"]+)"/.exec(m[0]),
      t = /Target="([^"]+)"/.exec(m[0]);
    if (id && t) rid.set(id[1], t[1].replace(/^\/?xl\//, ''));
  }
  const path = new Map();
  for (const m of wbx.matchAll(/<sheet\b[^>]*>/g)) {
    const n = /name="([^"]+)"/.exec(m[0]),
      r = /r:id="([^"]+)"/.exec(m[0]);
    if (n && r) path.set(n[1], 'xl/' + rid.get(r[1]));
  }
  const bySheet = new Map();
  for (const a of anchors) {
    const p = path.get(esc(a.sheet)) || path.get(a.sheet);
    if (!p) throw new Error('dynamic array: sheet not found ' + a.sheet);
    (bySheet.get(p) || bySheet.set(p, []).get(p)).push(a);
  }
  for (const [p, list] of bySheet) {
    let s = await z.file(p).async('string');
    for (const a of list) {
      const re = new RegExp(`<c r="${a.cell}"([^>]*)><f>`);
      if (!re.test(s)) throw new Error(`dynamic array: no formula in ${a.sheet}!${a.cell}`);
      s = s.replace(re, (m, attrs) => `<c r="${a.cell}"${attrs.replace(/\s*cm="\d+"/, '')} cm="1"><f t="array" ref="${a.ref}">`);
    }
    z.file(p, s);
  }
  z.file('xl/metadata.xml', META);
  let ct = await z.file('[Content_Types].xml').async('string');
  if (!ct.includes('/xl/metadata.xml'))
    ct = ct.replace(
      '</Types>',
      '<Override PartName="/xl/metadata.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheetMetadata+xml"/></Types>'
    );
  z.file('[Content_Types].xml', ct);
  if (!rels.includes('relationships/sheetMetadata'))
    z.file(
      'xl/_rels/workbook.xml.rels',
      rels.replace(
        '</Relationships>',
        '<Relationship Id="rIdDynMeta" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sheetMetadata" Target="metadata.xml"/></Relationships>'
      )
    );
  fs.writeFileSync(file, await z.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } }));
}
module.exports = { markDynamic };
