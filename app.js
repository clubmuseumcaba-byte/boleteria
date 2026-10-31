// Pantallas y guardado. Los cálculos están en logica.js y la exportación en exportar.js.
'use strict';

const $ = (id) => document.getElementById(id);

// ---------- Guardado en el teléfono

const almacen = {
  leer(clave) {
    try { return localStorage.getItem('boleteria.' + clave); } catch { return null; }
  },
  escribir(clave, valor) {
    try { localStorage.setItem('boleteria.' + clave, valor); } catch { aviso('No se pudo guardar en este dispositivo.'); }
  },
};

const nuevoUid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

let historial = [];
try { historial = JSON.parse(almacen.leer('historial') || '[]'); } catch { historial = []; }
const guardarHistorial = () => almacen.escribir('historial', JSON.stringify(historial));
// Cada carga lleva un identificador único, para que la planilla no la anote dos veces.
if (historial.some((c) => !c.uid)) {
  historial.forEach((c) => { if (!c.uid) c.uid = nuevoUid(); });
  guardarHistorial();
}

// Pide que el navegador no borre los datos por falta de espacio.
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

// ---------- Tema

const ICONOS_TEMA = {
  claro: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  oscuro: '<svg viewBox="0 0 24 24"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  sistema: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor"/></svg>',
};

function aplicarTema(t) {
  const raiz = document.documentElement;
  if (t === 'claro') raiz.dataset.theme = 'light';
  else if (t === 'oscuro') raiz.dataset.theme = 'dark';
  else delete raiz.dataset.theme;
  $('btnTema').innerHTML = ICONOS_TEMA[t] || ICONOS_TEMA.sistema;
  document.querySelectorAll('#menuTema button').forEach((b) => b.classList.toggle('activo', b.dataset.tema === t));
  const oscuro = t === 'oscuro' || (t !== 'claro' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]').content = oscuro ? '#15161B' : '#F4F4F6';
}
let tema = almacen.leer('tema') || 'sistema';
aplicarTema(tema);
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => aplicarTema(tema));

$('btnTema').addEventListener('click', (e) => { e.stopPropagation(); $('menuTema').hidden = !$('menuTema').hidden; });
document.addEventListener('click', () => { $('menuTema').hidden = true; });
document.querySelectorAll('#menuTema button').forEach((b) => b.addEventListener('click', () => {
  tema = b.dataset.tema;
  almacen.escribir('tema', tema);
  aplicarTema(tema);
}));

// ---------- Aviso breve

let timerAviso;
function aviso(texto) {
  const t = $('toast');
  t.textContent = texto;
  t.hidden = false;
  clearTimeout(timerAviso);
  timerAviso = setTimeout(() => { t.hidden = true; }, 3500);
}

// ---------- Pestañas / pantalla ancha

function mostrarPanel(p) {
  $('pCobro').classList.toggle('visible', p === 'cobro');
  $('pHistorial').classList.toggle('visible', p === 'historial');
  document.querySelectorAll('#pestanas button').forEach((b) => b.classList.toggle('activo', b.dataset.p === p));
  window.scrollTo(0, 0);
}
document.querySelectorAll('#pestanas button').forEach((b) => b.addEventListener('click', () => mostrarPanel(b.dataset.p)));
mostrarPanel('cobro');

const ancho = matchMedia('(min-width: 900px)');
const ajustarAncho = () => document.body.classList.toggle('ancho', ancho.matches);
ancho.addEventListener('change', ajustarAncho);
ajustarAncho();

// ============================================================ COBRAR

const form = { totalTxt: '', haySena: false, senaTxt: '', senaDigital: false, efectivoTxt: '', digitalTxt: '' };
let ultimoEditado = 'efectivo';

const soloMonto = (v) => v.replace(/[^\d.,]/g, '');

/** El campo que el cajero no tocó último se completa con lo que falta para el saldo. */
function recalcular() {
  const r = calcular(form);
  if (r.total <= 0) return;
  if (ultimoEditado === 'efectivo') {
    if (form.efectivoTxt.trim() || form.digitalTxt.trim()) {
      form.digitalTxt = plain(Math.max(r.saldo - (parseMonto(form.efectivoTxt) ?? 0), 0));
    }
  } else {
    form.efectivoTxt = plain(Math.max(r.saldo - (parseMonto(form.digitalTxt) ?? 0), 0));
  }
}

function pintarCobro() {
  const r = calcular(form);
  // Solo se reescriben los campos que cambió el cálculo, para no mover el cursor del que se está tipeando.
  for (const [id, k] of [['total', 'totalTxt'], ['sena', 'senaTxt'], ['efectivo', 'efectivoTxt'], ['digital', 'digitalTxt']]) {
    const el = $(id);
    if (el.value !== form[k]) el.value = form[k];
    el.classList.toggle('invalido', form[k].trim() !== '' && parseMonto(form[k]) == null);
  }
  $('haySena').checked = form.haySena;
  $('bloqueSena').hidden = !form.haySena;
  document.querySelectorAll('#senaMedio button').forEach((b) =>
    b.classList.toggle('activo', (b.dataset.v === 'digital') === form.senaDigital));

  $('saldo').textContent = money(r.saldo);
  $('todoEfectivo').disabled = $('todoDigital').disabled = r.saldo <= 0;

  const hayPago = form.efectivoTxt.trim() || form.digitalTxt.trim();
  $('dif').hidden = !(r.saldo > 0 && hayPago && !montosIguales(r.diferencia, 0));
  $('dif').textContent = r.diferencia > 0
    ? `Faltan ${money(r.diferencia)} para completar el saldo`
    : `Se pasa por ${money(-r.diferencia)} del saldo`;

  $('rEfectivo').textContent = money(r.efectivo);
  $('rDigital').textContent = money(r.digital);
  $('rTotal').textContent = money(r2(r.efectivo + r.digital));
  $('notaSena').hidden = !(r.sena > 0);
  $('notaSena').textContent = `Ya dejó una seña de ${money(r.sena)} (${r.senaDigital ? 'medio digital' : 'efectivo'})`;

  $('rConsumo').textContent = money(r.consumo);
  $('rFee').textContent = money(r.fee);
  let nota = '';
  if (r.fee > 0) {
    nota = `FEE = ${DESCUENTO_DIGITAL_PCT} % de ${money(r.totalDigital)} pagado por medio digital` +
      (r.senaDigital && r.sena > 0 ? ' (incluye la seña)' : '');
  } else if (r.sena > 0 && r.saldo <= 0) {
    nota = 'La seña cubre toda la mesa: va todo al consumo, sin FEE';
  } else if (r.senaDigital && r.sena > 0) {
    nota = 'El saldo se paga todo en efectivo: va todo al consumo, sin FEE (aunque la seña fue digital)';
  }
  $('notaFee').hidden = !nota;
  $('notaFee').textContent = nota;
}

function enlazarMonto(id, clave, alCambiar) {
  $(id).addEventListener('input', (e) => {
    const limpio = soloMonto(e.target.value);
    if (limpio !== e.target.value) e.target.value = limpio;
    form[clave] = limpio;
    if (alCambiar) alCambiar();
    recalcular();
    pintarCobro();
  });
}
enlazarMonto('total', 'totalTxt');
enlazarMonto('sena', 'senaTxt');
enlazarMonto('efectivo', 'efectivoTxt', () => { ultimoEditado = 'efectivo'; });
enlazarMonto('digital', 'digitalTxt', () => { ultimoEditado = 'digital'; });

$('haySena').addEventListener('change', (e) => {
  form.haySena = e.target.checked;
  recalcular(); pintarCobro();
  if (form.haySena) $('sena').focus();
});
document.querySelectorAll('#senaMedio button').forEach((b) => b.addEventListener('click', () => {
  form.senaDigital = b.dataset.v === 'digital';
  pintarCobro();
}));

$('todoEfectivo').addEventListener('click', () => {
  form.efectivoTxt = plain(calcular(form).saldo); ultimoEditado = 'efectivo'; recalcular(); pintarCobro();
});
$('todoDigital').addEventListener('click', () => {
  form.digitalTxt = plain(calcular(form).saldo); ultimoEditado = 'digital'; recalcular(); pintarCobro();
});

// "Siguiente" del teclado pasa al próximo campo; en el último, lo cierra.
const orden = ['cajero', 'mesa', 'total', 'sena', 'efectivo', 'digital'];
orden.forEach((id) => $(id).addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const siguientes = orden.slice(orden.indexOf(id) + 1).map($).filter((el) => el.offsetParent !== null);
  if (siguientes.length) siguientes[0].focus(); else e.target.blur();
}));

$('cajero').value = almacen.leer('cajero') || '';
$('cajero').addEventListener('input', (e) => almacen.escribir('cajero', e.target.value));

function limpiar() {
  Object.assign(form, { totalTxt: '', haySena: false, senaTxt: '', senaDigital: false, efectivoTxt: '', digitalTxt: '' });
  ultimoEditado = 'efectivo';
  $('mesa').value = '';
  $('error').hidden = true;
  pintarCobro();
}
$('limpiar').addEventListener('click', limpiar);

$('registrar').addEventListener('click', () => {
  document.activeElement && document.activeElement.blur();
  const r = calcular(form);
  if (r.error) {
    $('error').textContent = r.error;
    $('error').hidden = false;
    return;
  }
  const ahora = Date.now();
  historial.unshift({
    id: ahora, uid: nuevoUid(), fecha: ahora,
    cajero: $('cajero').value.trim(), mesa: $('mesa').value.trim(),
    total: r.total, sena: r.sena, senaDigital: r.senaDigital, efectivo: r.efectivo, digital: r.digital,
  });
  guardarHistorial();
  limpiar();
  pintarHistorial();
  window.scrollTo(0, 0);
  aviso(`Carga registrada: consumo ${money(r.consumo)} + FEE ${money(r.fee)}`);
  sincronizar();
});

// ============================================================ HISTORIAL

let filtro = 'turno';
document.querySelectorAll('#filtro button').forEach((b) => b.addEventListener('click', () => {
  filtro = b.dataset.v;
  pintarHistorial();
}));

function historialFiltrado() {
  if (filtro === 'todo') return historial.slice();
  const desde = inicioTurno();
  return historial.filter((c) => c.fecha >= desde);
}

const tituloReporte = (lista) => filtro === 'turno'
  ? `Turno desde el ${fechaHora(inicioTurno())} — ${lista.length} cargas`
  : `Historial completo — ${lista.length} cargas`;

const ICONO_BORRAR = '<svg viewBox="0 0 24 24"><path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13M10 11v6M14 11v6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const escHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function pintarHistorial() {
  document.querySelectorAll('#filtro button').forEach((b) => b.classList.toggle('activo', b.dataset.v === filtro));
  const lista = historialFiltrado();
  const t = totales(lista);
  $('resumen').innerHTML = `<h2>Resumen</h2>
    <div class="fila-monto"><span>Cargas</span><b>${lista.length}</b></div>
    <div class="fila-monto"><span>En efectivo (seña + saldo)</span><b>${money(t.efectivo)}</b></div>
    <div class="fila-monto"><span>Medio digital (seña + saldo)</span><b>${money(t.digital)}</b></div>
    <div class="fila-monto"><span>CONSUMO cargado</span><b>${money(t.consumo)}</b></div>
    <div class="fila-monto"><span>FEE cargado</span><b>${money(t.fee)}</b></div>
    <hr><div class="fila-monto fuerte"><span>TOTAL MESAS</span><b>${money(t.total)}</b></div>`;
  $('expPdf').disabled = $('expExcel').disabled = lista.length === 0;
  $('borrarTodo').hidden = historial.length === 0;

  if (!lista.length) {
    $('lista').innerHTML = `<div class="vacio">${filtro === 'turno' ? 'Todavía no hay cargas en este turno.' : 'No hay cargas registradas.'}</div>`;
    return;
  }
  $('lista').innerHTML = lista.map((c) => {
    const d = detalle(c);
    const quien = [c.mesa && `Mesa ${escHtml(c.mesa)}`, c.cajero && `Cajero: ${escHtml(c.cajero)}`].filter(Boolean).join(' · ');
    return `<div class="item"><div class="cuerpo">
      <div class="cab"><span class="fecha">${fechaHora(c.fecha)}</span><span class="monto">${money(c.total)}</span></div>
      ${quien ? `<div class="quien">${quien}</div>` : ''}
      <div class="det"><b>Consumo ${money(d.consumo)} + FEE ${money(d.fee)}</b></div>
      ${c.sena > 0 ? `<div class="det">Seña ${money(c.sena)} (${senaPor(c).toLowerCase()})</div>` : ''}
      <div class="pagos"><span class="c-efectivo">Saldo efectivo ${money(c.efectivo)}</span><span class="c-digital">Saldo digital ${money(c.digital)}</span></div>
      ${conexion && !c.enviada ? '<div class="chip-pend">⏳ Pendiente de enviar a la planilla</div>' : ''}
    </div><button class="borrar" data-id="${c.id}" aria-label="Borrar">${ICONO_BORRAR}</button></div>`;
  }).join('');
}

$('lista').addEventListener('click', (e) => {
  const b = e.target.closest('.borrar');
  if (!b) return;
  const c = historial.find((x) => String(x.id) === b.dataset.id);
  if (!c || !confirm(`¿Borrar esta carga?\n\n${fechaHora(c.fecha)} — ${money(c.total)}. No se puede deshacer.`)) return;
  historial = historial.filter((x) => x !== c);
  guardarHistorial();
  // Si ya estaba en la planilla, allá queda marcada como BORRADA.
  if (c.enviada) {
    borradasPendientes.push({ uid: c.uid, cuando: Date.now() });
    guardarBorradas();
    sincronizar();
  }
  pintarHistorial();
});

$('borrarTodo').addEventListener('click', () => {
  const sinEnviar = conexion ? historial.filter((c) => !c.enviada).length : 0;
  const extra = sinEnviar ? `\n\nAtención: ${sinEnviar} cargas todavía no llegaron a la planilla y se van a perder.` : '';
  if (!confirm(`¿Borrar todo el historial de este teléfono?\n\nSe eliminan las ${historial.length} cargas guardadas. Exportalo antes si lo necesitás. No se puede deshacer.` +
    (conexion ? ' Las que ya están en la planilla quedan allá.' : '') + extra)) return;
  historial = [];
  guardarHistorial();
  pintarHistorial();
});

// ============================================================ PLANILLA (Google Sheets)

let conexion = null; // { u: url del script, k: clave }
try { conexion = JSON.parse(almacen.leer('conexion') || 'null'); } catch { conexion = null; }
let borradasPendientes = [];
try { borradasPendientes = JSON.parse(almacen.leer('borradas') || '[]'); } catch { borradasPendientes = []; }
const guardarBorradas = () => almacen.escribir('borradas', JSON.stringify(borradasPendientes));
let ultimoError = null;
let enviando = false;

/** "BOLETERIA-<base64>" → { u, k }, o null si el código no es válido. */
function leerCodigo(texto) {
  try {
    let s = texto.replace(/\s/g, '').replace(/^BOLETERIA-/i, '');
    s = s.replace(/-/g, '+').replace(/_/g, '/');
    const c = JSON.parse(decodeURIComponent(escape(atob(s))));
    const valida = /^https:\/\//.test(c.u) || /^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(c.u); // local: solo pruebas
    return c && valida && c.k ? { u: c.u, k: c.k } : null;
  } catch { return null; }
}

const pendientes = () => historial.filter((c) => !c.enviada);

function paraPlanilla(c) {
  const d = detalle(c);
  return {
    uid: c.uid, fecha: c.fecha, cajero: c.cajero, mesa: c.mesa, total: c.total, sena: c.sena, senaPor: senaPor(c),
    efectivo: c.efectivo, digital: c.digital, totalDigital: d.totalDigital, consumo: d.consumo, fee: d.fee,
  };
}

/** Manda lo pendiente. Si no hay señal o falla, queda guardado y se reintenta solo. */
async function sincronizar(manual = false) {
  if (!conexion || enviando) return;
  const cargas = pendientes().slice(0, 200);
  const borradas = borradasPendientes.slice(0, 200);
  if (!cargas.length && !borradas.length) { ultimoError = null; pintarNube(); if (manual) aviso('No hay nada pendiente: todo está en la planilla.'); return; }
  if (!navigator.onLine) { ultimoError = 'Sin conexión a internet'; pintarNube(); if (manual) aviso('Sin internet: se envía solo cuando vuelva la señal.'); return; }
  enviando = true;
  try {
    const r = await fetch(conexion.u, {
      method: 'POST',
      // text/plain evita la consulta previa (CORS) que Google no responde.
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ k: conexion.k, cargas: cargas.map(paraPlanilla), borradas }),
    });
    const res = await r.json();
    if (!res.ok) throw new Error(res.error === 'clave' ? 'El código de activación no es válido' : res.error || 'Error de la planilla');
    const ok = new Set(res.recibidas || []);
    historial.forEach((c) => { if (ok.has(c.uid)) c.enviada = true; });
    guardarHistorial();
    const okB = new Set(res.borradas || []);
    borradasPendientes = borradasPendientes.filter((b) => !okB.has(b.uid));
    guardarBorradas();
    ultimoError = null;
    if (manual) aviso('Enviado a la planilla.');
  } catch (e) {
    ultimoError = e.message === 'Failed to fetch' || e.name === 'TypeError' ? 'No se pudo conectar con la planilla' : e.message;
    if (manual) aviso(ultimoError);
  } finally {
    enviando = false;
    pintarNube();
    pintarHistorial();
  }
  // Si quedó más (más de 200 de una vez), sigue.
  if (!ultimoError && (pendientes().length || borradasPendientes.length)) sincronizar(manual);
}

function pintarNube() {
  const n = pendientes().length + borradasPendientes.length;
  const punto = $('nubeEstado');
  punto.className = !conexion ? 'apagada' : n ? 'pendiente' : 'ok';
  $('planillaConectada').hidden = !conexion;
  $('planillaSinConectar').hidden = !!conexion;
  if (conexion) {
    $('planillaEstado').textContent = n
      ? `Conectada. Faltan enviar ${n} ${n === 1 ? 'movimiento' : 'movimientos'}${ultimoError ? ` (${ultimoError})` : ''}. Se envían solos cuando hay internet.`
      : 'Conectada. Todas las cargas están en la planilla.';
  }
}

$('btnNube').addEventListener('click', (e) => {
  e.stopPropagation();
  pintarNube();
  $('dlgPlanilla').showModal();
});
$('cerrarPlanilla').addEventListener('click', () => $('dlgPlanilla').close());
$('enviarAhora').addEventListener('click', () => sincronizar(true));
$('activar').addEventListener('click', () => {
  const c = leerCodigo($('codigoActivacion').value);
  if (!c) { aviso('Ese código no es válido. Copialo completo, tal cual te lo mandaron.'); return; }
  conexion = c;
  almacen.escribir('conexion', JSON.stringify(c));
  $('codigoActivacion').value = '';
  pintarNube();
  pintarHistorial();
  aviso('Conectada a la planilla.');
  sincronizar(true);
});
$('desconectar').addEventListener('click', () => {
  const n = pendientes().length;
  if (!confirm('¿Desconectar este teléfono de la planilla?' +
    (n ? `\n\nHay ${n} cargas que todavía no se enviaron y no van a llegar a la planilla.` : ''))) return;
  conexion = null;
  try { localStorage.removeItem('boleteria.conexion'); } catch {}
  pintarNube();
  pintarHistorial();
});

// Reintentos: al volver la señal, al volver a la app y cada minuto.
window.addEventListener('online', () => sincronizar());
document.addEventListener('visibilitychange', () => { if (!document.hidden) sincronizar(); });
setInterval(() => sincronizar(), 60000);

// ---------- Exportar: en el iPhone abre el menú Compartir (WhatsApp, Mail, Archivos…)

async function entregar(bytes, nombre, tipo) {
  const archivo = new File([bytes], nombre, { type: tipo });
  if (navigator.canShare && navigator.canShare({ files: [archivo] })) {
    try {
      await navigator.share({ files: [archivo], title: 'Club Museum — cargas de tarjeta' });
    } catch (e) {
      if (e.name !== 'AbortError') aviso('No se pudo compartir: ' + e.message);
    }
    return;
  }
  const url = URL.createObjectURL(archivo);
  const a = document.createElement('a');
  a.href = url; a.download = nombre;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  aviso('Archivo descargado: ' + nombre);
}

let logoPdf = null;
async function cargarLogoPdf() {
  if (logoPdf) return logoPdf;
  try { logoPdf = new Uint8Array(await (await fetch('logo-pdf.jpg')).arrayBuffer()); } catch { logoPdf = null; }
  return logoPdf;
}
cargarLogoPdf();

$('expPdf').addEventListener('click', async () => {
  const lista = historialFiltrado();
  try {
    await entregar(generarPdf(lista, tituloReporte(lista), await cargarLogoPdf()), nombreArchivo('pdf'), 'application/pdf');
  } catch (e) { aviso('No se pudo exportar: ' + e.message); }
});
$('expExcel').addEventListener('click', async () => {
  const lista = historialFiltrado();
  try {
    await entregar(generarExcel(lista, tituloReporte(lista)), nombreArchivo('xlsx'),
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  } catch (e) { aviso('No se pudo exportar: ' + e.message); }
});

// El filtro "Turno actual" depende de la hora: se refresca al volver a la app.
document.addEventListener('visibilitychange', () => { if (!document.hidden) pintarHistorial(); });

pintarCobro();
pintarHistorial();
pintarNube();
sincronizar();

// ---------- Funciona sin internet
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
