# Nova Leões — vitrine e autenticação, 22/09/2026

## Publicação

- Prévia: https://octopool-commerce-nova-leoes-staging.nova-leoes-storefront.workers.dev/
- Worker staging: `8373d58c-4dfc-466b-becb-1765d6056a88`.
- Pedidos públicos em staging: desligados. Produção não publicada nesta etapa.
- Nenhuma alteração em Nexus/AWS, catálogo de produção, pedidos, reservas ou saldos.

## Experiência

Abertura com carro ilustrativo 3D, carroceria/rodas/capô separados pelo progresso de rolagem, sem capturar ou bloquear a rolagem nativa. Quatro capítulos: introdução, amortecedor, filtro de ar e correia dentada. Destaques abrem os produtos reais recebidos da API. Preços nunca são gravados no conteúdo editorial.

O cliente pode pular diretamente para o catálogo. Busca inclui os nomes legíveis das peças, além do código/marca/nome original. Carrinho e checkout conservam a solicitação sujeita à aprovação manual. Seções explicam aplicação, conferência, pagamento combinado e retirada. Não foram inventados depoimentos, compatibilidade, promoção, frete ou cobrança online.

Modelo 3D carrega em módulo separado, renderiza sob demanda, respeita preferência de movimento reduzido e mantém conteúdo/controles HTML quando WebGL falha. Asset 4,42 MiB com crédito CC-BY visível. A transferência inicial do asset ainda precisa de avaliação em aparelhos reais e redes móveis lentas; não houve teste de carga.

## Higgsfield

Plugin selecionado pelo usuário foi consultado. A tentativa `gpt_image_2_5` foi recusada com `Requires basic plan or higher`. Conta observada: Free, 10 créditos, trial pendente. Nenhuma mídia gerada, trial ativado ou assinatura contratada. A implementação entregue nesta prévia usa modelo 3D licenciado e Three.js; não afirmar que foi criada no Higgsfield. O usuário foi informado do bloqueio.

## Verificação

- 59 testes passaram, incluindo 11 testes Firebase e os 48 testes anteriores de autorização/aprovação/estoque.
- Build TypeScript/Vite passou. Aviso do chunk 3D >500 kB; é carregado dinamicamente, separado da gestão.
- Navegador local: abertura e desmontagem, capítulos, CTA direto, viewport 1440x900 e 390x844, busca por amortecedor, adicionar/remover do carrinho. Nenhum pedido de produção usado em testes.
- Banco local isolado em outputs/storefront-preview-state, com snapshot público de sete produtos. Não são credenciais nem dados de clientes.
- Prévia hospedada: site, catálogo e status de auth disponíveis; Firebase configurado, recuperação disponível, pedidos desligados.
- Login real, entrega do e-mail de recuperação e promoção para produção pendentes da senha/validação do usuário. Ver docs/firebase-auth.md.
