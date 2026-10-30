// Cálculos de la boletería. Misma lógica que la app de Android y la de Windows.
'use strict';

/** Lo que se descuenta del consumo por cada peso pagado por medio digital; se carga como FEE. */
const DESCUENTO_DIGITAL_PCT = 15;

const r2 = (x) => Math.round(x * 100) / 100;
const montosIguales = (a, b) => Math.abs(a - b) < 0.005;

/**
 * Reparte el total de la mesa entre CONSUMO y FEE.
 * Si el saldo en boletería se paga todo en efectivo, va todo al consumo (FEE 0), aunque la seña haya sido digital.
 * Si no, FEE = 15 % de todo lo pagado por medio digital (seña incluida si fue digital); CONSUMO = total − FEE.
 */
function calcularFee(senaDigital, saldoDigital) {
  return saldoDigital <= 0 ? 0 : r2((senaDigital + saldoDigital) * DESCUENTO_DIGITAL_PCT / 100);
}

/** Agrega los montos calculados a una carga guardada {total, sena, senaDigital, efectivo, digital}. */
function detalle(c) {
  const senaEnDigital = c.senaDigital ? c.sena : 0;
  const senaEfectivo = c.senaDigital ? 0 : c.sena;
  const fee = calcularFee(senaEnDigital, c.digital);
  return {
    ...c,
    totalEfectivo: r2(senaEfectivo + c.efectivo),
    totalDigital: r2(senaEnDigital + c.digital),
    fee,
    consumo: r2(c.total - fee),
  };
}

const fmtMoney = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "$ 12.345,50" */
const money = (x) => '$ ' + fmtMoney.format(x);

/** Formato para volver a poner en un campo editable: "12345,5" */
const plain = (x) => String(r2(x)).replace('.', ',');

/**
 * Interpreta lo que escribe el cajero: "15000", "15.000", "15.000,50", "15000,5" o "15000.5".
 * Devuelve null si está vacío o no es un número.
 */
function parseMonto(raw) {
  let s = String(raw).trim().replace(/\$/g, '').replace(/\s/g, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ''); // "15.000": puntos de miles
  if (!/^\d*\.?\d+$|^\d+\.$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

const dos = (n) => String(n).padStart(2, '0');
function fechaHora(ms) {
  const d = new Date(ms);
  return `${dos(d.getDate())}/${dos(d.getMonth() + 1)}/${d.getFullYear()} ${dos(d.getHours())}:${dos(d.getMinutes())}`;
}

/** El turno de la noche arranca a las 12:00 del mediodía y termina a las 11:59 del día siguiente. */
function inicioTurno(ahora = new Date()) {
  const d = new Date(ahora);
  if (d.getHours() < 12) d.setDate(d.getDate() - 1);
  d.setHours(12, 0, 0, 0);
  return d.getTime();
}

/**
 * Estado del formulario de cobro → montos calculados y, si falta algo, el error a mostrar.
 * f = {totalTxt, haySena, senaTxt, senaDigital, efectivoTxt, digitalTxt}
 */
function calcular(f) {
  const total = parseMonto(f.totalTxt) ?? 0;
  const sena = f.haySena ? parseMonto(f.senaTxt) ?? 0 : 0;
  const senaDigital = f.haySena && f.senaDigital;
  const saldo = r2(Math.max(total - sena, 0));
  const efectivo = parseMonto(f.efectivoTxt) ?? 0;
  const digital = parseMonto(f.digitalTxt) ?? 0;
  const d = detalle({ total, sena, senaDigital, efectivo, digital });
  const diferencia = r2(saldo - efectivo - digital);

  let error = null;
  if (total <= 0) error = 'Ingresá el TOTAL DE LA MESA.';
  else if (f.haySena && (parseMonto(f.senaTxt) ?? 0) <= 0) error = 'Ingresá el monto de la SEÑA.';
  else if (sena > total) error = 'La SEÑA no puede ser mayor que el total de la mesa.';
  else if (f.efectivoTxt.trim() && parseMonto(f.efectivoTxt) == null) error = 'El monto en efectivo no es válido.';
  else if (f.digitalTxt.trim() && parseMonto(f.digitalTxt) == null) error = 'El monto por medio digital no es válido.';
  else if (saldo > 0 && !f.efectivoTxt.trim() && !f.digitalTxt.trim())
    error = 'Indicá cuánto del saldo paga en efectivo y cuánto por medio digital.';
  else if (!montosIguales(diferencia, 0))
    error = diferencia > 0 ? `Faltan ${money(diferencia)} para completar el saldo.` : `Se pasa por ${money(-diferencia)} del saldo.`;

  return { ...d, saldo, diferencia, error };
}

// ---------- Reporte (PDF / Excel)

const TITULO_REPORTE = 'CLUB MUSEUM — Historial de cargas de tarjeta';

const COLUMNAS = [
  'Fecha', 'Cajero', 'Mesa', 'Seña por', 'Total mesa', 'Seña',
  'Saldo efectivo', 'Saldo digital', 'Total digital', 'CONSUMO', 'FEE',
];

/** Las columnas desde esta se alinean a la derecha (montos). */
const PRIMERA_COLUMNA_NUMERICA = 4;

const senaPor = (c) => (c.sena <= 0 ? '—' : c.senaDigital ? 'Digital' : 'Efectivo');

function celdas(c) {
  const d = detalle(c);
  return [
    fechaHora(c.fecha), c.cajero, c.mesa, senaPor(c), money(c.total), money(c.sena),
    money(c.efectivo), money(c.digital), money(d.totalDigital), money(d.consumo), money(d.fee),
  ];
}

function totales(cargas) {
  const ds = cargas.map(detalle);
  const suma = (k) => r2(ds.reduce((a, d) => a + d[k], 0));
  return {
    total: suma('total'), efectivo: suma('totalEfectivo'), digital: suma('totalDigital'),
    consumo: suma('consumo'), fee: suma('fee'),
  };
}

function resumen(cargas) {
  const t = totales(cargas);
  return [
    ['Cantidad de cargas', String(cargas.length)],
    ['Total en efectivo (seña + saldo)', money(t.efectivo)],
    ['Total por medio digital (seña + saldo)', money(t.digital)],
    ['Total CONSUMO cargado', money(t.consumo)],
    ['Total FEE cargado', money(t.fee)],
    ['TOTAL MESAS', money(t.total)],
  ];
}

function nombreArchivo(ext, ahora = new Date()) {
  const d = ahora;
  return `Museum_cargas_${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}_${dos(d.getHours())}${dos(d.getMinutes())}.${ext}`;
}

if (typeof module !== 'undefined') {
  module.exports = {
    DESCUENTO_DIGITAL_PCT, r2, montosIguales, calcularFee, detalle, money, plain, parseMonto, fechaHora,
    inicioTurno, calcular, TITULO_REPORTE, COLUMNAS, PRIMERA_COLUMNA_NUMERICA, senaPor, celdas, totales,
    resumen, nombreArchivo,
  };
}
