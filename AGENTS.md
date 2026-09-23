# Nova Leões — site e Commerce

Escopo deste repositório: Nova Leões. Inclui vitrine, gestão, API Vercel/Firestore e o legado Cloudflare Worker/D1 preservado para a migração. O Nexus ERP é outro projeto, com publicação independente. Conferir o registro de corte antes de assumir qual ambiente está ativo.

## Antes de trabalhar

- Ler README.md, conferir `git status`, branch e remoto. Preservar alterações existentes.
- Remoto autorizado: `git@github.com:Octopool-sites/Novaleoes.git`.
- Usar Node 22.13+ e dependências deste projeto. Não ligar node_modules de outro cliente por junction.
- O README contém evidências históricas datadas. Conferir o estado atual antes de afirmar como está a produção.

## Contratos que devem ser preservados

- Direção visual aprovada em 23/09/2026: versão A, padrão em `/`. Próximas melhorias e apresentações usam A como base. Preservar B como alternativa histórica, sem mesclar seus elementos à A sem orientação do usuário.

- Envio público cria pedido aguardando aprovação, sem reserva, baixa ou chamada de movimentação ao ERP.
- Aprovação autenticada revalida preço e disponibilidade; reserva e comandos devem ser idempotentes.
- Retirada baixa estoque físico. Cancelamento antes da aprovação não repõe estoque.
- Não criar vendas, recebimentos ou NF automaticamente sem um fluxo especificamente definido.
- O vínculo ERP é exclusivo da Nova Leões. Não copiar IDs, credenciais, responsáveis ou bancos para outro cliente.

## Verificação e publicação

- `npm test` e `npm run build` para mudanças de comportamento. Alterações apenas documentais não exigem nova suíte.
- Testes usam fixtures e banco local/isolado; não apontar testes automáticos ao D1 de produção.
- Testes Firestore usam somente emulador local e namespaces sintéticos; não usar o projeto remoto como fixture. Produção Vercel não compartilha credenciais com previews.
- Staging e produção têm D1 distintos; declarar o ambiente nos comandos Wrangler.
- Após o corte, os comandos `cf:deploy:*` ficam bloqueados para evitar reativar o banco antigo. Só usar `wrangler.retired.jsonc` para manter redirecionamentos. Qualquer rollback de dados exige o procedimento de migração; não publicar o Worker legado por rotina.
- Commit/push não equivale a deploy. Reorganização local não exige publicação ou migrations.
- Credenciais, .env, .dev.vars, dumps e evidências privadas não entram no Git. A chave Supabase publicável é configuração pública; service_role e token ERP são secretos.

O padrão para próximos clientes está em docs/organizacao-clientes.md.
