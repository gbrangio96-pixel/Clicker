import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  AppError, addPhoto, authorizeOrder, authorizeOriginal, confirmOrder, createEvent,
  createOrder, db, deleteEvent, deletePhoto, getCatalog, getEvent, getProfile,
  getStudioState, orderDownloads, photoFiles, updateEvent, updateProfile,
} from '../lib/store.ts';
import { prepareUpload } from '../lib/images.ts';
import sharp from 'sharp';

const previousDataDir = process.env.CLICKER_DATA_DIR;
const isolatedDataDir = mkdtempSync(path.join(tmpdir(), 'clicker-store-test-'));
const eventInput = (extra: Record<string, unknown> = {}) => ({
  title: 'Ensaio de teste', location: 'Curitiba, PR', date: '2026-10-20',
  category: 'Retratos', description: 'Evento isolado da suíte de testes.',
  priceCents: 1990, packagePriceCents: 2990, status: 'published', ...extra,
});
const expectAppError = (status: number) => (error: unknown) => error instanceof AppError && error.status === status;

function eventWithPhotos(extra: Record<string, unknown> = {}) {
  const event = createEvent(eventInput(extra));
  const photos = [1, 2, 3].map(index => addPhoto({
    eventId: event.id, title: `Retrato ${index}`,
    originalPath: `/fixture/original-${index}.jpg`, previewPath: `/fixture/preview-${index}.jpg`,
    thumbPath: `/fixture/thumb-${index}.jpg`, width: 1600, height: 1067, bytes: 512000,
  }));
  return { event, photos };
}

function buyer(eventId: string, photoIds: string[], extra: Record<string, unknown> = {}) {
  return { eventId, photoIds, buyerName: 'Pessoa de teste', buyerEmail: 'comprador@example.test', paymentMethod: 'pix', ...extra };
}

describe('Clicker: fluxo persistente de eventos, compra simulada e entrega', { concurrency: false }, () => {
  before(() => { process.env.CLICKER_DATA_DIR = isolatedDataDir; });
  after(() => {
    db().close();
    if (previousDataDir === undefined) delete process.env.CLICKER_DATA_DIR;
    else process.env.CLICKER_DATA_DIR = previousDataDir;
    rmSync(isolatedDataDir, { recursive: true, force: true });
  });

  it('inicia com três eventos de exemplo e nenhuma receita ou venda inventada', () => {
    const state = getStudioState();
    assert.equal(state.events.length, 3);
    assert.equal(state.stats.photos, 9);
    assert.equal(state.orders.length, 0);
    assert.equal(state.stats.revenueCents, 0);
    assert.equal(state.stats.paidOrders, 0);
    assert.equal(getCatalog().events.length, 3);
    assert.equal(state.demo, true);
  });

  it('cria e edita eventos, preservando a identidade e rejeitando datas ou preços inválidos', () => {
    const event = createEvent(eventInput({ title: 'Um encontro à luz do dia' }));
    assert.match(event.slug, /^um-encontro-a-luz-do-dia-/);
    const updated = updateEvent(event.id, { title: 'Título ajustado', priceCents: 2500 });
    assert.equal(updated.id, event.id);
    assert.equal(updated.title, 'Título ajustado');
    assert.equal(updated.priceCents, 2500);
    assert.equal(updated.location, event.location);
    for (const value of [eventInput({ date: '2026-02-30' }), eventInput({ date: '2026-13-01' }), eventInput({ priceCents: 19.9 }), eventInput({ priceCents: 0 }), eventInput({ packagePriceCents: -500 }), eventInput({ title: ' ' })]) {
      assert.throws(() => createEvent(value), expectAppError(400));
    }
    assert.throws(() => updateEvent(event.id, { priceCents: -1 }), expectAppError(400));
    assert.equal(getEvent(event.id).event.priceCents, 2500);
  });

  it('mantém rascunhos fora do catálogo público e impede pedidos desses eventos', () => {
    const { event, photos } = eventWithPhotos({ status: 'draft' });
    assert.ok(!getCatalog().events.some(item => item.id === event.id));
    assert.equal(getEvent(event.id).photos.length, 3);
    assert.throws(() => getEvent(event.id, true), expectAppError(404));
    assert.throws(() => createOrder(buyer(event.id, [photos[0].id])), expectAppError(404));
    updateEvent(event.id, { status: 'published' });
    assert.ok(getCatalog().events.some(item => item.id === event.id));
  });

  it('recusa fotos de outro evento, seleção vazia e dados de comprador inválidos', () => {
    const first = eventWithPhotos();
    const second = eventWithPhotos();
    assert.throws(() => createOrder(buyer(first.event.id, [second.photos[0].id])), expectAppError(400));
    assert.throws(() => createOrder(buyer(first.event.id, [])), expectAppError(400));
    assert.throws(() => createOrder(buyer(first.event.id, [first.photos[0].id], { buyerEmail: 'sem-email' })), expectAppError(400));
    assert.throws(() => createOrder(buyer(first.event.id, [first.photos[0].id], { paymentMethod: 'dinheiro' })), expectAppError(400));
  });

  it('calcula preços no servidor, ignora totais enviados e aplica pacote somente à seleção completa', () => {
    const { event, photos } = eventWithPhotos({ priceCents: 2000, packagePriceCents: 4500 });
    const partial = createOrder(buyer(event.id, [photos[0].id, photos[1].id], { totalCents: 1 }));
    assert.equal(partial.order.totalCents, 4000);
    const all = createOrder(buyer(event.id, photos.map(photo => photo.id), { totalCents: 1 }));
    assert.equal(all.order.totalCents, 4500);
    const duplicated = createOrder(buyer(event.id, [photos[0].id, photos[0].id]));
    assert.deepEqual(duplicated.order.photoIds, [photos[0].id]);
    assert.equal(duplicated.order.totalCents, 2000);
    updateEvent(event.id, { packagePriceCents: 9000 });
    assert.equal(createOrder(buyer(event.id, photos.map(photo => photo.id))).order.totalCents, 6000);
  });

  it('protege o pedido e os originais com token e só libera as fotos compradas após confirmação', () => {
    const { event, photos } = eventWithPhotos();
    const { order, accessToken } = createOrder(buyer(event.id, [photos[0].id]));
    assert.equal(order.status, 'pending');
    assert.deepEqual(orderDownloads(order, accessToken), []);
    assert.throws(() => authorizeOrder(order.id, '0'.repeat(64)), expectAppError(403));
    assert.throws(() => authorizeOrder(order.id, undefined), expectAppError(403));
    assert.throws(() => authorizeOriginal(photos[0].id, order.id, accessToken), expectAppError(403));
    assert.throws(() => confirmOrder(order.id, '0'.repeat(64)), expectAppError(403));
    const confirmed = confirmOrder(order.id, accessToken);
    assert.equal(confirmed.order.status, 'paid');
    assert.equal(confirmed.downloads.length, 1);
    assert.equal(confirmed.downloads[0].photoId, photos[0].id);
    assert.equal(authorizeOriginal(photos[0].id, order.id, accessToken).id, photos[0].id);
    assert.throws(() => authorizeOriginal(photos[1].id, order.id, accessToken), expectAppError(403));
    assert.ok(!('token_hash' in confirmed.order));
    assert.ok(!('originalPath' in getEvent(event.id).photos[0]));
  });

  it('torna a confirmação repetida idempotente sem duplicar vendas, receita ou data de pagamento', () => {
    const { event, photos } = eventWithPhotos();
    const beforeState = getStudioState();
    const { order, accessToken } = createOrder(buyer(event.id, [photos[0].id]));
    const first = confirmOrder(order.id, accessToken);
    const second = confirmOrder(order.id, accessToken);
    const state = getStudioState();
    assert.equal(first.order.paidAt, second.order.paidAt);
    assert.equal(state.stats.paidOrders, beforeState.stats.paidOrders + 1);
    assert.equal(state.stats.revenueCents, beforeState.stats.revenueCents + order.totalCents);
    assert.equal(state.orders.filter(item => item.id === order.id).length, 1);
  });

  it('preserva o preço e o título contratados quando o fotógrafo edita ou despublica o evento', () => {
    const { event, photos } = eventWithPhotos({ priceCents: 2500 });
    const { order, accessToken } = createOrder(buyer(event.id, [photos[0].id]));
    updateEvent(event.id, { title: 'Outro título', priceCents: 9900, status: 'draft' });
    const confirmed = confirmOrder(order.id, accessToken);
    assert.equal(confirmed.order.totalCents, 2500);
    assert.equal(confirmed.order.eventTitle, event.title);
    assert.equal(confirmed.downloads.length, 1);
  });

  it('impede exclusão de fotos e eventos vinculados a pedidos, mesmo ainda pendentes', () => {
    const { event, photos } = eventWithPhotos();
    createOrder(buyer(event.id, [photos[0].id]));
    assert.throws(() => deletePhoto(photos[0].id), expectAppError(409));
    assert.throws(() => deleteEvent(event.id), expectAppError(409));
    assert.equal(photoFiles(photos[0].id).id, photos[0].id);
    assert.equal(getEvent(event.id).event.id, event.id);
    deletePhoto(photos[1].id);
    assert.throws(() => photoFiles(photos[1].id), expectAppError(404));
  });

  it('remove um evento sem pedidos e todos os seus registros de fotos', () => {
    const { event, photos } = eventWithPhotos();
    const files = deleteEvent(event.id);
    assert.equal(files.length, photos.length);
    assert.throws(() => getEvent(event.id), expectAppError(404));
    for (const photo of photos) assert.throws(() => photoFiles(photo.id), expectAppError(404));
  });

  it('salva o perfil no banco e permite recuperá-lo em um processo novo', () => {
    const original = getProfile();
    const changed = updateProfile({ studioName: 'Estúdio de Teste', slug: 'estudio-de-teste', bio: 'Perfil persistente.' });
    assert.equal(changed.name, original.name);
    assert.throws(() => updateProfile({ slug: 'endereço inválido/' }), expectAppError(400));
    const child = spawnSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', "import { getProfile } from './lib/store.ts'; process.stdout.write(JSON.stringify(getProfile()));"], {
      cwd: process.cwd(), env: { ...process.env, CLICKER_DATA_DIR: isolatedDataDir }, encoding: 'utf8', timeout: 10000,
    });
    assert.equal(child.status, 0, child.stderr);
    assert.deepEqual(JSON.parse(child.stdout), changed);
  });

  it('processa upload real em armazenamento privado, preserva o original e gera derivados menores', async () => {
    const input = readFileSync(path.join(process.cwd(), 'fixtures', 'photos', 'trail.jpg'));
    const photo = await prepareUpload(new File([input], 'meu-evento.jpg', { type: 'image/jpeg' }));
    assert.equal(photo.title, 'meu-evento');
    assert.equal(photo.bytes, input.length);
    assert.ok(photo.originalPath.startsWith(path.join(isolatedDataDir, 'originals') + path.sep));
    assert.deepEqual(readFileSync(photo.originalPath), input);
    const preview = await sharp(photo.previewPath).metadata();
    const thumb = await sharp(photo.thumbPath).metadata();
    assert.ok(preview.width! <= 1600 && preview.height! <= 1600);
    assert.ok(thumb.width! <= 600 && thumb.height! <= 600);
    assert.equal(preview.format, 'jpeg');
    assert.notDeepEqual(readFileSync(photo.previewPath), input);
  });

  it('recusa arquivo corrompido e tipo não aceito sem deixar originais ou prévias parciais', async () => {
    const beforeOriginals = readdirSync(path.join(isolatedDataDir, 'originals'));
    const beforePreviews = readdirSync(path.join(isolatedDataDir, 'previews'));
    await assert.rejects(prepareUpload(new File(['isto não é JPEG'], 'corrompida.jpg', { type: 'image/jpeg' })), expectAppError(400));
    await assert.rejects(prepareUpload(new File(['gif'], 'arquivo.gif', { type: 'image/gif' })), expectAppError(400));
    assert.deepEqual(readdirSync(path.join(isolatedDataDir, 'originals')), beforeOriginals);
    assert.deepEqual(readdirSync(path.join(isolatedDataDir, 'previews')), beforePreviews);
  });
});
