import type { Business, Sale } from './types';

type ReportPeriod = '7' | '30' | 'all';
type Draw = { commands: string[] };

const cp1252Extra: Record<string, number> = { '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85, '†': 0x86, '‡': 0x87, 'ˆ': 0x88, '‰': 0x89, 'Š': 0x8a, '‹': 0x8b, 'Œ': 0x8c, 'Ž': 0x8e, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '˜': 0x98, '™': 0x99, 'š': 0x9a, '›': 0x9b, 'œ': 0x9c, 'ž': 0x9e, 'Ÿ': 0x9f };
const pdfString = (value: string) => `<${[...value].map((char) => {
  const code = char.codePointAt(0) || 32;
  const byte = code <= 0xff ? code : (cp1252Extra[char] ?? 63);
  return byte.toString(16).padStart(2, '0');
}).join('')}>`;
const text = (value: string, x: number, y: number, size = 9, bold = false, color = '0.16 0.16 0.23') =>
  `${color} rg BT /${bold ? 'F2' : 'F1'} ${size} Tf 1 0 0 1 ${x} ${y} Tm ${pdfString(value)} Tj ET`;
const money = (value: number, symbol: string) => `${symbol} ${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const shortDate = (date: Date) => new Intl.DateTimeFormat('es-NI', { day: '2-digit', month: 'short' }).format(date);

export function buildBusinessReportPdf(business: Business, allSales: Sale[], period: ReportPeriod, registeredCustomerCount: number): Uint8Array {
  const now = new Date();
  const days = period === 'all' ? 0 : Number(period);
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  if (days) start.setDate(start.getDate() - days + 1);
  const completed = allSales.filter((sale) => sale.status === 'completed');
  const included = completed.filter((sale) => !days || new Date(sale.sold_at) >= start);
  const previousStart = new Date(start); if (days) previousStart.setDate(previousStart.getDate() - days);
  const previous = days ? completed.filter((sale) => new Date(sale.sold_at) >= previousStart && new Date(sale.sold_at) < start) : [];
  const currency = business.currency_symbol || 'C$';
  const revenue = (rows: Sale[]) => rows.reduce((sum, sale) => sum + Number(sale.total_amount), 0);
  const total = revenue(included); const priorTotal = revenue(previous);
  const units = included.reduce((sum, sale) => sum + (sale.sale_items || []).reduce((n, item) => n + Number(item.quantity), 0), 0);
  const customerPurchases = new Map<string, number>();
  included.forEach((sale) => { if (sale.customer_id) customerPurchases.set(sale.customer_id, (customerPurchases.get(sale.customer_id) || 0) + 1); });
  const customersWithPurchases = customerPurchases.size;
  const repeatCustomers = [...customerPurchases.values()].filter((count) => count > 1).length;
  const linkedSales = included.filter((sale) => !!sale.customer_id).length;
  const unlinkedSales = included.length - linkedSales;
  const webSales = included.filter((sale) => !!sale.public_order_id).length;
  const items = included.flatMap((sale) => sale.sale_items || []);
  const promoItems = items.filter((item) => item.promotion_applied);
  const promoUnits = promoItems.reduce((sum, item) => sum + Number(item.quantity), 0);
  const promoDiscount = promoItems.reduce((sum, item) => sum + Math.max(0, Number(item.regular_unit_price) - Number(item.unit_price)) * Number(item.quantity), 0);
  const products = new Map<string, { units: number; total: number }>();
  included.forEach((sale) => (sale.sale_items || []).forEach((item) => {
    const row = products.get(item.product_name) || { units: 0, total: 0 };
    row.units += Number(item.quantity); row.total += Number(item.line_total); products.set(item.product_name, row);
  }));
  const ranking = [...products.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, 10);
  const periodLabel = period === 'all'
    ? `Todo el historial hasta ${new Intl.DateTimeFormat('es-NI', { dateStyle: 'medium' }).format(now)}`
    : `Últimos ${days} días · ${new Intl.DateTimeFormat('es-NI', { dateStyle: 'medium' }).format(start)} – ${new Intl.DateTimeFormat('es-NI', { dateStyle: 'medium' }).format(now)}`;
  const docs: Draw[] = [{ commands: [] }, { commands: [] }];
  const colorHex = /^#[0-9a-f]{6}$/i.test(business.primary_color) ? business.primary_color : '#6d5ce8';
  const accent = [1, 3, 5].map((i) => (parseInt(colorHex.slice(i, i + 2), 16) / 255).toFixed(3)).join(' ');
  const add = (page: number, command: string) => docs[page].commands.push(command);
  const line = (page: number, x1: number, y1: number, x2: number, y2: number, stroke = '0.88 0.88 0.91') => add(page, `${stroke} RG 0.7 w ${x1} ${y1} m ${x2} ${y2} l S`);
  const heading = (page: number, title: string, subtitle: string) => {
    add(page, `${accent} rg 0 762 612 30 re f`);
    add(page, text('REPORTE DE DESEMPEÑO', 42, 773, 9, true, '1 1 1'));
    add(page, text(business.name, 42, 724, 22, true));
    add(page, text(title, 42, 702, 12, true, accent));
    add(page, text(subtitle, 42, 684, 9, false, '0.43 0.43 0.50'));
    add(page, text(`Período: ${periodLabel}`, 42, 666, 8, false, '0.43 0.43 0.50'));
    line(page, 42, 652, 570, 652);
  };
  const card = (page: number, x: number, y: number, w: number, label: string, value: string, note: string) => {
    add(page, `0.96 0.96 0.98 rg ${x} ${y} ${w} 65 re f`);
    add(page, text(label.toUpperCase(), x + 10, y + 49, 7, true, '0.48 0.48 0.56'));
    add(page, text(value, x + 10, y + 28, 13, true));
    add(page, text(note, x + 10, y + 11, 7, false, '0.48 0.48 0.56'));
  };

  // Page 1: key figures, sales trend, and customer health.
  heading(0, 'Resumen del negocio', 'Indicadores calculados a partir de ventas completadas.');
  card(0, 42, 572, 168, 'Monto vendido', money(total, currency), `${included.length} ventas completadas`);
  card(0, 222, 572, 168, 'Ticket promedio', money(included.length ? total / included.length : 0, currency), 'Monto vendido ÷ cantidad de ventas');
  card(0, 402, 572, 168, 'Unidades vendidas', String(units), `${products.size} productos diferentes`);

  add(0, text('Ventas a lo largo del período', 42, 543, 11, true));
  add(0, text(period === 'all' ? 'Últimos 12 meses' : 'Importe por día', 42, 528, 8, false, '0.48 0.48 0.56'));
  const chartRows: { label: string; amount: number }[] = [];
  if (period === 'all') {
    const first = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    for (let i = 0; i < 12; i++) {
      const date = new Date(first.getFullYear(), first.getMonth() + i, 1);
      const monthSales = included.filter((sale) => { const d = new Date(sale.sold_at); return d.getFullYear() === date.getFullYear() && d.getMonth() === date.getMonth(); });
      chartRows.push({ label: new Intl.DateTimeFormat('es-NI', { month: 'short' }).format(date), amount: revenue(monthSales) });
    }
  } else {
    for (let i = 0; i < days; i++) {
      const date = new Date(start); date.setDate(start.getDate() + i);
      const key = date.toDateString();
      chartRows.push({ label: days === 7 ? shortDate(date) : (i % 5 === 0 || i === days - 1 ? `${date.getDate()}/${date.getMonth() + 1}` : ''), amount: revenue(included.filter((sale) => new Date(sale.sold_at).toDateString() === key)) });
    }
  }
  const chartX = 48; const chartY = 390; const chartW = 516; const chartH = 112;
  [0, 0.5, 1].forEach((fraction) => line(0, chartX, chartY + fraction * chartH, chartX + chartW, chartY + fraction * chartH, '0.91 0.91 0.94'));
  const barGap = 3; const barW = (chartW - barGap * (chartRows.length - 1)) / chartRows.length;
  const maxAmount = Math.max(...chartRows.map((row) => row.amount), 1);
  chartRows.forEach((row, i) => {
    const h = row.amount ? Math.max(2, row.amount / maxAmount * (chartH - 5)) : 0;
    const x = chartX + i * (barW + barGap);
    if (h) add(0, `${accent} rg ${x.toFixed(2)} ${chartY} ${Math.max(barW, 1).toFixed(2)} ${h.toFixed(2)} re f`);
    if (row.label) add(0, text(row.label, x - 2, chartY - 13, chartRows.length > 14 ? 5.5 : 6.5, false, '0.48 0.48 0.56'));
  });
  add(0, text(`Máximo del gráfico: ${money(maxAmount, currency)}`, 42, 365, 7, false, '0.48 0.48 0.56'));

  add(0, text('Clientes y relación de compra', 42, 338, 11, true));
  card(0, 42, 257, 168, 'Clientes compradores', String(customersWithPurchases), `De ${registeredCustomerCount} registrados actualmente`);
  card(0, 222, 257, 168, 'Clientes recurrentes', String(repeatCustomers), '2 o más ventas en este período');
  card(0, 402, 257, 168, 'Ventas sin cliente', String(unlinkedSales), `${included.length ? (unlinkedSales / included.length * 100).toFixed(0) : 0}% de ventas sin asociación`);
  add(0, text(`${linkedSales} ventas asociadas a cliente · ${webSales} ventas originadas en pedido web.`, 48, 238, 8, false, '0.38 0.38 0.45'));
  add(0, text('La recurrencia solo considera las ventas asociadas a un cliente guardado.', 48, 222, 7, false, '0.48 0.48 0.56'));
  const linkedWidth = included.length ? 516 * linkedSales / included.length : 0;
  add(0, `0.91 0.91 0.94 rg 48 202 516 8 re f`);
  if (linkedWidth > 0) add(0, `${accent} rg 48 202 ${linkedWidth.toFixed(2)} 8 re f`);
  add(0, text(`Con cliente ${included.length ? (linkedSales / included.length * 100).toFixed(0) : 0}%`, 48, 190, 7, false, accent));
  add(0, text(`Sin cliente ${included.length ? (unlinkedSales / included.length * 100).toFixed(0) : 0}%`, 460, 190, 7, false, '0.48 0.48 0.56'));

  if (days) {
    add(0, text('Comparación con el período anterior', 42, 164, 10, true));
    if (priorTotal > 0) {
      const delta = total - priorTotal; const pct = (delta / priorTotal) * 100;
      add(0, text(`${delta >= 0 ? 'Aumento' : 'Disminución'} de ${money(Math.abs(delta), currency)} (${Math.abs(pct).toFixed(1)}%).`, 48, 145, 9, true, delta >= 0 ? '0.13 0.52 0.37' : '0.72 0.26 0.29'));
      add(0, text(`Período actual: ${money(total, currency)} · Período anterior: ${money(priorTotal, currency)}.`, 48, 129, 8, false, '0.43 0.43 0.50'));
    } else {
      add(0, text(`No hubo ventas completadas en el período anterior. Período actual: ${money(total, currency)}.`, 48, 145, 8, false, '0.43 0.43 0.50'));
    }
  }
  line(0, 42, 38, 570, 38);
  add(0, text('Reporte informativo · ventas anuladas excluidas · no representa ganancia neta.', 42, 24, 7, false, '0.55 0.55 0.61'));
  add(0, text('1 / 2', 548, 24, 7, false, '0.55 0.55 0.61'));

  // Page 2: product performance and promotions.
  heading(1, 'Productos y promociones', 'Detalle de los productos que generaron ventas en el período.');
  add(1, text('Productos con mayor venta', 42, 625, 12, true));
  add(1, text('Ordenados por monto vendido · hasta 10 productos', 42, 609, 8, false, '0.48 0.48 0.56'));
  add(1, text('PRODUCTO', 48, 581, 7, true, '0.48 0.48 0.56'));
  add(1, text('UNIDADES', 395, 581, 7, true, '0.48 0.48 0.56'));
  add(1, text('MONTO VENDIDO', 478, 581, 7, true, '0.48 0.48 0.56'));
  let productY = 561;
  if (!ranking.length) add(1, text('No hay ventas completadas para mostrar en este período.', 48, productY, 9, false, '0.48 0.48 0.56'));
  ranking.forEach(([name, data], index) => {
    if (index % 2 === 0) add(1, `0.97 0.97 0.98 rg 42 ${productY - 7} 528 25 re f`);
    const safeName = name.length > 52 ? `${name.slice(0, 49)}…` : name;
    add(1, text(safeName, 48, productY, 8));
    add(1, text(String(data.units), 395, productY, 8));
    add(1, text(money(data.total, currency), 478, productY, 8));
    productY -= 25;
  });

  const promoY = Math.max(305, Math.min(430, productY - 36));
  add(1, text('Promociones', 42, promoY, 12, true));
  card(1, 42, promoY - 83, 168, 'Unidades en promoción', String(promoUnits), `De ${units} unidades vendidas`);
  card(1, 222, promoY - 83, 168, 'Descuento estimado', money(promoDiscount, currency), 'Precio normal menos precio cobrado');
  card(1, 402, promoY - 83, 168, 'Ventas por pedido web', String(webSales), `${included.length ? (webSales / included.length * 100).toFixed(0) : 0}% de operaciones`);
  add(1, text('Guía de lectura', 42, promoY - 112, 10, true));
  const notes = [
    'Monto vendido: suma de ventas completadas registradas; las ventas anuladas se excluyen.',
    'Clientes recurrentes: clientes con al menos dos ventas asociadas dentro del período seleccionado.',
    'El descuento estimado usa los precios normales guardados al momento de vender; puede diferir de otros ajustes.',
    'Este reporte no incluye costos, gastos, impuestos, devoluciones ni inventario y no calcula utilidad o flujo de caja.',
  ];
  notes.forEach((note, i) => add(1, text(note, 48, promoY - 131 - i * 14, 7.5, false, '0.38 0.38 0.45')));
  line(1, 42, 38, 570, 38);
  add(1, text(`Generado ${new Intl.DateTimeFormat('es-NI', { dateStyle: 'medium', timeStyle: 'short' }).format(now)} · Mini POS`, 42, 24, 7, false, '0.55 0.55 0.61'));
  add(1, text('2 / 2', 548, 24, 7, false, '0.55 0.55 0.61'));

  const objects: string[] = [];
  objects.push('<< /Type /Catalog /Pages 2 0 R >>');
  objects.push('<< /Type /Pages /Kids [3 0 R 6 0 R] /Count 2 >>');
  objects.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 7 0 R >>');
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  objects.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 8 0 R >>');
  for (const page of docs) {
    const stream = page.commands.join('\n');
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  }
  let document = '%PDF-1.4\n'; const offsets = [0];
  objects.forEach((object, index) => { offsets.push(document.length); document += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xrefOffset = document.length;
  document += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => { document += `${String(offset).padStart(10, '0')} 00000 n \n`; });
  document += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return new TextEncoder().encode(document);
}
