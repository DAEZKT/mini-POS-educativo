import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { upload as uploadBlob } from '@vercel/blob/client';
import {
  ArrowUpRight, Ban, BarChart3, Check, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, ClipboardList, ImagePlus,
  LocateFixed,
  ExternalLink, Eye, Facebook, Instagram, LogOut, Menu,
  MoreVertical, Music2, Package, Plus, Printer, Search, Settings2, ShoppingBag, ShoppingCart,
  Store, Tag, X, Youtube, FileText, Inbox, Users, Phone,
} from 'lucide-react';
import { isNeonConfigured, neon } from './lib/neon';
import { Business, Category, Customer, formatDate, formatMoney, priceFor, Product, PublicOrder, PublicOrderStatus, Sale } from './lib/types';
import { buildReceiptPdf } from './lib/receipt-pdf';

type Page = 'dashboard' | 'products' | 'categories' | 'sale' | 'history' | 'publicOrders' | 'customers' | 'brand' | 'access';
type CartRow = { product: Product; quantity: number };
type InstallationMode = 'personal' | 'saas';
type InstallationConfig = { access_mode: InstallationMode; initialized: boolean };
type InstallationAccess = { status: 'pending' | 'approved' | 'revoked' | 'rejected'; role: 'owner' | 'admin' };
type DeleteResult = { ok: boolean; error?: string };

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: Record<string, unknown>) => string;
      remove: (widgetId: string) => void;
    };
  }
}

const navItems: { id: Page; label: string; icon: typeof BarChart3 }[] = [
  { id: 'dashboard', label: 'Resumen', icon: BarChart3 },
  { id: 'products', label: 'Productos', icon: Package },
  { id: 'categories', label: 'Categorías', icon: Tag },
  { id: 'sale', label: 'Nueva venta', icon: ShoppingCart },
  { id: 'history', label: 'Ventas', icon: ClipboardList },
  { id: 'publicOrders', label: 'Pedidos web', icon: Inbox },
  { id: 'customers', label: 'Clientes', icon: Users },
  { id: 'brand', label: 'Mi negocio', icon: Settings2 },
  { id: 'access', label: 'Accesos', icon: Users },
];

function slugify(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function isValidGoogleMapsUrl(value: string) {
  try {
    const url = new URL(value.trim());
    const host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:') return false;
    if (host === 'google.com' || host === 'www.google.com') return /^\/maps(?:\/|$)/i.test(url.pathname);
    return host === 'maps.google.com' || host === 'maps.app.goo.gl';
  } catch {
    return false;
  }
}

function withTimeout<T>(request: PromiseLike<T>, milliseconds: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('REQUEST_TIMEOUT')), milliseconds);
    Promise.resolve(request).then(
      (value) => { window.clearTimeout(timer); resolve(value); },
      (error: unknown) => { window.clearTimeout(timer); reject(error); },
    );
  });
}

function TurnstileWidget({ onToken }: { onToken: (token: string) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !siteKey) return;
    let widgetId = '';
    let cancelled = false;
    const render = () => {
      if (cancelled || !window.turnstile || !container || widgetId) return;
      widgetId = window.turnstile.render(container, {
        sitekey: siteKey,
        callback: onToken,
        'expired-callback': () => onToken(''),
        'error-callback': () => onToken(''),
        theme: 'light',
      });
    };
    let script = document.querySelector<HTMLScriptElement>('script[data-turnstile-script]');
    if (window.turnstile) render();
    else if (script) script.addEventListener('load', render, { once: true });
    else {
      script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.defer = true;
      script.dataset.turnstileScript = 'true';
      script.addEventListener('load', render, { once: true });
      document.head.appendChild(script);
    }
    return () => {
      cancelled = true;
      script?.removeEventListener('load', render);
      if (widgetId) window.turnstile?.remove(widgetId);
    };
  }, [onToken, siteKey]);
  return siteKey ? <div className="turnstile-field"><div ref={containerRef}/></div> : <div className="notice" role="status">Falta configurar la clave pública de Turnstile en el despliegue.</div>;
}

function PublicCatalog() {
  const [business, setBusiness] = useState<Business | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [catalogError, setCatalogError] = useState('');
  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Todas');
  const [publicCart,setPublicCart]=useState<CartRow[]>([]);
  const [checkoutOpen,setCheckoutOpen]=useState(false);
  const [previewProduct,setPreviewProduct]=useState<Product|null>(null);
  const [visibleProductCount,setVisibleProductCount]=useState(12);
  const offersTrackRef=useRef<HTMLDivElement>(null);
  const slug = window.location.pathname.split('/').filter(Boolean).at(-1) || '';
  useEffect(() => {
    let active = true;
    (async () => {
      if (!neon) {
        if (active) { setCatalogError('La conexión con Neon no está configurada en este despliegue.'); setLoading(false); }
        return;
      }
      try {
        const { data, error } = await neon.rpc('get_public_catalog', { p_slug: slug });
        if (!active) return;
        if (error) { setCatalogError(error.message || 'Neon rechazó la solicitud del catálogo.'); setLoading(false); return; }
        if (!data) { setCatalogError('Neon respondió sin datos para este enlace.'); setLoading(false); return; }
        const catalog = data as { business: Business; products: Product[] };
        if (!catalog.business) { setCatalogError('La respuesta no incluye los datos del negocio.'); setLoading(false); return; }
        setBusiness(catalog.business); setProducts(catalog.products || []); setLoading(false);
      } catch (cause) {
        if (!active) return;
        setCatalogError(cause instanceof Error ? cause.message : String(cause));
        setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [slug]);
  useEffect(()=>setVisibleProductCount(12),[query,selectedCategory]);

  if (loading) return <div className="public-loading">Cargando catálogo…</div>;
  if (!business) return <div className="public-loading"><Store size={28} /><h1>Catálogo no disponible</h1><p>Revisa el enlace o contacta al negocio.</p>{catalogError&&<p role="alert">Detalle técnico: {catalogError}</p>}</div>;
  const categoryNames = [...new Set(products.map((product) => product.category_name?.trim() || 'Sin categoría'))]
    .sort((a, b) => a === 'Sin categoría' ? 1 : b === 'Sin categoría' ? -1 : a.localeCompare(b, 'es'));
  const filteredProducts = products.filter((product) => {
    const category = product.category_name?.trim() || 'Sin categoría';
    const matchesCategory = selectedCategory === 'Todas' || category === selectedCategory;
    const searchText = `${product.name} ${product.description || ''} ${category}`.toLocaleLowerCase('es');
    return matchesCategory && searchText.includes(query.trim().toLocaleLowerCase('es'));
  });
  const visiblePublicProducts=filteredProducts.slice(0,visibleProductCount);
  const promotionalProducts=products.filter((product)=>product.promotion_enabled);
  const publicCartTotal=publicCart.reduce((total,row)=>total+priceFor(row.product)*row.quantity,0);
  const addPublicCart=(product:Product)=>setPublicCart((rows)=>{
    const existing=rows.find((row)=>row.product.id===product.id);
    return existing?rows.map((row)=>row.product.id===product.id?{...row,quantity:row.quantity+1}:row):[...rows,{product,quantity:1}];
  });
  const changePublicQuantity=(productId:string,delta:number)=>setPublicCart((rows)=>rows.map((row)=>row.product.id===productId?{...row,quantity:Math.max(0,row.quantity+delta)}:row).filter((row)=>row.quantity>0));
  return <main className="public-page" style={{ '--brand': business.primary_color, '--brand-soft': business.secondary_color } as CSSProperties}>
    <header className="public-header">
      <div className="public-brand"><span className="brand-mark"><Store size={19} /></span><div><strong>{business.name}</strong><small>Catálogo de productos</small></div></div>
      <div className="public-header-actions"><button className="button button-primary public-cart-button no-print" onClick={()=>setCheckoutOpen(true)}><ShoppingCart size={16}/> Mi pedido{publicCart.length>0&&<span>{publicCart.reduce((n,row)=>n+row.quantity,0)}</span>}</button><button className="button button-outline no-print public-print-button" onClick={()=>{setVisibleProductCount(filteredProducts.length);window.setTimeout(()=>window.print(),50);}}><Printer size={16} /> Imprimir catálogo</button></div>
    </header>
    {promotionalProducts.length>0&&<section className="public-offers" aria-label="Ofertas exclusivas"><div className="public-offers-heading"><div className="public-offers-title"><span><Tag size={17}/></span><div><h2>Ofertas exclusivas</h2><p>{promotionalProducts.length} {promotionalProducts.length===1?'producto en descuento':'productos en descuento'}</p></div></div><div className="public-offers-arrows no-print"><button type="button" aria-label="Ver ofertas anteriores" onClick={()=>offersTrackRef.current?.scrollBy({left:-300,behavior:'smooth'})}><ChevronLeft size={17}/></button><button type="button" aria-label="Ver más ofertas" onClick={()=>offersTrackRef.current?.scrollBy({left:300,behavior:'smooth'})}><ChevronRight size={17}/></button></div></div><div className="public-offers-track" ref={offersTrackRef}>{promotionalProducts.map((product)=><article className="public-offer-card" key={product.id}><button type="button" className="public-offer-image image-preview-trigger" onClick={()=>setPreviewProduct(product)} aria-label={`Ver imagen de ${product.name}`}>{product.image_url?<img src={product.image_url} alt={product.name} loading="lazy"/>:<ShoppingBag size={31}/>}<span className="image-preview-hint"><Eye size={14}/> Ver imagen</span><span className="offer-image-badge">Oferta</span></button><div className="public-offer-info"><strong title={product.name}>{product.name}</strong>{product.variant_label&&<small>{product.variant_label}</small>}<s>{formatMoney(product.regular_price,business.currency_symbol)}</s><div><b>{formatMoney(priceFor(product),business.currency_symbol)}</b><button type="button" aria-label={`Agregar ${product.name} al pedido`} onClick={()=>addPublicCart(product)}><Plus size={17}/></button></div></div></article>)}</div><div className="public-offers-scroll-hint no-print"><span/></div></section>}
    <section className="public-catalog-controls no-print"><div className="public-controls-heading"><div><span className="eyebrow">EXPLORA LA COLECCIÓN</span><h2>Nuestros productos</h2></div><span className="public-result-count">{filteredProducts.length} {filteredProducts.length===1?'resultado':'resultados'}</span></div><label className="public-search"><Search size={17}/><input type="search" value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Buscar productos…" aria-label="Buscar productos por nombre o descripción"/>{query&&<button type="button" onClick={()=>setQuery('')} aria-label="Limpiar búsqueda"><X size={15}/></button>}</label>{categoryNames.length>0&&<div className="public-filter-row"><span className="public-filter-label">Categorías</span><div className="public-filter-chips"><button className={`public-filter-chip ${selectedCategory==='Todas'?'active':''}`} onClick={()=>setSelectedCategory('Todas')}>Todas <small>{products.length}</small></button>{categoryNames.map((category)=>{const count=products.filter((product)=>(product.category_name?.trim()||'Sin categoría')===category).length;return <button key={category} className={`public-filter-chip ${selectedCategory===category?'active':''}`} onClick={()=>setSelectedCategory(category)}>{category}<small>{count}</small></button>;})}</div></div>}</section>
    {filteredProducts.length === 0 ? <section className="public-empty"><span><Search size={24}/></span><h2>{products.length?'No encontramos productos':'Aún no hay productos publicados'}</h2><p>{products.length?'Prueba otra búsqueda o cambia la categoría seleccionada.':'Vuelve pronto para ver los productos de este negocio.'}</p>{(query||selectedCategory!=='Todas')&&<button className="button button-outline no-print" onClick={()=>{setQuery('');setSelectedCategory('Todas');}}>Ver todos los productos</button>}</section> : <section className="public-category"><div className="public-grid">{visiblePublicProducts.map((product) => <article className="public-product" key={product.id}>
      <button type="button" className="public-product-image image-preview-trigger" onClick={()=>setPreviewProduct(product)} aria-label={`Ver imagen de ${product.name}`}>{product.image_url ? <img src={product.image_url} alt={product.name} loading="lazy" /> : <span className="public-image-placeholder"><ShoppingBag size={31}/></span>}<span className="image-preview-hint"><Eye size={14}/> Ver imagen</span>{product.promotion_enabled&&<span className="public-promo-badge">Oferta</span>}</button><div className="public-product-info">{product.category_name&&<span className="public-product-category">{product.category_name}</span>}<h3>{product.name}</h3>{product.variant_label&&<small className="product-variant">{product.variant_label}</small>}<p>{product.description || 'Un producto seleccionado para ti.'}</p><div className="price-line">{product.promotion_enabled && <s>{formatMoney(product.regular_price,business.currency_symbol)}</s>}<strong>{formatMoney(priceFor(product),business.currency_symbol)}</strong></div><button className="public-add-button no-print" onClick={()=>addPublicCart(product)}><Plus size={14}/> Agregar al pedido</button></div>
    </article>)}</div>{visiblePublicProducts.length<filteredProducts.length&&<div className="catalog-load-more no-print"><span>Mostrando {visiblePublicProducts.length} de {filteredProducts.length} productos</span><button type="button" className="button button-outline" onClick={()=>setVisibleProductCount((count)=>Math.min(count+12,filteredProducts.length))}>Ver más productos <ChevronDown size={15}/></button></div>}</section>}
    <footer className="public-footer">{business.address && <span>{business.address}</span>}{business.phone && <a href={`tel:${business.phone}`}>{business.phone}</a>}<span>Catálogo creado con Mini POS</span></footer>
    {publicCart.length>0&&<button className="public-cart-dock no-print" onClick={()=>setCheckoutOpen(true)}><span><ShoppingCart size={17}/>{publicCart.reduce((n,row)=>n+row.quantity,0)}</span><strong>Ver pedido</strong><b>{formatMoney(publicCartTotal,business.currency_symbol)}</b></button>}
    {previewProduct&&<ProductPreviewModal key={previewProduct.id} product={previewProduct} currencySymbol={business.currency_symbol} onClose={()=>setPreviewProduct(null)}/>}
    {checkoutOpen&&<PublicCheckoutModal business={business} slug={slug} cart={publicCart} total={publicCartTotal} onQuantity={changePublicQuantity} onClose={()=>setCheckoutOpen(false)} onOrdered={()=>{setPublicCart([]);}}/>}
  </main>;
}

function ProductPreviewModal({product,currencySymbol,onClose}:{product:Product;currencySymbol:string;onClose:()=>void}){
  const [showDetails,setShowDetails]=useState(false);
  useEffect(()=>{
    const previousOverflow=document.body.style.overflow;
    const closeOnEscape=(event:KeyboardEvent)=>{if(event.key==='Escape')onClose();};
    document.body.style.overflow='hidden';
    window.addEventListener('keydown',closeOnEscape);
    return()=>{document.body.style.overflow=previousOverflow;window.removeEventListener('keydown',closeOnEscape);};
  },[onClose]);
  return <div className="product-preview-backdrop" onMouseDown={(event)=>event.target===event.currentTarget&&onClose()}><section className="product-preview-modal" role="dialog" aria-modal="true" aria-label={`Imagen de ${product.name}`}><header className="product-preview-header"><span><Eye size={16}/> Vista del producto</span><button type="button" className="icon-button" onClick={onClose} aria-label="Cerrar imagen"><X size={19}/></button></header><div className="product-preview-image">{product.image_url?<img src={product.image_url} alt={product.name}/>:<ShoppingBag size={42}/>}</div><div className="product-preview-info">{product.category_name&&<small>{product.category_name}</small>}<h2>{product.name}</h2>{product.variant_label&&<span className="product-variant">{product.variant_label}</span>}<div className="product-preview-price">{product.promotion_enabled&&<s>{formatMoney(product.regular_price,currencySymbol)}</s>}<strong>{formatMoney(priceFor(product),currencySymbol)}</strong>{product.promotion_enabled&&<span>Oferta</span>}</div><button type="button" className="button button-outline product-preview-detail-toggle" aria-expanded={showDetails} onClick={()=>setShowDetails((shown)=>!shown)}>{showDetails?'Ocultar detalle':'Ver detalle'}<ChevronDown size={15}/></button>{showDetails&&<div className="product-preview-description"><strong>Descripción</strong><p>{product.description?.trim()||'Este producto no tiene una descripción adicional.'}</p></div>}</div></section></div>;
}

function PublicCheckoutModal({business,slug,cart,total,onQuantity,onClose,onOrdered}:{business:Business;slug:string;cart:CartRow[];total:number;onQuantity:(id:string,delta:number)=>void;onClose:()=>void;onOrdered:()=>void}){
  const [name,setName]=useState('');
  const [phone,setPhone]=useState('');
  const [address,setAddress]=useState('');
  const [locationUrl,setLocationUrl]=useState('');
  const [notes,setNotes]=useState('');
  const [captchaToken,setCaptchaToken]=useState('');
  const [captchaRefresh,setCaptchaRefresh]=useState(0);
  const [capturingLocation,setCapturingLocation]=useState(false);
  const [locationStatus,setLocationStatus]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [confirmation,setConfirmation]=useState<{order_number:number;total_amount:number;currency_symbol:string;business_name:string;business_phone:string;items:{product_name:string;variant_label:string|null;quantity:number;unit_price:number;line_total:number}[]}|null>(null);
  const [whatsappUrl,setWhatsappUrl]=useState('');
  const currencySymbol=business.currency_symbol||'C$';
  const hasBusinessWhatsApp=(business.phone||'').replace(/\D/g,'').length>=10;
  const captureLocation=()=>{
    if(!navigator.geolocation){setLocationStatus('Este navegador no permite obtener la ubicación.');return;}
    setCapturingLocation(true);setLocationStatus('Solicitando ubicación…');
    navigator.geolocation.getCurrentPosition((position)=>{
      const {latitude,longitude}=position.coords;
      setLocationUrl(`https://www.google.com/maps?q=${latitude},${longitude}`);
      setLocationStatus('Ubicación agregada.');setCapturingLocation(false);
    },(geoError)=>{
      const message=geoError.code===1?'Permite el acceso a la ubicación en tu navegador e inténtalo de nuevo.':geoError.code===2?'No se pudo determinar tu ubicación. Comprueba el GPS o la conexión.':'La solicitud tardó demasiado. Inténtalo de nuevo.';
      setLocationStatus(message);setCapturingLocation(false);
    },{enableHighAccuracy:true,timeout:15000,maximumAge:0});
  };
  const submit=async(event:FormEvent)=>{
    event.preventDefault();
    if(!cart.length)return;
    if(!captchaToken){setError('Completa la verificación de seguridad antes de enviar.');return;}
    if(locationUrl.trim()&&!isValidGoogleMapsUrl(locationUrl)){setError('Pega un enlace HTTPS válido de Google Maps.');return;}
    const recipient=business.phone?.replace(/\D/g,'')||'';
      if(recipient.length<10){setError('Este negocio todavía no configuró un número de WhatsApp válido.');return;}
    setBusy(true);setError('');
    const whatsappTab=window.open('about:blank','_blank');
    try{
      const response=await fetch('/api/public-order',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:captchaToken,slug,name:name.trim(),phone:phone.trim(),address:address.trim(),locationUrl:locationUrl.trim(),notes:notes.trim(),items:cart.map(({product,quantity})=>({product_id:product.id,quantity}))})});
      const data=await response.json() as {error?:string}|NonNullable<typeof confirmation>&{id:string};
      if(!response.ok)throw new Error('error' in data&&data.error?data.error:'No se pudo registrar el pedido.');
      if(!data||'error' in data)throw new Error('No se recibió la confirmación del pedido.');
      const result=data as NonNullable<typeof confirmation>&{id:string};
      const message=[
        `NUEVO PEDIDO - ${result.business_name}`,
        '',
        'DATOS DEL CLIENTE',
        `Cliente: ${name.trim()}`,
        `Teléfono: ${phone.trim()}`,
        `Dirección: ${address.trim()}`,
        `Ubicación: ${locationUrl.trim()||'No compartida'}`,
        '',
        'PRODUCTOS:',
        ...result.items.flatMap((item)=>[
          `- (${item.quantity}x) ${item.product_name}${item.variant_label?` [${item.variant_label}]`:''}`,
          `    ${formatMoney(Number(item.unit_price),result.currency_symbol)} c/u → ${formatMoney(Number(item.line_total),result.currency_symbol)}`,
        ]),
        '',
        `TOTAL: ${formatMoney(Number(result.total_amount),result.currency_symbol)}`,
        `Pedido #${String(result.order_number).padStart(5,'0')}`,
        notes.trim()?`Nota: ${notes.trim()}`:'',
      ].filter(Boolean).join('\n');
      const target=`https://wa.me/${recipient}?text=${encodeURIComponent(message)}`;
      setConfirmation(result);setWhatsappUrl(target);onOrdered();
      if(whatsappTab)whatsappTab.location.href=target;
    }catch(requestError){whatsappTab?.close();setCaptchaToken('');setCaptchaRefresh((value)=>value+1);setError(requestError instanceof Error?requestError.message:'No se pudo crear el pedido.');}
    finally{setBusy(false);}
  };
  return <div className="public-order-backdrop" onMouseDown={(event)=>event.target===event.currentTarget&&onClose()}><section className="public-order-modal" role="dialog" aria-modal="true" aria-label="Tu pedido"><header className="public-order-header"><div><span className="eyebrow">{confirmation?'PEDIDO RECIBIDO':'TU PEDIDO'}</span><h2>{confirmation?`Pedido #${String(confirmation.order_number).padStart(5,'0')}`:'Revisa y envía tu pedido'}</h2></div><button className="icon-button" onClick={onClose} aria-label="Cerrar pedido"><X size={19}/></button></header>{confirmation?<div className="public-order-success"><span className="public-order-success-icon"><Check size={23}/></span><h3>Tu pedido quedó registrado</h3><p>El negocio lo revisará como pedido pendiente. Para enviarlo por WhatsApp, confirma el mensaje que se abrió.</p><div className="public-order-success-total"><span>Total solicitado</span><strong>{formatMoney(Number(confirmation.total_amount),confirmation.currency_symbol)}</strong></div><a className="button button-primary button-full" href={whatsappUrl} target="_blank" rel="noreferrer"><Phone size={16}/> Continuar por WhatsApp</a><button className="button button-outline button-full" onClick={onClose}>Volver al catálogo</button></div>:<><div className="public-order-lines">{cart.map(({product,quantity})=><div className="public-order-line" key={product.id}><div className="public-order-product-image">{product.image_url?<img src={product.image_url} alt=""/>:<ShoppingBag size={18}/>}</div><div className="public-order-product"><strong>{product.name}</strong>{product.variant_label&&<small>{product.variant_label}</small>}<small>{formatMoney(priceFor(product),currencySymbol)} c/u</small></div><div className="quantity-control"><button type="button" onClick={()=>onQuantity(product.id,-1)} aria-label="Restar una unidad">−</button><span>{quantity}</span><button type="button" onClick={()=>onQuantity(product.id,1)} aria-label="Agregar una unidad">+</button></div><strong className="public-order-line-total">{formatMoney(priceFor(product)*quantity,currencySymbol)}</strong></div>)}</div><form className="public-order-form" onSubmit={submit}><div className="public-order-total"><span>Total del pedido</span><strong>{formatMoney(total,currencySymbol)}</strong></div><label>Cliente<input required maxLength={120} value={name} onChange={(event)=>setName(event.target.value)} placeholder="Nombre y apellido"/></label><label>Teléfono / WhatsApp<input required type="tel" minLength={7} maxLength={30} value={phone} onChange={(event)=>setPhone(event.target.value)} placeholder="Ej. +505 8888 8888"/><small>Incluye el código de país para que el negocio pueda contactarte.</small></label><label>Dirección<input required maxLength={300} value={address} onChange={(event)=>setAddress(event.target.value)} placeholder="Dirección para la entrega"/></label><label>Ubicación en Google Maps <span className="optional">OPCIONAL</span><div className="location-input-row"><input type="url" maxLength={500} value={locationUrl} onChange={(event)=>{setLocationUrl(event.target.value);setLocationStatus('');}} placeholder="https://www.google.com/maps?q=…"/><button type="button" className="location-capture-button" onClick={captureLocation} disabled={capturingLocation} aria-label="Capturar mi ubicación GPS" title="Usar mi ubicación actual"><LocateFixed size={17}/><span>{capturingLocation?'Obteniendo…':'Mi ubicación'}</span></button></div><small>{locationStatus||'Pega un enlace de Maps o usa tu ubicación actual. El navegador pedirá permiso.'}</small></label><label>Nota para el negocio <span className="optional">OPCIONAL</span><textarea maxLength={500} rows={2} value={notes} onChange={(event)=>setNotes(event.target.value)} placeholder="Horario u otra indicación"/></label><TurnstileWidget key={captchaRefresh} onToken={setCaptchaToken}/>{!hasBusinessWhatsApp&&<div className="notice" role="status">El negocio aún no ha configurado WhatsApp para recibir pedidos.</div>}{error&&<div className="notice" role="alert">{error}</div>}<button className="button button-primary button-full" disabled={busy||!cart.length||!hasBusinessWhatsApp||!captchaToken}>{busy?'Registrando pedido…':'Enviar pedido por WhatsApp'} <ArrowUpRight size={16}/></button><p className="public-order-disclaimer">El pedido queda pendiente. El negocio confirmará disponibilidad y detalles por WhatsApp.</p></form></>}</section></div>;
}

function AuthScreen({ onAuthenticated, canSignUp }: { onAuthenticated: (userId: string) => void; canSignUp: boolean }) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [verificationPending, setVerificationPending] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setMessage(''); setBusy(true);
    try {
      if (!neon) throw new Error('La conexión con Neon no está configurada.');
      const result = mode === 'login'
        ? await neon.auth.signInWithPassword({ email, password })
        : await neon.auth.signUp({ email, password });
      if (result.error) {
        const code = result.error.code?.toLowerCase() || '';
        const detail = result.error.message.toLowerCase();
        if (mode === 'signup' && (code === 'session_not_found' || detail.includes('session'))) {
          setVerificationPending(true);
          setMessage('Tu cuenta fue creada y necesita verificar el correo. Revisa tu bandeja de entrada para encontrar el código de verificación.');
        } else if (mode === 'login' && (code === 'email_not_confirmed' || code === 'email_not_verified' || (detail.includes('email') && (detail.includes('not verified') || detail.includes('not confirmed') || detail.includes('verification'))))) {
          setVerificationPending(true);
          setMessage('Este correo todavía no está verificado. Solicita un nuevo código y confírmalo aquí.');
        } else setMessage(result.error.message);
      }
      else if (result.data.session) {
        onAuthenticated(result.data.session.user.id);
      } else if (mode === 'signup') setMessage('Cuenta creada. Para entrar, confirma el correo con el enlace que envía Neon Auth. Revisa también spam. Si no llega, el envío de correo debe estar configurado en Neon Auth.');
      else setMessage('No se inició una sesión. Si tu cuenta requiere verificación, confirma el correo enviado por Neon Auth y vuelve a intentarlo.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo completar el acceso. Inténtalo de nuevo.');
    } finally {
      setBusy(false);
    }
  };
  const resendVerification = async () => {
    if (!neon || !email.trim()) return;
    setBusy(true); setMessage('');
    try {
      const result = await neon.auth.resend({ type: 'signup', email: email.trim() });
      if (result.error) setMessage(result.error.message);
      else setMessage('Solicitamos un nuevo correo de verificación. Revisa tu bandeja de entrada y spam.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo reenviar el correo.');
    } finally { setBusy(false); }
  };
  const verifyEmail = async (event: FormEvent) => {
    event.preventDefault();
    if (!neon) return;
    setBusy(true); setMessage('');
    try {
      const result = await neon.auth.verifyOtp({ email: email.trim(), token: verificationCode.trim(), type: 'signup' });
      if (result.error) { setMessage(result.error.message); return; }
      if (result.data.session) onAuthenticated(result.data.session.user.id);
      else {
        const login = await neon.auth.signInWithPassword({ email: email.trim(), password });
        if (login.error) setMessage(login.error.message);
        else if (login.data.session) onAuthenticated(login.data.session.user.id);
        else setMessage('Correo verificado. Inicia sesión para continuar.');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo verificar el correo.');
    } finally { setBusy(false); }
  };
  return <main className="auth-shell"><section className="auth-aside"><div className="auth-logo"><span className="brand-mark"><Store size={20} /></span> mini pos</div><div className="auth-pitch"><span className="eyebrow">TU NEGOCIO, MÁS CLARO</span><h1>Vende con calma.<br /><em>Crece a tu ritmo.</em></h1><p>Productos, ventas y catálogo en un solo lugar.</p><div className="auth-feature"><span><ShoppingBag size={17} /></span>Una forma sencilla de comenzar</div></div><small className="auth-copyright">Una herramienta gratuita para emprender.</small></section>
    <section className="auth-main"><div className="auth-form-wrap"><span className="mobile-brand"><Store size={18} /> mini pos</span><span className="eyebrow">{mode === 'login' ? 'QUÉ BUENO VERTE' : 'UN GRAN PRIMER PASO'}</span><h2>{mode === 'login' ? 'Inicia sesión' : 'Crea tu cuenta'}</h2><p className="muted">{mode === 'login' ? 'Ingresa para continuar con tu negocio.' : 'Configura tu espacio para empezar a vender.'}</p>{mode === 'signup' && <p className="muted" style={{ marginTop: 10, lineHeight: 1.6 }}>Si la verificación está activa, confirma el correo antes de entrar. Revisa también spam. Si no recibes el código, usa “Reenviar código” o revisa la configuración de correo en Neon.</p>}
    {verificationPending ? <form onSubmit={verifyEmail} className="auth-form"><label>Correo electrónico<input required type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@correo.com" /></label><label>Código de verificación<input required inputMode="numeric" autoComplete="one-time-code" value={verificationCode} onChange={(e) => setVerificationCode(e.target.value)} placeholder="Código del correo" /></label>{message && <div className="notice">{message}</div>}<button className="button button-primary button-full" disabled={busy}>{busy ? 'Verificando…' : 'Verificar correo'} <ArrowUpRight size={16} /></button><button type="button" className="button button-outline button-full" disabled={busy} onClick={()=>void resendVerification()}>Reenviar código</button><div className="auth-switch"><button type="button" onClick={()=>{setVerificationPending(false);setVerificationCode('');setMessage('');}}>Volver al inicio de sesión</button></div></form> : <><form onSubmit={submit} className="auth-form"><label>Correo electrónico<input required type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@correo.com" /></label><label>Contraseña<input required type="password" minLength={8} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 8 caracteres" /></label>
      {message && <div className="notice">{message}</div>}<button className="button button-primary button-full" disabled={busy}>{busy ? 'Un momento…' : mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'} <ArrowUpRight size={16} /></button></form>
    {canSignUp&&<div className="auth-switch">{mode === 'login' ? '¿Primera vez aquí?' : '¿Ya tienes una cuenta?'} <button type="button" onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setMessage(''); }}>{mode === 'login' ? 'Crear cuenta' : 'Iniciar sesión'}</button></div>}</>}<div className="auth-secure"><span className="secure-dot" /> Acceso protegido por Neon</div></div></section></main>;
}

function AccessHoldScreen({ status, mode, onSignOut }: { status: InstallationAccess['status'] | 'unapproved' | null; mode: InstallationMode; onSignOut: () => void }) {
  const title = status === 'pending' ? 'Solicitud pendiente' : status === 'revoked' ? 'Acceso revocado' : status === 'rejected' ? 'Solicitud rechazada' : 'Acceso no autorizado';
  const message = status === 'pending'
    ? 'Tu cuenta fue registrada. El superadministrador debe aprobarla antes de que puedas administrar un negocio.'
    : status === 'rejected'
      ? 'El superadministrador no aprobó esta solicitud. Contacta con el administrador de la instalación si necesitas más información.'
    : mode === 'personal'
      ? 'Esta instalación está configurada para uso personal. El propietario debe autorizar esta cuenta desde Neon.'
      : 'El superadministrador de esta instalación debe aprobar tu cuenta para continuar.';
  return <main className="center-loader"><section className="panel" style={{ maxWidth: 520, padding: 32, textAlign: 'center' }}><span className="brand-mark"><Store size={20}/></span><h1>{title}</h1><p>{message}</p><button className="button button-outline" onClick={onSignOut}>Cerrar sesión</button></section></main>;
}

function AccessAdminPage({ mode, onModeChanged, showToast, setError }: { mode: InstallationMode; onModeChanged: (mode: InstallationMode) => void; showToast: (message: string) => void; setError: (message: string) => void }) {
  const [rows, setRows] = useState<{user_id:string;email:string;status:'pending'|'approved'|'revoked'|'rejected';role:'owner'|'admin';created_at:string}[]>([]);
  const [busyUser, setBusyUser] = useState('');
  const [loadingRows, setLoadingRows] = useState(true);
  const load = useCallback(async () => {
    if (!neon) return;
    setLoadingRows(true);
    const { data, error } = await neon.from('installation_access').select('user_id,email,status,role,created_at').order('created_at', { ascending: false });
    if (error) setError(error.message);
    else setRows((data || []) as typeof rows);
    setLoadingRows(false);
  }, [setError]);
  useEffect(() => { void load(); }, [load]);
  const changeMode = async (next: InstallationMode) => {
    if (!neon || next === mode) return;
    const { error } = await neon.rpc('admin_set_installation_mode', { p_mode: next });
    if (error) { setError(error.message); return; }
    onModeChanged(next);
    showToast(next === 'personal' ? 'Modo personal activado.' : 'Modo SaaS educativo activado.');
  };
  const actOnUser = async (userId: string, action: 'approve'|'reject'|'revoke'|'reconsider') => {
    if (!neon) return;
    setBusyUser(userId);
    const rpcName = { approve:'admin_approve_installation_user', reject:'admin_reject_installation_user', revoke:'admin_revoke_installation_user', reconsider:'admin_reconsider_installation_user' }[action];
    const { error } = await neon.rpc(rpcName, { p_user_id: userId });
    if (error) setError(error.message);
    else { showToast(({approve:'Cuenta aprobada.',reject:'Solicitud rechazada.',revoke:'Acceso revocado.',reconsider:'Solicitud devuelta a pendiente.'})[action]); await load(); }
    setBusyUser('');
  };
  return <><PageHeading eyebrow="ADMINISTRACIÓN DE LA INSTALACIÓN" title="Accesos" description="Elige quién puede administrar un negocio en esta instalación."/><section className="panel" style={{ marginBottom: 20 }}><div className="table-toolbar"><div><strong className="table-title">Modo de acceso</strong><p>{mode === 'personal' ? 'Solo las cuentas autorizadas por el propietario pueden usar esta instalación.' : 'Las cuentas nuevas pueden solicitar acceso y esperan aprobación.'}</p></div><div className="modal-actions"><button className={`button ${mode==='personal'?'button-primary':'button-outline'}`} onClick={()=>void changeMode('personal')}>Personal</button><button className={`button ${mode==='saas'?'button-primary':'button-outline'}`} onClick={()=>void changeMode('saas')}>SaaS educativo</button></div></div></section><section className="panel"><div className="table-toolbar"><div><strong className="table-title">Cuentas de la instalación</strong><p>La autorización se aplica también en la base de datos.</p></div><button className="button button-outline" onClick={()=>void load()} disabled={loadingRows}>Actualizar</button></div>{loadingRows?<div className="empty-state">Cargando cuentas…</div>:rows.length?<div className="table-scroll"><table><thead><tr><th>CUENTA</th><th>CORREO</th><th>ESTADO</th><th>ROL</th><th>ACCIÓN</th></tr></thead><tbody>{rows.map((row)=><tr key={row.user_id}><td><code>{row.user_id}</code></td><td>{row.email||'—'}</td><td>{row.status==='approved'?'Aprobada':row.status==='pending'?'Pendiente':row.status==='rejected'?'Rechazada':'Revocada'}</td><td>{row.role==='admin'?'Superadmin':'Negocio'}</td><td>{row.status==='pending'&&mode==='saas'?<div className="access-row-actions"><button className="button button-small button-primary" disabled={busyUser===row.user_id} onClick={()=>void actOnUser(row.user_id,'approve')}>Aprobar</button><button className="button button-small button-danger-outline" disabled={busyUser===row.user_id} onClick={()=>void actOnUser(row.user_id,'reject')}>Rechazar</button></div>:row.status==='approved'&&row.role!=='admin'?<button className="button button-small button-outline" disabled={busyUser===row.user_id} onClick={()=>void actOnUser(row.user_id,'revoke')}>Revocar acceso</button>:row.status==='rejected'&&mode==='saas'?<button className="button button-small button-outline" disabled={busyUser===row.user_id} onClick={()=>void actOnUser(row.user_id,'reconsider')}>Reconsiderar</button>:<span className="muted">—</span>}</td></tr>)}</tbody></table></div>:<div className="empty-state"><span className="empty-icon"><Users size={23}/></span><strong>No hay otras cuentas</strong><p>Las solicitudes de acceso aparecerán aquí cuando el modo SaaS educativo esté activo.</p></div>}</section></>;
}

function ConfirmDeleteModal({ entityLabel, entityName, onCancel, onDelete }: { entityLabel:'producto'|'cliente'; entityName:string; onCancel:()=>void; onDelete:()=>Promise<DeleteResult> }) {
  const [confirmation,setConfirmation]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [copyHint,setCopyHint]=useState('');
  const copyName=async()=>{
    try{await navigator.clipboard.writeText(entityName);setCopyHint('Nombre copiado. Pégalo en el campo para confirmar.');}
    catch{setCopyHint('Selecciona el nombre mostrado y cópialo manualmente.');}
  };
  const confirm=async()=>{
    if(confirmation!==entityName||busy)return;
    setBusy(true);setError('');
    try{
      const result=await onDelete();
      if(result.ok)onCancel();
      else setError(result.error||`No se pudo eliminar el ${entityLabel}.`);
    }catch(cause){setError(cause instanceof Error?cause.message:`No se pudo eliminar el ${entityLabel}.`);}
    finally{setBusy(false);}
  };
  return <div className="modal-backdrop delete-confirm-backdrop" onMouseDown={(event)=>event.target===event.currentTarget&&!busy&&onCancel()}><section className="modal-card delete-confirm-modal" role="dialog" aria-modal="true" aria-label={`Confirmar eliminación de ${entityLabel}`}><div className="modal-heading"><div><span className="eyebrow">ELIMINACIÓN PERMANENTE</span><h2>Eliminar {entityLabel}</h2></div><button type="button" className="icon-button" disabled={busy} onClick={onCancel} aria-label="Cerrar"><X size={19}/></button></div><div className="notice delete-warning" role="alert">Esta acción no se puede deshacer. Solo se permite si no hay ventas ni pedidos web que dependan de este {entityLabel}.</div><p className="delete-copy-label">Copia el nombre exacto:</p><div className="delete-name-copy"><code>{entityName}</code><button type="button" className="button button-small button-outline" onClick={()=>void copyName()}><ClipboardList size={13}/> Copiar</button></div><label>Para confirmar, pega aquí el nombre<input autoFocus autoComplete="off" value={confirmation} onChange={(event)=>setConfirmation(event.target.value)} placeholder={entityName}/></label>{copyHint&&<small className="delete-copy-hint" role="status">{copyHint}</small>}{error&&<div className="notice" role="alert">{error}</div>}<div className="modal-actions"><button type="button" className="button button-outline" disabled={busy} onClick={onCancel}>Cancelar</button><button type="button" className="button button-danger-solid" disabled={busy||confirmation!==entityName} onClick={()=>void confirm()}>{busy?'Eliminando…':`Eliminar ${entityLabel}`}</button></div></section></div>;
}

function SetupScreen() {
  const socialLinks = [
    { label: 'YouTube', href: 'https://www.youtube.com/@adn.DAEZKT', icon: Youtube },
    { label: 'TikTok', href: 'https://www.tiktok.com/@adn.daezkt', icon: Music2 },
    { label: 'Facebook', href: 'https://www.facebook.com/share/1dNNCMGnA8/', icon: Facebook },
    { label: 'Instagram', href: 'https://www.instagram.com/daezkt.wsyt?dlrf=em5tcjU1cmkyaHVz', icon: Instagram },
  ];

  return <main className="setup-screen">
    <section className="setup-config-panel">
      <div className="setup-card">
        <span className="brand-mark"><Store size={20} /></span>
        <span className="eyebrow">CONFIGURACIÓN INICIAL</span>
        <h1>Conecta tu proyecto Neon</h1>
        <p>Configura estas variables en <code>.env.local</code> para desarrollo local o en Vercel para producción. Después, vuelve a cargar la app.</p>
        <div className="setup-hint">
          <strong>Variables necesarias</strong>
          <code>VITE_NEON_AUTH_URL</code>
          <code>VITE_NEON_DATA_API_URL</code>
        </div>
        <a href="https://console.neon.tech" target="_blank" rel="noreferrer" className="button button-primary">Abrir Neon <ExternalLink size={15} /></a>
      </div>
    </section>
    <aside className="setup-promo-panel">
      <div className="setup-promo-content">
        <span className="setup-creator-label">UNA HERRAMIENTA GRATUITA DE</span>
        <img className="setup-promo-logo" src="/brand/daezkt-logo-white.png" alt="DAEZKT — We Simplify Your Tasks" />
        <div className="setup-promo-copy">
          <span className="setup-promo-eyebrow">APRENDE · APLICA · CRECE</span>
          <h2>Mejora tu negocio, un paso a la vez.</h2>
          <p>Ideas y herramientas para optimizar procesos, aprender desarrollo y tomar mejores decisiones con datos.</p>
        </div>
        <nav className="setup-social-links" aria-label="Redes sociales de DAEZKT">
          {socialLinks.map(({ label, href, icon: Icon }) => <a key={label} href={href} target="_blank" rel="noreferrer" aria-label={`Visitar DAEZKT en ${label}`}>
            <Icon size={17} /><span>{label}</span><ExternalLink size={12} />
          </a>)}
        </nav>
        <small className="setup-promo-credit">Mini POS · Edición regalo</small>
      </div>
    </aside>
  </main>;
}

export default function App() {
  const isPublic = window.location.pathname.startsWith('/catalogo/');
  const [userId, setUserId] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [installationConfig, setInstallationConfig] = useState<InstallationConfig | null>(null);
  const [installationConfigReady, setInstallationConfigReady] = useState(false);
  const [installationAccess, setInstallationAccess] = useState<InstallationAccess | null>(null);
  const [accessChecked, setAccessChecked] = useState(false);
  const [business, setBusiness] = useState<Business | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [customers,setCustomers]=useState<Customer[]>([]);
  const [customersLoading,setCustomersLoading]=useState(false);
  const [publicOrders,setPublicOrders]=useState<PublicOrder[]>([]);
  const [page, setPage] = useState<Page>('dashboard');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [query, setQuery] = useState('');
  const [cart, setCart] = useState<CartRow[]>([]);
  const [receipt, setReceipt] = useState<Sale | null>(null);
  const [productModal, setProductModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [loggingOut,setLoggingOut]=useState(false);
  const [period, setPeriod] = useState<'7' | '30' | 'all'>('7');

  useEffect(() => {
    if (!neon) { setAuthReady(true); setInstallationConfigReady(true); return; }
    const client = neon;
    client.auth.getSession().then(async ({ data }) => {
      setUserId(data.session?.user.id || null);
      setAuthReady(true);
      const config = await client.rpc('get_installation_config');
      if (config.error) setError(config.error.message);
      else setInstallationConfig(config.data as InstallationConfig);
      setInstallationConfigReady(true);
    }).catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : 'No se pudo cargar la configuración de acceso.');
      setAuthReady(true); setInstallationConfigReady(true);
    });
    const { data: listener } = client.auth.onAuthStateChange((_event, session) => setUserId(session?.user.id || null));
    return () => listener.subscription.unsubscribe();
  }, []);

  const loadWorkspace = useCallback(async () => {
    if (!neon || !userId) return;
    setLoading(true); setCustomersLoading(true); setError('');
    const { data: accessData, error: accessError } = await neon.rpc('get_my_installation_access');
    if (accessError) {
      setError(accessError.message); setAccessChecked(true); setLoading(false); setCustomersLoading(false); return;
    }
    let access = accessData as InstallationAccess | null;
    if (!access && installationConfig?.access_mode === 'saas') {
      const request = await neon.rpc('request_installation_access');
      if (request.error) {
        setError(request.error.message); setAccessChecked(true); setLoading(false); setCustomersLoading(false); return;
      }
      access = { status: request.data as InstallationAccess['status'], role: 'owner' };
    }
    setInstallationAccess(access); setAccessChecked(true);
    if (!access || access.status !== 'approved') {
      setBusiness(null); setProducts([]); setCategories([]); setSales([]); setCustomers([]); setPublicOrders([]); setLoading(false); setCustomersLoading(false); return;
    }
    let { data: shop, error: shopError } = await neon.from('businesses').select('*').eq('owner_user_id', userId).maybeSingle();
    if (shopError) { setError(shopError.message); setLoading(false); setCustomersLoading(false); return; }
    if (!shop) {
      const name = 'Mi negocio';
      const slug = `${slugify(name) || 'negocio'}-${crypto.randomUUID().slice(0, 6)}`;
      const { data: created, error: createError } = await neon.from('businesses').insert({ owner_user_id: userId, name, public_slug: slug }).select().single();
      if (createError) { setError(createError.message); setLoading(false); setCustomersLoading(false); return; }
      shop = created;
    }
    setBusiness(shop as Business);
    void (async()=>{
      try {
        const { data: customerRows, error: customerError } = await neon.from('customers').select('*').eq('business_id', shop.id).order('updated_at', {ascending:false});
        if (customerError) setError(customerError.message);
        else setCustomers((customerRows || []) as Customer[]);
      } catch (customerError) { setError(customerError instanceof Error ? customerError.message : 'No se pudieron cargar los clientes.'); }
      finally { setCustomersLoading(false); }
    })();
    const [{ data: productRows, error: productError }, { data: saleRows, error: saleError }, { data: categoryRows, error: categoryError }, {data:orderRows,error:orderError}] = await Promise.all([
      neon.from('products').select('*').eq('business_id', shop.id).order('created_at', { ascending: false }),
      neon.from('sales').select('*, sale_items(*)').eq('business_id', shop.id).order('sold_at', { ascending: false }),
      neon.from('categories').select('*').eq('business_id', shop.id).order('name'),
      neon.from('public_orders').select('*, public_order_items(*)').eq('business_id', shop.id).order('created_at', {ascending:false}),
    ]);
    if (productError || saleError || categoryError || orderError) setError(productError?.message || saleError?.message || categoryError?.message || orderError?.message || 'No se pudieron cargar los datos.');
    setProducts((productRows || []) as Product[]); setSales((saleRows || []) as Sale[]); setCategories((categoryRows || []) as Category[]);setPublicOrders((orderRows||[]) as PublicOrder[]);setLoading(false);
  }, [userId, installationConfig?.access_mode]);

  useEffect(() => { if (userId) { setAccessChecked(false); void loadWorkspace(); } else { setInstallationAccess(null); setAccessChecked(false); setBusiness(null); setProducts([]); setCategories([]); setSales([]);setCustomers([]);setCustomersLoading(false);setPublicOrders([]); } }, [userId, loadWorkspace]);
  useEffect(() => { if (toast) { const timer = window.setTimeout(() => setToast(''), 3200); return () => window.clearTimeout(timer); } }, [toast]);
  useEffect(() => { if (business) { document.documentElement.style.setProperty('--brand', business.primary_color); document.documentElement.style.setProperty('--brand-soft', business.secondary_color); } }, [business]);

  const signOut=async()=>{
    if(!neon||loggingOut)return;
    setLoggingOut(true);setError('');
    try{
      const {error:signOutError}=await neon.auth.signOut();
      if(signOutError){setError(signOutError.message);return;}
      setUserId(null);setInstallationAccess(null);setAccessChecked(false);setBusiness(null);setProducts([]);setCategories([]);setSales([]);setCustomers([]);setPublicOrders([]);setCart([]);setReceipt(null);setProductModal(false);setEditingProduct(null);setMobileNavOpen(false);setLoading(false);
    }catch(error){setError(error instanceof Error?error.message:'No se pudo cerrar la sesión.');}
    finally{setLoggingOut(false);}
  };

  const activeProducts = products.filter((p) => p.is_active);
  const filteredProducts = products.filter((p) => p.name.toLowerCase().includes(query.toLowerCase()));
  const filteredActive = activeProducts.filter((p) => p.name.toLowerCase().includes(query.toLowerCase()));
  const periodSales = useMemo(() => {
    if (period === 'all') return sales.filter((sale) => sale.status !== 'voided');
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - Number(period) + 1);
    return sales.filter((sale) => sale.status !== 'voided' && new Date(sale.sold_at) >= start);
  }, [sales, period]);
  const totalRevenue = periodSales.reduce((sum, sale) => sum + Number(sale.total_amount), 0);
  const itemCounts: Record<string, { name: string; count: number }> = {};
  periodSales.forEach((sale) => (sale.sale_items || []).forEach((item) => { itemCounts[item.product_name] ||= { name: item.product_name, count: 0 }; itemCounts[item.product_name].count += item.quantity; }));
  const sortedProducts = Object.values(itemCounts).sort((a, b) => b.count - a.count);
  const totalUnitsSold = sortedProducts.reduce((sum, item) => sum + item.count, 0);
  const bestSellers = sortedProducts.slice(0, 4).map((item) => ({ ...item, percentage: totalUnitsSold ? item.count / totalUnitsSold * 100 : 0 }));
  const otherUnits = totalUnitsSold - bestSellers.reduce((sum, item) => sum + item.count, 0);
  if (otherUnits > 0) bestSellers.push({ name: 'Demás productos', count: otherUnits, percentage: otherUnits / totalUnitsSold * 100 });

  if (isPublic) return <PublicCatalog />;
  if (!authReady || !installationConfigReady) return <div className="center-loader">Preparando tu espacio…</div>;
  if (!isNeonConfigured) return <SetupScreen />;
  if (!userId) return <AuthScreen onAuthenticated={setUserId} canSignUp={installationConfig?.access_mode === 'saas' || !installationConfig?.initialized} />;
  if (!accessChecked) return <div className="center-loader">Comprobando autorización…</div>;
  if (!installationAccess || installationAccess.status !== 'approved') return <AccessHoldScreen status={installationAccess?.status || 'unapproved'} mode={installationConfig?.access_mode || 'personal'} onSignOut={() => void signOut()} />;

  const showToast = (message: string) => setToast(message);
  const addCategory = async (name: string): Promise<Category | null> => {
    if (!neon || !business) return null;
    const { data, error: categoryError } = await neon.from('categories').insert({ business_id: business.id, name: name.trim() }).select().single();
    if (categoryError) { setError(categoryError.message); return null; }
    const created = data as Category;
    setCategories((items) => [...items, created].sort((a, b) => a.name.localeCompare(b.name, 'es')));
    showToast('Categoría creada.');
    return created;
  };
  const renameCategory = async (id: string, name: string) => {
    if (!neon) return;
    const { error: categoryError } = await neon.from('categories').update({ name: name.trim() }).eq('id', id);
    if (categoryError) { setError(categoryError.message); return; }
    setCategories((items) => items.map((item) => item.id === id ? { ...item, name: name.trim() } : item).sort((a, b) => a.name.localeCompare(b.name, 'es')));
    showToast('Categoría actualizada.');
  };
  const deleteCategory = async (id: string) => {
    if (!neon) return;
    const { error: categoryError } = await neon.from('categories').delete().eq('id', id);
    if (categoryError) { setError(categoryError.message); return; }
    setCategories((items) => items.filter((item) => item.id !== id));
    await loadWorkspace();
    showToast('Categoría eliminada. Los productos quedaron sin categoría.');
  };
  const addToCart = (product: Product) => setCart((items) => {
    const existing = items.find((row) => row.product.id === product.id);
    return existing ? items.map((row) => row.product.id === product.id ? { ...row, quantity: row.quantity + 1 } : row) : [...items, { product, quantity: 1 }];
  });
  const changeQuantity = (productId: string, delta: number) => setCart((items) => items.map((row) => row.product.id === productId ? { ...row, quantity: Math.max(0, row.quantity + delta) } : row).filter((row) => row.quantity > 0));
  const cartTotal = cart.reduce((sum, row) => sum + priceFor(row.product) * row.quantity, 0);
  const finalizeSale = async (customerId:string|null=null) => {
    if (!neon || !cart.length) return;
    setLoading(true); setError('');
    const { data, error: saleError } = await neon.rpc('create_sale', { p_items: cart.map((row) => ({ product_id: row.product.id, quantity: row.quantity })), p_customer_id:customerId });
    if (saleError) { setError(saleError.message); setLoading(false); return; }
    setCart([]); await loadWorkspace();
    const { data: created } = await neon.from('sales').select('*, sale_items(*)').eq('id', data).single();
    if (created) setReceipt(created as Sale);
    setPage('history'); setLoading(false); showToast('Venta registrada correctamente.');
  };
  const updateSaleCustomer = async (saleId:string, customerId:string|null): Promise<boolean> => {
    if (!neon) return false;
    const { error: updateError } = await neon.rpc('update_sale_customer', { p_sale_id: saleId, p_customer_id: customerId });
    if (updateError) { setError(updateError.message); return false; }
    setSales((items) => items.map((sale) => sale.id === saleId ? { ...sale, customer_id: customerId } : sale));
    showToast('Cliente de la venta actualizado.');
    return true;
  };
  const deleteCustomer = async (customerId:string, confirmationName:string): Promise<DeleteResult> => {
    if (!neon) return {ok:false,error:'La conexión con Neon no está configurada.'};
    const {error:deleteError}=await neon.rpc('delete_customer',{p_customer_id:customerId,p_confirmation_name:confirmationName});
    if(deleteError)return {ok:false,error:deleteError.message};
    setCustomers((items)=>items.filter((customer)=>customer.id!==customerId));
    showToast('Cliente eliminado.');
    return {ok:true};
  };
  const deleteProduct = async (productId:string, confirmationName:string): Promise<DeleteResult> => {
    if (!neon) return {ok:false,error:'La conexión con Neon no está configurada.'};
    const {error:deleteError}=await neon.rpc('delete_product',{p_product_id:productId,p_confirmation_name:confirmationName});
    if(deleteError)return {ok:false,error:deleteError.message};
    return {ok:true};
  };
  const voidSale = async (saleId:string, reason:string) => {
    if (!neon) return;
    const safeReason=reason.trim().slice(0,300);
    const { error: voidError } = await neon.rpc('void_sale', { p_sale_id: saleId, p_reason: safeReason });
    if (voidError) { setError(voidError.message); return; }
    const voidedAt = new Date().toISOString();
    setSales((items) => items.map((sale) => sale.id === saleId ? { ...sale, status: 'voided', void_reason: safeReason, voided_at: voidedAt } : sale));
    showToast('Venta anulada. Se conserva en el historial y no cuenta en el resumen.');
  };
  const updatePublicOrderStatus=async(order:PublicOrder,status:PublicOrderStatus,updateCustomer=false)=>{
    if(!neon)return;
    const {error:statusError}=status==='completed'
      ? await neon.rpc('complete_public_order',{p_order_id:order.id,p_update_customer:updateCustomer})
      : await neon.from('public_orders').update({status,updated_at:new Date().toISOString()}).eq('id',order.id);
    if(statusError){setError(statusError.message);return;}
    setPublicOrders((orders)=>orders.map((item)=>item.id===order.id?{...item,status,updated_at:new Date().toISOString()}:item));
    await loadWorkspace();
    showToast(status==='confirmed'?'Pedido confirmado.':status==='completed'?'Pedido marcado como completado.':'Pedido cancelado.');
  };
  const visibleNavItems = navItems.filter((item) => item.id !== 'access');

  return <div className="app-shell">
    <aside className={`sidebar ${mobileNavOpen ? 'sidebar-open' : ''}`}><div className="sidebar-top"><a className="logo-lockup" href="#dashboard"><span className="brand-mark"><Store size={19} /></span><span>mini<span className="logo-light">pos</span><small>ESPACIO DE NEGOCIO</small></span></a><button className="icon-button mobile-close" onClick={() => setMobileNavOpen(false)} aria-label="Cerrar menú"><X size={19} /></button></div>
      <div className="side-business"><span className="business-avatar">{business?.name.slice(0, 1).toUpperCase() || 'M'}</span><span><strong>{business?.name || 'Mi negocio'}</strong><small>Plan emprendedor</small></span><ChevronDown size={15} /></div>
      <div className="nav-caption">MENÚ PRINCIPAL</div>{installationAccess.role==='admin'&&<button className={`nav-link access-nav-link ${page==='access'?'selected':''}`} onClick={()=>{setPage('access');setMobileNavOpen(false);}}><span className="nav-icon"><Users size={17} strokeWidth={1.9}/></span><span>Accesos</span></button>}<nav className="main-nav">{visibleNavItems.map(({ id, label, icon: Icon }) => <button key={id} className={`nav-link ${page === id ? 'selected' : ''}`} onClick={() => { setPage(id); setMobileNavOpen(false); }}><span className="nav-icon"><Icon size={17} strokeWidth={1.9} /></span><span>{label}</span>{id === 'sale' && cart.length > 0 && <i>{cart.reduce((n, row) => n + row.quantity, 0)}</i>}{id==='publicOrders'&&publicOrders.filter((order)=>order.status==='pending').length>0&&<i>{publicOrders.filter((order)=>order.status==='pending').length}</i>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="help-card"><strong>Un paso a la vez</strong><p>Tu negocio, organizado y listo para crecer.</p></div><button className="nav-link logout-link" disabled={loggingOut} onClick={() => void signOut()}><LogOut size={18} /><span>{loggingOut?'Cerrando sesión…':'Cerrar sesión'}</span></button><small className="sidebar-version">MINI POS · EDICIÓN REGALO</small></div>
    </aside>
    {mobileNavOpen && <button className="nav-backdrop" onClick={() => setMobileNavOpen(false)} aria-label="Cerrar menú" />}
    <main className="main-area"><header className="topbar"><button className="icon-button mobile-menu" onClick={() => setMobileNavOpen(true)} aria-label="Abrir menú"><Menu size={21} /></button><div className="breadcrumb">Mi negocio <span>/</span> <strong>{navItems.find((item) => item.id === page)?.label}</strong></div><div className="top-actions"><a className="catalog-link" href={`/catalogo/${business?.public_slug}`} target="_blank" rel="noreferrer"><Eye size={16} /> Ver catálogo <ExternalLink size={13} /></a><span className="top-avatar">{business?.name.slice(0, 1).toUpperCase() || 'M'}</span></div></header>
      <div className="content-wrap">
        {error && <div className="notice page-notice"><CircleHelp size={17} /><span>{error}</span><button onClick={() => setError('')}><X size={16} /></button></div>}
        {loading && <div className="loading-strip"><span /> Sincronizando información…</div>}
        {page === 'dashboard' && <Dashboard business={business} sales={periodSales} total={totalRevenue} products={products} bestSellers={bestSellers} period={period} setPeriod={setPeriod} />}
        {page === 'products' && <ProductsPage products={filteredProducts} categories={categories} currencySymbol={business?.currency_symbol||'C$'} query={query} setQuery={setQuery} onAdd={() => { setEditingProduct(null); setProductModal(true); }} onEdit={(p) => { setEditingProduct(p); setProductModal(true); }} onToggle={async (product) => {
          if (!neon) return;
          const { error: e } = await neon.from('products').update({ is_active: !product.is_active }).eq('id', product.id);
          if (e) setError(e.message); else { await loadWorkspace(); showToast(product.is_active ? 'Producto desactivado.' : 'Producto activado.'); }
        }} />}
        {page === 'categories' && <CategoriesPage categories={categories} onAdd={addCategory} onRename={renameCategory} onDelete={deleteCategory} />}
        {page === 'sale' && <SalePage products={filteredActive} categories={categories} customers={customers} customersLoading={customersLoading} currencySymbol={business?.currency_symbol||'C$'} query={query} setQuery={setQuery} cart={cart} addToCart={addToCart} changeQuantity={changeQuantity} total={cartTotal} onFinalize={finalizeSale} />}
        {page === 'history' && <HistoryPage sales={sales} orders={publicOrders} customers={customers} currencySymbol={business?.currency_symbol||'C$'} onReceipt={setReceipt} onUpdateCustomer={updateSaleCustomer} onVoid={voidSale} />}
        {page === 'publicOrders' && <PublicOrdersPage orders={publicOrders} sales={sales} customers={customers} currencySymbol={business?.currency_symbol||'C$'} onStatus={updatePublicOrderStatus} />}
        {page === 'customers' && business && <CustomersPage businessId={business.id} customers={customers} orders={publicOrders} sales={sales} onSaved={(customer,isNew)=>{setCustomers((items)=>isNew?[customer,...items].sort((a,b)=>a.name.localeCompare(b.name,'es')):items.map((item)=>item.id===customer.id?customer:item));showToast(isNew?'Cliente agregado.':'Cliente actualizado.');}} onDelete={deleteCustomer} />}
        {page === 'brand' && business && <BrandPage business={business} onSaved={(b) => { setBusiness(b); showToast('La marca del negocio se guardó.'); }} setError={setError} />}
        {page === 'access' && installationAccess.role === 'admin' && <AccessAdminPage mode={installationConfig?.access_mode || 'personal'} onModeChanged={(mode) => setInstallationConfig((current) => current ? { ...current, access_mode: mode } : current)} showToast={showToast} setError={setError} />}
      </div>
    </main>
    {productModal && business && <ProductModal businessId={business.id} product={editingProduct} categories={categories} isInSale={!!editingProduct&&sales.some((sale)=>sale.sale_items?.some((item)=>item.product_id===editingProduct.id))} isInWebOrder={!!editingProduct&&publicOrders.some((order)=>order.public_order_items?.some((item)=>item.product_id===editingProduct.id))} onAddCategory={addCategory} onClose={() => setProductModal(false)} onSaved={async () => { setProductModal(false); await loadWorkspace(); showToast(editingProduct ? 'Producto actualizado.' : 'Producto agregado.'); }} onDelete={deleteProduct} onDeleted={async()=>{setProductModal(false);await loadWorkspace();showToast('Producto eliminado.');}} setError={setError} />}
    {receipt && business && <ReceiptModal sale={receipt} business={business} onClose={() => setReceipt(null)} />}
    {toast && <div className="toast"><span><Check size={15} /></span>{toast}</div>}
  </div>;
}

function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="page-heading"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{action}</div>;
}

function Dashboard({ business, sales, total, products, bestSellers, period, setPeriod }: { business: Business | null; sales: Sale[]; total: number; products: Product[]; bestSellers: {name:string;count:number;percentage:number}[]; period:'7'|'30'|'all'; setPeriod:(v:'7'|'30'|'all')=>void }) {
  const activeCount = products.filter((p) => p.is_active).length;
  const currencySymbol=business?.currency_symbol||'C$';
  const chartData=useMemo(()=>{
    const now=new Date();
    const buckets=new Map<string,{key:string;label:string;amount:number}>();
    const keyForDay=(date:Date)=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
    const keyForMonth=(date:Date)=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;
    if(period==='all'){
      const firstMonth=new Date(now.getFullYear(),now.getMonth()-11,1);
      for(let index=0;index<12;index++){
        const date=new Date(firstMonth.getFullYear(),firstMonth.getMonth()+index,1);
        const key=keyForMonth(date);
        buckets.set(key,{key,label:new Intl.DateTimeFormat('es-NI',{month:'short',year:'2-digit'}).format(date),amount:0});
      }
      sales.forEach((sale)=>{const date=new Date(sale.sold_at);const bucket=buckets.get(keyForMonth(date));if(bucket)bucket.amount+=Number(sale.total_amount);});
    }else{
      const days=Number(period);
      const firstDay=new Date(now);firstDay.setHours(0,0,0,0);firstDay.setDate(firstDay.getDate()-days+1);
      for(let index=0;index<days;index++){
        const date=new Date(firstDay);date.setDate(firstDay.getDate()+index);
        const key=keyForDay(date);
        buckets.set(key,{key,label:new Intl.DateTimeFormat('es-NI',{day:'2-digit',month:'short'}).format(date),amount:0});
      }
      sales.forEach((sale)=>{const bucket=buckets.get(keyForDay(new Date(sale.sold_at)));if(bucket)bucket.amount+=Number(sale.total_amount);});
    }
    return [...buckets.values()];
  },[sales,period]);
  const chartMax=Math.max(...chartData.map((bucket)=>bucket.amount),1);
  const denseChart=period==='30';
  const chartDescription=period==='all'?'Total vendido por mes · últimos 12 meses':`Total vendido por día · últimos ${period} días`;
  return <><PageHeading eyebrow="VISTA GENERAL" title={`Hola, ${business?.name || 'emprendedor'}.`} description="Aquí tienes un vistazo de cómo va tu negocio." action={<select className="select-control period-select" value={period} onChange={(e) => setPeriod(e.target.value as '7'|'30'|'all')}><option value="7">Últimos 7 días</option><option value="30">Últimos 30 días</option><option value="all">Todo el historial</option></select>} />
    <div className="stats-grid"><StatCard label="Ventas del período" value={formatMoney(total,currencySymbol)} icon={BarChart3} hint={sales.length ? `${sales.length} ventas registradas` : 'Aún no hay ventas'} /><StatCard label="Ventas realizadas" value={String(sales.length)} icon={ShoppingBag} hint="En el período seleccionado" /><StatCard label="Productos activos" value={String(activeCount)} icon={Package} hint={`De ${products.length} productos registrados`} /></div>
    <div className="dashboard-grid"><section className="panel sales-chart-panel"><div className="panel-heading"><div><h2>Actividad de ventas</h2><p>{chartDescription}</p></div><span className="tiny-tag"><span className="green-dot" /> EN VIVO</span></div>{sales.length === 0 ? <div className="chart-empty"><span><BarChart3 size={23} /></span><strong>Aún no hay ventas en este período</strong><p>Cuando registres una venta, se sumará al día o mes correspondiente.</p></div> : <div className={`bar-chart ${denseChart?'bar-chart-dense':''}`}>{chartData.map((bucket,index)=><div className="bar-column" key={bucket.key} title={`${bucket.label}: ${formatMoney(bucket.amount,currencySymbol)}`} aria-label={`${bucket.label}: ${formatMoney(bucket.amount,currencySymbol)}`}><div className="bar-value">{denseChart?'':formatMoney(bucket.amount,currencySymbol)}</div><div className="bar-track"><div className={`bar-fill ${bucket.amount>0?'':'bar-fill-empty'}`} style={{ height: `${bucket.amount>0?Math.max(bucket.amount/chartMax*100,4):0}%` }} /></div><small>{denseChart&&index%5!==0&&index!==chartData.length-1?'':bucket.label}</small></div>)}</div>}</section>
      <section className="panel best-panel"><div className="panel-heading"><div><h2>Más vendidos</h2><p>Participación en unidades vendidas</p></div></div>{bestSellers.length ? <div className="ranking-list">{bestSellers.map((item, index) => <div className="ranking-row" key={item.name}><span className={`rank-number rank-${index+1}`}>{String(index+1).padStart(2,'0')}</span><span className="rank-product"><strong>{item.name}</strong><small>{item.count} {item.name==='Demás productos'?'unidades acumuladas':'unidades'}</small></span><span className="rank-percentage">{new Intl.NumberFormat('es-NI',{maximumFractionDigits:1}).format(item.percentage)}%</span><span className="rank-bar"><i style={{ width: `${item.percentage}%` }} /></span></div>)}</div> : <div className="mini-empty">Los productos más vendidos aparecerán aquí cuando registres ventas.</div>}<div className="best-footer"><span><ArrowUpRight size={15} /> Unidades vendidas</span><span>{bestSellers.reduce((sum, item) => sum + item.count, 0)}</span></div></section></div>
  </>;
}

function StatCard({ label, value, icon: Icon, hint, trend }: { label: string; value: string; icon: typeof BarChart3; hint: string; trend?: string }) {
  return <article className="stat-card"><div className="stat-card-top"><span>{label}</span><span className="stat-icon"><Icon size={18} /></span></div><strong className="stat-value">{value}</strong><div className="stat-foot"><span>{hint}</span>{trend && <span className={`trend ${trend.startsWith('-')?'negative':''}`}><ArrowUpRight size={13} />{trend}</span>}</div></article>;
}

function TablePagination({page,total,onPage}:{page:number;total:number;onPage:(page:number)=>void}){
  const pages=Math.max(1,Math.ceil(total/10));
  if(total<=10)return null;
  const first=(page-1)*10+1;
  return <div className="table-pagination"><small>Mostrando {first}–{Math.min(page*10,total)} de {total}</small><div><button type="button" className="button button-small button-outline" disabled={page<=1} onClick={()=>onPage(page-1)}><ChevronLeft size={14}/> Anterior</button><span>Página {page} de {pages}</span><button type="button" className="button button-small button-outline" disabled={page>=pages} onClick={()=>onPage(page+1)}>Siguiente <ChevronRight size={14}/></button></div></div>;
}

function ProductsPage({ products, categories, currencySymbol, query, setQuery, onAdd, onEdit, onToggle }: { products: Product[]; categories: Category[]; currencySymbol:string; query:string; setQuery:(v:string)=>void; onAdd:()=>void; onEdit:(p:Product)=>void; onToggle:(p:Product)=>void }) {
  const [page,setPage]=useState(1);
  useEffect(()=>setPage(1),[query]);
  const pageProducts=products.slice((page-1)*10,page*10);
  const categoryNames = new Map(categories.map((category) => [category.id, category.name]));
  return <><PageHeading eyebrow="TU CATÁLOGO" title="Productos" description="Organiza lo que vendes y mantén tus precios al día." action={<button className="button button-primary" onClick={onAdd}><Plus size={16} /> Agregar producto</button>} />
    <section className="panel table-panel"><div className="table-toolbar"><div className="search-box"><Search size={16} /><input placeholder="Buscar producto…" value={query} onChange={(e)=>setQuery(e.target.value)} /></div><span className="item-count">{products.length} productos</span></div>
    {products.length ? <><div className="table-scroll"><table><thead><tr><th>PRODUCTO</th><th>CATEGORÍA</th><th>PRECIO</th><th>PROMOCIÓN</th><th>ESTADO</th><th></th></tr></thead><tbody>{pageProducts.map((p)=> <tr key={p.id}><td><div className="table-product"><span className="product-mini">{p.image_url ? <img src={p.image_url} alt="" /> : <ShoppingBag size={16}/>}</span><span><strong>{p.name}</strong><small>{p.description || 'Sin descripción'}</small></span></div></td><td>{(p.category_id && categoryNames.get(p.category_id)) || <span className="subtle-text">Sin categoría</span>}</td><td><div className="price-cell">{p.promotion_enabled && <s>{formatMoney(p.regular_price,currencySymbol)}</s>}<strong>{formatMoney(priceFor(p),currencySymbol)}</strong></div></td><td>{p.promotion_enabled ? <span className="status-pill promo"><Tag size={13}/> Activa</span> : <span className="subtle-text">Sin promoción</span>}</td><td><button className={`status-toggle ${p.is_active?'on':''}`} onClick={()=>onToggle(p)}><i />{p.is_active?'Activo':'Inactivo'}</button></td><td><button className="icon-button table-edit" onClick={()=>onEdit(p)} aria-label={`Editar ${p.name}`}><Settings2 size={16}/></button></td></tr>)}</tbody></table></div><TablePagination page={page} total={products.length} onPage={setPage}/></> : <div className="empty-state"><span className="empty-icon"><Package size={24}/></span><strong>{query?'No encontramos ese producto':'Tu catálogo empieza aquí'}</strong><p>{query?'Prueba con otro nombre.':'Agrega tus productos y configura el precio que quieres ofrecer.'}</p>{!query && <button className="button button-primary" onClick={onAdd}><Plus size={15}/> Agregar primer producto</button>}</div>}</section>
  </>;
}

function CategoriesPage({ categories, onAdd, onRename, onDelete }: { categories: Category[]; onAdd:(name:string)=>Promise<Category|null>; onRename:(id:string,name:string)=>Promise<void>; onDelete:(id:string)=>Promise<void> }) {
  const [name,setName]=useState('');const [showCreate,setShowCreate]=useState(false);const [editId,setEditId]=useState<string|null>(null);const [editName,setEditName]=useState('');const [busy,setBusy]=useState(false);
  const add=async(e:FormEvent)=>{e.preventDefault();if(!name.trim())return;setBusy(true);const created=await onAdd(name);setBusy(false);if(created){setName('');setShowCreate(false);}};
  const rename=async(e:FormEvent)=>{e.preventDefault();if(!editId||!editName.trim())return;setBusy(true);await onRename(editId,editName);setEditId(null);setBusy(false);};
  const remove=async(id:string)=>{if(window.confirm('¿Eliminar esta categoría? Los productos se conservarán sin categoría.')){setBusy(true);await onDelete(id);setBusy(false);}};
  return <><PageHeading eyebrow="ORGANIZA TU CATÁLOGO" title="Categorías" description="Agrupa productos para que sea más fácil encontrarlos y explorarlos." action={<button className="button button-primary" onClick={()=>setShowCreate(true)}><Plus size={16}/> Agregar categoría</button>} />
    <section className="panel category-list"><div className="panel-heading"><div><h2>Tus categorías</h2><p>{categories.length} categorías creadas</p></div><span className="icon-surface"><Tag size={16}/></span></div>{categories.length?categories.map((category)=><div className="category-row" key={category.id}>{editId===category.id?<form className="category-edit-form" onSubmit={rename}><input autoFocus required maxLength={60} value={editName} onChange={(e)=>setEditName(e.target.value)}/><button className="button button-small button-primary" disabled={busy}>Guardar</button><button type="button" className="button button-small button-outline" onClick={()=>setEditId(null)}>Cancelar</button></form>:<><span className="category-chip"><Tag size={14}/>{category.name}</span><span className="category-row-actions"><button className="button button-small button-outline" onClick={()=>{setEditId(category.id);setEditName(category.name);}}>Editar</button><button className="button button-small button-outline" disabled={busy} onClick={()=>void remove(category.id)}>Eliminar</button></span></>}</div>):<div className="empty-state"><strong>Aún no hay categorías</strong><p>Crea una categoría aquí o desde el formulario de un producto.</p></div>}</section>
    {showCreate&&<div className="modal-backdrop" onMouseDown={(e)=>e.target===e.currentTarget&&!busy&&setShowCreate(false)}><form className="modal-card category-modal" onSubmit={add}><div className="modal-heading"><div><span className="eyebrow">NUEVA CATEGORÍA</span><h2>Agrega una categoría</h2></div><button type="button" className="icon-button" disabled={busy} onClick={()=>setShowCreate(false)} aria-label="Cerrar"><X size={19}/></button></div><p className="muted">Ejemplos: Ropa, Accesorios o Bebidas.</p><label>Nombre<input autoFocus required maxLength={60} value={name} onChange={(e)=>setName(e.target.value)} placeholder="Ej. Accesorios"/></label><div className="modal-actions"><button type="button" className="button button-outline" disabled={busy} onClick={()=>setShowCreate(false)}>Cancelar</button><button className="button button-primary" disabled={busy}>{busy?'Guardando…':'Guardar categoría'}</button></div></form></div>}
  </>;
}

function SalePage({ products, categories, customers, customersLoading, currencySymbol, query, setQuery, cart, addToCart, changeQuantity, total, onFinalize }: { products:Product[]; categories:Category[]; customers:Customer[]; customersLoading:boolean; currencySymbol:string; query:string; setQuery:(v:string)=>void; cart:CartRow[]; addToCart:(p:Product)=>void; changeQuantity:(id:string,d:number)=>void; total:number; onFinalize:(customerId:string|null)=>void }) {
  const [selectedCategory,setSelectedCategory]=useState('all');
  const [showCategoryFilters,setShowCategoryFilters]=useState(false);
  const [mobilePanel,setMobilePanel]=useState<'catalog'|'order'>('catalog');
  const [previewProduct,setPreviewProduct]=useState<Product|null>(null);
  const [selectedCustomerId,setSelectedCustomerId]=useState('');
  const [visibleProductCount,setVisibleProductCount]=useState(18);
  useEffect(()=>setVisibleProductCount(18),[query,selectedCategory]);
  const categoryNames = new Map(categories.map((category) => [category.id, category.name]));
  const categoryOptions = categories.filter((category)=>products.some((product)=>product.category_id===category.id));
  const visibleProducts=products.filter((product)=>{
    const matchesCategory=selectedCategory==='all'||product.category_id===selectedCategory||(selectedCategory==='uncategorized'&&!product.category_id);
    const matchesQuery=`${product.name} ${product.description||''}`.toLocaleLowerCase('es').includes(query.trim().toLocaleLowerCase('es'));
    return matchesCategory&&matchesQuery;
  });
  const displayedProducts=visibleProducts.slice(0,visibleProductCount);
  const itemCount=cart.reduce((count,row)=>count+row.quantity,0);
  const selectCategory=(categoryId:string)=>{setSelectedCategory(categoryId);setShowCategoryFilters(false);};
  return <div className="pos-page">
    <div className="pos-mobile-tabs"><button className={mobilePanel==='catalog'?'active':''} onClick={()=>setMobilePanel('catalog')}><ShoppingBag size={15}/> Catálogo</button><button className={mobilePanel==='order'?'active':''} onClick={()=>setMobilePanel('order')}><ShoppingCart size={15}/> Tu venta{itemCount>0&&<span>{itemCount}</span>}</button></div>
    <div className="pos-layout">
      <section className={`pos-products ${mobilePanel==='order'?'mobile-hidden':''}`}>
        <div className="pos-catalog-toolbar"><div className="search-box product-search"><Search size={16}/><input placeholder="Buscar productos activos…" value={query} onChange={(e)=>setQuery(e.target.value)}/>{query&&<button type="button" className="pos-clear-search" onClick={()=>setQuery('')} aria-label="Limpiar búsqueda"><X size={14}/></button>}</div><button type="button" className={`pos-filter-button ${showCategoryFilters||selectedCategory!=='all'?'active':''}`} onClick={()=>setShowCategoryFilters((shown)=>!shown)}><Tag size={15}/><span>{selectedCategory==='all'?'Categoría':selectedCategory==='uncategorized'?'Sin categoría':categoryNames.get(selectedCategory)||'Categoría'}</span><ChevronDown size={14}/></button></div>
        {showCategoryFilters&&<div className="pos-category-filters"><button className={selectedCategory==='all'?'active':''} onClick={()=>selectCategory('all')}>Todos los productos <small>{products.length}</small></button>{categoryOptions.map((category)=><button key={category.id} className={selectedCategory===category.id?'active':''} onClick={()=>selectCategory(category.id)}>{category.name}<small>{products.filter((product)=>product.category_id===category.id).length}</small></button>)}{products.some((product)=>!product.category_id)&&<button className={selectedCategory==='uncategorized'?'active':''} onClick={()=>selectCategory('uncategorized')}>Sin categoría <small>{products.filter((product)=>!product.category_id).length}</small></button>}</div>}
        <div className="pos-product-scroll">{visibleProducts.length>0?<div className="pos-product-grid">{displayedProducts.map((product)=><article key={product.id} className={`pos-product-card ${product.promotion_enabled?'pos-product-promo':''}`}>{product.promotion_enabled&&<span className="pos-promo-badge"><Tag size={11}/> OFERTA</span>}<button type="button" className="product-placeholder image-preview-trigger" onClick={()=>setPreviewProduct(product)} aria-label={`Ver imagen de ${product.name}`}>{product.image_url?<img src={product.image_url} alt={product.name} loading="lazy"/>:<ShoppingBag size={23}/>}<span className="image-preview-hint"><Eye size={14}/> Ver imagen</span></button><span className="pos-product-info"><strong>{product.name}</strong>{product.promotion_enabled&&<s>{formatMoney(product.regular_price,currencySymbol)}</s>}<b>{formatMoney(priceFor(product),currencySymbol)}</b></span><button type="button" className="add-circle" onClick={()=>addToCart(product)} aria-label={`Agregar ${product.name} a la venta`}><Plus size={16}/></button></article>)}</div>:<div className="pos-empty"><span className="empty-icon"><Package size={23}/></span><strong>{products.length?'No hay productos con esos filtros':'No hay productos activos'}</strong><p>{products.length?'Cambia la categoría o la búsqueda.':'Activa productos para que aparezcan aquí.'}</p>{products.length>0&&(selectedCategory!=='all'||query)&&<button className="text-link" onClick={()=>{selectCategory('all');setQuery('');}}>Mostrar todos</button>}</div>}</div>{displayedProducts.length<visibleProducts.length&&<div className="pos-load-more"><span>Mostrando {displayedProducts.length} de {visibleProducts.length}</span><button type="button" className="button button-outline" onClick={()=>setVisibleProductCount((count)=>Math.min(count+18,visibleProducts.length))}>Ver más productos <ChevronDown size={14}/></button></div>}
      </section>
      <aside className={`cart-panel ${mobilePanel==='catalog'?'mobile-hidden':''}`}><div className="cart-heading"><span className="cart-icon"><ShoppingCart size={18}/></span><div><h2>Tu venta</h2><p>{itemCount} artículos</p></div><span className="cart-count">{cart.length}</span></div><div className="cart-items">{cart.map(({product,quantity})=><div className="cart-row" key={product.id}><div className="cart-product"><strong>{product.name}</strong><small>{formatMoney(priceFor(product),currencySymbol)} c/u</small></div><div className="quantity-control"><button onClick={()=>changeQuantity(product.id,-1)} aria-label="Restar una unidad">−</button><span>{quantity}</span><button onClick={()=>changeQuantity(product.id,1)} aria-label="Agregar una unidad">+</button></div><strong className="cart-line-total">{formatMoney(priceFor(product)*quantity,currencySymbol)}</strong><button type="button" className="cart-remove-item" onClick={()=>changeQuantity(product.id,-quantity)} aria-label={`Quitar ${product.name} del pedido`} title="Quitar del pedido"><X size={15}/></button></div>)}{!cart.length&&<div className="cart-empty"><span><ShoppingCart size={23}/></span><strong>Tu venta está vacía</strong><small>Selecciona productos para comenzar.</small></div>}</div><div className="cart-summary"><label className="cart-customer-select">Cliente <span>OPCIONAL</span><select disabled={customersLoading} value={selectedCustomerId} onChange={(event)=>setSelectedCustomerId(event.target.value)}><option value="">{customersLoading?'Cargando clientes…':'Sin cliente asociado'}</option>{customers.map((customer)=><option key={customer.id} value={customer.id}>{customer.name} · +{customer.phone}</option>)}</select>{!customersLoading&&customers.length===0&&<small>Agrega clientes desde la vista Clientes.</small>}</label><div><span>Subtotal</span><span>{formatMoney(total,currencySymbol)}</span></div><div className="cart-total"><strong>Total</strong><strong>{formatMoney(total,currencySymbol)}</strong></div><button disabled={!cart.length} className="button button-primary button-full" onClick={()=>onFinalize(selectedCustomerId||null)}>Confirmar venta <ArrowUpRight size={16}/></button><small><Check size={13}/> Los precios se guardan al confirmar</small></div></aside>
    </div>
    {cart.length>0&&mobilePanel==='catalog'&&<button className="mobile-cart-dock" onClick={()=>setMobilePanel('order')}><span className="mobile-cart-dock-count">{itemCount}</span><span><small>Total de la venta</small><strong>{formatMoney(total,currencySymbol)}</strong></span><b>Ver pedido <ChevronDown size={16}/></b></button>}
    {previewProduct&&<ProductPreviewModal key={previewProduct.id} product={previewProduct} currencySymbol={currencySymbol} onClose={()=>setPreviewProduct(null)}/>}
  </div>;
}

function HistoryPage({ sales:allSales, orders, customers, currencySymbol, onReceipt, onUpdateCustomer, onVoid }: { sales:Sale[]; orders:PublicOrder[]; customers:Customer[]; currencySymbol:string; onReceipt:(sale:Sale)=>void; onUpdateCustomer:(saleId:string,customerId:string|null)=>Promise<boolean>; onVoid:(saleId:string,reason:string)=>Promise<void> }) {
  const [detail,setDetail]=useState<Sale|null>(null);
  const [editingSale,setEditingSale]=useState<Sale|null>(null);
  const [customerChoice,setCustomerChoice]=useState('');
  const [savingCustomer,setSavingCustomer]=useState(false);
  const [page,setPage]=useState(1);
  const [actionMenu,setActionMenu]=useState<{sale:Sale;top:number;left:number}|null>(null);
  const tablePanelRef=useRef<HTMLElement>(null);
  const actionButtonRef=useRef<HTMLButtonElement>(null);
  useEffect(()=>setPage(1),[allSales.length]);
  const sales=allSales.slice((page-1)*10,page*10);
  const buyerFor=(sale:Sale)=>orders.find((order)=>order.id===sale.public_order_id);
  const customerFor=(sale:Sale)=>customers.find((customer)=>customer.id===sale.customer_id);
  const buyer=detail?buyerFor(detail):undefined;
  const savedCustomer=detail?customerFor(detail):undefined;
  const saveCustomer=async(event:FormEvent)=>{
    event.preventDefault();
    if(!editingSale)return;
    setSavingCustomer(true);
    const saved=await onUpdateCustomer(editingSale.id,customerChoice||null);
    setSavingCustomer(false);if(saved)setEditingSale(null);
  };
  const voidSale=async(sale:Sale)=>{
    const reason=window.prompt(`Motivo para anular la venta #${String(sale.sale_number).padStart(5,'0')} (obligatorio):`);
    if(reason===null)return;
    if(reason.trim().length<3){window.alert('Escribe un motivo de al menos 3 caracteres.');return;}
    if(!window.confirm('La venta quedará anulada, conservará su consecutivo y no sumará al resumen. No se borrará. ¿Continuar?'))return;
    await onVoid(sale.id,reason.trim());
  };
  const toggleActionMenu=(event:React.MouseEvent<HTMLButtonElement>,sale:Sale)=>{
    event.stopPropagation();
    if(actionMenu?.sale.id===sale.id){setActionMenu(null);return;}
    const panel=tablePanelRef.current;
    if(!panel)return;
    const anchor=event.currentTarget.getBoundingClientRect();
    const bounds=panel.getBoundingClientRect();
    const menuHeight=sale.status==='completed'?176:48;
    const menuWidth=176;
    const spaceBelow=bounds.bottom-anchor.bottom-8;
    const openUp=spaceBelow<menuHeight&&anchor.top-bounds.top>menuHeight;
    const top=Math.max(8,Math.min(openUp?anchor.top-bounds.top-menuHeight-4:anchor.bottom-bounds.top+4,bounds.height-menuHeight-8));
    const left=Math.max(8,Math.min(anchor.right-bounds.left-menuWidth,bounds.width-menuWidth-8));
    actionButtonRef.current=event.currentTarget;
    setActionMenu({sale,top,left});
  };
  useEffect(()=>{
    if(!actionMenu)return;
    const closeOutside=(event:PointerEvent)=>{
      const target=event.target as Node;
      if(!tablePanelRef.current?.contains(target)&&!actionButtonRef.current?.contains(target))setActionMenu(null);
    };
    const closeOnEscape=(event:KeyboardEvent)=>{if(event.key==='Escape')setActionMenu(null);};
    document.addEventListener('pointerdown',closeOutside);
    document.addEventListener('keydown',closeOnEscape);
    return()=>{document.removeEventListener('pointerdown',closeOutside);document.removeEventListener('keydown',closeOnEscape);};
  },[actionMenu]);
  useEffect(()=>setActionMenu(null),[page]);
  return <><PageHeading eyebrow="MOVIMIENTOS" title="Ventas" description="Consulta, corrige el cliente asociado o anula una venta conservando el consecutivo." />
    <section className="panel table-panel history-table-panel" ref={tablePanelRef}><div className="table-toolbar"><div><strong className="table-title">Historial de ventas</strong><p>Las anuladas se conservan aquí y se excluyen del resumen.</p></div><span className="item-count">{allSales.length} registros</span></div>
    {allSales.length ? <><div className="table-scroll"><table><thead><tr><th>VENTA</th><th>FECHA</th><th>CLIENTE</th><th>ARTÍCULOS</th><th>ESTADO</th><th>TOTAL</th><th></th></tr></thead><tbody>{sales.map((sale)=>{const orderBuyer=buyerFor(sale);const customer=customerFor(sale);return <tr key={sale.id} className={sale.status==='voided'?'sale-row-voided':''}><td><div className="sale-number"><span className="sale-mini"><ShoppingBag size={15}/></span><span><strong>#{String(sale.sale_number).padStart(5,'0')}</strong>{sale.public_order_id&&<small className="sale-source-label">Pedido web #{String(sale.public_order_number||'').padStart(5,'0')}</small>}</span></div></td><td>{formatDate(sale.sold_at)}</td><td>{customer?<><strong>{customer.name}</strong><small className="history-buyer-phone">+{customer.phone}</small></>:orderBuyer?<><strong>{orderBuyer.customer_name}</strong><small className="history-buyer-phone">+{orderBuyer.customer_phone}</small></>:<span className="muted">Sin cliente</span>}</td><td>{(sale.sale_items||[]).reduce((n,item)=>n+item.quantity,0)} unidades</td><td><span className={`sale-status-pill ${sale.status==='voided'?'voided':'completed'}`}>{sale.status==='voided'?'Anulada':'Realizada'}</span>{sale.status==='voided'&&sale.void_reason&&<small className="sale-void-reason">{sale.void_reason}</small>}</td><td><strong>{formatMoney(Number(sale.total_amount),currencySymbol)}</strong></td><td className="history-menu-cell"><button ref={actionMenu?.sale.id===sale.id?actionButtonRef:undefined} type="button" className="history-menu-trigger" aria-label={`Acciones de la venta ${sale.sale_number}`} aria-haspopup="menu" aria-expanded={actionMenu?.sale.id===sale.id} onClick={(event)=>toggleActionMenu(event,sale)}><MoreVertical size={18}/></button></td></tr>;})}</tbody></table></div><TablePagination page={page} total={allSales.length} onPage={setPage}/>{actionMenu&&<div className="history-action-menu" role="menu" style={{top:actionMenu.top,left:actionMenu.left}}><button role="menuitem" onClick={()=>{setDetail(actionMenu.sale);setActionMenu(null);}}><Eye size={15}/> Detalle</button>{actionMenu.sale.status==='completed'&&<><button role="menuitem" onClick={()=>{setEditingSale(actionMenu.sale);setCustomerChoice(actionMenu.sale.customer_id||'');setActionMenu(null);}}><Users size={15}/> Cliente</button><button role="menuitem" className="danger" onClick={()=>{const sale=actionMenu.sale;setActionMenu(null);void voidSale(sale);}}><Ban size={15}/> Anular</button><button role="menuitem" onClick={()=>{onReceipt(actionMenu.sale);setActionMenu(null);}}><Printer size={15}/> Comprobante</button></>}</div>}</> : <div className="empty-state"><span className="empty-icon"><ClipboardList size={23}/></span><strong>Las ventas aparecerán aquí</strong><p>Registra tu primera venta para empezar tu historial.</p></div>}</section>
    {detail&&<div className="modal-backdrop" role="presentation" onMouseDown={(event)=>event.target===event.currentTarget&&setDetail(null)}><section className="modal-card sale-detail-modal" role="dialog" aria-modal="true" aria-label="Detalle de venta"><div className="modal-heading"><div><span className="eyebrow">DETALLE DE VENTA · {detail.status==='voided'?'ANULADA':'REALIZADA'}</span><h2>Venta #{String(detail.sale_number).padStart(5,'0')}</h2></div><button className="icon-button" onClick={()=>setDetail(null)} aria-label="Cerrar detalle"><X size={19}/></button></div><div className="sale-detail-meta"><span><small>Fecha</small><strong>{formatDate(detail.sold_at)}</strong></span><span><small>Origen</small><strong>{buyer?'Pedido web':'Punto de venta'}</strong></span><span><small>Cliente</small><strong>{savedCustomer?.name||buyer?.customer_name||'No registrado'}</strong>{savedCustomer&&<a href={`tel:+${savedCustomer.phone}`}>+{savedCustomer.phone}</a>}{!savedCustomer&&buyer&&<a href={`tel:+${buyer.customer_phone}`}>+{buyer.customer_phone}</a>}</span></div>{detail.status==='voided'&&<div className="notice">Anulada el {detail.voided_at?formatDate(detail.voided_at):'—'}. Motivo: {detail.void_reason||'No especificado'}.</div>}{(buyer||savedCustomer)&&<div className="sale-detail-contact"><strong>{buyer?'Datos del pedido':'Contacto del cliente'}</strong><span>{buyer?.customer_address||savedCustomer?.address||'Sin dirección guardada'}</span>{buyer?.customer_location_url&&<a href={buyer.customer_location_url} target="_blank" rel="noreferrer">Ver ubicación en Maps</a>}{!buyer&&savedCustomer?.location_url&&<a href={savedCustomer.location_url} target="_blank" rel="noreferrer">Ver ubicación en Maps</a>}</div>}<div className="sale-detail-lines">{(detail.sale_items||[]).map((item)=><div key={item.id}><span><strong>{item.quantity} × {item.product_name}</strong>{item.variant_label&&<small>{item.variant_label}</small>}{item.promotion_applied&&<small>Promoción aplicada</small>}</span><strong>{formatMoney(Number(item.line_total),currencySymbol)}</strong></div>)}</div><div className="sale-detail-total"><span>{detail.status==='voided'?'Total anulado':'Total'}</span><strong>{formatMoney(Number(detail.total_amount),currencySymbol)}</strong></div><div className="modal-actions"><button className="button button-outline" onClick={()=>setDetail(null)}>Cerrar</button>{detail.status==='completed'&&<button className="button button-primary" onClick={()=>onReceipt(detail)}><Printer size={14}/> Comprobante</button>}</div></section></div>}
    {editingSale&&<div className="modal-backdrop" role="presentation" onMouseDown={(event)=>event.target===event.currentTarget&&!savingCustomer&&setEditingSale(null)}><form className="modal-card sale-customer-modal" onSubmit={saveCustomer}><div className="modal-heading"><div><span className="eyebrow">CORREGIR VENTA</span><h2>Venta #{String(editingSale.sale_number).padStart(5,'0')}</h2></div><button type="button" className="icon-button" disabled={savingCustomer} onClick={()=>setEditingSale(null)} aria-label="Cerrar"> <X size={19}/></button></div><p className="muted">Cambia el cliente asociado. Los productos, precios, total y consecutivo de la venta se conservan.</p><label>Cliente<select value={customerChoice} onChange={(event)=>setCustomerChoice(event.target.value)}><option value="">Sin cliente asociado</option>{customers.map((customer)=><option key={customer.id} value={customer.id}>{customer.name} · +{customer.phone}</option>)}</select></label><div className="modal-actions"><button type="button" className="button button-outline" disabled={savingCustomer} onClick={()=>setEditingSale(null)}>Cancelar</button><button className="button button-primary" disabled={savingCustomer}>{savingCustomer?'Guardando…':'Guardar cliente'}</button></div></form></div>}
  </>;
}

function PublicOrdersPage({orders,sales,customers,currencySymbol,onStatus}:{orders:PublicOrder[];sales:Sale[];customers:Customer[];currencySymbol:string;onStatus:(order:PublicOrder,status:PublicOrderStatus,updateCustomer?:boolean)=>void}){
  const [filter,setFilter]=useState<PublicOrderStatus>('pending');
  const [completing,setCompleting]=useState<PublicOrder|null>(null);
  const labels:Record<PublicOrderStatus,string>={pending:'Pendientes',confirmed:'Confirmados',completed:'Completados',cancelled:'Cancelados'};
  const filtered=orders.filter((order)=>order.status===filter);
  const currentCustomer=completing?customers.find((customer)=>customer.id===completing.customer_id):undefined;
  return <><PageHeading eyebrow="CATÁLOGO PÚBLICO" title="Pedidos web" description="Revisa las solicitudes que llegan desde tu catálogo y actualiza su estado."/><section className="panel public-orders-panel"><div className="public-order-tabs">{(['pending','confirmed','completed','cancelled'] as PublicOrderStatus[]).map((status)=><button key={status} className={filter===status?'active':''} onClick={()=>setFilter(status)}>{labels[status]}<span>{orders.filter((order)=>order.status===status).length}</span></button>)}</div>{filtered.length? <div className="public-orders-list">{filtered.map((order)=><article className="public-business-order" key={order.id}><div className="public-business-order-top"><div><span className="eyebrow">PEDIDO #{String(order.order_number).padStart(5,'0')}</span><h2>{order.customer_name}</h2><p>{formatDate(order.created_at)} · <a href={`tel:+${order.customer_phone}`}>+{order.customer_phone}</a></p></div><span className={`public-order-status status-${order.status}`}>{labels[order.status]}</span></div>{order.status==='completed'&&(()=>{const linkedSale=sales.find((sale)=>sale.public_order_id===order.id);return linkedSale?<p className="public-order-sale-link">{linkedSale.status==='voided'?'Venta anulada: ':'Contabilizado en Ventas como '}<strong>#{String(linkedSale.sale_number).padStart(5,'0')}</strong></p>:null;})()}<div className="public-order-delivery"><p><strong>Dirección:</strong> {order.customer_address||'No indicada'}</p>{order.customer_location_url&&<a href={order.customer_location_url} target="_blank" rel="noreferrer"><ExternalLink size={14}/> Ver ubicación en Google Maps</a>}</div><div className="public-business-order-items">{(order.public_order_items||[]).map((item)=><div key={item.id}><span>{item.quantity} × {item.product_name}{item.variant_label&&<small>{item.variant_label}</small>}{item.promotion_applied&&<small>Promoción aplicada</small>}</span><strong>{formatMoney(Number(item.line_total),currencySymbol)}</strong></div>)}</div>{order.notes&&<p className="public-business-order-note"><strong>Nota:</strong> {order.notes}</p>}<div className="public-business-order-footer"><a className="public-customer-contact" href={`https://wa.me/${order.customer_phone}`} target="_blank" rel="noreferrer"><Phone size={14}/> Contactar cliente</a><strong className="public-business-order-total">{formatMoney(Number(order.total_amount),currencySymbol)}</strong><div className="public-business-order-actions">{order.status==='pending'&&<button className="button button-small button-primary" onClick={()=>void onStatus(order,'confirmed')}>Confirmar pedido</button>}{order.status==='confirmed'&&<button className="button button-small button-primary" onClick={()=>setCompleting(order)}>Marcar completado</button>}{(order.status==='pending'||order.status==='confirmed')&&<button className="button button-small button-outline" onClick={()=>void onStatus(order,'cancelled')}>Cancelar</button>}</div></div></article>)}</div>:<div className="empty-state"><span className="empty-icon"><Inbox size={23}/></span><strong>No hay pedidos {labels[filter].toLowerCase()}</strong><p>Cuando alguien envíe un pedido desde el catálogo, aparecerá aquí.</p></div>}</section>
    {completing&&<div className="modal-backdrop" role="presentation" onMouseDown={(event)=>event.target===event.currentTarget&&setCompleting(null)}><section className="modal-card customer-choice-modal" role="dialog" aria-modal="true" aria-label="Confirmar contacto del pedido"><div className="modal-heading"><div><span className="eyebrow">PEDIDO #{String(completing.order_number).padStart(5,'0')}</span><h2>¿Qué hacemos con este contacto?</h2></div><button className="icon-button" onClick={()=>setCompleting(null)} aria-label="Cerrar"><X size={19}/></button></div><p className="muted">El pedido se convertirá en venta. El teléfono coincide con un cliente guardado; elige si conservamos sus datos o los actualizamos con lo que indicó en este pedido.</p><div className="customer-choice-comparison"><article><span>CONTACTO GUARDADO</span><strong>{currentCustomer?.name||'No disponible'}</strong><small>+{currentCustomer?.phone||completing.customer_phone}</small><p>{currentCustomer?.address||'Sin dirección guardada'}</p></article><article><span>DATOS DE ESTE PEDIDO</span><strong>{completing.customer_name}</strong><small>+{completing.customer_phone}</small><p>{completing.customer_address||'Sin dirección indicada'}</p></article></div><div className="customer-choice-actions"><button className="button button-outline" onClick={()=>{void onStatus(completing,'completed',false);setCompleting(null);}}>Conservar contacto</button><button className="button button-primary" onClick={()=>{void onStatus(completing,'completed',true);setCompleting(null);}}>Actualizar con datos del pedido</button></div></section></div>}
  </>;
}

function CustomersPage({businessId,customers,orders,sales,onSaved,onDelete}:{businessId:string;customers:Customer[];orders:PublicOrder[];sales:Sale[];onSaved:(customer:Customer,isNew:boolean)=>void;onDelete:(customerId:string,confirmationName:string)=>Promise<DeleteResult>}){
  const [query,setQuery]=useState('');
  const [page,setPage]=useState(1);
  useEffect(()=>setPage(1),[query]);
  const [showForm,setShowForm]=useState(false);
  const [editing,setEditing]=useState<Customer|null>(null);
  const [duplicate,setDuplicate]=useState<Customer|null>(null);
  const [name,setName]=useState('');
  const [phone,setPhone]=useState('');
  const [address,setAddress]=useState('');
  const [locationUrl,setLocationUrl]=useState('');
  const [saving,setSaving]=useState(false);
  const [deleteTarget,setDeleteTarget]=useState<Customer|null>(null);
  const [formError,setFormError]=useState('');
  const matching=customers.filter((customer)=>`${customer.name} ${customer.phone}`.toLowerCase().includes(query.trim().toLowerCase()));
  const filtered=matching.slice((page-1)*10,page*10);
  const latestOrder=(customerId:string)=>orders.filter((order)=>order.customer_id===customerId).sort((a,b)=>new Date(b.created_at).getTime()-new Date(a.created_at).getTime())[0];
  const nameKey=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().replace(/\s+/g,' ').toLocaleLowerCase('es');
  const possibleNameMatch=customers.find((customer)=>customer.id!==editing?.id&&name.trim()&&nameKey(customer.name)===nameKey(name));
  const openNew=()=>{setEditing(null);setDuplicate(null);setName('');setPhone('');setAddress('');setLocationUrl('');setFormError('');setShowForm(true);};
  const openEdit=(customer:Customer)=>{setEditing(customer);setDuplicate(null);setName(customer.name);setPhone(customer.phone);setAddress(customer.address||'');setLocationUrl(customer.location_url||'');setFormError('');setShowForm(true);};
  const save=async(event:FormEvent)=>{
    event.preventDefault();
    if(!neon)return;
    const canonicalPhone=phone.replace(/\D/g,'');
    if(canonicalPhone.length<7||canonicalPhone.length>15){setFormError('Ingresa el teléfono con código de país, entre 7 y 15 dígitos.');return;}
    if(locationUrl.trim()){
      try{const url=new URL(locationUrl.trim());if(url.protocol!=='https:')throw new Error();}
      catch{setFormError('La ubicación debe ser un enlace HTTPS válido.');return;}
    }
    setSaving(true);setFormError('');setDuplicate(null);
    try{
      const {data:existing,error:lookupError}=await neon.from('customers').select('*').eq('business_id',businessId).eq('phone',canonicalPhone).maybeSingle();
      if(lookupError)throw new Error(lookupError.message);
      if(existing&&existing.id!==editing?.id){setDuplicate(existing as Customer);return;}
      const values={name:name.trim(),phone:canonicalPhone,address:address.trim()||null,location_url:locationUrl.trim()||null,updated_at:new Date().toISOString()};
      const result=editing
        ? await neon.from('customers').update(values).eq('id',editing.id).eq('business_id',businessId).select().single()
        : await neon.from('customers').insert({business_id:businessId,...values}).select().single();
      if(result.error){if('code'in result.error&&result.error.code==='23505'){const {data:match}=await neon.from('customers').select('*').eq('business_id',businessId).eq('phone',canonicalPhone).maybeSingle();if(match){setDuplicate(match as Customer);return;}}throw new Error(result.error.message);}
      onSaved(result.data as Customer,!editing);setShowForm(false);
    }catch(error){setFormError(error instanceof Error?error.message:'No se pudo guardar el cliente.');}
    finally{setSaving(false);}
  };
  const useExisting=()=>{if(!duplicate)return;openEdit(duplicate);};
  return <><PageHeading eyebrow="RELACIÓN CON CLIENTES" title="Clientes" description="Administra clientes capturados manualmente y desde pedidos web." action={<button className="button button-primary" onClick={openNew}><Plus size={15}/> Agregar cliente</button>}/><section className="panel customers-panel"><div className="table-toolbar"><div><strong className="table-title">Tus clientes</strong><p>{matching.length} contactos en tu negocio.</p></div><span className="item-count">{matching.length} clientes</span><label className="search-box customer-search"><Search size={15}/><input value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Buscar cliente…"/></label><TablePagination page={page} total={matching.length} onPage={setPage}/></div>{filtered.length?<div className="table-scroll"><table><thead><tr><th>CLIENTE</th><th>WHATSAPP</th><th>DIRECCIÓN</th><th>PEDIDOS</th><th>ÚLTIMO PEDIDO</th><th></th></tr></thead><tbody>{filtered.map((customer)=>{const recent=latestOrder(customer.id);const count=orders.filter((order)=>order.customer_id===customer.id).length;const hasSale=sales.some((sale)=>sale.customer_id===customer.id);const hasOrder=count>0;return <tr key={customer.id}><td><div className="sale-number"><span className="sale-mini customer-mini"><Users size={15}/></span><strong>{customer.name}</strong></div></td><td><a className="customer-phone" href={`tel:+${customer.phone}`}>+{customer.phone}</a></td><td><span>{customer.address||'—'}</span>{customer.location_url&&<a className="customer-location-link" href={customer.location_url} target="_blank" rel="noreferrer">Ver mapa</a>}</td><td>{count}</td><td>{recent?formatDate(recent.created_at):'—'}</td><td><div className="customer-row-actions"><button className="button button-small button-outline" onClick={()=>openEdit(customer)}>Editar</button><button className="button button-small button-danger-outline" disabled={hasSale||hasOrder} title={hasSale?'No se puede eliminar: el cliente está asociado a una venta.':hasOrder?'No se puede eliminar: el cliente está asociado a un pedido web.':'Eliminar cliente'} onClick={()=>setDeleteTarget(customer)}>Eliminar</button><a className="button button-small button-outline" href={`https://wa.me/${customer.phone}`} target="_blank" rel="noreferrer"><Phone size={13}/> WhatsApp</a></div></td></tr>;})}</tbody></table></div>:<div className="empty-state"><span className="empty-icon"><Users size={23}/></span><strong>{customers.length?'No encontramos ese cliente':'Aún no hay clientes'}</strong><p>{customers.length?'Prueba buscar por nombre o teléfono.':'Agrega un cliente manualmente o espera un pedido del catálogo público.'}</p>{!customers.length&&<button className="button button-primary" onClick={openNew}><Plus size={14}/> Agregar primer cliente</button>}</div>}</section>{showForm&&<div className="modal-backdrop customer-form-backdrop" onMouseDown={(event)=>event.target===event.currentTarget&&!saving&&setShowForm(false)}><form className="modal-card customer-form" onSubmit={save}><div className="modal-heading"><div><span className="eyebrow">{editing?'ACTUALIZAR CLIENTE':'NUEVO CLIENTE'}</span><h2>{editing?'Edita el contacto':'Agrega un cliente'}</h2></div><button type="button" className="icon-button" disabled={saving} onClick={()=>setShowForm(false)} aria-label="Cerrar formulario"><X size={19}/></button></div><p className="muted">El teléfono con código de país identifica al cliente y evita registros duplicados.</p>{duplicate&&<div className="notice customer-duplicate-notice" role="alert"><span>El número ya está registrado para <strong>{duplicate.name}</strong>. No se creó otro cliente.</span><button type="button" className="button button-small button-outline" onClick={useExisting}>Editar registro existente</button></div>}{formError&&<div className="notice" role="alert">{formError}</div>}<label>Nombre del cliente<input required maxLength={120} value={name} onChange={(event)=>setName(event.target.value)} placeholder="Nombre y apellido"/></label>{possibleNameMatch&&<p className="customer-possible-duplicate" role="status">Ya existe otro contacto con este nombre y diferente teléfono ({`+${possibleNameMatch.phone}`}). Verifica si es la misma persona antes de guardar.</p>}<label>Teléfono / WhatsApp<input required type="tel" minLength={7} maxLength={24} value={phone} onChange={(event)=>setPhone(event.target.value)} placeholder="Ej. +505 8888 4444"/><small>Incluye el código de país. Se guardará en formato normalizado.</small></label><label>Dirección <span className="optional">OPCIONAL</span><input maxLength={300} value={address} onChange={(event)=>setAddress(event.target.value)} placeholder="Dirección del cliente"/></label><label>Ubicación en Google Maps <span className="optional">OPCIONAL</span><input type="url" maxLength={500} value={locationUrl} onChange={(event)=>setLocationUrl(event.target.value)} placeholder="https://www.google.com/maps?q=…"/></label><div className="modal-actions"><button type="button" className="button button-outline" disabled={saving} onClick={()=>setShowForm(false)}>Cancelar</button><button className="button button-primary" disabled={saving}>{saving?'Guardando…':editing?'Guardar cambios':'Agregar cliente'}</button></div></form></div>}{deleteTarget&&<ConfirmDeleteModal entityLabel="cliente" entityName={deleteTarget.name} onCancel={()=>setDeleteTarget(null)} onDelete={()=>onDelete(deleteTarget.id,deleteTarget.name)}/>}</>;
}

function BrandPage({ business, onSaved, setError }: { business:Business; onSaved:(b:Business)=>void; setError:(v:string)=>void }) {
  const [form,setForm]=useState({name:business.name,currency_symbol:business.currency_symbol||'C$',primary_color:business.primary_color,secondary_color:business.secondary_color,address:business.address||'',phone:business.phone||''});
  const [saving,setSaving]=useState(false);
  const save=async(e:FormEvent)=>{e.preventDefault();if(!neon)return;const values={...form,currency_symbol:form.currency_symbol.trim()};if(!values.currency_symbol){setError('Escribe el símbolo o texto de la moneda.');return;}setSaving(true);setError('');const {data,error}=await neon.from('businesses').update(values).eq('id',business.id).select().single();if(error)setError(error.message);else onSaved(data as Business);setSaving(false);};
  const catalogUrl=`${window.location.origin}/catalogo/${business.public_slug}`;
  return <><PageHeading eyebrow="IDENTIDAD DE TU NEGOCIO" title="Mi negocio" description="Elige cómo se verá tu marca en la app y el catálogo público." />
    <div className="brand-layout"><form className="panel brand-form" onSubmit={save}><div className="panel-heading"><div><h2>Información del negocio</h2><p>Estos datos se muestran en tus documentos y catálogo.</p></div><span className="icon-surface"><Store size={16}/></span></div><label>Nombre del negocio<input required maxLength={80} value={form.name} onChange={(e)=>setForm({...form,name:e.target.value})}/></label><label>Símbolo o texto de moneda<input required maxLength={16} value={form.currency_symbol} onChange={(e)=>setForm({...form,currency_symbol:e.target.value})} placeholder="Ej. C$, $, US$ o MXN"/></label><p className="currency-note">Escribe cómo quieres mostrar tus precios. Esto no convierte los valores guardados.</p><div className="form-two"><label>Color principal<div className="color-field"><input type="color" value={form.primary_color} onChange={(e)=>setForm({...form,primary_color:e.target.value})}/><span>{form.primary_color.toUpperCase()}</span></div></label><label>Color secundario<div className="color-field"><input type="color" value={form.secondary_color} onChange={(e)=>setForm({...form,secondary_color:e.target.value})}/><span>{form.secondary_color.toUpperCase()}</span></div></label></div><label>Dirección <span className="optional">OPCIONAL</span><input maxLength={180} value={form.address} onChange={(e)=>setForm({...form,address:e.target.value})} placeholder="Dirección de tu negocio"/></label><label>WhatsApp del negocio <span className="optional">OPCIONAL</span><input type="tel" maxLength={30} value={form.phone} onChange={(e)=>setForm({...form,phone:e.target.value})} placeholder="+505 8888 8888"/><small className="brand-field-hint">Incluye el código de país. Se usará para recibir pedidos desde tu catálogo.</small></label><div className="brand-form-footer"><span><Check size={14}/> Se aplicará a catálogo y comprobantes</span><button className="button button-primary" disabled={saving}>{saving?'Guardando…':'Guardar cambios'}</button></div></form>
    <aside className="brand-side"><section className="panel brand-preview"><div className="preview-label"><span className="green-dot"/> VISTA PREVIA DEL CATÁLOGO</div><div className="preview-banner" style={{background:form.primary_color}}><span className="preview-brand-icon"><Store size={18}/></span><strong>{form.name||'Tu negocio'}</strong><small>Catálogo de productos</small></div><div className="preview-body"><div className="preview-product"><span><ShoppingBag size={17}/></span><div><b>Producto de ejemplo</b><small>Descripción de tu producto</small></div><strong>{formatMoney(250,form.currency_symbol)}</strong></div><div className="preview-product"><span><ShoppingBag size={17}/></span><div><b>Otro producto</b><small>Disponible para tu catálogo</small></div><strong>{formatMoney(180,form.currency_symbol)}</strong></div></div></section><section className="panel share-panel"><span className="share-icon"><ExternalLink size={17}/></span><div><strong>Tu catálogo público</strong><p>Comparte el enlace con tus clientes.</p></div><div className="share-url"><input readOnly value={catalogUrl}/><button onClick={()=>{void navigator.clipboard.writeText(catalogUrl);}} title="Copiar enlace"><ClipboardList size={15}/></button></div><a className="text-link" href={catalogUrl} target="_blank" rel="noreferrer">Abrir catálogo <ArrowUpRight size={14}/></a></section></aside></div>
  </>;
}

function ProductModal({ businessId, product, categories, isInSale, isInWebOrder, onAddCategory, onClose, onSaved, onDelete, onDeleted, setError }: { businessId:string; product:Product|null; categories:Category[]; isInSale:boolean; isInWebOrder:boolean; onAddCategory:(name:string)=>Promise<Category|null>; onClose:()=>void; onSaved:()=>void; onDelete:(productId:string,confirmationName:string)=>Promise<DeleteResult>; onDeleted:()=>void; setError:(v:string)=>void }) {
  const [name,setName]=useState(product?.name||'');
  const [description,setDescription]=useState(product?.description||'');
  const [variantLabel,setVariantLabel]=useState(product?.variant_label||'');
  const [regular,setRegular]=useState(product?String(product.regular_price):'');
  const [promoPrice,setPromoPrice]=useState(product?.promotional_price?String(product.promotional_price):'');
  const [active,setActive]=useState(product?.is_active??true);
  const [promo,setPromo]=useState(product?.promotion_enabled??false);
  const [categoryId,setCategoryId]=useState(product?.category_id||'');
  const [newCategoryName,setNewCategoryName]=useState('');
  const [showNewCategory,setShowNewCategory]=useState(false);
  const [categoryBusy,setCategoryBusy]=useState(false);
  const [imageUrl,setImageUrl]=useState(product?.image_url||'');
  const [imageFile,setImageFile]=useState<File|null>(null);
  const [imagePreview,setImagePreview]=useState(product?.image_url||'');
  const [saving,setSaving]=useState(false);
  const [saveTimedOut,setSaveTimedOut]=useState(false);
  const [formError,setFormError]=useState('');
  const [saveStatus,setSaveStatus]=useState('');
  const [deleteOpen,setDeleteOpen]=useState(false);

  const adjustPrice=(value:string,setValue:(next:string)=>void,delta:number)=>{
    const current=Number(value||0);
    if(!Number.isFinite(current))return;
    const cents=Math.round(current*100)+delta*100;
    setValue((cents/100).toFixed(2));
  };

  useEffect(()=>()=>{if(imagePreview.startsWith('blob:'))URL.revokeObjectURL(imagePreview);},[imagePreview]);

  const reportError=(message:string)=>{setFormError(message);setError(message);};

  const save=async(e:FormEvent)=>{
    e.preventDefault();
    if(!neon)return;
    const regularNumber=Number(regular),promoNumber=Number(promoPrice);
    if(!Number.isFinite(regularNumber)||regularNumber<=0){reportError('Ingresa un precio normal mayor que cero.');return;}
    if(promo&&(!Number.isFinite(promoNumber)||promoNumber<=0||promoNumber>=regularNumber)){reportError('El precio promocional debe ser mayor que cero y menor que el precio normal.');return;}
    if(imageFile&&imageFile.size>5*1024*1024){reportError('La imagen debe pesar 5 MB o menos.');return;}
    setSaving(true);setSaveStatus(imageFile?'Subiendo imagen…':'Guardando producto…');setFormError('');setError('');
    try{
      let nextImageUrl=imageUrl;
      if(imageFile){
        const {data}=await neon.auth.getSession();
        const accessToken=data.session?.access_token;
        if(!accessToken)throw new Error('Tu sesión expiró. Inicia sesión de nuevo para subir imágenes.');
        const extension=imageFile.type==='image/png'?'png':imageFile.type==='image/webp'?'webp':'jpg';
        const uploadController=new AbortController();
        const uploadTimer=window.setTimeout(()=>uploadController.abort(),30000);
        let blob;
        try{
          blob=await uploadBlob(`products/${businessId}/${crypto.randomUUID()}.${extension}`,imageFile,{
            access:'public',handleUploadUrl:'/api/product-image-upload',clientPayload:accessToken,contentType:imageFile.type,abortSignal:uploadController.signal,
          });
        }finally{window.clearTimeout(uploadTimer);}
        nextImageUrl=blob.url;
      }
      setSaveStatus('Guardando producto en Neon…');
      const payload={business_id:businessId,category_id:categoryId||null,name:name.trim(),variant_label:variantLabel.trim()||null,description:description.trim()||null,image_url:nextImageUrl||null,regular_price:regularNumber,promotional_price:promoPrice?promoNumber:null,promotion_enabled:promo,is_active:active};
      const request=product?neon.from('products').update(payload).eq('id',product.id):neon.from('products').insert(payload);
      const result=await withTimeout(request,10000);
      if(result.error)throw new Error(result.error.message);
      await onSaved();
    }catch(error){
      if(error instanceof Error&&error.message==='REQUEST_TIMEOUT'){
        setSaveTimedOut(true);
        reportError('Neon no respondió a tiempo. La solicitud pudo haberse procesado: cierra este formulario, recarga Productos y verifica si el producto aparece antes de volver a intentarlo.');
      }else if(error instanceof Error&&error.name==='AbortError')reportError('La subida de la imagen tardó demasiado. Revisa tu conexión e intenta de nuevo.');
      else reportError(error instanceof Error?error.message:'No se pudo guardar el producto.');
    }finally{setSaving(false);setSaveStatus('');}
  };

  const selectImage=(file:File|null)=>{
    if(!file){setImageFile(null);setImageUrl('');setImagePreview('');return;}
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)){reportError('Elige una imagen JPG, PNG o WebP.');return;}
    setFormError('');setError('');setImageFile(file);setImageUrl('');setImagePreview(URL.createObjectURL(file));
  };

  const createCategory=async()=>{
    if(!newCategoryName.trim()||categoryBusy)return;
    setCategoryBusy(true);setFormError('');setError('');
    try{
      const created=await onAddCategory(newCategoryName);
      if(created){setCategoryId(created.id);setNewCategoryName('');setShowNewCategory(false);}
      else setFormError('No se pudo crear la categoría. Comprueba el mensaje y que no exista otra con el mismo nombre.');
    }catch(error){reportError(error instanceof Error?error.message:'No se pudo crear la categoría.');
    }finally{setCategoryBusy(false);}
  };

  return <div className="modal-backdrop" onMouseDown={(e)=>e.target===e.currentTarget&&onClose()}><form className="modal-card product-modal" onSubmit={save}>
    <div className="modal-heading"><div><span className="eyebrow">{product?'ACTUALIZAR':'NUEVO'} PRODUCTO</span><h2>{product?'Editar producto':'Agrega un producto'}</h2></div><button type="button" className="icon-button" onClick={onClose}><X size={19}/></button></div>
    {formError&&<div className="notice product-form-notice" role="alert"><CircleHelp size={16}/><span>{formError}</span></div>}{saveStatus&&<p className="product-save-status" role="status">{saveStatus}</p>}
    <label>Nombre del producto<input required autoFocus maxLength={100} value={name} onChange={(e)=>setName(e.target.value)} placeholder="Ej. Blusa de lino"/></label>
    <label>Descripción <span className="optional">OPCIONAL</span><textarea rows={2} value={description} onChange={(e)=>setDescription(e.target.value)} placeholder="Detalles que quieras compartir"/></label>
    <label>Variante o presentación <span className="optional">OPCIONAL</span><input maxLength={80} value={variantLabel} onChange={(e)=>setVariantLabel(e.target.value)} placeholder="Ej. T: 36 · 46 cm x 46 cm"/><small>Se muestra en el catálogo y en el pedido de WhatsApp.</small></label>
    <div className="product-category-field"><label>Categoría<select value={categoryId} onChange={(e)=>setCategoryId(e.target.value)}><option value="">Sin categoría</option>{categories.map((category)=><option key={category.id} value={category.id}>{category.name}</option>)}</select></label><button type="button" className="text-link quick-category-toggle" onClick={()=>setShowNewCategory((shown)=>!shown)}><Plus size={14}/> Crear categoría</button>{showNewCategory&&<div className="quick-category-form"><input autoFocus maxLength={60} value={newCategoryName} onChange={(e)=>setNewCategoryName(e.target.value)} onKeyDown={(e)=>{if(e.key==='Enter'){e.preventDefault();void createCategory();}}} placeholder="Nombre de categoría"/><button type="button" className="button button-small button-primary" disabled={categoryBusy||!newCategoryName.trim()} onClick={()=>void createCategory()}>{categoryBusy?'Creando…':'Crear'}</button></div>}</div>
    <div className="product-image-field"><span className="field-label">Imagen <span className="optional">OPCIONAL</span></span><div className="product-image-controls"><div className="product-image-preview">{imagePreview?<img src={imagePreview} alt="Vista previa del producto"/>:<ImagePlus size={23}/>}</div><div><label className="button button-outline image-select">{imageFile||imageUrl?'Cambiar imagen':'Elegir imagen'}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e)=>selectImage(e.target.files?.[0]||null)}/></label>{imagePreview&&<button type="button" className="text-link image-remove" onClick={()=>selectImage(null)}>Quitar imagen</button>}<small>JPG, PNG o WebP · máximo 5 MB</small></div></div></div>
    <div className="form-two"><label>Precio normal<div className="price-input-wrap"><input required type="number" min="0.01" step="any" value={regular} onChange={(e)=>setRegular(e.target.value)} placeholder="0.00"/><span className="price-stepper"><button type="button" aria-label="Aumentar precio normal en 10" onClick={()=>adjustPrice(regular,setRegular,10)}>▲</button><button type="button" aria-label="Disminuir precio normal en 10" disabled={!regular||Number(regular)<=10} onClick={()=>adjustPrice(regular,setRegular,-10)}>▼</button></span></div></label><label>Precio promocional<div className="price-input-wrap"><input type="number" min="0.01" step="any" value={promoPrice} onChange={(e)=>setPromoPrice(e.target.value)} placeholder="Sin promoción" disabled={!promo}/><span className="price-stepper"><button type="button" aria-label="Aumentar precio promocional en 10" disabled={!promo} onClick={()=>adjustPrice(promoPrice,setPromoPrice,10)}>▲</button><button type="button" aria-label="Disminuir precio promocional en 10" disabled={!promo||!promoPrice||Number(promoPrice)<=10} onClick={()=>adjustPrice(promoPrice,setPromoPrice,-10)}>▼</button></span></div></label></div>
    <div className="setting-row"><span><strong>Promoción activa</strong><small>Usar el precio promocional hasta que la desactives.</small></span><button type="button" role="switch" aria-checked={promo} className={`switch ${promo?'checked':''}`} onClick={()=>setPromo(!promo)}><i/></button></div>
    <div className="setting-row"><span><strong>Producto activo</strong><small>Disponible en venta y catálogo público.</small></span><button type="button" role="switch" aria-checked={active} className={`switch ${active?'checked':''}`} onClick={()=>setActive(!active)}><i/></button></div>
    <div className="modal-actions product-modal-actions">{product&&<div className="product-delete-control"><button type="button" className="button button-danger-outline" disabled={saving||isInSale||isInWebOrder} title={isInSale?'No se puede eliminar: el producto aparece en una venta.':isInWebOrder?'No se puede eliminar: el producto aparece en un pedido web.':'Eliminar producto'} onClick={()=>setDeleteOpen(true)}>Eliminar producto</button>{(isInSale||isInWebOrder)&&<small>{isInSale?'Está asociado a ventas y debe conservarse.':'Está asociado a pedidos web y debe conservarse.'}</small>}</div>}<div className="product-modal-actions-right"><button type="button" className="button button-outline" onClick={onClose}>Cerrar</button><button className="button button-primary" disabled={saving||saveTimedOut}>{saving?saveStatus:saveTimedOut?'Verifica Productos':product?'Guardar cambios':'Agregar producto'}</button></div></div>
  </form>{deleteOpen&&product&&<ConfirmDeleteModal entityLabel="producto" entityName={product.name} onCancel={()=>setDeleteOpen(false)} onDelete={async()=>{const result=await onDelete(product.id,product.name);if(result.ok)await onDeleted();return result;}}/>}</div>;
}

function ReceiptModal({ sale, business, onClose }: { sale:Sale; business:Business; onClose:()=>void }) {
  const items=sale.sale_items||[];
  const currencySymbol=business.currency_symbol||'C$';
  const openPdf=()=>{
    const pdf=new Blob([buildReceiptPdf(sale,business)],{type:'application/pdf'});
    const url=URL.createObjectURL(pdf);
    const tab=window.open(url,'_blank');
    if(tab)tab.opener=null;
    else{const link=document.createElement('a');link.href=url;link.download=`comprobante-${String(sale.sale_number).padStart(5,'0')}.pdf`;link.click();}
    window.setTimeout(()=>URL.revokeObjectURL(url),120000);
  };
  return <div className="modal-backdrop" onMouseDown={(e)=>e.target===e.currentTarget&&onClose()}><div className="modal-card receipt-modal"><div className="modal-heading no-print"><div><span className="eyebrow">COMPROBANTE DE VENTA</span><h2>Venta #{String(sale.sale_number).padStart(5,'0')}</h2></div><button className="icon-button" onClick={onClose}><X size={19}/></button></div><div className="receipt-paper" id="print-receipt"><div className="receipt-brand"><span className="brand-mark"><Store size={17}/></span><strong>{business.name}</strong>{business.address&&<small>{business.address}</small>}{business.phone&&<small>{business.phone}</small>}</div><div className="receipt-meta"><span>Comprobante #{String(sale.sale_number).padStart(5,'0')}</span><span>{formatDate(sale.sold_at)}</span></div><div className="receipt-lines">{items.map((item)=><div className="receipt-line" key={item.id}><span>{item.quantity} × {item.product_name}{item.variant_label&&<small>{item.variant_label}</small>}{item.promotion_applied&&<small>Promoción aplicada</small>}</span><strong>{formatMoney(Number(item.line_total),currencySymbol)}</strong></div>)}</div><div className="receipt-total"><span>Total</span><strong>{formatMoney(Number(sale.total_amount),currencySymbol)}</strong></div><p className="receipt-thanks">¡Gracias por tu compra!</p></div><div className="modal-actions receipt-actions no-print"><button className="button button-outline" onClick={onClose}>Cerrar</button><button className="button button-primary" onClick={openPdf}><FileText size={15}/> Abrir PDF</button></div></div></div>;
}
