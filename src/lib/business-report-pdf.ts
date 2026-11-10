import type { Business, Sale } from './types';

type ReportPeriod = '7' | '30' | 'all';
const clean = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/×/g, 'x').replace(/[^\x20-\x7E]/g, '');
const esc = (value: string) => clean(value).replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)');
const money = (value: number, symbol: string) => `${symbol} ${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const txt = (value: string, x: number, y: number, size = 9, bold = false, color = '0.16 0.16 0.23') =>
  `${color} rg BT /${bold ? 'F2' : 'F1'} ${size} Tf ${x} ${y} Td (${esc(value)}) Tj ET`;

export function buildBusinessReportPdf(business: Business, allSales: Sale[], period: ReportPeriod, registeredCustomerCount: number): Uint8Array {
  const now = new Date();
  const days = period === 'all' ? 0 : Number(period);
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  if (days) start.setDate(start.getDate() - days + 1);
  const included = allSales.filter((sale) => sale.status === 'completed' && (!days || new Date(sale.sold_at) >= start));
  const revenue = included.reduce((sum, sale) => sum + Number(sale.total_amount), 0);
  const units = included.reduce((sum, sale) => sum + (sale.sale_items || []).reduce((n, item) => n + Number(item.quantity), 0), 0);
  const web = included.filter((sale) => !!sale.public_order_id).length;
  const customerSales = included.filter((sale) => !!sale.customer_id || !!sale.public_order_id).length;
  const promoItems = included.flatMap((sale) => sale.sale_items || []).filter((item) => item.promotion_applied);
  const promoUnits = promoItems.reduce((sum, item) => sum + Number(item.quantity), 0);
  const promoDiscount = promoItems.reduce((sum, item) => sum + Math.max(0, Number(item.regular_unit_price) - Number(item.unit_price)) * Number(item.quantity), 0);
  const products = new Map<string, { units: number; total: number }>();
  included.forEach((sale) => (sale.sale_items || []).forEach((item) => {
    const key = item.product_name;
    const row = products.get(key) || { units: 0, total: 0 };
    row.units += Number(item.quantity); row.total += Number(item.line_total); products.set(key, row);
  }));
  const ranking = [...products.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, 8);
  const previous = days ? (() => {
    const end = new Date(start);
    const prevStart = new Date(start); prevStart.setDate(prevStart.getDate() - days);
    const rows = allSales.filter((sale) => sale.status === 'completed' && new Date(sale.sold_at) >= prevStart && new Date(sale.sold_at) < end);
    return rows.reduce((sum, sale) => sum + Number(sale.total_amount), 0);
  })() : null;
  const periodLabel = period === 'all'
    ? `Todo el historial hasta ${new Intl.DateTimeFormat('es-NI', { dateStyle: 'medium' }).format(now)}`
    : `Ultimos ${days} dias · desde ${new Intl.DateTimeFormat('es-NI', { dateStyle: 'medium' }).format(start)}`;
  const commands: string[] = [];
  const colorHex = /^#[0-9a-f]{6}$/i.test(business.primary_color) ? business.primary_color : '#6d5ce8';
  const color = [1, 3, 5].map((i) => (parseInt(colorHex.slice(i, i + 2), 16) / 255).toFixed(3)).join(' ');
  commands.push(`${color} rg 0 762 612 30 re f`);
  commands.push(txt('REPORTE DE DESEMPENO', 42, 774, 9, true, '1 1 1'));
  commands.push(txt(clean(business.name), 42, 718, 22, true));
  commands.push(txt(periodLabel, 42, 699, 10, false, '0.43 0.43 0.50'));
  commands.push(txt(`Generado el ${new Intl.DateTimeFormat('es-NI', { dateStyle: 'medium', timeStyle: 'short' }).format(now)}`, 42, 681, 8, false, '0.55 0.55 0.61'));
  const cardY = 620;
  const cards = [
    ['MONTO VENDIDO', money(revenue, business.currency_symbol || 'C$'), `${included.length} operaciones completadas`],
    ['TICKET PROMEDIO', money(included.length ? revenue / included.length : 0, business.currency_symbol || 'C$'), 'Total vendido / operaciones'],
    ['UNIDADES VENDIDAS', String(units), `${products.size} productos distintos`],
  ];
  cards.forEach(([label, value, note], index) => {
    const x = 42 + index * 181;
    commands.push(`0.96 0.96 0.98 rg ${x} ${cardY} 168 72 re f`);
    commands.push(txt(label, x + 11, cardY + 53, 7, true, '0.48 0.48 0.56'));
    commands.push(txt(value, x + 11, cardY + 32, 13, true));
    commands.push(txt(note, x + 11, cardY + 14, 7, false, '0.48 0.48 0.56'));
  });
  let y = 595;
  commands.push(txt('LECTURA DEL PERIODO', 42, y, 11, true)); y -= 20;
  const observations = [
    previous === null ? `Ventas en el historial: ${included.length}. No se calcula variacion por falta de un periodo comparable.` : `Cambio frente a los ${days} dias anteriores: ${revenue >= previous ? '+' : '-'}${money(Math.abs(revenue - previous), business.currency_symbol || 'C$')} (${previous ? `${revenue >= previous ? '+' : ''}${((revenue - previous) / previous * 100).toFixed(1)}%` : 'sin base comparable'}); periodo anterior: ${money(previous, business.currency_symbol || 'C$')}.`,
    `Promociones: ${promoUnits} unidades vendidas con oferta; descuento estimado frente al precio normal: ${money(promoDiscount, business.currency_symbol || 'C$')}.`,
    `Canal web: ${web} ventas completadas (${included.length ? (web / included.length * 100).toFixed(0) : 0}%); ${customerSales} ventas tienen cliente asociado o provienen de un pedido web.`,
    `Base de clientes: ${registeredCustomerCount} clientes registrados actualmente. El historial no permite identificar recurrencia en todas las ventas sin cliente asociado.`,
  ];
  observations.forEach((line) => { commands.push(txt(line, 48, y, 8)); y -= 16; });
  y -= 5;
  commands.push(txt('PRODUCTOS CON MAYOR VENTA', 42, y, 11, true)); y -= 19;
  commands.push(txt('PRODUCTO', 48, y, 7, true, '0.48 0.48 0.56'));
  commands.push(txt('UNIDADES', 365, y, 7, true, '0.48 0.48 0.56'));
  commands.push(txt('VENTA', 478, y, 7, true, '0.48 0.48 0.56')); y -= 12;
  if (!ranking.length) { commands.push(txt('Aun no hay ventas registradas en este periodo.', 48, y, 8, false, '0.48 0.48 0.56')); y -= 15; }
  ranking.forEach(([name, data], index) => {
    if (index % 2 === 0) commands.push(`0.97 0.97 0.98 rg 42 ${y - 4} 528 17 re f`);
    commands.push(txt(name.slice(0, 53), 48, y, 8));
    commands.push(txt(String(data.units), 365, y, 8));
    commands.push(txt(money(data.total, business.currency_symbol || 'C$'), 478, y, 8));
    y -= 17;
  });
  y -= 4;
  commands.push(txt('COMO LEER ESTE REPORTE', 42, y, 10, true)); y -= 16;
  commands.push(txt('Las ventas registradas muestran el valor de operaciones completadas, no la ganancia neta.', 48, y, 7, false, '0.38 0.38 0.45')); y -= 11;
  commands.push(txt('No se descuentan costos, gastos, impuestos, devoluciones ni inventario. Las ventas anuladas se excluyen.', 48, y, 7, false, '0.38 0.38 0.45')); y -= 11;
  commands.push(txt('El descuento de promociones es estimado usando los precios normales guardados en cada venta.', 48, y, 7, false, '0.38 0.38 0.45'));
  commands.push(`0.88 0.88 0.91 RG 0.7 w 42 38 m 570 38 l S`);
  commands.push(txt('Reporte informativo basado en los registros de Mini POS.', 42, 24, 7, false, '0.55 0.55 0.61'));
  const stream = commands.join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let document = '%PDF-1.4\n'; const offsets = [0];
  objects.forEach((object, index) => { offsets.push(document.length); document += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xrefOffset = document.length;
  document += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => { document += `${String(offset).padStart(10, '0')} 00000 n \n`; });
  document += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return new TextEncoder().encode(document);
}
