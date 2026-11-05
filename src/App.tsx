import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { upload as uploadBlob } from '@vercel/blob/client';
import {
  ArrowUpRight, BarChart3, Check, ChevronDown, CircleHelp, ClipboardList, ImagePlus,
  ExternalLink, Eye, Facebook, Instagram, LogOut, Menu,
  Music2, Package, Plus, Printer, Search, Settings2, ShoppingBag, ShoppingCart,
  Sparkles, Store, Tag, X, Youtube,
} from 'lucide-react';
import { isNeonConfigured, neon } from './lib/neon';
import { Business, Category, formatDate, formatMoney, priceFor, Product, Sale } from './lib/types';

type Page = 'dashboard' | 'products' | 'categories' | 'sale' | 'history' | 'brand';
type CartRow = { product: Product; quantity: number };

const navItems: { id: Page; label: string; icon: typeof BarChart3 }[] = [
  { id: 'dashboard', label: 'Resumen', icon: BarChart3 },
  { id: 'products', label: 'Productos', icon: Package },
  { id: 'categories', label: 'Categorías', icon: Tag },
  { id: 'sale', label: 'Nueva venta', icon: ShoppingCart },
  { id: 'history', label: 'Ventas', icon: ClipboardList },
  { id: 'brand', label: 'Mi negocio', icon: Settings2 },
];

function slugify(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function groupProducts(products: Product[], getCategoryName: (product: Product) => string | null | undefined) {
  const groups = new Map<string, { name: string; products: Product[] }>();
  products.forEach((product) => {
    const name = getCategoryName(product)?.trim() || 'Sin categoría';
    const group = groups.get(name) || { name, products: [] };
    group.products.push(product);
    groups.set(name, group);
  });
  return [...groups.values()].sort((a, b) => a.name === 'Sin categoría' ? 1 : b.name === 'Sin categoría' ? -1 : a.name.localeCompare(b.name, 'es'));
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

function PublicCatalog() {
  const [business, setBusiness] = useState<Business | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Todas');
  const slug = window.location.pathname.split('/').filter(Boolean).at(-1) || '';
  useEffect(() => {
    let active = true;
    (async () => {
      if (!neon) { setLoading(false); return; }
      const { data, error } = await neon.rpc('get_public_catalog', { p_slug: slug });
      if (!active || error || !data) { setLoading(false); return; }
      const catalog = data as { business: Business; products: Product[] };
      if (active) { setBusiness(catalog.business); setProducts(catalog.products || []); setLoading(false); }
    })();
    return () => { active = false; };
  }, [slug]);

  if (loading) return <div className="public-loading">Cargando catálogo…</div>;
  if (!business) return <div className="public-loading"><Store size={28} /><h1>Catálogo no disponible</h1><p>Revisa el enlace o contacta al negocio.</p></div>;
  const categoryNames = [...new Set(products.map((product) => product.category_name?.trim() || 'Sin categoría'))]
    .sort((a, b) => a === 'Sin categoría' ? 1 : b === 'Sin categoría' ? -1 : a.localeCompare(b, 'es'));
  const filteredProducts = products.filter((product) => {
    const category = product.category_name?.trim() || 'Sin categoría';
    const matchesCategory = selectedCategory === 'Todas' || category === selectedCategory;
    const searchText = `${product.name} ${product.description || ''} ${category}`.toLocaleLowerCase('es');
    return matchesCategory && searchText.includes(query.trim().toLocaleLowerCase('es'));
  });
  const groups = groupProducts(filteredProducts, (product) => product.category_name);
  return <main className="public-page" style={{ '--brand': business.primary_color, '--brand-soft': business.secondary_color } as CSSProperties}>
    <header className="public-header">
      <div className="public-brand"><span className="brand-mark"><Store size={19} /></span><div><strong>{business.name}</strong><small>Catálogo de productos</small></div></div>
      <button className="button button-outline no-print" onClick={() => window.print()}><Printer size={16} /> Imprimir catálogo</button>
    </header>
    <section className="public-hero"><span className="public-hero-orb"/><div className="public-hero-copy"><span className="public-eyebrow"><span/> CATÁLOGO DISPONIBLE</span><h1>Encuentra algo<br/><em>que te encante.</em></h1><p>Explora los productos de {business.name} y descubre tu próximo favorito.</p><div className="public-hero-meta"><span><ShoppingBag size={15}/>{products.length} {products.length === 1 ? 'producto disponible' : 'productos disponibles'}</span>{business.address&&<span>{business.address}</span>}</div></div><div className="public-hero-mark"><Store size={42}/></div></section>
    <section className="public-catalog-controls no-print"><div className="public-controls-heading"><div><span className="eyebrow">EXPLORA LA COLECCIÓN</span><h2>Nuestros productos</h2></div><span className="public-result-count">{filteredProducts.length} {filteredProducts.length===1?'resultado':'resultados'}</span></div><label className="public-search"><Search size={17}/><input type="search" value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Buscar productos…" aria-label="Buscar productos por nombre o descripción"/>{query&&<button type="button" onClick={()=>setQuery('')} aria-label="Limpiar búsqueda"><X size={15}/></button>}</label>{categoryNames.length>0&&<div className="public-filter-row"><span className="public-filter-label">Categorías</span><div className="public-filter-chips"><button className={`public-filter-chip ${selectedCategory==='Todas'?'active':''}`} onClick={()=>setSelectedCategory('Todas')}>Todas <small>{products.length}</small></button>{categoryNames.map((category)=>{const count=products.filter((product)=>(product.category_name?.trim()||'Sin categoría')===category).length;return <button key={category} className={`public-filter-chip ${selectedCategory===category?'active':''}`} onClick={()=>setSelectedCategory(category)}>{category}<small>{count}</small></button>;})}</div></div>}</section>
    {groups.length === 0 ? <section className="public-empty"><span><Search size={24}/></span><h2>{products.length?'No encontramos productos':'Aún no hay productos publicados'}</h2><p>{products.length?'Prueba otra búsqueda o cambia la categoría seleccionada.':'Vuelve pronto para ver los productos de este negocio.'}</p>{(query||selectedCategory!=='Todas')&&<button className="button button-outline no-print" onClick={()=>{setQuery('');setSelectedCategory('Todas');}}>Ver todos los productos</button>}</section> : groups.map((group) => <section className="public-category" key={group.name}><div className="public-category-heading"><h2>{group.name}</h2><span>{group.products.length} {group.products.length===1?'artículo':'artículos'}</span></div><div className="public-grid">{group.products.map((product) => <article className="public-product" key={product.id}>
      <div className="public-product-image">{product.image_url ? <img src={product.image_url} alt={product.name} loading="lazy" /> : <span className="public-image-placeholder"><ShoppingBag size={31}/></span>}{product.promotion_enabled&&<span className="public-promo-badge">Oferta</span>}</div><div className="public-product-info">{product.category_name&&<span className="public-product-category">{product.category_name}</span>}<h3>{product.name}</h3><p>{product.description || 'Un producto seleccionado para ti.'}</p><div className="price-line">{product.promotion_enabled && <s>{formatMoney(product.regular_price,business.currency_symbol)}</s>}<strong>{formatMoney(priceFor(product),business.currency_symbol)}</strong></div></div>
    </article>)}</div></section>)}
    <footer className="public-footer">{business.address && <span>{business.address}</span>}{business.phone && <a href={`tel:${business.phone}`}>{business.phone}</a>}<span>Catálogo creado con Mini POS</span></footer>
  </main>;
}

function AuthScreen({ onAuthenticated }: { onAuthenticated: (userId: string) => void }) {
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
    <div className="auth-switch">{mode === 'login' ? '¿Primera vez aquí?' : '¿Ya tienes una cuenta?'} <button onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setMessage(''); }}>{mode === 'login' ? 'Crear cuenta' : 'Iniciar sesión'}</button></div></>}<div className="auth-secure"><span className="secure-dot" /> Acceso protegido por Neon</div></div></section></main>;
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
  const [business, setBusiness] = useState<Business | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
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
  const [period, setPeriod] = useState<'7' | '30' | 'all'>('7');

  useEffect(() => {
    if (!neon) { setAuthReady(true); return; }
    neon.auth.getSession().then(({ data }) => { setUserId(data.session?.user.id || null); setAuthReady(true); });
    const { data: listener } = neon.auth.onAuthStateChange((_event, session) => setUserId(session?.user.id || null));
    return () => listener.subscription.unsubscribe();
  }, []);

  const loadWorkspace = useCallback(async () => {
    if (!neon || !userId) return;
    setLoading(true); setError('');
    let { data: shop, error: shopError } = await neon.from('businesses').select('*').eq('owner_user_id', userId).maybeSingle();
    if (shopError) { setError(shopError.message); setLoading(false); return; }
    if (!shop) {
      const name = 'Mi negocio';
      const slug = `${slugify(name) || 'negocio'}-${crypto.randomUUID().slice(0, 6)}`;
      const { data: created, error: createError } = await neon.from('businesses').insert({ owner_user_id: userId, name, public_slug: slug }).select().single();
      if (createError) { setError(createError.message); setLoading(false); return; }
      shop = created;
    }
    setBusiness(shop as Business);
    const [{ data: productRows, error: productError }, { data: saleRows, error: saleError }, { data: categoryRows, error: categoryError }] = await Promise.all([
      neon.from('products').select('*').eq('business_id', shop.id).order('created_at', { ascending: false }),
      neon.from('sales').select('*, sale_items(*)').eq('business_id', shop.id).order('sold_at', { ascending: false }),
      neon.from('categories').select('*').eq('business_id', shop.id).order('name'),
    ]);
    if (productError || saleError || categoryError) setError(productError?.message || saleError?.message || categoryError?.message || 'No se pudieron cargar los datos.');
    setProducts((productRows || []) as Product[]); setSales((saleRows || []) as Sale[]); setCategories((categoryRows || []) as Category[]); setLoading(false);
  }, [userId]);

  useEffect(() => { if (userId) void loadWorkspace(); else { setBusiness(null); setProducts([]); setCategories([]); setSales([]); } }, [userId, loadWorkspace]);
  useEffect(() => { if (toast) { const timer = window.setTimeout(() => setToast(''), 3200); return () => window.clearTimeout(timer); } }, [toast]);
  useEffect(() => { if (business) { document.documentElement.style.setProperty('--brand', business.primary_color); document.documentElement.style.setProperty('--brand-soft', business.secondary_color); } }, [business]);

  const activeProducts = products.filter((p) => p.is_active);
  const filteredProducts = products.filter((p) => p.name.toLowerCase().includes(query.toLowerCase()));
  const filteredActive = activeProducts.filter((p) => p.name.toLowerCase().includes(query.toLowerCase()));
  const periodSales = useMemo(() => sales.filter((s) => period === 'all' || Date.now() - new Date(s.sold_at).getTime() <= Number(period) * 86400000), [sales, period]);
  const totalRevenue = periodSales.reduce((sum, sale) => sum + Number(sale.total_amount), 0);
  const itemCounts: Record<string, { name: string; count: number }> = {};
  periodSales.forEach((sale) => (sale.sale_items || []).forEach((item) => { itemCounts[item.product_name] ||= { name: item.product_name, count: 0 }; itemCounts[item.product_name].count += item.quantity; }));
  const bestSellers = Object.values(itemCounts).sort((a, b) => b.count - a.count).slice(0, 4);
  const barMax = Math.max(...periodSales.slice(0, 7).map((s) => Number(s.total_amount)), 1);

  if (isPublic) return <PublicCatalog />;
  if (!authReady) return <div className="center-loader">Preparando tu espacio…</div>;
  if (!isNeonConfigured) return <SetupScreen />;
  if (!userId) return <AuthScreen onAuthenticated={setUserId} />;

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
  const finalizeSale = async () => {
    if (!neon || !cart.length) return;
    setLoading(true); setError('');
    const { data, error: saleError } = await neon.rpc('create_sale', { p_items: cart.map((row) => ({ product_id: row.product.id, quantity: row.quantity })) });
    if (saleError) { setError(saleError.message); setLoading(false); return; }
    setCart([]); await loadWorkspace();
    const { data: created } = await neon.from('sales').select('*, sale_items(*)').eq('id', data).single();
    if (created) setReceipt(created as Sale);
    setPage('history'); setLoading(false); showToast('Venta registrada correctamente.');
  };

  return <div className="app-shell">
    <aside className={`sidebar ${mobileNavOpen ? 'sidebar-open' : ''}`}><div className="sidebar-top"><a className="logo-lockup" href="#dashboard"><span className="brand-mark"><Store size={19} /></span><span>mini<span className="logo-light">pos</span><small>ESPACIO DE NEGOCIO</small></span></a><button className="icon-button mobile-close" onClick={() => setMobileNavOpen(false)} aria-label="Cerrar menú"><X size={19} /></button></div>
      <div className="side-business"><span className="business-avatar">{business?.name.slice(0, 1).toUpperCase() || 'M'}</span><span><strong>{business?.name || 'Mi negocio'}</strong><small>Plan emprendedor</small></span><ChevronDown size={15} /></div>
      <div className="nav-caption">MENÚ PRINCIPAL</div><nav className="main-nav">{navItems.map(({ id, label, icon: Icon }) => <button key={id} className={`nav-link ${page === id ? 'selected' : ''}`} onClick={() => { setPage(id); setMobileNavOpen(false); }}><span className="nav-icon"><Icon size={17} strokeWidth={1.9} /></span><span>{label}</span>{id === 'sale' && cart.length > 0 && <i>{cart.reduce((n, row) => n + row.quantity, 0)}</i>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="help-card"><span><Sparkles size={17} /></span><strong>Un paso a la vez</strong><p>Tu negocio, organizado y listo para crecer.</p></div><button className="nav-link logout-link" onClick={() => neon?.auth.signOut()}><LogOut size={18} /><span>Cerrar sesión</span></button><small className="sidebar-version">MINI POS · EDICIÓN REGALO</small></div>
    </aside>
    {mobileNavOpen && <button className="nav-backdrop" onClick={() => setMobileNavOpen(false)} aria-label="Cerrar menú" />}
    <main className="main-area"><header className="topbar"><button className="icon-button mobile-menu" onClick={() => setMobileNavOpen(true)} aria-label="Abrir menú"><Menu size={21} /></button><div className="breadcrumb">Mi negocio <span>/</span> <strong>{navItems.find((item) => item.id === page)?.label}</strong></div><div className="top-actions"><a className="catalog-link" href={`/catalogo/${business?.public_slug}`} target="_blank" rel="noreferrer"><Eye size={16} /> Ver catálogo <ExternalLink size={13} /></a><span className="top-avatar">{business?.name.slice(0, 1).toUpperCase() || 'M'}</span></div></header>
      <div className="content-wrap">
        {error && <div className="notice page-notice"><CircleHelp size={17} /><span>{error}</span><button onClick={() => setError('')}><X size={16} /></button></div>}
        {loading && <div className="loading-strip"><span /> Sincronizando información…</div>}
        {page === 'dashboard' && <Dashboard business={business} sales={periodSales} total={totalRevenue} products={products} bestSellers={bestSellers} barMax={barMax} period={period} setPeriod={setPeriod} />}
        {page === 'products' && <ProductsPage products={filteredProducts} categories={categories} currencySymbol={business?.currency_symbol||'C$'} query={query} setQuery={setQuery} onAdd={() => { setEditingProduct(null); setProductModal(true); }} onEdit={(p) => { setEditingProduct(p); setProductModal(true); }} onToggle={async (product) => {
          if (!neon) return;
          const { error: e } = await neon.from('products').update({ is_active: !product.is_active }).eq('id', product.id);
          if (e) setError(e.message); else { await loadWorkspace(); showToast(product.is_active ? 'Producto desactivado.' : 'Producto activado.'); }
        }} />}
        {page === 'categories' && <CategoriesPage categories={categories} onAdd={addCategory} onRename={renameCategory} onDelete={deleteCategory} />}
        {page === 'sale' && <SalePage products={filteredActive} categories={categories} currencySymbol={business?.currency_symbol||'C$'} query={query} setQuery={setQuery} cart={cart} addToCart={addToCart} changeQuantity={changeQuantity} total={cartTotal} onFinalize={finalizeSale} />}
        {page === 'history' && <HistoryPage sales={sales} currencySymbol={business?.currency_symbol||'C$'} onReceipt={setReceipt} />}
        {page === 'brand' && business && <BrandPage business={business} onSaved={(b) => { setBusiness(b); showToast('La marca del negocio se guardó.'); }} setError={setError} />}
      </div>
    </main>
    {productModal && business && <ProductModal businessId={business.id} product={editingProduct} categories={categories} onAddCategory={addCategory} onClose={() => setProductModal(false)} onSaved={async () => { setProductModal(false); await loadWorkspace(); showToast(editingProduct ? 'Producto actualizado.' : 'Producto agregado.'); }} setError={setError} />}
    {receipt && business && <ReceiptModal sale={receipt} business={business} onClose={() => setReceipt(null)} />}
    {toast && <div className="toast"><span><Check size={15} /></span>{toast}</div>}
  </div>;
}

function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="page-heading"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{action}</div>;
}

function Dashboard({ business, sales, total, products, bestSellers, barMax, period, setPeriod }: { business: Business | null; sales: Sale[]; total: number; products: Product[]; bestSellers: {name:string;count:number}[]; barMax: number; period:'7'|'30'|'all'; setPeriod:(v:'7'|'30'|'all')=>void }) {
  const activeCount = products.filter((p) => p.is_active).length;
  const currencySymbol=business?.currency_symbol||'C$';
  return <><PageHeading eyebrow="VISTA GENERAL" title={`Hola, ${business?.name || 'emprendedor'}.`} description="Aquí tienes un vistazo de cómo va tu negocio." action={<select className="select-control period-select" value={period} onChange={(e) => setPeriod(e.target.value as '7'|'30'|'all')}><option value="7">Últimos 7 días</option><option value="30">Últimos 30 días</option><option value="all">Todo el historial</option></select>} />
    <div className="stats-grid"><StatCard label="Ventas del período" value={formatMoney(total,currencySymbol)} icon={BarChart3} hint={sales.length ? `${sales.length} ventas registradas` : 'Aún no hay ventas'} /><StatCard label="Ventas realizadas" value={String(sales.length)} icon={ShoppingBag} hint="En el período seleccionado" /><StatCard label="Productos activos" value={String(activeCount)} icon={Package} hint={`De ${products.length} productos registrados`} /></div>
    <div className="dashboard-grid"><section className="panel sales-chart-panel"><div className="panel-heading"><div><h2>Actividad reciente</h2><p>Ventas registradas en este período</p></div><span className="tiny-tag"><span className="green-dot" /> EN VIVO</span></div>{sales.length === 0 ? <div className="chart-empty"><span><BarChart3 size={23} /></span><strong>Tu primera venta aparecerá aquí</strong><p>Cuando registres una venta, podrás seguir cómo se mueve tu negocio.</p></div> : <div className="bar-chart">{sales.slice(0, 7).reverse().map((sale) => <div className="bar-column" key={sale.id}><div className="bar-value">{formatMoney(Number(sale.total_amount),currencySymbol)}</div><div className="bar-track"><div className="bar-fill" style={{ height: `${Math.max(Number(sale.total_amount) / barMax * 100, 8)}%` }} /></div><small>{new Date(sale.sold_at).toLocaleDateString('es-NI', { day: '2-digit', month: 'short' })}</small></div>)}</div>}</section>
      <section className="panel best-panel"><div className="panel-heading"><div><h2>Más vendidos</h2><p>Unidades en el período</p></div><span className="icon-surface"><Sparkles size={16} /></span></div>{bestSellers.length ? <div className="ranking-list">{bestSellers.map((item, index) => <div className="ranking-row" key={item.name}><span className={`rank-number rank-${index+1}`}>{String(index+1).padStart(2,'0')}</span><span className="rank-product"><strong>{item.name}</strong><small>{item.count} unidades</small></span><span className="rank-bar"><i style={{ width: `${Math.max(item.count / bestSellers[0].count * 100, 10)}%` }} /></span></div>)}</div> : <div className="mini-empty">Los productos más vendidos aparecerán aquí cuando registres ventas.</div>}<div className="best-footer"><span><ArrowUpRight size={15} /> Unidades vendidas</span><span>{bestSellers.reduce((sum, item) => sum + item.count, 0)}</span></div></section></div>
    <section className="welcome-strip"><span className="welcome-icon"><Tag size={19} /></span><div><strong>Prepara tu catálogo público</strong><p>Activa tus productos y comparte tu catálogo cuando quieras.</p></div><span className="welcome-progress"><i style={{ width: products.length ? '70%' : '20%' }} /></span><span className="welcome-step">{products.length ? 'Un buen comienzo' : 'Paso 1 de 3'}</span></section>
  </>;
}

function StatCard({ label, value, icon: Icon, hint, trend }: { label: string; value: string; icon: typeof BarChart3; hint: string; trend?: string }) {
  return <article className="stat-card"><div className="stat-card-top"><span>{label}</span><span className="stat-icon"><Icon size={18} /></span></div><strong className="stat-value">{value}</strong><div className="stat-foot"><span>{hint}</span>{trend && <span className={`trend ${trend.startsWith('-')?'negative':''}`}><ArrowUpRight size={13} />{trend}</span>}</div></article>;
}

function ProductsPage({ products, categories, currencySymbol, query, setQuery, onAdd, onEdit, onToggle }: { products: Product[]; categories: Category[]; currencySymbol:string; query:string; setQuery:(v:string)=>void; onAdd:()=>void; onEdit:(p:Product)=>void; onToggle:(p:Product)=>void }) {
  const categoryNames = new Map(categories.map((category) => [category.id, category.name]));
  return <><PageHeading eyebrow="TU CATÁLOGO" title="Productos" description="Organiza lo que vendes y mantén tus precios al día." action={<button className="button button-primary" onClick={onAdd}><Plus size={16} /> Agregar producto</button>} />
    <section className="panel table-panel"><div className="table-toolbar"><div className="search-box"><Search size={16} /><input placeholder="Buscar producto…" value={query} onChange={(e)=>setQuery(e.target.value)} /></div><span className="item-count">{products.length} productos</span></div>
    {products.length ? <div className="table-scroll"><table><thead><tr><th>PRODUCTO</th><th>CATEGORÍA</th><th>PRECIO</th><th>PROMOCIÓN</th><th>ESTADO</th><th></th></tr></thead><tbody>{products.map((p)=> <tr key={p.id}><td><div className="table-product"><span className="product-mini">{p.image_url ? <img src={p.image_url} alt="" /> : <ShoppingBag size={16}/>}</span><span><strong>{p.name}</strong><small>{p.description || 'Sin descripción'}</small></span></div></td><td>{(p.category_id && categoryNames.get(p.category_id)) || <span className="subtle-text">Sin categoría</span>}</td><td><div className="price-cell">{p.promotion_enabled && <s>{formatMoney(p.regular_price,currencySymbol)}</s>}<strong>{formatMoney(priceFor(p),currencySymbol)}</strong></div></td><td>{p.promotion_enabled ? <span className="status-pill promo"><Tag size={13}/> Activa</span> : <span className="subtle-text">Sin promoción</span>}</td><td><button className={`status-toggle ${p.is_active?'on':''}`} onClick={()=>onToggle(p)}><i />{p.is_active?'Activo':'Inactivo'}</button></td><td><button className="icon-button table-edit" onClick={()=>onEdit(p)} aria-label={`Editar ${p.name}`}><Settings2 size={16}/></button></td></tr>)}</tbody></table></div> : <div className="empty-state"><span className="empty-icon"><Package size={24}/></span><strong>{query?'No encontramos ese producto':'Tu catálogo empieza aquí'}</strong><p>{query?'Prueba con otro nombre.':'Agrega tus productos y configura el precio que quieres ofrecer.'}</p>{!query && <button className="button button-primary" onClick={onAdd}><Plus size={15}/> Agregar primer producto</button>}</div>}</section>
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

function SalePage({ products, categories, currencySymbol, query, setQuery, cart, addToCart, changeQuantity, total, onFinalize }: { products:Product[]; categories:Category[]; currencySymbol:string; query:string; setQuery:(v:string)=>void; cart:CartRow[]; addToCart:(p:Product)=>void; changeQuantity:(id:string,d:number)=>void; total:number; onFinalize:()=>void }) {
  const [selectedCategory,setSelectedCategory]=useState('all');
  const [showCategoryFilters,setShowCategoryFilters]=useState(false);
  const [mobilePanel,setMobilePanel]=useState<'catalog'|'order'>('catalog');
  const categoryNames = new Map(categories.map((category) => [category.id, category.name]));
  const categoryOptions = categories.filter((category)=>products.some((product)=>product.category_id===category.id));
  const visibleProducts=products.filter((product)=>{
    const matchesCategory=selectedCategory==='all'||product.category_id===selectedCategory||(selectedCategory==='uncategorized'&&!product.category_id);
    const matchesQuery=`${product.name} ${product.description||''}`.toLocaleLowerCase('es').includes(query.trim().toLocaleLowerCase('es'));
    return matchesCategory&&matchesQuery;
  });
  const itemCount=cart.reduce((count,row)=>count+row.quantity,0);
  const selectCategory=(categoryId:string)=>{setSelectedCategory(categoryId);setShowCategoryFilters(false);};
  return <div className="pos-page">
    <div className="pos-page-heading"><PageHeading eyebrow="PUNTO DE VENTA" title="Nueva venta" description="Selecciona productos y confirma la venta." /></div>
    <div className="pos-mobile-tabs"><button className={mobilePanel==='catalog'?'active':''} onClick={()=>setMobilePanel('catalog')}><ShoppingBag size={15}/> Catálogo</button><button className={mobilePanel==='order'?'active':''} onClick={()=>setMobilePanel('order')}><ShoppingCart size={15}/> Tu venta{itemCount>0&&<span>{itemCount}</span>}</button></div>
    <div className="pos-layout">
      <section className={`pos-products ${mobilePanel==='order'?'mobile-hidden':''}`}>
        <div className="pos-catalog-toolbar"><div className="search-box product-search"><Search size={16}/><input placeholder="Buscar productos activos…" value={query} onChange={(e)=>setQuery(e.target.value)}/>{query&&<button type="button" className="pos-clear-search" onClick={()=>setQuery('')} aria-label="Limpiar búsqueda"><X size={14}/></button>}</div><button type="button" className={`pos-filter-button ${showCategoryFilters||selectedCategory!=='all'?'active':''}`} onClick={()=>setShowCategoryFilters((shown)=>!shown)}><Tag size={15}/><span>{selectedCategory==='all'?'Categoría':selectedCategory==='uncategorized'?'Sin categoría':categoryNames.get(selectedCategory)||'Categoría'}</span><ChevronDown size={14}/></button></div>
        {showCategoryFilters&&<div className="pos-category-filters"><button className={selectedCategory==='all'?'active':''} onClick={()=>selectCategory('all')}>Todos los productos <small>{products.length}</small></button>{categoryOptions.map((category)=><button key={category.id} className={selectedCategory===category.id?'active':''} onClick={()=>selectCategory(category.id)}>{category.name}<small>{products.filter((product)=>product.category_id===category.id).length}</small></button>)}{products.some((product)=>!product.category_id)&&<button className={selectedCategory==='uncategorized'?'active':''} onClick={()=>selectCategory('uncategorized')}>Sin categoría <small>{products.filter((product)=>!product.category_id).length}</small></button>}</div>}
        <div className="pos-product-scroll">{visibleProducts.length>0?<div className="pos-product-grid">{visibleProducts.map((product)=><button key={product.id} className="pos-product-card" onClick={()=>addToCart(product)}><span className="product-placeholder">{product.image_url?<img src={product.image_url} alt={product.name} loading="lazy"/>:<ShoppingBag size={23}/>}</span><span className="pos-product-info"><strong>{product.name}</strong>{product.promotion_enabled&&<s>{formatMoney(product.regular_price,currencySymbol)}</s>}<b>{formatMoney(priceFor(product),currencySymbol)}</b></span><span className="add-circle"><Plus size={16}/></span></button>)}</div>:<div className="pos-empty"><span className="empty-icon"><Package size={23}/></span><strong>{products.length?'No hay productos con esos filtros':'No hay productos activos'}</strong><p>{products.length?'Cambia la categoría o la búsqueda.':'Activa productos para que aparezcan aquí.'}</p>{products.length>0&&(selectedCategory!=='all'||query)&&<button className="text-link" onClick={()=>{selectCategory('all');setQuery('');}}>Mostrar todos</button>}</div>}</div>
      </section>
      <aside className={`cart-panel ${mobilePanel==='catalog'?'mobile-hidden':''}`}><div className="cart-heading"><span className="cart-icon"><ShoppingCart size={18}/></span><div><h2>Tu venta</h2><p>{itemCount} artículos</p></div><span className="cart-count">{cart.length}</span></div><div className="cart-items">{cart.map(({product,quantity})=><div className="cart-row" key={product.id}><div className="cart-product"><strong>{product.name}</strong><small>{formatMoney(priceFor(product),currencySymbol)} c/u</small></div><div className="quantity-control"><button onClick={()=>changeQuantity(product.id,-1)} aria-label="Restar una unidad">−</button><span>{quantity}</span><button onClick={()=>changeQuantity(product.id,1)} aria-label="Agregar una unidad">+</button></div><strong className="cart-line-total">{formatMoney(priceFor(product)*quantity,currencySymbol)}</strong></div>)}{!cart.length&&<div className="cart-empty"><span><ShoppingCart size={23}/></span><strong>Tu venta está vacía</strong><small>Selecciona productos para comenzar.</small></div>}</div><div className="cart-summary"><div><span>Subtotal</span><span>{formatMoney(total,currencySymbol)}</span></div><div className="cart-total"><strong>Total</strong><strong>{formatMoney(total,currencySymbol)}</strong></div><button disabled={!cart.length} className="button button-primary button-full" onClick={onFinalize}>Confirmar venta <ArrowUpRight size={16}/></button><small><Check size={13}/> Los precios se guardan al confirmar</small></div></aside>
    </div>
    {cart.length>0&&mobilePanel==='catalog'&&<button className="mobile-cart-dock" onClick={()=>setMobilePanel('order')}><span className="mobile-cart-dock-count">{itemCount}</span><span><small>Total de la venta</small><strong>{formatMoney(total,currencySymbol)}</strong></span><b>Ver pedido <ChevronDown size={16}/></b></button>}
  </div>;
}

function HistoryPage({ sales, currencySymbol, onReceipt }: { sales:Sale[]; currencySymbol:string; onReceipt:(sale:Sale)=>void }) {
  return <><PageHeading eyebrow="MOVIMIENTOS" title="Ventas" description="Consulta tus ventas y vuelve a imprimir un comprobante." />
    <section className="panel table-panel"><div className="table-toolbar"><div><strong className="table-title">Historial de ventas</strong><p>Las ventas guardan los precios aplicados al momento de confirmar.</p></div><span className="item-count">{sales.length} recientes</span></div>
    {sales.length ? <div className="table-scroll"><table><thead><tr><th>VENTA</th><th>FECHA</th><th>ARTÍCULOS</th><th>TOTAL</th><th></th></tr></thead><tbody>{sales.map((sale)=><tr key={sale.id}><td><div className="sale-number"><span className="sale-mini"><ShoppingBag size={15}/></span><strong>#{String(sale.sale_number).padStart(5,'0')}</strong></div></td><td>{formatDate(sale.sold_at)}</td><td>{(sale.sale_items||[]).reduce((n,item)=>n+item.quantity,0)} unidades</td><td><strong>{formatMoney(Number(sale.total_amount),currencySymbol)}</strong></td><td><button className="button button-small button-outline" onClick={()=>onReceipt(sale)}><Printer size={14}/> Comprobante</button></td></tr>)}</tbody></table></div> : <div className="empty-state"><span className="empty-icon"><ClipboardList size={23}/></span><strong>Las ventas aparecerán aquí</strong><p>Registra tu primera venta para empezar tu historial.</p></div>}</section>
  </>;
}

function BrandPage({ business, onSaved, setError }: { business:Business; onSaved:(b:Business)=>void; setError:(v:string)=>void }) {
  const [form,setForm]=useState({name:business.name,currency_symbol:business.currency_symbol||'C$',primary_color:business.primary_color,secondary_color:business.secondary_color,address:business.address||'',phone:business.phone||''});
  const [saving,setSaving]=useState(false);
  const save=async(e:FormEvent)=>{e.preventDefault();if(!neon)return;const values={...form,currency_symbol:form.currency_symbol.trim()};if(!values.currency_symbol){setError('Escribe el símbolo o texto de la moneda.');return;}setSaving(true);setError('');const {data,error}=await neon.from('businesses').update(values).eq('id',business.id).select().single();if(error)setError(error.message);else onSaved(data as Business);setSaving(false);};
  const catalogUrl=`${window.location.origin}/catalogo/${business.public_slug}`;
  return <><PageHeading eyebrow="IDENTIDAD DE TU NEGOCIO" title="Mi negocio" description="Elige cómo se verá tu marca en la app y el catálogo público." />
    <div className="brand-layout"><form className="panel brand-form" onSubmit={save}><div className="panel-heading"><div><h2>Información del negocio</h2><p>Estos datos se muestran en tus documentos y catálogo.</p></div><span className="icon-surface"><Store size={16}/></span></div><label>Nombre del negocio<input required maxLength={80} value={form.name} onChange={(e)=>setForm({...form,name:e.target.value})}/></label><label>Símbolo o texto de moneda<input required maxLength={16} value={form.currency_symbol} onChange={(e)=>setForm({...form,currency_symbol:e.target.value})} placeholder="Ej. C$, $, US$ o MXN"/></label><p className="currency-note">Escribe cómo quieres mostrar tus precios. Esto no convierte los valores guardados.</p><div className="form-two"><label>Color principal<div className="color-field"><input type="color" value={form.primary_color} onChange={(e)=>setForm({...form,primary_color:e.target.value})}/><span>{form.primary_color.toUpperCase()}</span></div></label><label>Color secundario<div className="color-field"><input type="color" value={form.secondary_color} onChange={(e)=>setForm({...form,secondary_color:e.target.value})}/><span>{form.secondary_color.toUpperCase()}</span></div></label></div><label>Dirección <span className="optional">OPCIONAL</span><input maxLength={180} value={form.address} onChange={(e)=>setForm({...form,address:e.target.value})} placeholder="Dirección de tu negocio"/></label><label>Teléfono <span className="optional">OPCIONAL</span><input maxLength={30} value={form.phone} onChange={(e)=>setForm({...form,phone:e.target.value})} placeholder="+505 0000 0000"/></label><div className="brand-form-footer"><span><Check size={14}/> Se aplicará a catálogo y comprobantes</span><button className="button button-primary" disabled={saving}>{saving?'Guardando…':'Guardar cambios'}</button></div></form>
    <aside className="brand-side"><section className="panel brand-preview"><div className="preview-label"><span className="green-dot"/> VISTA PREVIA DEL CATÁLOGO</div><div className="preview-banner" style={{background:form.primary_color}}><span className="preview-brand-icon"><Store size={18}/></span><strong>{form.name||'Tu negocio'}</strong><small>Catálogo de productos</small></div><div className="preview-body"><div className="preview-product"><span><ShoppingBag size={17}/></span><div><b>Producto de ejemplo</b><small>Descripción de tu producto</small></div><strong>{formatMoney(250,form.currency_symbol)}</strong></div><div className="preview-product"><span><ShoppingBag size={17}/></span><div><b>Otro producto</b><small>Disponible para tu catálogo</small></div><strong>{formatMoney(180,form.currency_symbol)}</strong></div></div></section><section className="panel share-panel"><span className="share-icon"><ExternalLink size={17}/></span><div><strong>Tu catálogo público</strong><p>Comparte el enlace con tus clientes.</p></div><div className="share-url"><input readOnly value={catalogUrl}/><button onClick={()=>{void navigator.clipboard.writeText(catalogUrl);}} title="Copiar enlace"><ClipboardList size={15}/></button></div><a className="text-link" href={catalogUrl} target="_blank" rel="noreferrer">Abrir catálogo <ArrowUpRight size={14}/></a></section></aside></div>
  </>;
}

function ProductModal({ businessId, product, categories, onAddCategory, onClose, onSaved, setError }: { businessId:string; product:Product|null; categories:Category[]; onAddCategory:(name:string)=>Promise<Category|null>; onClose:()=>void; onSaved:()=>void; setError:(v:string)=>void }) {
  const [name,setName]=useState(product?.name||'');
  const [description,setDescription]=useState(product?.description||'');
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
      const payload={business_id:businessId,category_id:categoryId||null,name:name.trim(),description:description.trim()||null,image_url:nextImageUrl||null,regular_price:regularNumber,promotional_price:promoPrice?promoNumber:null,promotion_enabled:promo,is_active:active};
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
    <div className="product-category-field"><label>Categoría<select value={categoryId} onChange={(e)=>setCategoryId(e.target.value)}><option value="">Sin categoría</option>{categories.map((category)=><option key={category.id} value={category.id}>{category.name}</option>)}</select></label><button type="button" className="text-link quick-category-toggle" onClick={()=>setShowNewCategory((shown)=>!shown)}><Plus size={14}/> Crear categoría</button>{showNewCategory&&<div className="quick-category-form"><input autoFocus maxLength={60} value={newCategoryName} onChange={(e)=>setNewCategoryName(e.target.value)} onKeyDown={(e)=>{if(e.key==='Enter'){e.preventDefault();void createCategory();}}} placeholder="Nombre de categoría"/><button type="button" className="button button-small button-primary" disabled={categoryBusy||!newCategoryName.trim()} onClick={()=>void createCategory()}>{categoryBusy?'Creando…':'Crear'}</button></div>}</div>
    <div className="product-image-field"><span className="field-label">Imagen <span className="optional">OPCIONAL</span></span><div className="product-image-controls"><div className="product-image-preview">{imagePreview?<img src={imagePreview} alt="Vista previa del producto"/>:<ImagePlus size={23}/>}</div><div><label className="button button-outline image-select">{imageFile||imageUrl?'Cambiar imagen':'Elegir imagen'}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e)=>selectImage(e.target.files?.[0]||null)}/></label>{imagePreview&&<button type="button" className="text-link image-remove" onClick={()=>selectImage(null)}>Quitar imagen</button>}<small>JPG, PNG o WebP · máximo 5 MB</small></div></div></div>
    <div className="form-two"><label>Precio normal<div className="price-input-wrap"><input required type="number" min="0.01" step="any" value={regular} onChange={(e)=>setRegular(e.target.value)} placeholder="0.00"/><span className="price-stepper"><button type="button" aria-label="Aumentar precio normal en 10" onClick={()=>adjustPrice(regular,setRegular,10)}>▲</button><button type="button" aria-label="Disminuir precio normal en 10" disabled={!regular||Number(regular)<=10} onClick={()=>adjustPrice(regular,setRegular,-10)}>▼</button></span></div></label><label>Precio promocional<div className="price-input-wrap"><input type="number" min="0.01" step="any" value={promoPrice} onChange={(e)=>setPromoPrice(e.target.value)} placeholder="Sin promoción" disabled={!promo}/><span className="price-stepper"><button type="button" aria-label="Aumentar precio promocional en 10" disabled={!promo} onClick={()=>adjustPrice(promoPrice,setPromoPrice,10)}>▲</button><button type="button" aria-label="Disminuir precio promocional en 10" disabled={!promo||!promoPrice||Number(promoPrice)<=10} onClick={()=>adjustPrice(promoPrice,setPromoPrice,-10)}>▼</button></span></div></label></div>
    <div className="setting-row"><span><strong>Promoción activa</strong><small>Usar el precio promocional hasta que la desactives.</small></span><button type="button" role="switch" aria-checked={promo} className={`switch ${promo?'checked':''}`} onClick={()=>setPromo(!promo)}><i/></button></div>
    <div className="setting-row"><span><strong>Producto activo</strong><small>Disponible en venta y catálogo público.</small></span><button type="button" role="switch" aria-checked={active} className={`switch ${active?'checked':''}`} onClick={()=>setActive(!active)}><i/></button></div>
    <div className="modal-actions"><button type="button" className="button button-outline" onClick={onClose}>Cerrar</button><button className="button button-primary" disabled={saving||saveTimedOut}>{saving?saveStatus:saveTimedOut?'Verifica Productos':product?'Guardar cambios':'Agregar producto'}</button></div>
  </form></div>;
}

function ReceiptModal({ sale, business, onClose }: { sale:Sale; business:Business; onClose:()=>void }) {
  const items=sale.sale_items||[];
  const currencySymbol=business.currency_symbol||'C$';
  return <div className="modal-backdrop" onMouseDown={(e)=>e.target===e.currentTarget&&onClose()}><div className="modal-card receipt-modal"><div className="modal-heading no-print"><div><span className="eyebrow">COMPROBANTE DE VENTA</span><h2>Venta #{String(sale.sale_number).padStart(5,'0')}</h2></div><button className="icon-button" onClick={onClose}><X size={19}/></button></div><div className="receipt-paper" id="print-receipt"><div className="receipt-brand"><span className="brand-mark"><Store size={17}/></span><strong>{business.name}</strong>{business.address&&<small>{business.address}</small>}{business.phone&&<small>{business.phone}</small>}</div><div className="receipt-meta"><span>Comprobante #{String(sale.sale_number).padStart(5,'0')}</span><span>{formatDate(sale.sold_at)}</span></div><div className="receipt-lines">{items.map((item)=><div className="receipt-line" key={item.id}><span>{item.quantity} × {item.product_name}{item.promotion_applied&&<small>Promoción aplicada</small>}</span><strong>{formatMoney(Number(item.line_total),currencySymbol)}</strong></div>)}</div><div className="receipt-total"><span>Total</span><strong>{formatMoney(Number(sale.total_amount),currencySymbol)}</strong></div><p className="receipt-thanks">¡Gracias por tu compra!</p></div><div className="modal-actions no-print"><button className="button button-outline" onClick={onClose}>Cerrar</button><button className="button button-primary" onClick={()=>window.print()}><Printer size={15}/> Imprimir / Guardar PDF</button></div></div></div>;
}
