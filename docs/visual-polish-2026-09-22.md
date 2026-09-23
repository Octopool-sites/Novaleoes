# Nova Leões — refinamento visual, 22/09/2026

## Escopo

Refinamento da vitrine Nova Leões: catálogo, cartões de produto, modal, carrinho, rodapé e conteúdo editorial. A animação aprovada foi preservada, reutilizando o MP4 e as imagens existentes da [revisão Higgsfield](higgsfield-car-20260922.md). Não houve nova geração de mídia nem gasto adicional Higgsfield nesta etapa.

O fluxo continua apresentando produtos do catálogo, aplicação a conferir, solicitação sujeita à aprovação da equipe e retirada. Esta revisão visual não altera contratos de autenticação, pedidos, reservas, estoque compartilhado ou Nexus/AWS.

## Validação e publicação

- `npm run build` passou.
- `npm test`: 59 testes passaram.
- QA visual local no Chrome: 1440 × 900 e 390 × 844. Catálogo, modal, carrinho, passos de compra, guia de aplicação, dúvidas e rodapé revisados. Sem transbordamento horizontal observado; emulação de viewport, sem teste em aparelho físico.
- Busca por `filtro` retornou uma peça; categoria Motor retornou duas. Adicionar a bomba ao carrinho, aumentar para duas unidades (R$ 166,00), remover e voltar ao catálogo pelo estado vazio funcionaram. Dúvidas expandem com o texto correto; nenhum pedido foi enviado.
- Console do navegador sem erros ou avisos durante a revisão. O estado de envio desativado foi preservado.
- Redesign ainda não publicado. Deploy depende de reautenticação Cloudflare e confirmação da publicação; a prévia hospedada conserva a versão anterior.
- Produção preservada nesta revisão. Não foram enviados pedidos reais nem realizadas movimentações de estoque para validar o visual.

## Firebase e Cloudflare

Firebase Authentication foi escolhido para o login da equipe e está selecionado/configurado no staging publicado, no projeto `nova-leoes-commerce`. Produção ainda seleciona o Supabase legado. Senha, confirmação do e-mail, recebimento real da recuperação e primeiro login Firebase continuam pendentes de validação do responsável, conforme [migração Firebase](firebase-auth.md).

Na consulta pública de 22/09, `/api/auth/status` de staging respondeu HTTP 200 com `configured:true`, `accessReady:true`, `passwordRecovery:true`; produção respondeu HTTP 200 com `configured:true`, `accessReady:true`, no formato anterior. O endpoint confere configuração e lista de responsáveis; não prova login nem disponibilidade do provedor. Não houve tentativa de autenticação nessa auditoria.

Cloudflare hospeda o site/API e o banco D1. Firebase autentica os operadores. A autorização Cloudflare solicitada para publicar pelo Wrangler é uma credencial de infraestrutura, separada da senha usada pela equipe no Commerce. Trocar o provedor de login não migra a hospedagem e não altera o estoque no Nexus.
