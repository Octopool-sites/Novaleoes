# Nova Leões — site e Commerce

Escopo deste repositório: Nova Leões. Inclui vitrine, gestão, Cloudflare Worker e D1. O Nexus ERP é outro projeto, com publicação independente.

## Antes de trabalhar

- Ler README.md, conferir `git status`, branch e remoto. Preservar alterações existentes.
- Remoto autorizado: `git@github.com:ArthurTrottaCosta/Novaleoes.git`.
- Usar Node 22.13+ e dependências deste projeto. Não ligar node_modules de outro cliente por junction.
- O README contém evidências históricas datadas. Conferir o estado atual antes de afirmar como está a produção.

## Contratos que devem ser preservados

- Envio público cria pedido aguardando aprovação, sem reserva, baixa ou chamada de movimentação ao ERP.
- Aprovação autenticada revalida preço e disponibilidade; reserva e comandos devem ser idempotentes.
- Retirada baixa estoque físico. Cancelamento antes da aprovação não repõe estoque.
- Não criar vendas, recebimentos ou NF automaticamente sem um fluxo especificamente definido.
- O vínculo ERP é exclusivo da Nova Leões. Não copiar IDs, credenciais, responsáveis ou bancos para outro cliente.

## Verificação e publicação

- `npm test` e `npm run build` para mudanças de comportamento. Alterações apenas documentais não exigem nova suíte.
- Testes usam fixtures e banco local/isolado; não apontar testes automáticos ao D1 de produção.
- Staging e produção têm D1 distintos; declarar o ambiente nos comandos Wrangler.
- Commit/push não equivale a deploy. Reorganização local não exige publicação ou migrations.
- Credenciais, .env, .dev.vars, dumps e evidências privadas não entram no Git. A chave Supabase publicável é configuração pública; service_role e token ERP são secretos.

O padrão para próximos clientes está em docs/organizacao-clientes.md.
