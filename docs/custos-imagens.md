# Armazenamento de fotografias: serviços e custos

Consulta das fontes: 20/10/2026. Valores em dólares americanos, sem câmbio,
impostos ou custos do aplicativo, processamento, pagamentos e backups.
São estimativas, não propostas comerciais. O protótipo entregue usa arquivos
locais; nenhum serviço abaixo foi contratado ou conectado.

## Comparação com preços verificados

As páginas comerciais não estavam acessíveis pela rede deste ambiente.
Os preços abaixo foram conferidos nas fontes públicas dos repositórios
oficiais de documentação, em revisões identificadas no fim deste documento.

Para comparação, 1 TB significa **1.000 GB**, retidos durante um mês inteiro.
As franquias pressupõem que outros projetos da conta não as tenham consumido.

| Serviço | Preço de armazenamento | Cenário de 100 GB | Cenário de 1 TB | Entrega e observações |
|---|---|---|---|---|
| **Cloudflare R2 Standard** | US$ 0,015/GB-mês, com 10 GB-mês gratuitos | **US$ 1,35/mês** | **US$ 14,85/mês** | Saída direta do R2 sem cobrança de transferência; operações e serviços adicionais podem ser cobrados |
| **Supabase Storage no Pro** | 100 GB incluídos; excedente de aproximadamente US$ 0,0213/GB-mês | Sem excedente de armazenamento; assinatura Pro de US$ 25/mês | Cerca de US$ 19,17 de excedente, além do Pro; base aproximada de US$ 44,17/mês | Franquias de 250 GB de saída sem cache e 250 GB com cache, independentes; excedentes US$ 0,09/GB e US$ 0,03/GB, respectivamente |

O Pro do Supabase inclui outros serviços além de armazenamento, portanto seu
preço base não é diretamente comparável à cobrança de objetos do R2. O total
depende de compute, quantidade de projetos, transformações e demais consumos.
O armazenamento é medido por GB-hora; a cobrança efetiva varia com as horas
e o uso médio do período. A estimativa acima usa o equivalente mensal
aproximado publicado na documentação detalhada.

No R2 Standard, a franquia mensal inclui 1 milhão de operações de classe A
(por exemplo, gravações) e 10 milhões de classe B (por exemplo, leituras).
Depois da franquia, os preços são US$ 4,50 e US$ 0,36 por milhão,
respectivamente, com arredondamento por unidade de cobrança. O valor de
armazenamento da tabela não inclui operações excedentes. Cloudflare Workers
e outros serviços conectados podem gerar cobrança própria.

## Outros serviços a cotar antes de contratar

| Serviço | Adequação | Como avaliar o custo |
|---|---|---|
| **Amazon S3 Standard** | Ecossistema amplo, regiões e políticas de ciclo de vida | Cotar armazenamento na região escolhida, requisições, saída para internet e CDN. A tarifa de uma região dos EUA não deve ser apresentada como preço de São Paulo |
| **Backblaze B2** | Alternativa de armazenamento de objetos e cópias de segurança | Conferir tarifa vigente, franquias de download, operações e condições das integrações de CDN |
| **Cloudinary** | Transformação, otimização e distribuição gerenciadas | Comparar plano, créditos e consumo combinado de armazenamento, transformação e tráfego; não comparar apenas GB |

Não foi possível confirmar as tarifas comerciais vigentes desses três
fornecedores nesta consulta. Os links oficiais para cotação são
[Amazon S3](https://aws.amazon.com/s3/pricing/),
[Backblaze B2](https://www.backblaze.com/cloud-storage/pricing) e
[Cloudinary](https://cloudinary.com/pricing). Evita-se usar preços históricos
como se fossem uma cotação atual.

## Recomendação para a plataforma

Começar a integração de produção pelo **R2 Standard para as imagens**, mantendo
originais privados e entregando prévias otimizadas por CDN. O custo de saída
é especialmente relevante para galerias visitadas muitas vezes. O Supabase
pode continuar como opção de autenticação e banco, sem exigir que todas as
fotografias também sejam armazenadas nele.

As contas devem incluir **originais + miniaturas + prévias + backups**. Por
exemplo, 10.000 originais de 10 MB já correspondem a aproximadamente 100 GB,
antes das demais versões. Não é uma estimativa do volume real do usuário.

O custo mensal completo será:

**armazenamento + operações + entrega + processamento de imagens + aplicação
+ banco + backups + observabilidade**.

Gerar poucas versões uma vez, usar cache, limitar uploads, estabelecer cotas
por fotógrafo e definir retenção dos eventos permite controlar esses custos.
A integração com um armazenamento externo exige uma próxima entrega; o
protótipo atual guarda os arquivos e o banco em `.data/` e precisa de disco
persistente para conservar os uploads.

## Fontes verificadas

- Cloudflare R2: [documentação de preços](https://developers.cloudflare.com/r2/pricing/).
  [Fonte consultada](https://github.com/cloudflare/cloudflare-docs/blob/355f5a2b9187078f57e8fe2809900ae71e1f1631/src/content/docs/r2/pricing.mdx).
- Supabase: [Storage Size](https://supabase.com/docs/guides/platform/manage-your-usage/storage-size).
  [Tabela detalhada consultada](https://github.com/supabase/supabase/blob/a90fc6792df4bf8da118a5234c1d8824d991d6cd/apps/docs/content/_partials/billing/pricing/pricing_storage_size.mdx).
  A página geral usa US$ 0,021 arredondado; a tabela detalhada explicita
  US$ 0,0213 e a cobrança por GB-hora, utilizada nas estimativas deste documento.
- Supabase: [fonte de preços de egress e exemplos do Pro](https://github.com/supabase/supabase/blob/a90fc6792df4bf8da118a5234c1d8824d991d6cd/apps/docs/content/guides/platform/manage-your-usage/egress.mdx).
- Supabase: [fonte de compute e créditos](https://github.com/supabase/supabase/blob/a90fc6792df4bf8da118a5234c1d8824d991d6cd/apps/docs/content/guides/platform/manage-your-usage/compute.mdx).
