import type { Business, Sale, SaleItem } from './types';

const pdfText = (value: string) => value
  .replaceAll('₡', 'CRC ')
  .replaceAll('€', 'EUR ')
  .replaceAll('£', 'GBP ')
  .replaceAll('¥', 'JPY ')
  .replaceAll('₹', 'INR ')
  .replaceAll('×', 'x')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^\x20-\x7E]/g, '');

const escapePdf = (value: string) => pdfText(value)
  .replaceAll('\\', '\\\\')
  .replaceAll('(', '\\(')
  .replaceAll(')', '\\)');

const wrapText = (value: string, maxLength: number) => {
  const words = pdfText(value).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    if (line && `${line} ${word}`.length > maxLength) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
};

const textCommand = (value: string, x: number, y: number, size: number, bold = false) =>
  `BT /${bold ? 'F2' : 'F1'} ${size} Tf ${x} ${y} Td (${escapePdf(value)}) Tj ET`;

export function buildReceiptPdf(sale: Sale, business: Business): Uint8Array {
  const items = sale.sale_items || [];
  const itemLines = items.map((item: SaleItem) => ({
    item,
    nameLines: wrapText(`${item.quantity} x ${item.product_name}${item.variant_label ? ` [${item.variant_label}]` : ''}`, 34),
  }));
  const itemHeight = itemLines.reduce((height, row) => height + row.nameLines.length * 12 + (row.item.promotion_applied ? 10 : 0) + 9, 0);
  const pageHeight = Math.max(280, 250 + itemHeight);
  const commands: string[] = [];
  const accent = /^#[0-9a-f]{6}$/i.test(business.primary_color) ? business.primary_color : '#6d5ce8';
  const color = [1, 3, 5].map((index) => (parseInt(accent.slice(index, index + 2), 16) / 255).toFixed(3)).join(' ');
  let y = pageHeight - 30;

  const centered = (value: string, size: number, bold = false) => {
    const clean = pdfText(value);
    const approxWidth = clean.length * size * (bold ? 0.28 : 0.25);
    commands.push(textCommand(clean, Math.max(24, (320 - approxWidth) / 2), y, size, bold));
    y -= size + 7;
  };
  const rule = (stroke = '0.88 0.88 0.91') => {
    commands.push(`${stroke} RG 0.7 w 24 ${y} m 296 ${y} l S`);
    y -= 13;
  };

  centered(business.name, 15, true);
  if (business.address) centered(business.address, 8);
  if (business.phone) centered(business.phone, 8);
  y -= 3;
  rule(`${color} RG`);
  commands.push(textCommand(`Comprobante #${String(sale.sale_number).padStart(5, '0')}`, 25, y, 9, true));
  y -= 14;
  commands.push(textCommand(new Intl.DateTimeFormat('es-NI', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(sale.sold_at)), 25, y, 8));
  y -= 9;
  rule();

  for (const { item, nameLines } of itemLines) {
    const amount = `${business.currency_symbol || 'C$'} ${Number(item.line_total).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    nameLines.forEach((line, index) => {
      commands.push(textCommand(line, 25, y, 8, index === 0));
      if (index === 0) {
        const amountX = Math.max(205, 294 - pdfText(amount).length * 4.3);
        commands.push(textCommand(amount, amountX, y, 8, true));
      }
      y -= 11;
    });
    if (item.promotion_applied) {
      commands.push(textCommand('Promocion aplicada', 25, y, 7));
      y -= 10;
    }
    y -= 3;
  }

  rule();
  commands.push(textCommand('TOTAL', 25, y, 11, true));
  const total = `${business.currency_symbol || 'C$'} ${Number(sale.total_amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  commands.push(textCommand(total, Math.max(185, 294 - pdfText(total).length * 5.8), y, 11, true));
  y -= 25;
  rule(`${color} RG`);
  centered('Gracias por tu compra', 9, true);

  const stream = commands.join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 320 ${pageHeight}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let document = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(document.length);
    document += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = document.length;
  document += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => { document += `${String(offset).padStart(10, '0')} 00000 n \n`; });
  document += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return new TextEncoder().encode(document);
}
