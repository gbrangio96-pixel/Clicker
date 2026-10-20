'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Aperture, ArrowLeft, ArrowRight, ArrowUpRight, Barcode, CalendarDays, Camera, Check, CheckCircle2, CreditCard, Download, Info, LoaderCircle, MapPin, Maximize2, QrCode, Search, ShieldCheck, ShoppingBag, X } from 'lucide-react';
import type { Catalog, CheckoutResult, Download as PhotoDownload, EventDetail, Order, PaymentMethod, Photo, PhotoEvent } from '@/lib/types';
import { formatDate, formatMoney } from '@/lib/types';
import s from './storefront.module.css';

const paymentMethods: { id: PaymentMethod; title: string; detail: string; icon: typeof QrCode }[] = [
  { id: 'pix', title: 'Pix', detail: 'Confirmação de teste', icon: QrCode },
  { id: 'credit', title: 'Crédito', detail: 'Sem informar cartão', icon: CreditCard },
  { id: 'debit', title: 'Débito', detail: 'Sem informar cartão', icon: CreditCard },
  { id: 'boleto', title: 'Boleto', detail: 'Sem emissão de cobrança', icon: Barcode },
];

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Não foi possível concluir a solicitação.');
  return body;
}

function EventCard({ event, featured = false }: { event: PhotoEvent; featured?: boolean }) {
  return <Link href={`/eventos/${event.id}`} className={`${s.eventCard} ${featured ? s.featured : ''}`}>
    <div className={s.eventImage}>
      <img src={event.coverUrl || '/demo/trail.jpg'} alt={event.title} />
      <span className={s.category}>{event.category || 'Fotografia'}</span>
      <span className={s.cardArrow}><ArrowUpRight size={21} /></span>
      {featured && <div className={s.featuredCopy}><span>UM MOMENTO. MUITAS HISTÓRIAS.</span><h2>{event.title}</h2><p><MapPin size={15} />{event.location || 'Explore este evento'}<span className={s.dot}>·</span>{formatDate(event.date)}</p></div>}
    </div>
    {!featured && <div className={s.eventInfo}><div><h3>{event.title}</h3><p>{event.location} <span>·</span> {formatDate(event.date)}</p></div><span>{event.photoCount} fotos</span></div>}
    {featured && <div className={s.featuredFooter}><span>{event.photoCount} fotografias para guardar</span><strong>Encontrar minhas fotos <ArrowRight size={17} /></strong></div>}
  </Link>;
}

export default function Storefront({ eventId }: { eventId?: string }) {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [detail, setDetail] = useState<EventDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [zoom, setZoom] = useState<Photo | null>(null);
  const [checkout, setCheckout] = useState(false);
  const [buyerName, setBuyerName] = useState('');
  const [buyerEmail, setBuyerEmail] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('pix');
  const [busy, setBusy] = useState(false);
  const [checkoutError, setCheckoutError] = useState('');
  const [purchase, setPurchase] = useState<CheckoutResult | null>(null);
  const [downloads, setDownloads] = useState<PhotoDownload[]>([]);
  const [recoverable, setRecoverable] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const dialogOpen = checkout || !!zoom;

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const [nextCatalog, nextDetail] = await Promise.all([
          request<Catalog>('/api/catalog', { signal: controller.signal }),
          eventId ? request<EventDetail>(`/api/events/${encodeURIComponent(eventId)}?public=1`, { signal: controller.signal }) : Promise.resolve(null),
        ]);
        setCatalog(nextCatalog);
        setDetail(nextDetail);
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Não foi possível carregar a loja.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    if (eventId) {
      try { setRecoverable(!!localStorage.getItem(`clicker:last-order:${eventId}`)); } catch { /* Browsers can disable local storage. */ }
    }
    return () => controller.abort();
  }, [eventId]);

  useEffect(() => {
    if (!dialogOpen) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.focus();
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) { setCheckout(false); setZoom(null); }
      if (event.key === 'Tab' && dialogRef.current) {
        const elements = dialogRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input, [tabindex="0"]');
        const first = elements[0]; const last = elements[elements.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', close);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', close); previousFocus?.focus(); };
  }, [dialogOpen, busy]);

  const photos = detail?.photos || [];
  const event = detail?.event;
  const allSelected = photos.length > 0 && selected.length === photos.length;
  const subtotal = (event?.priceCents || 0) * selected.length;
  const packageAvailable = allSelected && event?.packagePriceCents != null && event.packagePriceCents < subtotal;
  const total = packageAvailable ? event!.packagePriceCents! : subtotal;
  const filteredPhotos = photos.filter(photo => photo.title.toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR')));
  const filteredEvents = (catalog?.events || []).filter(item => `${item.title} ${item.location} ${item.category}`.toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR')));

  function togglePhoto(id: string) { setSelected(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]); }
  function openCheckout() { setPurchase(null); setDownloads([]); setCheckoutError(''); setCheckout(true); }

  async function createOrder(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    if (!event || selected.length === 0) return;
    setBusy(true); setCheckoutError('');
    try {
      const result = await request<CheckoutResult>('/api/orders', { method: 'POST', body: JSON.stringify({ eventId: event.id, photoIds: selected, buyerName: buyerName.trim(), buyerEmail: buyerEmail.trim(), paymentMethod: method }) });
      setPurchase(result);
      try { localStorage.setItem(`clicker:last-order:${event.id}`, JSON.stringify({ id: result.order.id, accessToken: result.accessToken })); setRecoverable(true); } catch { /* The current session remains usable without storage. */ }
    } catch (cause) { setCheckoutError(cause instanceof Error ? cause.message : 'Não foi possível criar o pedido.'); }
    finally { setBusy(false); }
  }

  async function confirmPayment() {
    if (!purchase) return;
    setBusy(true); setCheckoutError('');
    try {
      const result = await request<{ order: Order; downloads: PhotoDownload[] }>(`/api/orders/${purchase.order.id}/confirm`, { method: 'POST', body: JSON.stringify({ accessToken: purchase.accessToken }) });
      setPurchase({ order: result.order, accessToken: purchase.accessToken }); setDownloads(result.downloads);
    } catch (cause) { setCheckoutError(cause instanceof Error ? cause.message : 'Não foi possível confirmar o pagamento de teste.'); }
    finally { setBusy(false); }
  }

  async function recoverOrder() {
    if (!eventId) return;
    setCheckout(true); setBusy(true); setCheckoutError(''); setPurchase(null); setDownloads([]);
    try {
      const saved = localStorage.getItem(`clicker:last-order:${eventId}`);
      if (!saved) throw new Error('Nenhum pedido salvo neste navegador.');
      const record = JSON.parse(saved) as { id: string; accessToken: string };
      const result = await request<{ order: Order; downloads: PhotoDownload[] }>(`/api/orders/${encodeURIComponent(record.id)}?token=${encodeURIComponent(record.accessToken)}`);
      setPurchase({ order: result.order, accessToken: record.accessToken }); setDownloads(result.downloads || []);
    } catch (cause) { setCheckoutError(cause instanceof Error ? cause.message : 'Não foi possível recuperar o pedido.'); }
    finally { setBusy(false); }
  }

  return <div className={s.root}>
    <div className={s.demoBar}><span className={s.demoDot} /> Ambiente de teste <span className={s.demoSeparator}>·</span> Pagamentos simulados, sem cobranças reais</div>
    <header className={s.header}><Link href="/loja" className={s.logo} aria-label="Clicker, início da loja"><Aperture size={30} strokeWidth={1.8} />clicker<span aria-hidden="true" style={{ color: "var(--accent)" }}>●</span></Link><nav><Link className={s.navLink} href="/loja">Explorar eventos</Link><Link className={s.panelLink} href="/">Painel do fotógrafo <ArrowUpRight size={16} /></Link></nav></header>

    {loading ? <main className={s.loading}><LoaderCircle className={s.spin} size={30} /><h1>Preparando boas lembranças…</h1><p>Carregando a galeria do fotógrafo.</p></main> : error ? <main className={s.empty}><Camera size={36} /><h1>Esta galeria não está disponível</h1><p role="alert">{error}</p><Link href="/loja" className={s.primary}>Voltar para a loja <ArrowRight size={17} /></Link>{eventId && recoverable && <button className={s.recoverButton} type="button" onClick={() => void recoverOrder()}><ShoppingBag size={16} /> Retomar último pedido de teste neste navegador</button>}</main> : <main className={`${s.main} ${event ? s.galleryMain : ''}`}>
      {!event && <>
        <section className={s.intro}><span className={s.eyebrow}><span /> A LOJA DE {catalog?.photographer.name.toLocaleUpperCase('pt-BR')}</span><h1>Momentos passam.<br />As <em>fotografias</em> ficam.</h1><p>{catalog?.photographer.bio || 'Encontre seu evento, escolha suas fotos favoritas e guarde o que vale a pena reviver.'}</p><div className={s.author}><div className={s.avatar}>{catalog?.photographer.name.split(' ').map(part => part[0]).slice(0, 2).join('')}</div><div><strong>{catalog?.photographer.studioName}</strong><span>Fotografia com identidade. Do clique à sua história.</span></div></div><Aperture className={s.introDecoration} strokeWidth={.6} aria-hidden="true" /></section>
        {catalog?.events[0] && <EventCard event={catalog.events[0]} featured />}
        <section className={s.eventsSection}><div className={s.sectionHeading}><div><span className={s.eyebrow}>ENCONTRE SUA HISTÓRIA</span><h2>Explore os eventos<span className={s.count}>{catalog?.events.length || 0}</span></h2></div><label className={s.search}><Search size={18} /><span className={s.srOnly}>Buscar eventos</span><input placeholder="Buscar evento, cidade…" value={query} onChange={input => setQuery(input.target.value)} /></label></div><div className={s.eventGrid}>{filteredEvents.map(item => <EventCard key={item.id} event={item} />)}</div>{filteredEvents.length === 0 && <div className={s.emptyInline}><Camera size={28} /><h3>{query ? 'Nenhum evento encontrado' : 'As próximas histórias estão chegando'}</h3><p>{query ? 'Tente outro nome, cidade ou categoria.' : 'Os eventos publicados pelo fotógrafo aparecerão aqui.'}</p></div>}</section>
      </>}

      {event && <>
        <Link className={s.backLink} href="/loja"><ArrowLeft size={16} /> Todos os eventos</Link>
        <section className={s.galleryHero}><img className={s.galleryCover} src={event.coverUrl || '/demo/trail.jpg'} alt="" /><div className={s.heroOverlay} /><div className={s.galleryHeroCopy}><span className={s.heroCategory}>{event.category || 'Fotografia'}</span><h1>{event.title}</h1><div className={s.heroMeta}><span><MapPin size={16} />{event.location || 'Local não informado'}</span><span><CalendarDays size={16} />{formatDate(event.date)}</span><span><Camera size={16} />{photos.length} fotos</span></div></div><div className={s.heroSignature}><Aperture size={20} /><span>POR {catalog?.photographer.name.toLocaleUpperCase('pt-BR')}</span></div></section>
        <section className={s.galleryDescription}><div><span className={s.eyebrow}>SUAS MELHORES LEMBRANÇAS</span><h2>Encontre o seu momento.</h2><p>{event.description || 'Selecione suas fotografias favoritas. Após a compra de teste, baixe os arquivos disponíveis nesta demonstração.'}</p></div><div className={s.priceTag}><span>Fotos a partir de</span><strong>{formatMoney(event.priceCents)}</strong><small>por fotografia</small></div></section>
        <div className={s.galleryToolbar}><label className={s.search}><Search size={18} /><span className={s.srOnly}>Buscar foto pelo nome</span><input placeholder="Buscar pelo nome do arquivo…" value={query} onChange={input => setQuery(input.target.value)} /></label><div className={s.selectionActions}><span>{photos.length} fotografias</span>{photos.length > 0 && <button type="button" onClick={() => setSelected(allSelected ? [] : photos.map(photo => photo.id))}>{allSelected ? 'Limpar seleção' : 'Selecionar todas'}</button>}</div></div>
        {event.packagePriceCents != null && photos.length > 0 && <div className={s.packageBanner}><div><ShoppingBag size={21} /><p><strong>Mais momentos, em um só pacote.</strong><span> Todas as {photos.length} fotos por {formatMoney(Math.min(event.packagePriceCents, event.priceCents * photos.length))}.</span></p></div><button type="button" onClick={() => setSelected(photos.map(photo => photo.id))}>{allSelected ? <><Check size={16} /> Pacote selecionado</> : <>Escolher pacote <ArrowRight size={16} /></>}</button></div>}
        <div className={s.photoGrid}>{filteredPhotos.map((photo, index) => <article key={photo.id} className={`${s.photoCard} ${selected.includes(photo.id) ? s.photoSelected : ''}`}><div className={s.photoImage}><button type="button" className={s.photoSelect} onClick={() => togglePhoto(photo.id)} aria-label={`${selected.includes(photo.id) ? 'Desmarcar' : 'Selecionar'} ${photo.title}`} aria-pressed={selected.includes(photo.id)}><img src={photo.previewUrl} alt={photo.title} loading={index < 4 ? 'eager' : 'lazy'} /><span className={s.selectCheck}>{selected.includes(photo.id) && <Check size={17} />}</span></button><button type="button" className={s.zoomButton} aria-label={`Ampliar ${photo.title}`} onClick={() => setZoom(photo)}><Maximize2 size={17} /></button></div><div className={s.photoInfo}><span title={photo.title}>{photo.title}</span><strong>{formatMoney(event.priceCents)}</strong></div></article>)}</div>
        {filteredPhotos.length === 0 && <div className={s.emptyInline}><Camera size={32} /><h3>{query ? 'Nenhuma foto com esse nome' : 'Este álbum está sendo preparado'}</h3><p>{query ? 'Tente outro termo ou limpe a busca.' : 'Volte em breve para encontrar suas fotos.'}</p></div>}
        <div className={s.galleryNote}><ShieldCheck size={17} /><p>As prévias possuem marca-d’água. Os arquivos disponibilizados na compra são entregues sem a marca aplicada pela plataforma.</p></div>
        {recoverable && <button className={s.recoverButton} type="button" onClick={() => void recoverOrder()}><ShoppingBag size={16} /> Retomar último pedido de teste neste navegador</button>}
      </>}
    </main>}

    <footer className={s.footer}><div><Aperture size={22} /><strong>clicker</strong><span>Sua fotografia, suas regras.</span></div><p>Protótipo local sem autenticação. Use apenas fotos e dados de teste.<br /><Link href="/creditos" style={{ textDecoration: "underline", textUnderlineOffset: "3px" }}>Créditos das fotos de demonstração</Link></p><Link href="/">Sou fotógrafo <ArrowUpRight size={15} /></Link></footer>

    {event && selected.length > 0 && !checkout && <aside className={s.cartBar} aria-label="Resumo da seleção"><div className={s.cartIcon}><ShoppingBag size={22} /><span>{selected.length}</span></div><div className={s.cartText}><strong>{selected.length} {selected.length === 1 ? 'foto selecionada' : 'fotos selecionadas'}</strong><span>{packageAvailable ? 'Desconto do pacote aplicado' : 'Prontas para fazer parte da sua história'}</span></div><div className={s.cartTotal}><small>Total da seleção</small><strong>{formatMoney(total)}</strong></div><button className={s.primary} type="button" onClick={openCheckout}>Continuar <ArrowRight size={18} /></button></aside>}

    {zoom && <div className={s.backdrop} onClick={input => { if (input.target === input.currentTarget) setZoom(null); }}><div className={`${s.dialog} ${s.zoomDialog}`} role="dialog" aria-modal="true" aria-labelledby="zoom-title" tabIndex={-1} ref={dialogRef}><button className={s.close} type="button" aria-label="Fechar visualização" onClick={() => setZoom(null)}><X size={21} /></button><img src={zoom.previewUrl} alt={zoom.title} /><div className={s.zoomFooter}><div><h2 id="zoom-title">{zoom.title}</h2><span>Prévia protegida · {formatMoney(event?.priceCents || 0)}</span></div><button className={selected.includes(zoom.id) ? s.secondary : s.primary} type="button" onClick={() => togglePhoto(zoom.id)}>{selected.includes(zoom.id) ? <><Check size={17} /> Selecionada</> : <><ShoppingBag size={17} /> Selecionar foto</>}</button></div></div></div>}

    {checkout && <div className={s.backdrop} onClick={input => { if (input.target === input.currentTarget && !busy) setCheckout(false); }}><div className={s.dialog} role="dialog" aria-modal="true" aria-labelledby="checkout-title" tabIndex={-1} ref={dialogRef}>
      <button className={s.close} type="button" aria-label="Fechar checkout" disabled={busy} onClick={() => setCheckout(false)}><X size={21} /></button>
      <div className={s.checkoutBrand}><Aperture size={23} /> clicker <span>CHECKOUT DE TESTE</span></div>
      {!purchase ? <><span className={s.eyebrow}>QUASE NA SUA GALERIA</span><h2 id="checkout-title">Guarde esse momento.</h2><p className={s.checkoutSubtitle}>Seus arquivos estarão disponíveis após a confirmação simulada.</p><div className={s.testNotice}><Info size={18} /><span><strong>Compra simulada • nenhum valor será cobrado.</strong> Não informe dados bancários nem cartão real.</span></div><form onSubmit={createOrder}><div className={s.formFields}><label>Seu nome<input required name="buyerName" autoComplete="name" placeholder="Como podemos chamar você?" minLength={2} maxLength={100} value={buyerName} onChange={input => setBuyerName(input.target.value)} /></label><label>E-mail<input required type="email" name="buyerEmail" autoComplete="email" placeholder="voce@exemplo.com" maxLength={200} value={buyerEmail} onChange={input => setBuyerEmail(input.target.value)} /></label></div><fieldset className={s.paymentField}><legend>Escolha como testar o pagamento</legend><div className={s.paymentMethods}>{paymentMethods.map(payment => <label key={payment.id} className={method === payment.id ? s.paymentActive : ''}><input type="radio" name="paymentMethod" value={payment.id} checked={method === payment.id} onChange={() => setMethod(payment.id)} /><payment.icon size={22} /><strong>{payment.title}</strong><small>{payment.detail}</small><span className={s.radioDot}>{method === payment.id && <Check size={10} />}</span></label>)}</div></fieldset><div className={s.orderSummary}><div><span>{event?.title}</span><strong>{selected.length} {selected.length === 1 ? 'fotografia' : 'fotografias'}</strong></div>{packageAvailable && <p>Pacote completo <span>− {formatMoney(subtotal - total)}</span></p>}<div className={s.summaryTotal}><span>Total simulado</span><strong>{formatMoney(total)}</strong></div></div>{checkoutError && <p className={s.formError} role="alert">{checkoutError}</p>}<button className={`${s.primary} ${s.fullWidth}`} type="submit" disabled={busy || selected.length === 0}>{busy ? <><LoaderCircle className={s.spin} size={18} /> Criando pedido…</> : <>Criar pedido de teste <ArrowRight size={18} /></>}</button></form></> : purchase.order.status === 'pending' ? <><div className={s.pendingIcon}>{method === 'pix' ? <QrCode size={31} /> : <ShoppingBag size={31} />}</div><h2 id="checkout-title">Seu pedido está criado.</h2><p className={s.checkoutSubtitle}>Agora simule a confirmação do pagamento para testar a entrega das fotos.</p><div className={s.testNotice}><Info size={18} /><span><strong>Nenhuma cobrança foi emitida.</strong> Este botão confirma apenas uma compra fictícia.</span></div><div className={s.pendingDetails}><p>Pedido <strong>#{purchase.order.id.slice(0, 8).toUpperCase()}</strong></p><p>Comprador <strong>{purchase.order.buyerName}</strong></p><p>Forma de pagamento <strong>{paymentMethods.find(item => item.id === purchase.order.paymentMethod)?.title}</strong></p><p>Fotos <strong>{purchase.order.photoIds.length}</strong></p><p>Total simulado <strong>{formatMoney(purchase.order.totalCents)}</strong></p></div>{checkoutError && <p className={s.formError} role="alert">{checkoutError}</p>}<button className={`${s.primary} ${s.fullWidth}`} type="button" disabled={busy} onClick={() => void confirmPayment()}>{busy ? <><LoaderCircle className={s.spin} size={18} /> Confirmando…</> : <><CheckCircle2 size={18} /> Confirmar pagamento simulado</>}</button><p className={s.secureNote}><ShieldCheck size={14} /> Os arquivos só são liberados após esta confirmação.</p></> : <><div className={s.successIcon}><Check size={34} /></div><span className={s.eyebrow}>PRONTAS PARA REVIVER</span><h2 id="checkout-title">Suas fotos estão aqui.</h2><p className={s.checkoutSubtitle}>Pagamento de teste confirmado. Baixe os arquivos abaixo e complete a experiência.</p><div className={s.receipt}><span>Pedido #{purchase.order.id.slice(0, 8).toUpperCase()}</span><strong>{formatMoney(purchase.order.totalCents)} <small>simulados</small></strong></div><div className={s.downloadList}>{downloads.map(file => <a key={file.photoId} href={file.url} download className={s.downloadLink}><div><Camera size={18} /><span>{file.title}</span></div><Download size={19} /></a>)}</div>{downloads.length === 0 && <p className={s.formError}>Não há arquivos disponíveis neste pedido. Tente retomar o pedido nesta galeria.</p>}<p className={s.secureNote}><Info size={14} /> Links de acesso são privados. Não os compartilhe.</p><button type="button" className={`${s.secondary} ${s.fullWidth}`} onClick={() => { setCheckout(false); setSelected([]); }}>Voltar à galeria <ArrowRight size={17} /></button></>}
      {!purchase && busy && recoverable && <p className={s.secureNote}>Consultando os dados do pedido…</p>}
    </div></div>}
  </div>;
}
