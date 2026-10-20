import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

test('cria evento, envia fotos, publica, compra e baixa os originais pelo navegador',async({page,request})=>{
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading',{name:'Olá, Marina.'})).toBeVisible();
  await page.getByRole('button',{name:'Novo evento',exact:true}).click();
  const dialog=page.getByRole('dialog');
  await dialog.getByLabel('Nome do evento').fill('Meu primeiro evento de teste');
  await dialog.getByLabel('Data',{exact:true}).fill('2026-10-20');
  await dialog.getByLabel('Local',{exact:true}).fill('Curitiba, PR');
  await dialog.getByLabel('Preço por foto (R$)',{exact:true}).fill('25');
  await dialog.getByLabel('Pacote do álbum inteiro (R$)').fill('40');
  const createdResponse=page.waitForResponse(response=>response.url().endsWith('/api/events')&&response.request().method()==='POST');
  await dialog.getByRole('button',{name:'Criar e adicionar fotos'}).click();
  const {event}=await (await createdResponse).json();
  await expect(dialog.getByRole('heading',{name:'Gerenciar evento'})).toBeVisible();
  const uploadedResponse=page.waitForResponse(response=>response.url().endsWith(`/api/events/${event.id}/photos`)&&response.request().method()==='POST');
  await dialog.locator('input[type=file]').setInputFiles(['fixtures/photos/photo-2.jpg','fixtures/photos/photo-4.jpg']);
  expect((await uploadedResponse).status()).toBe(201);
  await expect(dialog.getByRole('img',{name:'photo-2',exact:true})).toBeVisible();
  await dialog.getByLabel('Visibilidade').selectOption('published');
  await dialog.getByRole('button',{name:'Salvar alterações',exact:true}).click();
  await expect(dialog).toHaveCount(0);

  await page.goto('/loja');
  await page.getByRole('textbox',{name:'Buscar eventos'}).fill('Meu primeiro');
  await page.getByRole('link').filter({has:page.getByRole('heading',{name:'Meu primeiro evento de teste',exact:true})}).last().click();
  await expect(page).toHaveURL(`/eventos/${event.id}`);
  await expect(page.getByRole('heading',{name:'Meu primeiro evento de teste',exact:true,level:1})).toBeVisible();
  await page.getByRole('button',{name:'Selecionar todas',exact:true}).click();
  const cart=page.getByRole('complementary',{name:'Resumo da seleção'});
  await expect(cart).toContainText('40,00');
  await cart.getByRole('button',{name:'Continuar',exact:true}).click();
  await page.getByLabel('Seu nome',{exact:true}).fill('Comprador de teste');
  await page.getByLabel('E-mail',{exact:true}).fill('comprador@example.test');
  await page.getByRole('button',{name:'Criar pedido de teste',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Seu pedido está criado.'})).toBeVisible();
  await page.getByRole('button',{name:'Confirmar pagamento simulado',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Suas fotos estão aqui.'})).toBeVisible();
  const downloadLinks=page.getByRole('dialog').locator('a[download]');
  await expect(downloadLinks).toHaveCount(2);
  const downloadURL=(await downloadLinks.first().getAttribute('href'))!;
  const response=await request.get(downloadURL);
  expect(response.status()).toBe(200);
  expect(response.headers()['content-disposition']).toContain('attachment');
  expect((await response.body()).length).toBeGreaterThan(1000);
  const unauthorized=new URL(downloadURL,'http://127.0.0.1:3100');
  unauthorized.searchParams.delete('token');
  expect((await request.get(unauthorized.toString())).status()).toBe(403);
  await page.reload();
  await page.getByRole('button',{name:'Retomar último pedido de teste neste navegador'}).click();
  await expect(page.getByRole('heading',{name:'Suas fotos estão aqui.'})).toBeVisible();
  expect((await request.patch(`/api/events/${event.id}`,{data:{status:'draft'}})).status()).toBe(200);
  await page.reload();
  await expect(page.getByRole('heading',{name:'Esta galeria não está disponível'})).toBeVisible();
  await page.getByRole('button',{name:'Retomar último pedido de teste neste navegador'}).click();
  await expect(page.getByRole('heading',{name:'Suas fotos estão aqui.'})).toBeVisible();
  await page.goto('/');
  await page.getByRole('button',{name:'Minhas vendas',exact:true}).click();
  await expect(page.getByRole('cell',{name:'Comprador de teste comprador@example.test'})).toBeVisible();
  expect(errors).toEqual([]);
});

test('os quatro meios simulados preservam o mesmo fluxo de pedido e confirmação',async({request})=>{
  for (const paymentMethod of ['pix','credit','debit','boleto']) {
    const created=await request.post('/api/orders',{data:{eventId:'demo-city',photoIds:['demo-city-1'],buyerName:'Teste de pagamento',buyerEmail:'teste@example.test',paymentMethod,totalCents:1}});
    expect(created.status()).toBe(201);
    const {order,accessToken}=await created.json();
    expect(order.totalCents).toBe(1990);
    expect(order.status).toBe('pending');
    expect(order.demo).toBe(true);
    const blocked=await request.get(`/api/photos/demo-city-1/original?orderId=${order.id}&token=${accessToken}`);
    expect(blocked.status()).toBe(403);
    const confirmation=await request.post(`/api/orders/${order.id}/confirm`,{data:{accessToken}});
    expect(confirmation.status()).toBe(200);
    const result=await confirmation.json();
    expect(result.order.paymentMethod).toBe(paymentMethod);
    expect(result.downloads).toHaveLength(1);
    expect((await request.get(result.downloads[0].url)).status()).toBe(200);
    const again=await request.post(`/api/orders/${order.id}/confirm`,{data:{accessToken}});
    expect((await again.json()).order.paidAt).toBe(result.order.paidAt);
  }
});

test('recusa arquivos inválidos e origem externa sem alterar o álbum',async({request})=>{
  const old=(await (await request.get('/api/events/demo-trail')).json()).photos.length;
  const good=await readFile(path.join(process.cwd(),'fixtures/photos/photo-1.jpg'));
  const form=new FormData();
  form.append('files',new Blob([new Uint8Array(good)],{type:'image/jpeg'}),'valid.jpg');
  form.append('files',new Blob(['not an image'],{type:'image/jpeg'}),'corrupt.jpg');
  const response=await request.post('/api/events/demo-trail/photos',{multipart:form});
  expect(response.status()).toBe(400);
  expect((await (await request.get('/api/events/demo-trail')).json()).photos).toHaveLength(old);
  const foreign=await request.patch('/api/profile',{headers:{origin:'https://external.invalid'},data:{name:'Ataque'}});
  expect(foreign.status()).toBe(403);
  const proxy=await request.patch('/api/events/nonexistent-proxy-check',{headers:{host:'clicker.example',origin:'https://clicker.example','x-forwarded-proto':'https'},data:{status:'draft'}});
  expect(proxy.status()).toBe(404);
});

test('painel, loja e galeria funcionam em celular sem rolagem horizontal',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  for (const route of ['/','/loja','/eventos/demo-city']) {
    await page.goto(route);
    await expect(page.locator('h1')).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
    await expect.poll(()=>page.locator('img').evaluateAll(elements=>elements.filter(element=>{const image=element as HTMLImageElement;return !image.complete||image.naturalWidth===0;}).length)).toBe(0);
  }
  await page.goto('/');
  await page.getByRole('button',{name:'Abrir menu',exact:true}).click();
  await page.getByRole('button',{name:'Minha loja',exact:true}).click();
  await expect(page.getByRole('button',{name:'Salvar minha loja'})).toBeVisible();
  await page.getByLabel('Nome do estúdio').fill('Meu estúdio de teste');
  await page.getByRole('button',{name:'Salvar minha loja'}).click();
  await expect(page.getByRole('status')).toContainText('Sua loja foi atualizada.');
  await page.reload();
  await expect(page.locator('aside')).toContainText('Meu estúdio de teste');
});
