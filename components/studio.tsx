'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Aperture, ArrowDownToLine, ArrowRight, ArrowUpRight, CalendarDays, Camera, Check, ChevronDown, CircleHelp, ExternalLink, FolderOpen, HardDrive, Images, LayoutDashboard, LoaderCircle, Menu, MoreHorizontal, Plus, Search, Settings2, ShoppingBag, SlidersHorizontal, Sparkles, Store, Trash2, UploadCloud, Wallet, X } from 'lucide-react';
import { formatDate, formatMoney, type EventDetail, type Photo, type PhotoEvent, type Photographer, type StudioState } from '@/lib/types';
import s from './studio.module.css';

type Tab = 'overview' | 'events' | 'orders' | 'settings';
const titles: Record<Tab, string> = { overview: 'Visão geral', events: 'Meus eventos', orders: 'Minhas vendas', settings: 'Minha loja' };

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Não foi possível concluir. Tente novamente.');
  return result as T;
}

function bytesLabel(bytes: number) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} GB`;
  return `${(bytes / 1024 ** 2).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`;
}

export default function Studio() {
  const [state, setState] = useState<StudioState | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [mobileNav, setMobileNav] = useState(false);
  const [help, setHelp] = useState(false);
  const [editing, setEditing] = useState<PhotoEvent | 'new' | null>(null);
  const [detail, setDetail] = useState<EventDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [modalError, setModalError] = useState('');
  const [profileBusy, setProfileBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const openDialog = editing ? 'event' : help ? 'help' : null;

  const refresh = useCallback(async () => {
    const data = await api<StudioState>('/api/state');
    setState(data);
    return data;
  }, []);

  useEffect(() => {
    const load = () => refresh().catch(err => setError(err.message));
    load();
    window.addEventListener('focus', load);
    return () => window.removeEventListener('focus', load);
  }, [refresh]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (!editing && !help) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy && uploadProgress === null) { setEditing(null); setHelp(false); } };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = previous; };
  }, [editing, help, busy, uploadProgress]);
  useEffect(() => {
    if (!openDialog) return;
    const previous = document.activeElement as HTMLElement | null;
    const timer = setTimeout(() => dialogRef.current?.querySelector<HTMLElement>('input:not([type="file"]), button, a, select, textarea')?.focus(), 0);
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const controls = dialogRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]):not([type="file"]), select:not([disabled]), textarea:not([disabled])');
      if (!controls?.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', trapFocus);
    return () => { clearTimeout(timer); document.removeEventListener('keydown', trapFocus); previous?.focus(); };
  }, [openDialog]);

  function navigate(next: Tab) { setTab(next); setSearch(''); setStatusFilter('all'); setMobileNav(false); }
  async function openEvent(event: PhotoEvent | 'new') {
    setEditing(event); setDetail(null); setModalError('');
    if (event !== 'new') {
      try { setDetail(await api<EventDetail>(`/api/events/${event.id}`)); }
      catch (err) { setModalError((err as Error).message); }
    }
  }

  async function saveEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    setBusy(true); setModalError('');
    const form = new FormData(event.currentTarget);
    const data = {
      title: String(form.get('title')).trim(), location: String(form.get('location')).trim(),
      date: form.get('date'), category: form.get('category'), description: form.get('description'),
      priceCents: Math.round(Number(form.get('price')) * 100),
      packagePriceCents: form.get('packagePrice') ? Math.round(Number(form.get('packagePrice')) * 100) : null,
      status: form.get('status'),
    };
    try {
      const result = await api<{ event: PhotoEvent }>(editing === 'new' ? '/api/events' : `/api/events/${editing.id}`, { method: editing === 'new' ? 'POST' : 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      await refresh();
      if (editing === 'new') {
        setEditing(result.event);
        setDetail(await api<EventDetail>(`/api/events/${result.event.id}`));
        setToast('Evento criado. Agora adicione suas fotos!');
      } else { setEditing(null); setToast('Alterações salvas. Sua loja está atualizada.'); }
    } catch (err) { setModalError((err as Error).message); }
    finally { setBusy(false); }
  }

  function uploadFiles(files: FileList | File[]) {
    if (!editing || editing === 'new' || !files.length || uploadProgress !== null) return;
    const list = Array.from(files);
    if (list.length > 30) { setModalError('Envie até 30 imagens por lote.'); return; }
    if (list.some(file => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type))) { setModalError('Use imagens JPEG, PNG ou WebP.'); return; }
    if (list.some(file => file.size > 20 * 1024 * 1024)) { setModalError('Cada imagem deve ter no máximo 20 MB.'); return; }
    setModalError(''); setUploadProgress(0);
    const form = new FormData();
    list.forEach(file => form.append('files', file));
    const request = new XMLHttpRequest();
    request.open('POST', `/api/events/${editing.id}/photos`);
    request.upload.onprogress = event => { if (event.lengthComputable) setUploadProgress(Math.round((event.loaded / event.total) * 100)); };
    request.onerror = () => { setUploadProgress(null); setModalError('A conexão foi interrompida. Tente enviar novamente.'); };
    request.onload = async () => {
      try {
        const result = JSON.parse(request.responseText);
        if (request.status < 200 || request.status >= 300) throw new Error(result.error || 'O envio não foi concluído.');
        setDetail(await api<EventDetail>(`/api/events/${editing.id}`));
        const latest = await refresh();
        const updated = latest.events.find(item => item.id === editing.id);
        if (updated) setEditing(updated);
        setToast(`${result.photos.length} foto${result.photos.length === 1 ? '' : 's'} adicionada${result.photos.length === 1 ? '' : 's'} ao evento.`);
      } catch (err) { setModalError((err as Error).message); }
      finally { setUploadProgress(null); if (fileRef.current) fileRef.current.value = ''; }
    };
    request.send(form);
  }

  async function deletePhoto(photo: Photo) {
    if (!window.confirm(`Excluir a foto “${photo.title}”? Essa ação não pode ser desfeita.`)) return;
    setBusy(true); setModalError('');
    try {
      await api(`/api/photos/${photo.id}`, { method: 'DELETE' });
      if (editing && editing !== 'new') setDetail(await api<EventDetail>(`/api/events/${editing.id}`));
      await refresh(); setToast('Foto excluída.');
    } catch (err) { setModalError((err as Error).message); }
    finally { setBusy(false); }
  }

  async function deleteEvent() {
    if (!editing || editing === 'new' || !window.confirm(`Excluir o evento “${editing.title}” e suas fotos? Essa ação não pode ser desfeita.`)) return;
    setBusy(true); setModalError('');
    try { await api(`/api/events/${editing.id}`, { method: 'DELETE' }); await refresh(); setEditing(null); setToast('Evento excluído.'); }
    catch (err) { setModalError((err as Error).message); }
    finally { setBusy(false); }
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setProfileBusy(true); setError('');
    const form = new FormData(event.currentTarget);
    const profile = Object.fromEntries(form.entries()) as unknown as Photographer;
    try { await api('/api/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(profile) }); await refresh(); setToast('Sua loja foi atualizada.'); }
    catch (err) { setError((err as Error).message); }
    finally { setProfileBusy(false); }
  }

  function exportOrders() {
    if (!state) return;
    const rows = [['Pedido', 'Comprador', 'Email', 'Evento', 'Valor (R$)', 'Pagamento', 'Status', 'Data', 'Demonstração'], ...state.orders.map(order => [order.id, order.buyerName, order.buyerEmail, order.eventTitle, (order.totalCents / 100).toFixed(2), order.paymentMethod, order.status, order.createdAt, 'Sim'])];
    const content = '\uFEFF' + rows.map(row => row.map(value => { const cell = String(value); return `"${(/^[=+\-@\t\r]/.test(cell) ? "'" + cell : cell).replaceAll('"', '""')}"`; }).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8;' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'clicker-vendas-demonstracao.csv'; anchor.click(); URL.revokeObjectURL(url);
  }

  const events = state?.events.filter(event => `${event.title} ${event.location}`.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')) && (statusFilter === 'all' || event.status === statusFilter)) || [];
  const activeEvents = state?.events.filter(event => event.status === 'published').length || 0;
  const editedEvent = editing && editing !== 'new' ? editing : null;

  return <div className={s.shell}>
    {mobileNav && <button className={s.navScrim} aria-label="Fechar menu" onClick={() => setMobileNav(false)} />}
    <aside className={`${s.sidebar} ${mobileNav ? s.sidebarOpen : ''}`}>
      <Link href="/" className={s.brand} aria-label="Clicker, início"><Aperture size={30} strokeWidth={1.8} /><span>clicker<span className={s.brandDot}>.</span></span></Link>
      <div className={s.workspace}><span className={s.workspaceIcon}><Camera size={18} /></span><div><strong>{state?.photographer.studioName || 'Meu estúdio'}</strong><span>Espaço do fotógrafo</span></div><span className={s.workspaceBadge}>BETA</span></div>
      <span className={s.navLabel}>SEU ESPAÇO</span>
      <nav className={s.nav} aria-label="Navegação principal">
        <button className={tab === 'overview' ? s.navActive : ''} onClick={() => navigate('overview')}><LayoutDashboard size={19} />Visão geral{tab === 'overview' && <span className={s.navDot} />}</button>
        <button className={tab === 'events' ? s.navActive : ''} onClick={() => navigate('events')}><Images size={19} />Meus eventos<span className={s.navCount}>{state?.events.length || 0}</span></button>
        <button className={tab === 'orders' ? s.navActive : ''} onClick={() => navigate('orders')}><ShoppingBag size={19} />Minhas vendas</button>
        <button className={tab === 'settings' ? s.navActive : ''} onClick={() => navigate('settings')}><Store size={19} />Minha loja</button>
      </nav>
      <div className={s.sidebarNote}><span className={s.noteIcon}><Sparkles size={20} /></span><h3>Seu olhar.<br />Seu negócio.</h3><p>Preços, fotos e escolhas.<br />O controle é todo seu.</p><Link href="/loja">Conhecer minha loja <ArrowUpRight size={17} /></Link></div>
      <div className={s.sidebarBottom}><button className={s.helpLink} onClick={() => setHelp(true)}><CircleHelp size={18} />Como testar a plataforma<ArrowUpRight size={14} /></button><div className={s.user}><span className={s.avatar}>{state?.photographer.name.split(' ').slice(0, 2).map(name => name[0]).join('') || 'MC'}</span><div><strong>{state?.photographer.name || 'Fotógrafo'}</strong><span>Conta de demonstração</span></div><button aria-label="Configurar minha loja" onClick={() => navigate('settings')}><Settings2 size={18} /></button></div></div>
    </aside>

    <div className={s.main}>
      <div className={s.demoBar}><span className={s.demoDot} />Ambiente de teste <span className={s.demoDivider}>/</span> Pagamentos simulados <button onClick={() => setHelp(true)}>Como funciona <ArrowUpRight size={12} /></button></div>
      <header className={s.header}><div className={s.headerLeft}><button className={s.menuButton} aria-label="Abrir menu" onClick={() => setMobileNav(true)}><Menu size={23} /></button><span className={s.breadcrumb}>Meu estúdio <span>/</span> <strong>{titles[tab]}</strong></span></div><div className={s.headerRight}><span className={s.localBadge}><span />Demonstração local</span><Link href="/loja" className={s.storeLink}>Ver minha loja <ArrowUpRight size={15} /></Link></div></header>

      <main className={s.content}>
        {error && <div className={s.error} role="alert">{error}<button onClick={() => { setError(''); refresh().catch(err => setError(err.message)); }}>Tentar novamente</button></div>}
        {!state ? <div className={s.loading}><LoaderCircle className={s.spin} size={28} /><p>Preparando seu estúdio…</p></div> : <>
          <div className={s.pageHeading}><div><p className={s.eyebrow}>{tab === 'overview' ? 'BEM-VINDO AO SEU ESTÚDIO' : 'FOTOGRAFIA COM AUTONOMIA'}</p><h1>{tab === 'overview' ? <>Olá, {state.photographer.name.split(' ')[0]}<span className={s.greetingDot}>.</span></> : titles[tab]}</h1><p className={s.subtitle}>{tab === 'overview' ? 'Seu talento em foco. Seu negócio em movimento.' : tab === 'events' ? 'Cada evento, uma nova história para compartilhar.' : tab === 'orders' ? 'Acompanhe cada pedido, do pagamento à entrega.' : 'Uma loja com a sua identidade. Do seu jeito.'}</p></div>{(tab === 'overview' || tab === 'events') && <button className={s.primaryButton} onClick={() => openEvent('new')}><Plus size={18} />Novo evento</button>}{tab === 'orders' && <button className={s.secondaryButton} onClick={exportOrders}><ArrowDownToLine size={17} />Exportar vendas</button>}{tab === 'settings' && <Link href="/loja" className={s.secondaryButton}>Visitar loja <ArrowUpRight size={17} /></Link>}</div>

          {tab === 'overview' && <>
            <section className={s.hero} aria-label="Seu espaço para vender fotografias"><div className={s.heroContent}><span className={s.heroKicker}><span />FEITO PARA QUEM VÊ ALÉM</span><h2>Sua fotografia.<br /><em>Suas regras.</em></h2><p>Transforme momentos em oportunidades.<br />Crie um evento e deixe seu trabalho brilhar.</p><button className={s.heroButton} onClick={() => openEvent('new')}>Criar meu próximo evento <ArrowUpRight size={18} /></button></div><div className={s.heroCredit}><span>UM NOVO OLHAR PARA O SEU NEGÓCIO</span><Aperture size={25} strokeWidth={1.4} /></div></section>
            <section className={s.statsGrid} aria-label="Resumo do estúdio">
              <Stat icon={<Wallet size={20} />} label="Receita simulada" value={formatMoney(state.stats.revenueCents)} detail="Total de pedidos pagos em teste" accent />
              <Stat icon={<ShoppingBag size={20} />} label="Vendas concluídas" value={String(state.stats.paidOrders).padStart(2, '0')} detail="Compras confirmadas na demonstração" />
              <Stat icon={<Images size={20} />} label="Fotos no estúdio" value={state.stats.photos.toLocaleString('pt-BR')} detail={`${bytesLabel(state.stats.storageBytes)} em arquivos originais`} />
              <Stat icon={<CalendarDays size={20} />} label="Eventos publicados" value={String(activeEvents).padStart(2, '0')} detail={`${state.events.length - activeEvents} em rascunho · você decide quando publicar`} />
            </section>
          </>}

          {(tab === 'overview' || tab === 'events') && <section className={s.eventsSection}><div className={s.sectionHeading}><div><h2>{tab === 'overview' ? 'Seus eventos' : 'Todos os eventos'}<span>{state.events.length}</span></h2><p>Histórias que merecem ser vistas.</p></div>{tab === 'overview' && <button className={s.textButton} onClick={() => navigate('events')}>Ver todos os eventos <ArrowRight size={16} /></button>}</div><div className={s.eventToolbar}><label className={s.search}><Search size={17} /><input aria-label="Buscar eventos" placeholder="Buscar por evento ou local…" value={search} onChange={event => setSearch(event.target.value)} /></label><label className={s.filter}><SlidersHorizontal size={16} /><select aria-label="Filtrar eventos por status" value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option value="all">Todos os status</option><option value="published">Publicados</option><option value="draft">Rascunhos</option></select><ChevronDown size={14} /></label></div>
            <div className={s.eventGrid}>{(tab === 'overview' ? events.slice(0, 3) : events).map(event => <article className={s.eventCard} key={event.id}><div className={s.eventImage}><img src={event.coverUrl || '/demo/trail.jpg'} alt={event.title} /><span className={`${s.statusPill} ${event.status === 'draft' ? s.statusDraft : ''}`}><span />{event.status === 'published' ? 'Publicado' : 'Rascunho'}</span><button className={s.cardSettings} aria-label={`Editar ${event.title}`} onClick={() => openEvent(event)}><MoreHorizontal size={20} /></button><span className={s.photoCount}><Images size={13} />{event.photoCount} fotos</span></div><div className={s.eventBody}><span className={s.category}>{event.category || 'Evento'}</span><h3>{event.title}</h3><p className={s.eventMeta}><CalendarDays size={13} />{formatDate(event.date)}<span>·</span>{event.location}</p><div className={s.eventFooter}><div className={s.price}><strong>{formatMoney(event.priceCents)}</strong><span>/ foto</span></div><button onClick={() => openEvent(event)}>Gerenciar <ArrowUpRight size={15} /></button></div></div></article>)}</div>
            {!events.length && <div className={s.empty}><FolderOpen size={32} /><h3>{search || statusFilter !== 'all' ? 'Nenhum evento encontrado' : 'Sua próxima história começa aqui'}</h3><p>{search || statusFilter !== 'all' ? 'Tente outro nome ou ajuste os filtros.' : 'Crie um evento e publique suas primeiras fotografias.'}</p>{!search && statusFilter === 'all' && <button className={s.primaryButton} onClick={() => openEvent('new')}><Plus size={17} />Criar evento</button>}</div>}
          </section>}

          {(tab === 'orders' || (tab === 'overview' && state.orders.length > 0)) && <section className={s.ordersSection}><div className={s.sectionHeading}><div><h2>{tab === 'overview' ? 'Últimas vendas' : 'Pedidos do estúdio'}<span>{state.orders.length}</span></h2><p>Todos os valores desta versão são simulados.</p></div>{tab === 'overview' && <button className={s.textButton} onClick={() => navigate('orders')}>Ver pedidos <ArrowRight size={16} /></button>}</div>{state.orders.length ? <div className={s.tableWrap}><table className={s.ordersTable}><thead><tr><th>Comprador</th><th>Evento</th><th>Pagamento</th><th>Status</th><th>Valor</th></tr></thead><tbody>{(tab === 'overview' ? state.orders.slice(0, 5) : state.orders).map(order => <tr key={order.id}><td><strong>{order.buyerName}</strong><span>{order.buyerEmail}</span></td><td>{order.eventTitle}<span>{order.photoIds.length} foto{order.photoIds.length === 1 ? '' : 's'}</span></td><td>{({ pix: 'Pix', credit: 'Crédito', debit: 'Débito', boleto: 'Boleto' } as const)[order.paymentMethod]}<span>Simulado</span></td><td><span className={`${s.orderStatus} ${order.status === 'pending' ? s.orderPending : ''}`}>{order.status === 'paid' ? 'Confirmado' : 'Aguardando'}</span></td><td><strong>{formatMoney(order.totalCents)}</strong></td></tr>)}</tbody></table></div> : <div className={s.empty}><ShoppingBag size={34} /><h3>Sua primeira venda está a um clique</h3><p>Visite sua loja, escolha uma foto e faça uma compra simulada.<br />O pedido aparecerá aqui automaticamente.</p><Link className={s.primaryButton} href="/loja">Testar minha loja <ArrowUpRight size={17} /></Link></div>}</section>}

          {tab === 'settings' && <div className={s.settingsGrid}><section className={s.settingsCard}><div className={s.settingsHeading}><span><Store size={22} /></span><div><h2>Identidade da loja</h2><p>Apresente seu trabalho com a sua personalidade.</p></div></div><form onSubmit={saveProfile} className={s.form}><label>Seu nome<input name="name" required maxLength={80} defaultValue={state.photographer.name} /></label><label>Nome do estúdio<input name="studioName" required maxLength={100} defaultValue={state.photographer.studioName} /></label><label>Identificador da loja<input name="slug" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" maxLength={60} defaultValue={state.photographer.slug} /><small>Use letras minúsculas, números e hífens. Nesta versão, a loja é acessada em /loja.</small></label><label>Sobre seu trabalho<textarea name="bio" rows={4} maxLength={600} defaultValue={state.photographer.bio} /></label><label>Instagram<input name="instagram" placeholder="@seuestudio" maxLength={80} defaultValue={state.photographer.instagram} /></label><button className={s.primaryButton} disabled={profileBusy} type="submit">{profileBusy ? <LoaderCircle size={17} className={s.spin} /> : <Check size={17} />}Salvar minha loja</button></form></section><aside className={s.settingsAside}><span className={s.settingsEyebrow}>AUTONOMIA DE VERDADE</span><h3>O seu negócio,<br /><em>do seu jeito.</em></h3><p>Defina seus preços, crie pacotes e escolha quando publicar cada evento.</p><div><HardDrive size={19} /><span><strong>{bytesLabel(state.stats.storageBytes)}</strong> de originais armazenados localmente</span></div><div><Camera size={19} /><span><strong>{state.stats.photos} fotografias</strong> organizadas em {state.events.length} eventos</span></div><p className={s.settingsDisclaimer}>Esta é uma demonstração local de conta única. Use apenas imagens de teste. Login, repasses e pagamentos reais ainda não estão conectados.</p></aside></div>}

          {tab === 'overview' && <div className={s.bottomTip}><span><Sparkles size={18} /></span><p><strong>Seu próximo passo:</strong> abra sua loja e experimente a jornada de compra.</p><Link href="/loja">Explorar minha loja <ArrowUpRight size={16} /></Link></div>}
          <footer className={s.footer}><span>© {new Date().getFullYear()} Clicker. Seu olhar tem valor. <Link href="/creditos">Créditos das imagens</Link></span><span>Feito para a sua independência <span className={s.footerDot}>●</span></span></footer>
        </>}
      </main>
    </div>

    {toast && <div className={s.toast} role="status"><span><Check size={16} /></span>{toast}<button aria-label="Fechar aviso" onClick={() => setToast('')}><X size={16} /></button></div>}

    {editing && <div className={s.modalOverlay} onMouseDown={event => { if (event.target === event.currentTarget && !busy && uploadProgress === null) setEditing(null); }}><section ref={dialogRef} className={s.modal} role="dialog" aria-modal="true" aria-labelledby="event-modal-title"><header className={s.modalHeader}><div><span className={s.eyebrow}>{editing === 'new' ? 'UMA NOVA HISTÓRIA' : 'SEU EVENTO, SUAS ESCOLHAS'}</span><h2 id="event-modal-title">{editing === 'new' ? 'Criar novo evento' : 'Gerenciar evento'}</h2></div><button className={s.iconButton} aria-label="Fechar evento" disabled={busy || uploadProgress !== null} onClick={() => setEditing(null)}><X size={21} /></button></header><div className={s.modalBody}>{modalError && <div className={s.error} role="alert">{modalError}</div>}<form key={editedEvent?.id || 'new'} onSubmit={saveEvent} className={s.form}><label>Nome do evento<input name="title" autoFocus required maxLength={120} placeholder="Ex.: Corrida do amanhecer" defaultValue={editedEvent?.title || ''} /></label><div className={s.formRow}><label>Data<input name="date" type="date" required defaultValue={editedEvent?.date?.slice(0, 10) || new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())} /></label><label>Categoria<select name="category" defaultValue={editedEvent?.category || 'Esportes'}><option>Esportes</option><option>Lifestyle</option><option>Urbano</option><option>Natureza</option><option>Casamentos</option><option>Retratos</option><option>Shows e cultura</option><option>Outros</option></select></label></div><label>Local<input name="location" required maxLength={120} placeholder="Cidade ou local do evento" defaultValue={editedEvent?.location || ''} /></label><label>Descrição<textarea name="description" rows={3} maxLength={2000} placeholder="Conte um pouco sobre esse momento…" defaultValue={editedEvent?.description || ''} /></label><div className={s.formRow}><label>Preço por foto (R$)<input name="price" type="number" required min="1" max="10000" step="0.01" defaultValue={editedEvent ? (editedEvent.priceCents / 100).toFixed(2) : '19.90'} /></label><label>Pacote do álbum inteiro (R$)<input name="packagePrice" type="number" min="1" max="10000" step="0.01" placeholder="Opcional" defaultValue={editedEvent?.packagePriceCents ? (editedEvent.packagePriceCents / 100).toFixed(2) : ''} /></label></div><label>Visibilidade<select name="status" defaultValue={editedEvent?.status || 'draft'}><option value="draft">Rascunho — apenas no seu painel</option><option value="published">Publicado — disponível na loja</option></select></label><div className={s.formActions}><button type="submit" className={s.primaryButton} disabled={busy || uploadProgress !== null}>{busy ? <LoaderCircle className={s.spin} size={17} /> : editing === 'new' ? <Plus size={17} /> : <Check size={17} />}{editing === 'new' ? 'Criar e adicionar fotos' : 'Salvar alterações'}</button>{editedEvent?.status === 'published' && <Link href={`/eventos/${editedEvent.id}`} className={s.textButton}>Ver galeria <ExternalLink size={15} /></Link>}</div></form>
      {editedEvent && <section className={s.photoManager}><div className={s.photoManagerHeading}><h3>Fotografias <span>{detail?.photos.length || 0}</span></h3><span>JPEG, PNG ou WebP · até 20 MB/foto</span></div><div className={`${s.dropzone} ${dragging ? s.dropzoneActive : ''}`} onDragOver={event => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); setDragging(false); uploadFiles(event.dataTransfer.files); }}><input ref={fileRef} id="event-photo-upload" type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={event => event.target.files && uploadFiles(event.target.files)} disabled={busy || uploadProgress !== null} /><label htmlFor="event-photo-upload"><span className={s.uploadIcon}>{uploadProgress !== null ? <LoaderCircle size={25} className={s.spin} /> : <UploadCloud size={26} />}</span><strong>{uploadProgress === null ? 'Arraste suas fotos ou clique para selecionar' : uploadProgress === 100 ? 'Processando imagens e marca-d’água…' : `Enviando fotografias… ${uploadProgress}%`}</strong><span>{uploadProgress === null ? 'Até 30 fotos por lote. Os originais são preservados.' : 'Aguarde a conclusão para fechar esta janela.'}</span></label>{uploadProgress !== null && <div className={s.progressTrack}><div style={{ width: `${uploadProgress}%` }} /></div>}</div>{detail ? <div className={s.photoGrid}>{detail.photos.map(photo => <div key={photo.id} className={s.photoTile}><img src={photo.thumbUrl} alt={photo.title} /><div><span title={photo.title}>{photo.title}</span><button type="button" aria-label={`Excluir ${photo.title}`} disabled={busy || uploadProgress !== null} onClick={() => deletePhoto(photo)}><Trash2 size={14} /></button></div></div>)}</div> : <p className={s.photoLoading}><LoaderCircle className={s.spin} size={16} />Carregando fotografias…</p>}<div className={s.dangerZone}><p>Fotos já compradas e eventos com pedidos são protegidos contra exclusão.</p><button disabled={busy || uploadProgress !== null} onClick={deleteEvent}><Trash2 size={15} />Excluir evento</button></div></section>}
      </div></section></div>}

    {help && <div className={s.modalOverlay} onMouseDown={event => event.target === event.currentTarget && setHelp(false)}><section ref={dialogRef} className={`${s.modal} ${s.helpModal}`} role="dialog" aria-modal="true" aria-labelledby="help-title"><header className={s.modalHeader}><div><span className={s.eyebrow}>PRIMEIRA VERSÃO</span><h2 id="help-title">Um passeio pelo seu estúdio</h2></div><button aria-label="Fechar instruções" className={s.iconButton} onClick={() => setHelp(false)}><X size={21} /></button></header><div className={s.modalBody}><p className={s.helpIntro}>Experimente a jornada completa com fotos de teste e pagamentos simulados.</p><ol className={s.helpSteps}><li><strong>Crie seu evento.</strong><span>Escolha nome, data, preço por foto e um pacote opcional.</span></li><li><strong>Adicione suas fotos.</strong><span>Envie JPEG, PNG ou WebP. As prévias recebem marca-d’água.</span></li><li><strong>Publique e visite a loja.</strong><span>Escolha as fotos e avance para o checkout.</span></li><li><strong>Confirme o pagamento de teste.</strong><span>Baixe as fotos e veja a venda no seu painel.</span></li></ol><div className={s.helpWarning}><CircleHelp size={20} /><p>Nenhum valor é cobrado. Esta versão usa armazenamento local e uma única conta de demonstração, sem login. Use apenas dados e imagens de teste.</p></div><Link href="/loja" className={s.primaryButton}>Explorar a loja <ArrowUpRight size={17} /></Link></div></section></div>}
  </div>;
}

function Stat({ icon, label, value, detail, accent = false }: { icon: React.ReactNode; label: string; value: string; detail: string; accent?: boolean }) {
  return <article className={`${s.statCard} ${accent ? s.statAccent : ''}`}><div className={s.statTop}><span>{label}</span><span className={s.statIcon}>{icon}</span></div><strong className={s.statValue}>{value}</strong><p>{detail}</p></article>;
}
