import { DatabaseSync } from 'node:sqlite';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { mkdirSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import type { Photographer, PhotoEvent, Photo, Order, PaymentMethod, StudioState, Catalog, Download } from './types.ts';

export class AppError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}
type Row = Record<string, string | number | null>;
type StoreGlobal = typeof globalThis & { __clickerDb?: DatabaseSync; __clickerDbPath?: string };
// Mutable data belongs to the runtime volume, never the deployment trace.
export const dataDir = () => path.resolve(/* turbopackIgnore: true */ process.env.CLICKER_DATA_DIR || path.join(process.cwd(), '.data'));
const uid = () => randomBytes(12).toString('hex');
const now = () => new Date().toISOString();
const hash = (token: string) => createHash('sha256').update(token).digest('hex');

export function db(): DatabaseSync {
  const global = globalThis as StoreGlobal;
  const filename = path.join(dataDir(), 'clicker.sqlite');
  if (global.__clickerDb && global.__clickerDbPath === filename) return global.__clickerDb;
  mkdirSync(path.join(dataDir(), 'originals'), { recursive: true });
  mkdirSync(path.join(dataDir(), 'previews'), { recursive: true });
  const database = new DatabaseSync(filename);
  database.exec(`PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, slug TEXT NOT NULL UNIQUE, location TEXT NOT NULL,
      date TEXT NOT NULL, category TEXT NOT NULL, description TEXT NOT NULL, price_cents INTEGER NOT NULL,
      package_price_cents INTEGER, status TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS photos (
      id TEXT PRIMARY KEY, event_id TEXT NOT NULL REFERENCES events(id), title TEXT NOT NULL,
      original_path TEXT NOT NULL, preview_path TEXT NOT NULL, thumb_path TEXT NOT NULL,
      width INTEGER NOT NULL, height INTEGER NOT NULL, bytes INTEGER NOT NULL, created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS photos_event ON photos(event_id);
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY, buyer_name TEXT NOT NULL, buyer_email TEXT NOT NULL,
      event_id TEXT NOT NULL REFERENCES events(id), event_title TEXT NOT NULL,
      photo_ids TEXT NOT NULL, total_cents INTEGER NOT NULL, payment_method TEXT NOT NULL,
      status TEXT NOT NULL, created_at TEXT NOT NULL, paid_at TEXT, token_hash TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS orders_event ON orders(event_id);`);
  global.__clickerDb = database; global.__clickerDbPath = filename;
  if (!database.prepare('SELECT key FROM settings WHERE key = ?').get('profile')) {
    const profile: Photographer = { name: 'Marina Costa', studioName: 'Marina Costa Fotografia', slug: 'marinacosta', bio: 'Histórias em movimento. Fotografias de esporte, natureza e dos encontros que ficam.', instagram: '@marinacosta.foto' };
    database.prepare('INSERT INTO settings (key,value) VALUES (?,?)').run('profile', JSON.stringify(profile));
  }
  if (!database.prepare('SELECT key FROM settings WHERE key = ?').get('seeded')) {
    // These are clearly identified sample events. Real uploads always stay in .data/originals.
    const samples = [
      { id: 'demo-trail', title: 'Caminhos de outono', location: 'Parques & natureza · amostra', date: '2026-10-18', category: 'Natureza', description: 'Luz entre as folhas, caminhos e pequenos detalhes. Um álbum de demonstração para explorar a plataforma.', image: 'trail.jpg' },
      { id: 'demo-surf', title: 'Jardins e encontros', location: 'Ao ar livre · amostra', date: '2026-10-12', category: 'Lifestyle', description: 'Encontros com a natureza e histórias ao ar livre. Fotografias de demonstração.', image: 'surf.jpg' },
      { id: 'demo-city', title: 'Luz da cidade', location: 'Ruas históricas · amostra', date: '2026-10-05', category: 'Urbano', description: 'Novos caminhos e um outro olhar para a cidade. Explore este evento de demonstração.', image: 'city.jpg' }
    ];
    database.exec('BEGIN');
    try {
      for (const sample of samples) {
        database.prepare(`INSERT INTO events VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(sample.id, sample.title, sample.id, sample.location, sample.date, sample.category, sample.description, 1990, 4990, 'published', now());
        const fixture = path.join(process.cwd(), 'fixtures', 'photos', sample.image);
        const preview = path.join(process.cwd(), 'public', 'demo', sample.image);
        for (let i = 0; i < 3; i++) {
          const alt = path.join(process.cwd(), 'fixtures', 'photos', `photo-${samples.indexOf(sample) * 3 + i + 1}.jpg`);
          const original = existsSync(alt) ? alt : fixture;
          const altPreview = path.join(process.cwd(), 'public', 'demo', `photo-${samples.indexOf(sample) * 3 + i + 1}.jpg`);
          database.prepare('INSERT INTO photos VALUES (?,?,?,?,?,?,?,?,?,?)').run(`${sample.id}-${i+1}`, sample.id, `Fotografia ${String(i+1).padStart(2,'0')}`, original, existsSync(altPreview) ? altPreview : preview, existsSync(altPreview) ? altPreview : preview, 640, 480, existsSync(original) ? statSync(original).size : 0, now());
        }
      }
      database.prepare('INSERT INTO settings VALUES (?,?)').run('seeded', 'true');
      database.exec('COMMIT');
    } catch (error) { database.exec('ROLLBACK'); throw error; }
  }
  return database;
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AppError('Dados inválidos.');
  return value as Record<string, unknown>;
}
function text(value: unknown, label: string, max = 160, optional = false): string {
  if (optional && (value === undefined || value === null)) return '';
  if (typeof value !== 'string') throw new AppError(`${label}: informe um texto válido.`);
  const clean = value.trim();
  if ((!optional && !clean) || clean.length > max) throw new AppError(`${label}: use ${optional ? 'até' : 'entre 1 e'} ${max} caracteres.`);
  return clean;
}
function cents(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 100 || value > 1000000) throw new AppError(`${label}: informe um valor entre R$ 1,00 e R$ 10.000,00.`);
  return value;
}
const slugify = (str: string) => str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export function getProfile(): Photographer { return JSON.parse(String(db().prepare('SELECT value FROM settings WHERE key = ?').get('profile')!.value)); }
export function updateProfile(input: unknown): Photographer {
  const data = { ...getProfile(), ...record(input) };
  const profile: Photographer = {
    name: text(data.name, 'Nome', 80), studioName: text(data.studioName, 'Nome da loja', 100),
    slug: text(data.slug, 'Endereço', 60), bio: text(data.bio, 'Apresentação', 600, true), instagram: text(data.instagram, 'Instagram', 80, true)
  };
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(profile.slug)) throw new AppError('Endereço: use letras minúsculas, números e hífens.');
  db().prepare('UPDATE settings SET value = ? WHERE key = ?').run(JSON.stringify(profile), 'profile');
  return profile;
}
function eventDto(row: Row): PhotoEvent {
  const photo = db().prepare('SELECT id FROM photos WHERE event_id = ? ORDER BY created_at,id LIMIT 1').get(row.id);
  const count = db().prepare('SELECT COUNT(*) AS count FROM photos WHERE event_id = ?').get(row.id)!;
  return { id: String(row.id), title: String(row.title), slug: String(row.slug), location: String(row.location), date: String(row.date), category: String(row.category), description: String(row.description), priceCents: Number(row.price_cents), packagePriceCents: row.package_price_cents === null ? null : Number(row.package_price_cents), status: row.status as PhotoEvent['status'], createdAt: String(row.created_at), photoCount: Number(count.count), coverUrl: photo ? `/api/photos/${photo.id}/preview` : '/demo/placeholder.svg' };
}
function photoDto(row: Row): Photo { return { id: String(row.id), eventId: String(row.event_id), title: String(row.title), previewUrl: `/api/photos/${row.id}/preview`, thumbUrl: `/api/photos/${row.id}/thumb`, width: Number(row.width), height: Number(row.height), bytes: Number(row.bytes) }; }
function orderDto(row: Row): Order { return { id: String(row.id), buyerName: String(row.buyer_name), buyerEmail: String(row.buyer_email), eventId: String(row.event_id), eventTitle: String(row.event_title), photoIds: JSON.parse(String(row.photo_ids)), totalCents: Number(row.total_cents), paymentMethod: row.payment_method as PaymentMethod, status: row.status as Order['status'], createdAt: String(row.created_at), paidAt: row.paid_at ? String(row.paid_at) : null, demo: true }; }

export function getStudioState(): StudioState {
  const events = (db().prepare('SELECT * FROM events ORDER BY created_at DESC,id').all() as Row[]).map(eventDto);
  const orders = (db().prepare('SELECT * FROM orders ORDER BY created_at DESC,id').all() as Row[]).map(orderDto);
  const totals = db().prepare('SELECT COALESCE(SUM(bytes),0) AS bytes, COUNT(*) AS count FROM photos').get()!;
  return { photographer: getProfile(), events, orders, stats: { revenueCents: orders.filter(o => o.status === 'paid').reduce((sum,o) => sum+o.totalCents,0), paidOrders: orders.filter(o => o.status === 'paid').length, photos: Number(totals.count), storageBytes: Number(totals.bytes) }, demo: true };
}
export function getCatalog(): Catalog { return { photographer: getProfile(), events: (db().prepare("SELECT * FROM events WHERE status = 'published' ORDER BY date DESC").all() as Row[]).map(eventDto), demo: true }; }
export function getEvent(id: string, publicOnly = false) {
  const row = db().prepare('SELECT * FROM events WHERE id = ?').get(id) as Row | undefined;
  if (!row || (publicOnly && row.status !== 'published')) throw new AppError('Evento não encontrado.', 404);
  return { event: eventDto(row), photos: (db().prepare('SELECT * FROM photos WHERE event_id = ? ORDER BY created_at,id').all(id) as Row[]).map(photoDto) };
}
function validateEvent(input: unknown) {
  const data = record(input);
  const title = text(data.title, 'Nome do evento', 120);
  const date = text(data.date, 'Data', 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(`${date}T12:00:00Z`).toISOString().slice(0,10) !== date) throw new AppError('Informe uma data válida.');
  if (data.status !== 'published' && data.status !== 'draft') throw new AppError('Status do evento inválido.');
  return { title, location: text(data.location, 'Local', 120), date, category: text(data.category, 'Categoria', 60), description: text(data.description, 'Descrição', 2000, true), priceCents: cents(data.priceCents, 'Preço por foto'), packagePriceCents: data.packagePriceCents === null || data.packagePriceCents === undefined ? null : cents(data.packagePriceCents, 'Preço do pacote'), status: data.status };
}
export function createEvent(input: unknown): PhotoEvent {
  const value = validateEvent(input); const id = uid();
  db().prepare('INSERT INTO events VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(id,value.title,`${slugify(value.title) || 'evento'}-${id.slice(0,6)}`,value.location,value.date,value.category,value.description,value.priceCents,value.packagePriceCents,value.status,now());
  return getEvent(id).event;
}
export function updateEvent(id: string, input: unknown): PhotoEvent {
  const existing = getEvent(id).event;
  const value = validateEvent({ ...existing, ...record(input) });
  db().prepare('UPDATE events SET title=?, location=?, date=?, category=?, description=?, price_cents=?, package_price_cents=?, status=? WHERE id=?').run(value.title,value.location,value.date,value.category,value.description,value.priceCents,value.packagePriceCents,value.status,id);
  return getEvent(id).event;
}
export function addPhoto(input: { id?: string; eventId: string; title: string; originalPath: string; previewPath: string; thumbPath: string; width: number; height: number; bytes: number }): Photo {
  getEvent(input.eventId);
  const id = input.id || uid();
  db().prepare('INSERT INTO photos VALUES (?,?,?,?,?,?,?,?,?,?)').run(id,input.eventId,input.title,input.originalPath,input.previewPath,input.thumbPath,input.width,input.height,input.bytes,now());
  return photoDto(db().prepare('SELECT * FROM photos WHERE id=?').get(id) as Row);
}
export function photoFiles(id: string) {
  const row = db().prepare('SELECT * FROM photos WHERE id=?').get(id) as Row | undefined;
  if (!row) throw new AppError('Foto não encontrada.',404);
  return { ...photoDto(row), originalPath: String(row.original_path), previewPath: String(row.preview_path), thumbPath: String(row.thumb_path) };
}
export function deletePhoto(id: string) {
  const photo = photoFiles(id);
  const orders = db().prepare('SELECT photo_ids FROM orders WHERE event_id=?').all(photo.eventId);
  if (orders.some(row => (JSON.parse(String(row.photo_ids)) as string[]).includes(id))) throw new AppError('Esta foto está vinculada a um pedido e precisa ser preservada.',409);
  db().prepare('DELETE FROM photos WHERE id=?').run(id);
  return photo;
}
export function deleteEvent(id: string) {
  getEvent(id);
  if (db().prepare('SELECT id FROM orders WHERE event_id=? LIMIT 1').get(id)) throw new AppError('Eventos com pedidos precisam ser preservados. Você pode despublicá-los.',409);
  const files = (db().prepare('SELECT id FROM photos WHERE event_id=?').all(id)).map(row => photoFiles(String(row.id)));
  db().exec('BEGIN');
  try { db().prepare('DELETE FROM photos WHERE event_id=?').run(id); db().prepare('DELETE FROM events WHERE id=?').run(id); db().exec('COMMIT'); } catch (error) { db().exec('ROLLBACK'); throw error; }
  return files;
}
export function createOrder(input: unknown) {
  const value = record(input);
  const eventId = text(value.eventId, 'Evento', 80);
  const detail = getEvent(eventId, true);
  const buyerName = text(value.buyerName,'Nome',100);
  const buyerEmail = text(value.buyerEmail,'E-mail',254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(buyerEmail)) throw new AppError('Informe um e-mail válido.');
  const methods: PaymentMethod[] = ['pix','credit','debit','boleto'];
  if (!methods.includes(value.paymentMethod as PaymentMethod)) throw new AppError('Forma de pagamento inválida.');
  if (!Array.isArray(value.photoIds) || !value.photoIds.length || value.photoIds.length > 500 || value.photoIds.some(id => typeof id !== 'string')) throw new AppError('Selecione entre 1 e 500 fotografias.');
  const photoIds = [...new Set(value.photoIds as string[])];
  const valid = new Set(detail.photos.map(photo=>photo.id));
  if (photoIds.some(id => !valid.has(id))) throw new AppError('Uma das fotos não pertence a este evento.');
  const singlePrice = photoIds.length * detail.event.priceCents;
  const totalCents = photoIds.length === detail.photos.length && detail.event.packagePriceCents ? Math.min(singlePrice, detail.event.packagePriceCents) : singlePrice;
  const id = uid(); const accessToken = randomBytes(32).toString('hex');
  db().prepare('INSERT INTO orders VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(id,buyerName,buyerEmail,eventId,detail.event.title,JSON.stringify(photoIds),totalCents,value.paymentMethod as string,'pending',now(),null,hash(accessToken));
  return { order: orderDto(db().prepare('SELECT * FROM orders WHERE id=?').get(id) as Row), accessToken };
}
export function authorizeOrder(id: string, token: unknown): Order {
  const row = db().prepare('SELECT * FROM orders WHERE id=?').get(id) as Row | undefined;
  if (!row || typeof token !== 'string' || token.length !== 64 || !timingSafeEqual(Buffer.from(String(row.token_hash),'hex'),Buffer.from(hash(token),'hex'))) throw new AppError('Acesso ao pedido não autorizado.',403);
  return orderDto(row);
}
export function orderDownloads(order: Order, token: string): Download[] {
  if (order.status !== 'paid') return [];
  return order.photoIds.map(id=>({ photoId:id,title:photoFiles(id).title,url:`/api/photos/${id}/original?orderId=${order.id}&token=${encodeURIComponent(token)}` }));
}
export function confirmOrder(id: string, token: unknown) {
  authorizeOrder(id,token);
  db().prepare("UPDATE orders SET status='paid',paid_at=? WHERE id=? AND status='pending'").run(now(),id);
  const order = authorizeOrder(id,token);
  return { order, downloads: orderDownloads(order,token as string) };
}
export function authorizeOriginal(photoId: string, orderId: string, token: unknown) {
  const order = authorizeOrder(orderId,token);
  if (order.status !== 'paid' || !order.photoIds.includes(photoId)) throw new AppError('Confirme a compra para acessar esta fotografia.',403);
  return photoFiles(photoId);
}
