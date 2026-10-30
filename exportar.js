// PDF y Excel del historial, generados en el teléfono sin librerías externas (funciona sin internet).
'use strict';

if (typeof module !== 'undefined') Object.assign(globalThis, require('./logica.js'));

// ============================================================ PDF

// Anchos de Helvetica / Helvetica-Bold (1/1000 de em) para los bytes WinAnsi 32..255.
const ANCHOS = {
  F1: [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584,0,556,556,222,556,333,1000,556,556,333,1000,667,333,1000,556,611,556,556,222,222,333,333,350,556,1000,333,1000,500,333,944,556,500,667,278,333,556,556,556,556,260,556,333,737,370,556,584,333,737,333,400,584,333,333,333,556,537,278,333,333,365,556,834,834,834,611,667,667,667,667,667,667,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,500,556,556,556,556,278,278,278,278,556,556,556,556,556,556,556,584,611,556,556,556,556,500,556,500],
  F2: [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584,0,556,611,278,556,500,1000,556,556,333,1000,667,333,1000,611,611,611,611,278,278,500,500,350,556,1000,333,1000,556,333,944,611,500,667,278,333,556,556,556,556,280,556,333,737,370,556,584,333,737,333,400,584,333,333,333,611,556,278,333,333,365,556,834,834,834,611,722,722,722,722,722,722,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,556,556,556,556,556,278,278,278,278,611,611,611,611,611,611,611,584,611,611,611,611,611,556,611,556],
};

// Caracteres fuera de Latin-1 que sí existen en WinAnsi.
const WINANSI_EXTRA = { '€': 0x80, '…': 0x85, '–': 0x96, '—': 0x97, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95 };

/** Texto → bytes WinAnsi; lo que la fuente estándar no tiene (p. ej. emojis) se reemplaza por "?". */
function winAnsi(s) {
  const out = [];
  for (const ch of String(s)) {
    const c = ch.codePointAt(0);
    if (WINANSI_EXTRA[ch]) out.push(WINANSI_EXTRA[ch]);
    else if ((c >= 32 && c < 127) || (c >= 160 && c <= 255)) out.push(c);
    else if (ch === '−') out.push(45);
    else out.push(63);
  }
  return out;
}

const anchoTexto = (s, fuente, t) => winAnsi(s).reduce((a, b) => a + ANCHOS[fuente][b - 32], 0) / 1000 * t;

function pdfString(bytes) {
  let s = '(';
  for (const b of bytes) {
    if (b === 40 || b === 41 || b === 92) s += '\\' + String.fromCharCode(b);
    else s += String.fromCharCode(b);
  }
  return s + ')';
}

const latin1 = (s) => Uint8Array.from(s, (c) => c.charCodeAt(0) & 0xff);
const n2 = (x) => (Math.round(x * 100) / 100).toString();
const rgb = (r, g, b) => `${n2(r / 255)} ${n2(g / 255)} ${n2(b / 255)}`;

/** Tamaño de un JPEG (lee el marcador SOF). */
function medidasJpeg(b) {
  let i = 2;
  while (i < b.length) {
    const m = b[i + 1];
    const largo = (b[i + 2] << 8) | b[i + 3];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      return { alto: (b[i + 5] << 8) | b[i + 6], ancho: (b[i + 7] << 8) | b[i + 8], comps: b[i + 9] };
    }
    i += 2 + largo;
  }
  throw new Error('JPEG inválido');
}

/**
 * PDF A4 apaisado con el mismo diseño que el de Android / Windows.
 * logoJpeg: Uint8Array de un JPEG (o null).
 */
function generarPdf(cargas, titulo, logoJpeg, ahora = Date.now()) {
  const w = 842, h = 595, margen = 28, filaAlto = 16;
  const anchoUtil = w - 2 * margen;
  const pesos = [1.55, 1.1, 0.9, 0.8, 1.05, 1, 1.05, 1.05, 1.05, 1.1, 1];
  const sumaPesos = pesos.reduce((a, b) => a + b, 0);
  const anchos = pesos.map((p) => p / sumaPesos * anchoUtil);
  const oscuro = [30, 31, 36];

  const paginas = [];
  let cs = null;
  let y = 0;

  const texto = (s, x, base, fuente, t, color = oscuro) => {
    cs.push(`BT ${rgb(...color)} rg /${fuente} ${t} Tf ${n2(x)} ${n2(h - base)} Td ${pdfString(winAnsi(s))} Tj ET`);
  };

  const fila = (valores, fuente, color, fondo) => {
    if (fondo) cs.push(`${rgb(...fondo)} rg ${n2(margen)} ${n2(h - y - filaAlto)} ${n2(anchoUtil)} ${filaAlto} re f`);
    let x = margen;
    valores.forEach((v, i) => {
      const maxW = anchos[i] - 6;
      let s = String(v);
      while (anchoTexto(s, fuente, 8) > maxW && s.length > 1) s = s.slice(0, -1);
      const tx = i >= PRIMERA_COLUMNA_NUMERICA ? x + anchos[i] - 3 - anchoTexto(s, fuente, 8) : x + 3;
      texto(s, tx, y + filaAlto - 5, fuente, 8, color);
      x += anchos[i];
    });
    cs.push(`${rgb(200, 200, 205)} RG 0.5 w ${n2(margen)} ${n2(h - y - filaAlto)} m ${n2(w - margen)} ${n2(h - y - filaAlto)} l S`);
    y += filaAlto;
  };

  const nuevaPagina = () => {
    cs = [];
    paginas.push(cs);
    y = margen;
    if (paginas.length === 1) {
      if (logoJpeg) cs.push(`q 64 0 0 64 ${margen} ${n2(h - y - 64)} cm /Logo Do Q`);
      texto(TITULO_REPORTE, margen + 76, y + 24, 'F2', 15);
      texto(titulo, margen + 76, y + 42, 'F1', 10);
      texto(`Generado: ${fechaHora(ahora)}`, margen + 76, y + 56, 'F1', 9, [128, 128, 128]);
      y += 80;
    }
    fila(COLUMNAS, 'F2', [255, 255, 255], [45, 46, 51]);
    texto(`Página ${paginas.length}`, w - margen - 40, h - 14, 'F1', 8);
  };

  nuevaPagina();
  cargas.forEach((c, i) => {
    if (y + filaAlto > h - margen - 10) nuevaPagina();
    fila(celdas(c), 'F1', oscuro, i % 2 === 1 ? [242, 242, 245] : null);
  });

  const res = resumen(cargas);
  if (y + 14 + 15 * res.length > h - margen) nuevaPagina();
  y += 14;
  res.forEach(([k, v], i) => {
    const f = i === res.length - 1 ? 'F2' : 'F1';
    texto(k, margen, y + 12, f, 10);
    texto(v, margen + 300 - anchoTexto(v, f, 10), y + 12, f, 10);
    y += 15;
  });

  // ---- Armado del archivo
  const partes = [];
  let largo = 0;
  const offsets = [];
  const add = (u8) => { partes.push(u8); largo += u8.length; };
  const obj = (num, cuerpo, stream) => {
    offsets[num] = largo;
    add(latin1(`${num} 0 obj\n${cuerpo}\n`));
    if (stream) { add(latin1('stream\n')); add(stream); add(latin1('\nendstream\n')); }
    add(latin1('endobj\n'));
  };

  add(latin1('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n'));
  // 1 catálogo, 2 páginas, 3-4 fuentes, 5 logo, luego página + contenido de a pares.
  const primeraPagina = 6;
  const kids = paginas.map((_, i) => `${primeraPagina + 2 * i} 0 R`).join(' ');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, `<< /Type /Pages /Kids [${kids}] /Count ${paginas.length} >>`);
  obj(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  obj(4, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  if (logoJpeg) {
    const m = medidasJpeg(logoJpeg);
    const espacio = m.comps === 1 ? '/DeviceGray' : m.comps === 4 ? '/DeviceCMYK' : '/DeviceRGB';
    obj(5, `<< /Type /XObject /Subtype /Image /Width ${m.ancho} /Height ${m.alto} /ColorSpace ${espacio} ` +
      `/BitsPerComponent 8 /Filter /DCTDecode /Length ${logoJpeg.length} >>`, logoJpeg);
  } else {
    obj(5, '<< >>');
  }
  const recursos = `<< /Font << /F1 3 0 R /F2 4 0 R >>${logoJpeg ? ' /XObject << /Logo 5 0 R >>' : ''} >>`;
  paginas.forEach((ops, i) => {
    const num = primeraPagina + 2 * i;
    const contenido = latin1(ops.join('\n'));
    obj(num, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources ${recursos} /Contents ${num + 1} 0 R >>`);
    obj(num + 1, `<< /Length ${contenido.length} >>`, contenido);
  });

  const total = primeraPagina + 2 * paginas.length;
  const inicioXref = largo;
  let xref = `xref\n0 ${total}\n0000000000 65535 f \n`;
  for (let i = 1; i < total; i++) xref += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
  add(latin1(xref + `trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${inicioXref}\n%%EOF\n`));

  const out = new Uint8Array(largo);
  let p = 0;
  for (const u of partes) { out.set(u, p); p += u.length; }
  return out;
}

// ============================================================ EXCEL (.xlsx)

const CRC_TABLA = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(b) {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC_TABLA[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Zip sin compresión (alcanza para un .xlsx chico). */
function zip(archivos) {
  const enc = new TextEncoder();
  const partes = [];
  const central = [];
  let offset = 0;
  for (const [nombre, contenido] of archivos) {
    const n = enc.encode(nombre);
    const datos = enc.encode(contenido);
    const crc = crc32(datos);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true);
    local.setUint32(14, crc, true); local.setUint32(18, datos.length, true); local.setUint32(22, datos.length, true);
    local.setUint16(26, n.length, true);
    partes.push(new Uint8Array(local.buffer), n, datos);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
    c.setUint32(16, crc, true); c.setUint32(20, datos.length, true); c.setUint32(24, datos.length, true);
    c.setUint16(28, n.length, true); c.setUint32(42, offset, true);
    central.push(new Uint8Array(c.buffer), n);
    offset += 30 + n.length + datos.length;
  }
  const largoCentral = central.reduce((a, u) => a + u.length, 0);
  const fin = new DataView(new ArrayBuffer(22));
  fin.setUint32(0, 0x06054b50, true); fin.setUint16(8, archivos.length, true); fin.setUint16(10, archivos.length, true);
  fin.setUint32(12, largoCentral, true); fin.setUint32(16, offset, true);
  const todo = [...partes, ...central, new Uint8Array(fin.buffer)];
  const out = new Uint8Array(todo.reduce((a, u) => a + u.length, 0));
  let p = 0;
  for (const u of todo) { out.set(u, p); p += u.length; }
  return out;
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function colLetra(i) {
  let n = i + 1, s = '';
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

function generarExcel(cargas, titulo) {
  let r = 0;
  let sheet = XML_HEAD + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<sheetViews><sheetView workbookViewId="0"><pane ySplit="3" topLeftCell="A4" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>';
  [17, 14, 10, 10, 14, 13, 14, 14, 14, 14, 13].forEach((a, i) => {
    sheet += `<col min="${i + 1}" max="${i + 1}" width="${a}" customWidth="1"/>`;
  });
  sheet += '</cols><sheetData>';

  const str = (c, v, e = 0) => `<c r="${colLetra(c)}${r}" t="inlineStr" s="${e}"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
  const num = (c, v, e = 2) => `<c r="${colLetra(c)}${r}" s="${e}"><v>${v}</v></c>`;
  const formula = (c, f, e = 3) => `<c r="${colLetra(c)}${r}" s="${e}"><f>${f}</f></c>`;
  const row = (celdasXml) => { sheet += `<row r="${r}">${celdasXml}</row>`; };

  r++; row(str(0, TITULO_REPORTE, 1));
  r++; row(str(0, titulo));
  r++; row(COLUMNAS.map((c, i) => str(i, c, 4)).join(''));
  const primera = r + 1;
  cargas.forEach((c) => {
    const d = detalle(c);
    r++;
    row(str(0, fechaHora(c.fecha)) + str(1, c.cajero) + str(2, c.mesa) + str(3, senaPor(c)) +
      num(4, c.total) + num(5, c.sena) + num(6, c.efectivo) + num(7, c.digital) +
      num(8, d.totalDigital) + num(9, d.consumo) + num(10, d.fee));
  });
  const ultima = r;
  if (cargas.length) {
    r++;
    let x = str(0, `TOTALES (${cargas.length} cargas)`, 1);
    for (let i = 4; i <= 10; i++) x += formula(i, `SUM(${colLetra(i)}${primera}:${colLetra(i)}${ultima})`);
    row(x);
  }
  sheet += '</sheetData></worksheet>';

  return zip([
    ['[Content_Types].xml', XML_HEAD +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      '</Types>'],
    ['_rels/.rels', XML_HEAD +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '</Relationships>'],
    ['xl/workbook.xml', XML_HEAD +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<sheets><sheet name="Cargas" sheetId="1" r:id="rId1"/></sheets></workbook>'],
    ['xl/_rels/workbook.xml.rels', XML_HEAD +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      '</Relationships>'],
    // Estilos: 0 normal, 1 negrita, 2 moneda, 3 moneda en negrita, 4 encabezado (blanco sobre gris oscuro)
    ['xl/styles.xml', XML_HEAD +
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<numFmts count="1"><numFmt numFmtId="164" formatCode="&quot;$&quot; #,##0.00"/></numFmts>' +
      '<fonts count="3"><font><sz val="11"/><name val="Calibri"/></font>' +
      '<font><b/><sz val="11"/><name val="Calibri"/></font>' +
      '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts>' +
      '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FF2D2E33"/><bgColor indexed="64"/></patternFill></fill></fills>' +
      '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="5">' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
      '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
      '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
      '<xf numFmtId="164" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>' +
      '<xf numFmtId="0" fontId="2" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>' +
      '</cellXfs>' +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
      '</styleSheet>'],
    ['xl/worksheets/sheet1.xml', sheet],
  ]);
}

if (typeof module !== 'undefined') module.exports = { generarPdf, generarExcel, winAnsi, anchoTexto };
