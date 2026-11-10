import type { Business, Product } from './types';
import { formatMoney, priceFor } from './types';

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const LEFT = 42;
const RIGHT = PAGE_WIDTH - 42;
const CONTENT_WIDTH = RIGHT - LEFT;
const FOOTER_Y = 42;

export type CatalogPdfImage = { width: number; height: number; data: Uint8Array };

export async function loadCatalogPdfImages(products: Product[]): Promise<{ images: Record<string, CatalogPdfImage>; unavailable: string[] }> {
  const images: Record<string, CatalogPdfImage> = {};
  const unavailable: string[] = [];
  const withImage = products.filter((product) => product.is_active && product.image_url);
  for (let index = 0; index < withImage.length; index += 6) {
    await Promise.all(withImage.slice(index, index + 6).map(async (product) => {
      try {
        const response = await fetch(product.image_url!, { mode: 'cors', credentials: 'omit' });
        if (!response.ok) throw new Error('image request failed');
        const bitmap = await createImageBitmap(await response.blob());
        const scale = Math.min(1, 320 / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(bitmap.width * scale));
        canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        const context = canvas.getContext('2d');
        if (!context) throw new Error('canvas unavailable');
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        bitmap.close();
        const jpeg = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('image encoding failed')), 'image/jpeg', 0.86);
        });
        images[product.id] = { width: canvas.width, height: canvas.height, data: new Uint8Array(await jpeg.arrayBuffer()) };
      } catch {
        unavailable.push(product.name);
      }
    }));
  }
  return { images, unavailable };
}

const ascii = (value: string) => value
  .replaceAll('₡', 'CRC ')
  .replaceAll('€', 'EUR ')
  .replaceAll('£', 'GBP ')
  .replaceAll('¥', 'JPY ')
  .replaceAll('₹', 'INR ')
  .replaceAll('×', 'x')
  .replace(/[–—]/g, '-')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^\x20-\x7E]/g, '');

const escaped = (value: string) => ascii(value)
  .replaceAll('\\', '\\\\')
  .replaceAll('(', '\\(')
  .replaceAll(')', '\\)');

const wrap = (value: string, maxChars: number): string[] => {
  const words = ascii(value).trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    if (line && `${line} ${word}`.length > maxChars) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines;
};

const rgb = (hex: string, fallback: string) => {
  const value = /^#[0-9a-f]{6}$/i.test(hex) ? hex : fallback;
  return [1, 3, 5].map((index) => (parseInt(value.slice(index, index + 2), 16) / 255).toFixed(3)).join(' ');
};

const text = (value: string, x: number, y: number, size: number, bold = false, color = '0.17 0.16 0.24') =>
  `${color} rg BT /${bold ? 'F2' : 'F1'} ${size} Tf ${x} ${y} Td (${escaped(value)}) Tj ET`;

const rectangle = (x: number, y: number, width: number, height: number, fill: string, stroke?: string) =>
  `${fill} rg ${stroke ? `${stroke} RG 0.7 w ` : ''}${x} ${y} ${width} ${height} re ${stroke ? 'B' : 'f'}`;

const line = (x1: number, y1: number, x2: number, y2: number, color = '0.89 0.88 0.92', width = 0.7) =>
  `${color} RG ${width} w ${x1} ${y1} m ${x2} ${y2} l S`;

const drawProductImage = (imageName: string, x: number, y: number, width: number, height: number, image: CatalogPdfImage | undefined) => {
  const commands = [rectangle(x, y, width, height, '0.96 0.95 0.98', '0.89 0.88 0.92')];
  if (!image) {
    commands.push(text('SIN FOTO', x + 9, y + height / 2 - 2, 6, true, '0.61 0.60 0.67'));
    return commands;
  }
  const scale = Math.min((width - 6) / image.width, (height - 6) / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  const drawX = x + (width - drawWidth) / 2;
  const drawY = y + (height - drawHeight) / 2;
  commands.push(`q ${drawWidth} 0 0 ${drawHeight} ${drawX} ${drawY} cm /${imageName} Do Q`);
  return commands;
};

const truncateLines = (value: string, maxChars: number, maxLines: number) => {
  const lines = wrap(value, maxChars);
  if (lines.length <= maxLines) return lines;
  const visible = lines.slice(0, maxLines);
  visible[maxLines - 1] = `${visible[maxLines - 1].slice(0, Math.max(1, maxChars - 3)).trimEnd()}...`;
  return visible;
};

export function buildCatalogPdf(business: Business, sourceProducts: Product[], productImages: Record<string, CatalogPdfImage> = {}): Uint8Array {
  const products = sourceProducts.filter((product) => product.is_active);
  const offers = products.filter((product) => product.promotion_enabled);
  const standardProducts = products.filter((product) => !product.promotion_enabled);
  const accent = rgb(business.primary_color, '#6d5ce8');
  const pale = rgb(business.secondary_color, '#ece9ff');
  const imageNames = new Map(Object.keys(productImages).map((productId, index) => [productId, `Im${index}`]));
  const pages: { commands: string[]; images: Set<string> }[] = [];
  let currentPage: { commands: string[]; images: Set<string> } = { commands: [], images: new Set() };
  let commands: string[] = [];
  let y = 0;
  let currentSection = '';

  const startPage = () => {
    commands = [];
    currentPage = { commands, images: new Set() };
    pages.push(currentPage);
    commands.push(rectangle(0, PAGE_HEIGHT - 7, PAGE_WIDTH, 7, accent));
    commands.push(text(business.name, LEFT, PAGE_HEIGHT - 39, 14, true));
    if (business.phone) commands.push(text(business.phone, RIGHT - ascii(business.phone).length * 4.2, PAGE_HEIGHT - 38, 8, false, '0.43 0.42 0.51'));
    commands.push(line(LEFT, PAGE_HEIGHT - 51, RIGHT, PAGE_HEIGHT - 51));
    y = PAGE_HEIGHT - 75;
    if (currentSection) drawSectionHeading(`${currentSection} - CONTINUACION`);
  };

  const drawSectionHeading = (label: string) => {
    const title = ascii(label).toUpperCase();
    commands.push(rectangle(LEFT, y - 6, CONTENT_WIDTH, 27, pale));
    commands.push(rectangle(LEFT, y - 6, 4, 27, accent));
    commands.push(text(title, LEFT + 14, y + 2, 10, true, accent));
    y -= 39;
  };

  const ensureSpace = (height: number) => {
    if (y - height < FOOTER_Y + 20) startPage();
  };

  startPage();
  commands.push(text('CATALOGO DE PRODUCTOS', LEFT, y, 9, true, accent));
  y -= 31;
  commands.push(text('Una seleccion para ti', LEFT, y, 25, true));
  y -= 21;
  commands.push(text(`${products.length} ${products.length === 1 ? 'producto disponible' : 'productos disponibles'}${offers.length ? `  |  ${offers.length} ${offers.length === 1 ? 'oferta' : 'ofertas'}` : ''}`, LEFT, y, 9, false, '0.43 0.42 0.51'));
  y -= 17;
  const contact = [business.address, business.phone].filter(Boolean).join('  |  ');
  if (contact) {
    for (const contactLine of truncateLines(contact, 86, 2)) {
      commands.push(text(contactLine, LEFT, y, 8, false, '0.43 0.42 0.51'));
      y -= 12;
    }
  }
  y -= 13;

  if (offers.length) {
    currentSection = 'OFERTAS ESPECIALES';
    drawSectionHeading(currentSection);
    for (const product of offers) {
      const description = product.description?.trim() || 'Consulta con el negocio para conocer mas detalles.';
      const descriptionLines = truncateLines(description, 42, 3);
      const category = product.category_name?.trim();
      const name = `${product.name}${product.variant_label ? ` - ${product.variant_label}` : ''}`;
      const nameLines = truncateLines(name, 37, 2);
      const height = Math.max(88, 58 + nameLines.length * 14 + (category ? 12 : 0) + descriptionLines.length * 11);
      ensureSpace(height + 8);
      const top = y;
      const bottom = y - height;
      commands.push(rectangle(LEFT, bottom, CONTENT_WIDTH, height, '0.985 0.982 0.997', '0.89 0.87 0.94'));
      commands.push(rectangle(LEFT, bottom, 4, height, accent));
      const imageName = imageNames.get(product.id) || '';
      const image = productImages[product.id];
      commands.push(...drawProductImage(imageName, LEFT + 14, bottom + 10, 84, height - 20, image));
      if (image) currentPage.images.add(imageName);
      const detailsX = LEFT + 110;
      commands.push(text('OFERTA', detailsX, top - 18, 7, true, accent));
      nameLines.forEach((nameLine, index) => commands.push(text(nameLine, detailsX, top - 36 - index * 14, 11, true)));
      let descriptionY = top - 38 - nameLines.length * 14;
      if (category) {
        commands.push(text(category.toLocaleUpperCase('es'), detailsX, descriptionY, 6, true, '0.53 0.51 0.62'));
        descriptionY -= 11;
      }
      descriptionLines.forEach((descriptionLine) => {
        commands.push(text(descriptionLine, detailsX, descriptionY, 8, false, '0.43 0.42 0.51'));
        descriptionY -= 11;
      });
      const priceX = RIGHT - 126;
      const currentPrice = formatMoney(priceFor(product), business.currency_symbol || 'C$');
      const regularPrice = formatMoney(Number(product.regular_price), business.currency_symbol || 'C$');
      commands.push(text(regularPrice, priceX, top - 34, 8, false, '0.54 0.53 0.60'));
      commands.push(line(priceX, top - 31, priceX + ascii(regularPrice).length * 4.1, top - 31, '0.54 0.53 0.60', 0.6));
      commands.push(text(currentPrice, priceX, top - 57, 13, true, accent));
      y = bottom - 10;
    }
  }

  if (standardProducts.length) {
    currentSection = 'COLECCION COMPLETA';
    if (y - 40 < FOOTER_Y + 20) startPage();
    else drawSectionHeading(currentSection);
    const categories = new Map<string, Product[]>();
    for (const product of standardProducts) {
      const category = product.category_name?.trim() || 'Otros productos';
      categories.set(category, [...(categories.get(category) || []), product]);
    }
    const sortedCategories = [...categories.entries()].sort(([a], [b]) =>
      a === 'Otros productos' ? 1 : b === 'Otros productos' ? -1 : a.localeCompare(b, 'es'));
    for (const [category, categoryProducts] of sortedCategories) {
      ensureSpace(28);
      commands.push(text(category.toLocaleUpperCase('es'), LEFT, y, 8, true, accent));
      y -= 16;
      for (const product of categoryProducts) {
        const descriptionLines = truncateLines(product.description?.trim() || 'Disponible en este catalogo.', 68, 2);
        const name = `${product.name}${product.variant_label ? ` - ${product.variant_label}` : ''}`;
        const nameLines = truncateLines(name, 57, 2);
        const height = Math.max(62, 12 + nameLines.length * 12 + descriptionLines.length * 10);
        ensureSpace(height + 4);
        const top = y;
        const imageName = imageNames.get(product.id) || '';
        const image = productImages[product.id];
        commands.push(...drawProductImage(imageName, LEFT, top - height + 4, 50, height - 8, image));
        if (image) currentPage.images.add(imageName);
        const detailsX = LEFT + 62;
        nameLines.forEach((nameLine, index) => commands.push(text(nameLine, detailsX, top - 13 - index * 12, 9, true)));
        let descriptionY = top - 17 - nameLines.length * 12;
        descriptionLines.forEach((descriptionLine) => {
          commands.push(text(descriptionLine, detailsX, descriptionY, 7.5, false, '0.43 0.42 0.51'));
          descriptionY -= 10;
        });
        const productPrice = formatMoney(priceFor(product), business.currency_symbol || 'C$');
        commands.push(text(productPrice, RIGHT - ascii(productPrice).length * 5.1, top - 16, 9, true, accent));
        y -= height;
        commands.push(line(LEFT, y, RIGHT, y, '0.92 0.91 0.94', 0.5));
        y -= 5;
      }
      y -= 5;
    }
  } else if (!offers.length) {
    commands.push(text('Aun no hay productos activos para mostrar.', LEFT, y, 10, false, '0.43 0.42 0.51'));
  }

  pages.forEach((page, index) => {
    page.commands.push(line(LEFT, FOOTER_Y + 8, RIGHT, FOOTER_Y + 8, '0.89 0.88 0.92'));
    page.commands.push(text(`${business.name}  |  Catalogo de productos`, LEFT, FOOTER_Y - 6, 7, false, '0.53 0.52 0.60'));
    page.commands.push(text(`${index + 1} / ${pages.length}`, RIGHT - 30, FOOTER_Y - 6, 7, false, '0.53 0.52 0.60'));
  });

  const objects: string[] = [];
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = '';
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  objects[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
  const imageObjectIds = new Map<string, number>();
  for (const [productId, image] of Object.entries(productImages)) {
    const imageObjectId = objects.length;
    imageObjectIds.set(productId, imageObjectId);
    const hex = Array.from(image.data, (byte) => byte.toString(16).padStart(2, '0')).join('');
    objects[imageObjectId] = `<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter [/ASCIIHexDecode /DCTDecode] /Length ${hex.length + 1} >>\nstream\n${hex}>\nendstream`;
  }
  const firstPageObject = objects.length;
  const pageReferences = pages.map((_, index) => `${firstPageObject + index * 2} 0 R`).join(' ');
  objects[2] = `<< /Type /Pages /Kids [${pageReferences}] /Count ${pages.length} >>`;
  pages.forEach((page, index) => {
    const pageObject = firstPageObject + index * 2;
    const contentObject = pageObject + 1;
    const stream = page.commands.join('\n');
    const xObjectResources = [...page.images].map((imageName) => {
      const productId = [...imageNames.entries()].find(([, name]) => name === imageName)?.[0];
      return productId ? `/${imageName} ${imageObjectIds.get(productId)} 0 R` : '';
    }).filter(Boolean).join(' ');
    const xObjectDict = xObjectResources ? ` /XObject << ${xObjectResources} >>` : '';
    objects[pageObject] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >>${xObjectDict} >> /Contents ${contentObject} 0 R >>`;
    objects[contentObject] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  });

  let document = '%PDF-1.4\n';
  const offsets = [0];
  for (let index = 1; index < objects.length; index += 1) {
    offsets[index] = document.length;
    document += `${index} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xrefOffset = document.length;
  document += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => { document += `${String(offset).padStart(10, '0')} 00000 n \n`; });
  document += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return new TextEncoder().encode(document);
}
