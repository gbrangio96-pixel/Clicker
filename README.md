# Clicker · primeira versão para testes

Plataforma de fotografias em português, com painel do fotógrafo, loja e compra
simulada. Esta entrega é um protótipo funcional de **uma conta compartilhada, sem
login**. Use somente imagens e dados de teste. Não publique este servidor como
um marketplace de produção.

## O que já funciona

- Criar, editar, publicar e despublicar eventos, com preços independentes por foto
  e pacote do álbum completo. Cada evento funciona como um álbum nesta versão.
- Upload em lote de JPEG, PNG e WebP, com progresso, originais privados, miniaturas
  e prévias com marca-d’água geradas pelo servidor.
- Loja com busca, galerias, ampliação, seleção de fotos e desconto de pacote.
- Pedidos com Pix, crédito, débito ou boleto **simulados**, sem cartões, QR Codes
  de pagamento ou boletos reais.
- Confirmação de teste e download dos arquivos comprados, autorizado por token.
- Retomar o último pedido no mesmo navegador, painel de vendas e exportação CSV.
- Personalizar nome, apresentação e identificação do fotógrafo.
- Persistência em SQLite e disco: reiniciar o processo não apaga seus testes.

## Executar

Requisitos: **Node.js 24.x** e npm. Não há segredos, banco externo ou provedor de
pagamento necessários para a demonstração.

```bash
cd /workspace/Clicker
npm ci --cache /workspace/.npm-cache --no-audit --no-fund
npm run dev
```

O servidor usa a porta **3000**. Rotas: `/` (painel), `/loja` (loja),
`/eventos/<id>` (galeria) e `/creditos` (origem e licença das imagens de amostra).
O script de preparação gera as prévias de demonstração antes de iniciar.

Para testar a versão compilada:

```bash
npm run build
npm run start
```

O servidor de desenvolvimento deve estar parado antes de usar a mesma porta.
Use o checkout existente: tarefas na nuvem já são isoladas e não precisam de
outro Git worktree.

## Roteiro de teste

1. No painel, clique em **Novo evento**. Preencha nome, data, local e preço.
2. Crie como rascunho e adicione imagens na área de upload. São permitidas até
   30 imagens por lote, 20 MB por arquivo, 200 MB por lote e 40 megapixels por
   imagem. O envio mostra progresso; retomada automática fica para outra etapa.
3. Mude a visibilidade para **Publicado**, salve e visite **Ver minha loja**.
4. Abra o evento, selecione fotos e avance. Informe um nome e e-mail fictícios.
5. Crie o pedido e clique em **Confirmar pagamento simulado**. Baixe as imagens.
6. Retorne ao painel e consulte **Minhas vendas**. Recarregue a página ou reinicie
   o servidor para conferir a persistência.

As três galerias iniciais contêm fotos licenciadas de demonstração, sem vendas
inventadas. A marca-d’água identifica a prévia, não reivindica a autoria das
imagens. Consulte [as atribuições](fixtures/photos/ATTRIBUTION.md).

## Armazenamento e limites desta versão

Os dados ficam em `.data/clicker.sqlite`, os originais em `.data/originals` e os
derivados em `.data/previews`. Tudo está ignorado pelo Git. Para mudar o volume,
defina `CLICKER_DATA_DIR` com um diretório gravável. Preserve esse diretório e
faça backup para manter os dados. Não use hospedagem com disco efêmero para
guardar uploads reais.

Os originais não ficam na pasta pública. O servidor só os entrega quando o
pedido está confirmado e o token corresponde à foto comprada. Tokens são
credenciais de acesso e **não expiram nesta demonstração**. O último token fica
no armazenamento local do navegador; não use um navegador compartilhado para
dados reais. A conta administrativa e suas APIs são compartilhadas e não têm
autenticação: rascunho significa ausência na vitrine, não controle de acesso
entre pessoas.

Os valores são calculados no servidor e preservados no pedido. Confirmar o
mesmo pedido duas vezes não duplica vendas. Fotos com pedidos vinculados não
podem ser excluídas. Não há cobrança, repasse, envio de e-mails ou integração
financeira externa.

Para produção: autenticação e isolamento por fotógrafo, PostgreSQL, armazenamento
de objetos, upload com retomada, fila durável, links com expiração, políticas de
retenção e provedor de pagamentos com split e webhooks verificados. Múltiplos
álbuns dentro de um evento, cupons, domínio próprio, equipes e reconhecimento
facial também ficam para etapas posteriores.

## Validação automatizada

```bash
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Os testes de backend usam um banco temporário e cobrem persistência, validações,
precificação, proteção dos arquivos, idempotência e processamento real de
imagens. Os testes de navegador usam outro diretório temporário e iniciam seu
próprio servidor compilado na porta **3100**, sem mexer nos dados do painel.

O ambiente já tem Chromium em `/usr/bin/chromium`. Em outra máquina, instale o
navegador do Playwright com `npx playwright install chromium`, ou defina
`CLICKER_CHROMIUM_PATH` com o caminho de um Chromium instalado.

## Custos de hospedagem das imagens

Esta versão usa disco local, sem contratar serviços de armazenamento de imagens.
Veja [comparação de fornecedores e estimativas mensais](docs/custos-imagens.md).
