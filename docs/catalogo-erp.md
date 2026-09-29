# Catálogo completo no site — 25/09/2026

Escopo: vitrine da Nova Leões (versão A). O catálogo inteiro do ERP passou a ser publicado no site como
arquivos estáticos; a integração de estoque (`octopool.stock.v1`), a gestão e a API de pedidos não mudaram.

## O que o site mostra

- **39.369 peças ativas** do tenant Nova Leões no Nexus ERP, das quais 9.435 com estoque e 23.376 com foto.
- Por peça: nome limpo, marca, grupo, departamento, preço de venda, disponibilidade, foto, descrição e
  aplicações veiculares (montadora, modelo, versão, motor, anos).
- **Nunca sai do ERP:** código interno, código do fabricante/OEM, custo, curva ABC, localização, similares.
  O nome também perde a referência colada no fim (`BOMBA DAGUA / 766` → "Bomba d'Água") e códigos entre
  parênteses (`PAST FREIO DT ( 4213 )`).

## Fluxo

1. **Exportar** (somente leitura, dentro do container do backend em produção, via ECS Exec):
   `scripts/catalogo/exportar-erp.cjs`. O script abre a transação com `SET TRANSACTION READ ONLY`, confere
   que a empresa é a Nova Leões (AUTOPECAS, ATIVA, raiz) e imprime o JSON comprimido em base64. O comando
   completo está no cabeçalho do arquivo. Resultado: `outputs/catalogo-erp.json` (24 MB, fora do Git).
2. **Construir**: `node scripts/catalogo/construir.mjs` lê a exportação e grava `public/catalogo/`:
   - `meta.json` (55 KB): departamentos, grupos, marcas, montadoras, modelos, unidades, datas e totais.
   - `indice.json` (3,8 MB, ~840 KB comprimido): uma linha por peça para busca e filtros no navegador.
   - `detalhes/000..199.json` (7,7 MB no total): descrição limpa e aplicações completas, carregadas
     só ao abrir a peça.
   O build é determinístico (ordenação fixa), então o diff no Git mostra só o que mudou no ERP.
3. **Publicar**: os arquivos vão no repositório e saem no deploy normal da Vercel (`vercel.json` dá
   cache de 1 h no navegador e 1 dia na CDN para `/catalogo/*`). Reexportar quando a loja quiser refletir
   cadastros novos; preço e estoque das sete peças integradas continuam vindo ao vivo do ERP.

`npm test` cobre limpeza de nomes, descrição, taxonomia, construção do índice e filtros
(`tests/catalogo.test.mjs`).

## Regras de apresentação

- **Nomes** (`scripts/catalogo/nomes.mjs`): expansão das abreviações do balcão (AMORT, DT, TS, LD, LE,
  MANG, VALV, PAST, ROL, TERM, CIL, RESERV, HOMO, EMBR…), acentos, caixa de título, "com/sem/para".
  Em disco de freio, VENT = ventilado e SOL = sólido. O nome original continua indexado pela busca
  (buscar "amort ts" acha "Amortecedor Traseiro").
- **Descrição**: linhas `> ... <` viram destaques; pontos soltos, códigos isolados e repetições saem.
- **Departamentos** (`scripts/catalogo/taxonomia.mjs`): 17 departamentos com regras de palavra-chave
  sobre o grupo do ERP. O grupo `LUBRIFICANTES` é um balde do legado (7.429 itens, de mangueira a
  furadeira): nesses casos o nome da peça decide e o grupo exibido é derivado do nome. O que não casa
  com regra nenhuma fica em "Outras peças" (916 itens na exportação de 25/09, a maioria nomes de uma
  palavra como "Mangueira" ou "Bucha").
- **Anos das aplicações**: erros do legado (`2106`, `2207`) são corrigidos para `2006`, `2007`; valores
  impossíveis (`120`, `5487`) ficam como "não informado".
- **Preço abaixo de R$ 1** (1.370 itens) é tratado como "consultar preço". Marcas com sufixo de linha
  (`COFAP AMORT`, `SABO JUNTAS`) aparecem só com o nome (`Cofap`, `Sabo`).
- **Fotos**: servidas direto do bucket público `octopool-fotos-produtos` (S3) ou da rota pública do ERP
  (`/api/produtos-foto/:id`); ambos liberados na CSP. Fotos apontando para sites de terceiros não entram.

## Comportamento na loja

- Busca por palavras (nome, marca, grupo, departamento, montadora e modelo), departamentos com contagem,
  grupos do departamento, filtro por montadora → modelo → ano, marca da peça, "só em estoque" e
  ordenação. O estado do filtro vai para a URL (`?dep=freios&modelo=41&ano=2010`) para compartilhar.
- Qualquer peça entra em **Meu pedido**. As sete peças vinculadas ao ERP seguem o fluxo de aprovação
  online quando ele estiver ligado (`PUBLIC_ORDERS_ENABLED=1`); o restante, e o pedido inteiro enquanto o
  online estiver desligado, sai pelo botão **Enviar pedido pelo WhatsApp** (mensagem pronta com itens,
  quantidades e veículo). O detalhe da peça também tem "Perguntar no WhatsApp".
- Seções institucionais: Quem somos (fundação 1993, Guarulhos, entrega própria), Onde estamos (endereço,
  mapa, telefone, WhatsApp, horário), Trocas e garantia e o rodapé com departamentos, links da loja,
  atendimento, razão social e CNPJ. Os dados ficam em `lib/loja.ts`.

## Loja pronta para vender — 25/09/2026 (tarde)

Revisão completa pedida pelo Luca para levar ao Berna. Padrão seguido: lojas de autopeças que vendem bem
(Canal da Peça, PeçaAgora, AutoZone, Mercado Livre Autopeças): o carro do cliente em primeiro lugar,
departamentos com foto, selo de compatibilidade no cartão, frete pelo CEP na página da peça e no carrinho,
WhatsApp sempre à mão e rodapé com políticas.

- **Meu carro** (`components/seletor-veiculo.tsx`, `lib/garagem.ts`): montadora → modelo → ano, salvo no
  navegador pelo nome. Botão no cabeçalho e faixa "Qual é o seu carro?" com as 12 montadoras com mais
  aplicações. Com o carro escolhido, o catálogo filtra, cada cartão ganha o selo "Serve no seu Uno" e o
  detalhe destaca a linha do carro na tabela de aplicação (ou avisa quando não há aplicação cadastrada).
- **Departamentos com foto** (`components/vitrines.tsx`): capa escolhida pelo construtor entre peças com foto,
  estoque e preço do grupo mais numeroso.
- **Frete** (`lib/frete.ts`, `components/calculo-frete.tsx`): CEP → endereço e coordenadas pela AwesomeAPI CEP
  (ViaCEP de reserva), distância até a loja × 1,35 (rua), faixas em `lib/loja.ts`. Retirada grátis sempre;
  acima de 15 km, "a combinar". Aparece no detalhe da peça, no carrinho, no checkout e na seção Entrega. O CEP
  fica salvo e o endereço preenche o checkout.
- **Checkout** (`components/storefront.tsx`, `lib/pedido.ts`): peças e frete → dados (nome, WhatsApp, carro já
  preenchido) → entrega (retirar ou receber, com rua/número/bairro) → pagamento na entrega/retirada (Pix,
  débito, crédito, dinheiro) → **Enviar pedido pelo WhatsApp** com o texto completo (itens, valores, frete,
  total, cliente, carro, endereço, pagamento e o link de cada peça no site, para a loja identificar sem
  código interno). O pedido online do Commerce continua disponível quando só houver peças integradas e o
  envio online estiver ligado.
- **Compartilhar**: cada peça tem link próprio (`/?peca=xxxxxxxx`) que abre o detalhe; botão "Compartilhar
  esta peça" (menu nativo no celular, cópia no computador) e tags Open Graph para a prévia no WhatsApp.
- **Dados corrigidos no construtor**: marca sem a linha do produto ("VIEMAR TERM" → Viemar, "TECFIL F AR" →
  Tecfil; rótulos internos como DIVERSOS e FERRAMENTAS não aparecem), modelos duplicados unidos
  (S-10/S10, HR-V/HRV, Del Rey/Delrey…; 232 → 224), ordenação por relevância com desempate pela parte do
  carro (freios, suspensão, direção…).
- **Fotos conferidas**: `scripts/catalogo/verificar-fotos.mjs` fez HEAD em todas as 23.089 URLs em 25/09:
  todas 200 e image/*. Se uma próxima conferência achar quebradas, o construtor tira a foto da peça.
- **Defeitos corrigidos**: formulário dentro de formulário (frete no checkout) e padrão de telefone inválido
  nos navegadores atuais (já existia na versão anterior; a validação do campo era ignorada).
- **Verificação**: `npm test` (149, 0 falhas), build, e um fluxo de cliente ponta a ponta no Edge em
  1366 px e 390 px: escolher Fiat Uno 2010, selo em todos os cartões, Freios (119 peças), detalhe com
  aplicação, frete para o CEP 07110-000 (5,2 km, R$ 12,00), carrinho com frete, checkout com endereço
  preenchido pelo CEP, mensagem do WhatsApp conferida, link compartilhado abrindo a mesma peça, âncoras,
  sem rolagem horizontal e sem erro no console.

### Confirmar com o Berna antes de divulgar

Tudo funciona com os valores abaixo, mas são decisões da loja (todos em `lib/loja.ts`):

1. Número do WhatsApp da loja (hoje o fixo (11) 2452-8939).
2. Tabela de frete: até 3 km R$ 8 · 3–6 km R$ 12 · 6–10 km R$ 18 · 10–15 km R$ 25 · acima, a combinar.
3. Prazo de entrega ("mesmo dia útil para pedidos confirmados até as 16h") e de retirada.
4. Formas de pagamento na entrega/retirada (Pix, débito, crédito, dinheiro).
5. Horário de atendimento, Instagram e e-mail público (vazios hoje).
6. Texto de trocas e garantia.

### Para colocar no ar

- Deploy na Vercel (projeto `nova-leoes-preview`, CLI na conta do Arthur).
- Domínio próprio: apontar o DNS, trocar `og:image` para URL absoluta do domínio e tirar o `noindex`
  (`index.html` e `X-Robots-Tag` em `vercel.json`) quando quiserem aparecer no Google.
- Reexportar o catálogo periodicamente (preço/estoque das peças não integradas são da exportação; a data
  aparece no catálogo como "estoque de DD/MM"). Sincronização automática exige um endpoint novo no Nexus.

## Revisão final — 27/09/2026

Revisão independente do código mais teste da build de produção servida com os cabeçalhos do `vercel.json`
(CSP ativa, API da gestão fora do ar de propósito). Corrigido:

- **Código de fabricante vazando**: 39 nomes ("( Usar GP30120 )", "Atual T-010037") e 1.132 linhas de descrição
  ("COD Fabricante: 000330019", "Orig 7.086.502", "Cod. Metalsystem ----> M31544"). Agora `removerCodigos` e
  `cortarCodigos` limpam nome, descrição e observação de aplicação, e o `construir.mjs` **falha** se algum texto
  publicado ainda casar com `VAZAMENTO_CODIGO`. Resultado: zero.
- **Filtro na URL por nome** (`?montadora=Fiat&modelo=Uno`), resolvido depois que o catálogo carrega. Link antigo
  ou inválido é ignorado em vez de derrubar a página; `utm_*`, `gclid` e `fbclid` são preservados; escolher o
  carro com uma peça aberta mantém o `?peca=`.
- **Busca do topo** perdia o foco ao clicar (o catálogo roubava o foco): agora só rola a página.
- **Frete**: a retirada escolhida voltava sozinha para entrega ao reabrir o carrinho; CEP inválido depois de um
  válido mantinha o frete antigo; respostas de CEP fora de ordem podiam gravar o endereço errado. Os três corrigidos.
- **Carrinho**: peça integrada adicionada antes da API responder não duplica mais; peça que saiu do catálogo
  bloqueia "Finalizar" com aviso (antes ia ao WhatsApp como "Peça indisponível"); o "−" para na venda mínima.
- **Venda mínima**: `quantidadeMinimaVenda` é a quantidade que o balcão já lança (ex.: 4 velas) e o preço é por
  unidade; o site mostra "venda mínima de 4" em vez de "Jogo com 4".

Verificação: `npm test` 150 testes (0 falhas); fluxo de cliente no Edge em 1366 e 390 px e seis cenários de
regressão na build de produção com CSP, todos OK. Script do fluxo: fora do repositório, em `C:dev_e2e-nl`.

## Pendências e limites

- **Dados da loja a confirmar** em `lib/loja.ts`: qual número tem WhatsApp (o site usa o telefone fixo
  `(11) 2452-8939` nos links `wa.me`), horário de atendimento, e-mail público e Instagram. O e-mail do
  ERP não foi publicado de propósito.
- **Texto de trocas e garantia** é genérico (garantia do fabricante + CDC, arrependimento de 7 dias para
  compra fora da loja). Revisar com a loja antes de divulgar.
- O catálogo é uma **fotografia** da exportação (data em `meta.json → exportadoEm` e no rodapé da
  gestão futura). Preço e estoque das peças não integradas podem mudar até a conferência da equipe.
- A classificação por departamento é heurística; revisar "Outras peças" e mover regras conforme a loja
  apontar. Ampliar o vínculo ERP para mais peças (aprovação online com reserva) é uma mudança no
  Nexus, fora deste repositório.
- Ainda não há página própria por peça (URL por produto) nem indexação: o site segue `noindex`.

## Atualização automática de preço e estoque — 28/09/2026

Em 3 dias sem reexportar (25/09 → 28/09), 20 preços mudaram e 27 peças esgotaram no ERP, mas o site continuava mostrando "Em estoque". Por isso a exportação passou a rodar sozinha.

- **Script:** `scripts/catalogo/atualizar.mjs`. Faz `git pull` da main, roda a exportação **somente leitura** no container de produção (a mesma do cabeçalho de `exportar-erp.cjs`), confere a exportação (precisa terminar em `NL_END` e ter pelo menos 90% das peças da anterior), roda o `construir.mjs` e, se algo mudou, commita `chore(catalogo): estoque e preços do ERP — DD/MM, HH:MM` e faz push na main. A Vercel publica sozinha. `--sem-publicar` commita sem push.
- **Onde roda:** num clone só para isso, `C:\dev\novaleoes-site-estoque`, sempre na main, para nunca tocar na pasta de trabalho. Precisa do AWS CLI com o profile `octopool` e do plugin do Session Manager (o PC do Luca tem os dois).
- **Agendamento:** tarefa do Windows "Nova Leoes estoque do site" chamando `scripts/catalogo/atualizar-agendado.cmd`. Log em `%TEMP%\nl-estoque-site.log`.
- **No site:** o catálogo mostra "estoque de DD/MM, HHh" com a hora da exportação.
- **Limite:** continua sendo uma fotografia (duas ou três por dia), não tempo real. Estoque ao vivo para todas as peças exige um endpoint público de leitura no Nexus (hoje só as sete peças integradas vêm ao vivo pela API do Commerce).
- **O site só acompanha o ERP (pedido do Luca, 28/09):** a exportação abre transação `SET TRANSACTION READ ONLY` e só faz `SELECT`; o `atualizar.mjs` se recusa a rodar se o `exportar-erp.cjs` perder a transação somente leitura ou ganhar qualquer comando de escrita. Nada do site grava no Nexus: os pedidos online (`PUBLIC_ORDERS_ENABLED`) estão desligados, e é só por eles que o Commerce reservaria estoque no ERP.
- **Só "tem / não tem":** o catálogo público guarda o estoque como 0 ou 1 (`construir.mjs`) e a API pública (`/api/public/catalog`) devolve `stock` 0 ou 1. A quantidade real não sai do servidor; no carrinho o limite é 20 unidades e a loja confere a quantidade no pedido.

## Fotos ilustrativas e desenho técnico — 28/09/2026

58% das peças com estoque não tinham foto e as pastilhas mostravam o desenho técnico do catálogo do fabricante (medidas), não a peça.

- **Desenho técnico** (`scripts/catalogo/fotos-desenho.json`): hoje só pastilhas. 1.112 das 1.118 fotos de pastilha do cadastro são desenho. A lista foi gerada medindo cada foto (proporção de branco, de traço escuro e de cor; desenho = traço fino sem a massa escura do material de atrito). O desenho sai da vitrine e aparece no detalhe como "Desenho técnico do fabricante" (campo `t` do detalhe). Foto nova de pastilha que chegar do ERP só entra na lista quando a medição for refeita.
- **Foto ilustrativa** (índice, posição 11 = 1): peça sem foto própria (ou só com desenho) recebe a foto real de outra peça do mesmo grupo, primeiro da mesma marca, com selo "Foto ilustrativa" no cartão e no detalhe. Grupos em que a escolha automática erraria têm foto fixa em `scripts/catalogo/fotos-ilustrativas.json` (pastilhas: foto real da Varga). `_fotoErrada` lista fotos do cadastro que mostram outra peça (ex.: coxim de motor numa pastilha SYL), tratadas como sem foto.
- **Resultado (com estoque):** 3.689 com foto própria, 3.888 com ilustrativa, 1.844 sem foto (grupos sem nenhuma foto).
- **Caminho definitivo:** a loja fotografa e cadastra no ERP; a atualização das 7h/13h traz a foto própria e o selo some. Lista priorizada entregue ao Luca em `Octopool/Documentos/Nova Leões - peças com estoque sem foto (2026-09-28).csv` (vault).

## Revisão de entrega — 28/09/2026

- **Busca** (`lib/catalogo-site.ts`, `textoBusca`/`termosDe`/`raizBusca`): o índice e o que o cliente digita passam
  pela mesma limpeza. Sem acento; apóstrofo e hífen somem (`D´agua` = `dagua`, `HR-V` = `hrv`); o resto da
  pontuação vira espaço. Na busca:
  - de/da/do/para/com são ignorados;
  - singular e masculino valem pelo plural e pelo feminino;
  - dt/ts/ld/le são siglas do balcão, e vw/gm são apelidos de montadora;
  - os grupos de óleo por viscosidade (`5W30`, `20W50`, `ATF`…) ganham "óleo lubrificante" no índice.

  O texto de marca, grupo e modelo é calculado uma vez por item da lista: montar as 39 mil peças continua em
  ~70 ms.
- **Nomes** (`nomes.mjs`): DIR vira "Direito" em peça de lado (lanterna, farol, retrovisor, porta…). Os
  adjetivos logo depois de um nome feminino concordam com ele: "Lanterna Traseira Direita", "Bandeja Completa
  Dianteira". A mudança entra na próxima atualização automática.
- **Frete** (`lib/frete.ts`, `lib/loja.ts`):
  - a loja passou para o nº 444 no OpenStreetMap (-23,4459 / -46,5476), e não mais o centro do CEP;
  - o limite de tempo é compatível com o iOS 15;
  - "CEP não existe" e "falha de conexão" têm mensagens diferentes;
  - o mesmo CEP é consultado uma vez só por visita.
- **Cache** (`vercel.json`): `/catalogo/*` usa `max-age=0, must-revalidate`, e a CDN da Vercel troca a cada deploy.
  Assim o navegador não mostra o estoque do dia anterior.
- **Pendência:** o nome dos arquivos de foto é o código interno do ERP. Ver
  [entrega de 28/09](entrega-2026-09-28.md#com-o-luca-e-o-trotta).
