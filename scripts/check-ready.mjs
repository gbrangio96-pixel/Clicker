import assert from 'node:assert/strict';
const origin = process.env.CLICKER_CHECK_ORIGIN || 'http://127.0.0.1:3000';
let failure;
for (let attempt = 0; attempt < 20; attempt++) {
  try {
    const response = await fetch(`${origin}/api/state`);
    assert.equal(response.status, 200);
    const state = await response.json();
    assert.equal(state.demo, true);
    assert.equal(typeof state.photographer.name, 'string');
    assert.ok(Array.isArray(state.events));
    const catalogResponse = await fetch(`${origin}/api/catalog`);
    assert.equal(catalogResponse.status, 200);
    const catalog = await catalogResponse.json();
    assert.ok(catalog.events.every(event => event.status === 'published'));
    for (const route of ['/', '/loja']) assert.equal((await fetch(`${origin}${route}`)).status, 200);
    const event = catalog.events.find(event => event.photoCount > 0);
    if (event) {
      const photo = await fetch(`${origin}${event.coverUrl}`);
      assert.equal(photo.status, 200);
      assert.ok(photo.headers.get('content-type').startsWith('image/'));
      assert.ok((await photo.arrayBuffer()).byteLength > 100);
    }
    console.log(`Clicker pronto: painel, catálogo e prévias verificados; ${state.events.length} eventos, ${state.stats.photos} fotos.`);
    process.exit(0);
  } catch (error) {
    failure = error;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
}
console.error('A aplicação não ficou pronta:', failure);
process.exit(1);
