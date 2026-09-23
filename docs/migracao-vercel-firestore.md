# Migração da Nova Leões para Vercel e Firestore

## Escopo aprovado e estado deste documento

O destino solicitado é Vercel para vitrine A/B, gestão e API; Firebase Authentication para os três acessos internos; Cloud Firestore para catálogo, pedidos, auditoria e tarefas de estoque. O Nexus/AWS continua como autoridade do estoque integrado, em seu repositório e publicação independentes. Os nomes de acesso do Master não significam SSO nem compartilhamento de senhas.

Este documento é um procedimento de migração. **A presença dos arquivos no Git não comprova provisionamento, importação, publicação ou conclusão da migração.** Registrar no encerramento os identificadores de deploy, hashes do export e do import, ambiente, validações executadas e pendências reais. A produção Cloudflare só pode ser considerada aposentada depois do corte e da conferência abaixo.

O importador foi exercitado em 32 casos locais persistidos em `tests/migration-firestore.test.mjs`, com fixtures e transação simulada: validação de escopo, referências, totais e unicidade, guardas de aprovação, histórico terminal, replay, comparação com destino, preservação do contador e da ordem do catálogo e nenhuma escrita em divergência. O dry-run do executável também passou. Esses testes não acessaram Firestore/D1 remotos e não comprovam permissões IAM, índices nem uma importação real.

## Modelo de dados e permissões

### Configuração de servidor

O projeto existente da Vercel é `nova-leoes-preview`, no escopo `arthurtrottacostas-projects`. As variáveis de produção ficam somente nesse ambiente; a API recusa namespace de produção em um preview. O backend usa a conta exclusiva `commerce-vercel@nova-leoes-commerce.iam.gserviceaccount.com`, com `roles/datastore.user`, sem permissões de administração do Firebase Authentication. Sua chave JSON fica na variável sensível `FIRESTORE_SERVICE_ACCOUNT_JSON`; a cópia operacional local usa Windows DPAPI, fora do Git. Revisar/rotacionar a chave na operação regular e revogá-la se houver exposição.

Variáveis necessárias: `STORE_OWNER`, `CATALOG_MODE`, `FIREBASE_PROJECT_ID`, `FIREBASE_API_KEY`, `COMMERCE_APPROVERS`, `COMMERCE_LOGIN_ALIASES`, `FIRESTORE_SERVICE_ACCOUNT_JSON`, `COMMERCE_ALLOWED_ORIGINS`, `RATE_LIMIT_SALT`, `CRON_SECRET`, `COMMERCE_ERP_ORIGIN`, `COMMERCE_ERP_TOKEN`, `COMMERCE_ERP_OWNER`, `REQUIRE_SHARED_STOCK`, `PUBLIC_ORDERS_ENABLED` e `COMMERCE_READ_ONLY`. Manutenção usa `COMMERCE_READ_ONLY=1` e `PUBLIC_ORDERS_ENABLED=0`; configuração normal usa `0` e `1`, respectivamente, somente após o corte.

Workload Identity Federation não foi adotado porque o guia Google exige projeto com faturamento habilitado. A chave de serviço restrita evita alterar o Spark apenas para essa federação. Nenhum plano pago ou vínculo de faturamento foi criado. Fontes: [servidores externos no Firebase](https://firebase.google.com/docs/admin/setup#initialize_the_sdk_in_non-google_environments) e [pré-requisitos WIF](https://docs.cloud.google.com/iam/docs/workload-identity-federation-with-other-providers).

### Reconciliação no plano atual

O cron Vercel Hobby é diário, às 07:00 UTC, e exige `CRON_SECRET`. Enquanto a gestão está aberta, suas consultas solicitam reconciliação com trava compartilhada de um minuto. Aprovação e demais comandos de estoque continuam síncronos e idempotentes, com tarefas duráveis se a resposta se perder. Sem operador conectado, uma tarefa incerta pode aguardar o cron diário ou uma reconciliação manual; **não é equivalente ao cron anterior de cinco minutos**. A frequência pode ser ampliada com um agendador compatível quando a operação exigir.

O catálogo público tem uma atualização sob demanda, limitada a uma tentativa a cada cinco minutos. Ela lê apenas o inventário do ERP e atualiza sua cópia no Firestore com controle de versão; não processa reservas, manutenção ou confirmação de eventos. Durante indisponibilidade, conserva a última cópia; a aprovação sempre revalida preço e disponibilidade. Não prometer prazo máximo de atualização durante uma falha do ERP.

Cada ambiente fica isolado em `commerce/{environment}/tenants/{owner}/stores/nova-leoes`, com `environment` igual a `staging` ou `production`. O documento da loja contém a linha original de `commerce_settings` e `_order_guard`. O contador permite ao servidor serializar criação de pedido e alterações do modo de estoque; o importador inicializa zero ou preserva o valor existente.

| D1 | Firestore, abaixo do documento da loja |
| --- | --- |
| `commerce_products` | `products/{id}` |
| `commerce_orders` | `orders/{id}` |
| `commerce_order_events` | `events/{id}` |
| `commerce_inventory_jobs` | `jobs/{id}` |
| Restrições únicas | `keys/{kind}_{sha256(value)}` |
| Evidência de importação | `migrations/{snapshotSha256}` |

Os campos das linhas são preservados em `snake_case`, inclusive JSON, datas, revisões, status e dados da aprovação. As chaves únicas têm `owner`, `store`, `kind`, `value` e `target_id`. Os tipos são `sku`, `idempotency`, `approval` e `job-revision`; este último usa `${order_id}:${local_revision}`. A identidade de tarefas antigas não pode ser regenerada: ela participa da idempotência com o ERP.

Produtos recebem `_position` para conservar a ordem visual do catálogo. O export D1 deve consultar produtos com `ORDER BY rowid`; quando não há posição explícita, o importador usa o índice do array a partir de zero. Uma posição explícita deve ser um inteiro não negativo. No destino, posições válidas já existentes são preservadas quando o export não especifica posição; posições ausentes são inicializadas. Uma posição explícita conflitante ou qualquer divergência nos dados de negócio continua bloqueando a transação.

`firestore.rules` nega todo acesso direto de clientes web, mesmo autenticados. A API autoriza o operador, valida a loja e usa credenciais de servidor controladas por IAM. Firebase Authentication não concede ao navegador permissão de ler ou escrever no Firestore. Não colocar credencial administrativa nem token do ERP em variáveis `VITE_*`, arquivos públicos ou bundles.

`firestore.indexes.json` declara as consultas de tarefas por estado/data e pedido/estado/revisão, e de eventos por pedido/data. Ordenação de pedidos por `created_at` usa o índice simples automático. Campos grandes sem consultas têm indexação desativada. Esperar os índices necessários ficarem prontos antes de abrir a gestão.

## Exportação e validação local

Usar um export JSON restrito à loja e ao ambiente corretos, gerado por consultas de leitura às cinco tabelas. O formato exigido é:

```json
{
  "schemaVersion": 1,
  "owner": "OWNER_EXATO_DO_AMBIENTE",
  "store": "nova-leoes",
  "tables": {
    "commerce_products": [],
    "commerce_orders": [],
    "commerce_order_events": [],
    "commerce_settings": [],
    "commerce_inventory_jobs": []
  }
}
```

As listas devem conter **todas** as linhas do escopo, com todas as colunas atuais, inclusive valores nulos. Produtos são exportados em `ORDER BY rowid`; `_position` é a única coluna adicional opcional aceita nesse tipo de linha. `commerce_settings` deve ter exatamente uma linha. O export final precisa ser obtido depois de interrompidas todas as escritas na origem. Dumps, credenciais e relatórios com clientes ficam em diretório ignorado pelo Git, como `outputs/migration/`, com acesso local restrito; não entram em commits nem em anexos públicos.

O comando abaixo é exclusivamente local: valida escopo, tipos, valores, referências, totais, unicidade, aprovação e tarefas, e devolve contagens e hash. **Não consulta o Firestore nem comprova compatibilidade com o destino.** Não necessita credenciais:

```powershell
node scripts/migrate-commerce-firestore.mjs --input outputs/migration/production.json --project nova-leoes-commerce --environment production --owner OWNER_EXATO_DO_AMBIENTE
```

Para staging, usar export e owner de staging e `--environment staging`. Nunca trocar apenas o nome do ambiente mantendo dados de produção como fixtures.

Revisar os avisos `legacyTerminalOrders` e `legacyTerminalJobs`. Um job `RESERVE` pendente sem aprovação bloqueia a importação. Tarefas já `APPLIED`/`FAILED`, vinculadas a pedidos `CANCELLED`/`COMPLETED`, podem ser histórico anterior à aprovação manual: são preservadas sem criar aprovação fictícia, com aviso de auditoria. O novo executor não pode reabrir ou executar essas tarefas terminais. Outros estados ativos sem aprovação são rejeitados.

## Comparação com destino e importação

Provisionar o banco `(default)` do projeto `nova-leoes-commerce`, as regras, índices e identidade de servidor antes desta etapa. A autenticação do importador aceita Application Default Credentials ou um token temporário em `GOOGLE_OAUTH_ACCESS_TOKEN`, somente no processo. Não aceita credenciais em flags, não imprime valores e não usa automaticamente a sessão de login do site. Um token temporário precisa estar válido durante toda a operação; expirado ele falha sem renovar por conta própria.

Somar `--check-remote` ao comando executa uma transação somente de leitura para comparar o destino. Ela verifica todo o conteúdo das cinco subcoleções de negócio e o documento da loja; dados extras ou diferentes encerram a operação. Repetir o import do mesmo snapshot é permitido. `_order_guard` existente é preservado; metadados da importação ficam separados das linhas de negócio.

Somente `--apply` autoriza escritas:

```powershell
node scripts/migrate-commerce-firestore.mjs --input outputs/migration/production.json --project nova-leoes-commerce --environment production --owner OWNER_EXATO_DO_AMBIENTE --check-remote
node scripts/migrate-commerce-firestore.mjs --input outputs/migration/production.json --project nova-leoes-commerce --environment production --owner OWNER_EXATO_DO_AMBIENTE --apply
```

A aplicação volta a ler e comparar o destino **dentro da mesma transação em que grava**. Nenhum documento divergente é sobrescrito. A transação cria as linhas ausentes, as chaves únicas e o manifesto, ou não grava nenhuma delas. O manifesto contém hash, contagens e data; o terminal não exibe nomes, contatos, payloads, senhas ou credenciais. O contador de escritas de uma repetição idêntica deve ser zero.

O importador é intencionalmente limitado ao piloto: no máximo 450 documentos incluindo manifesto, entrada/transação estimada de até 6 MiB e limite conservador de 900 KiB por documento. Ao exceder o limite, falha com `CONTROLLED_BATCH_PLAN_REQUIRED` ou `DOCUMENT_TOO_LARGE`; **não divide automaticamente em lotes parciais**. Um volume maior exige plano de migração controlado, validação e retomada próprios. Uma falha de RPC ou limite imposto pelo serviço também aborta a transação.

## Corte de produção

1. Validar no staging isolado o login Firebase, autorização por UID, rotas privadas, catálogo, pedido aguardando aprovação, aprovação manual, idempotência, concorrência e recuperação de tarefas. Usar ERP simulado/isolado; não criar movimentos no estoque real para testes automáticos.
2. Preparar o deploy Vercel sem receber pedidos nem executar reconciliação enquanto a origem continuar ativa. Conferir variáveis e segredos de produção, domínio, origem das requisições, cookies seguros, limites de autenticação e estratégia de reconciliação suportada pelo plano atual. Não usar a mudança de hospedagem para contratar plano ou aumentar recursos implicitamente.
3. Fechar **todas** as mutações Cloudflare antes do export final: pedidos públicos, aprovação, mudanças de pedido/catálogo/configurações, recuperação em rotas de leitura, cron e reconciliação. Desligar somente `PUBLIC_ORDERS_ENABLED` é insuficiente. Esperar a execução em curso terminar e conferir que não há job pendente ou operação de estoque em trânsito. Resolver pendências no ambiente ainda autoritativo antes de congelar; não inventar confirmação local.
4. Com a origem congelada e a API Vercel ainda sem escritas, exportar as cinco tabelas novamente. Rodar dry-run e comparação. Conferir contagens, revisões, status, guardas e hash; executar a importação final atômica. Arquivar a evidência sem dados de clientes em logs públicos.
5. Conferir contagens e replay sem alterações. Publicar/promover o Vercel e validar vitrine A, B, `/gestao`, APIs e ativos. Conferir uma sessão real do responsável; não registrar senha nem cookie. Só então habilitar pedidos e processamento de tarefas no destino.
6. Manter os endereços antigos Cloudflare apenas redirecionando navegações para o novo site. Rotas mutáveis antigas devem permanecer bloqueadas; não redirecionar silenciosamente `POST`, `PATCH`, `PUT` ou `DELETE` para repetir a operação em outro host. Retirar cron e bindings ativos da aplicação aposentada. Preservar D1 como histórico congelado durante a janela de recuperação; **não apagar o banco como parte do corte**.
7. Registrar a comprovação do novo destino, redirecionamento antigo, teste de login, contagens e jobs, custos/limites revisados e pendências. Publicação não comprova testes que ainda não ocorreram, e migração não garante ausência de falhas futuras.

## Recuperação e limites de rollback

Antes da primeira escrita real no Firestore, um rollback de hospedagem pode reabrir a origem congelada depois de desligar completamente a API e tarefas Vercel. Depois de qualquer pedido, aprovação ou comando criado no destino, **não reativar o D1 antigo diretamente**: ele ficou desatualizado. Congelar o destino, reconciliar com a autoridade do estoque, extrair os dados novos e planejar a volta sem perder revisões nem repetir reservas. Não operar as duas origens simultaneamente.

## Evidência do corte em 23/09/2026

- Firestore Standard `(default)`, `southamerica-east1`, `freeTier:true`; três índices necessários em `READY`, regras publicadas. Identidade de serviço consultou o destino e o vínculo ERP reconheceu a loja com sete produtos, sem movimentação de estoque.
- Origem congelada às 13:10 UTC com Worker `4f3c0285-4b89-496b-81e8-1bb583c168a9`, sem banco/cron. Resposta 503 confirmada. Exports repetidos após o congelamento tiveram o mesmo hash; export final às 13:11:18 UTC, em `backups/migration/d1-production-2026-09-23T13-11-18.998Z.json`, ignorado pelo Git.
- SHA-256 do arquivo: `8493a80242a1e0103b2ea84c23c23d678650f259a66dae222da89c0016030710`. Hash canônico do plano: `cc60f884994b835db93ccffd9b6030b8bbe7d9370e30e08a47aec6da5853e4e5`.
- Import atômico: 31 documentos de negócio e um manifesto; sete produtos, dois pedidos `CANCELLED`, sete eventos, duas tarefas `APPLIED` e 12 chaves únicas. Conferência remota posterior: 31 existentes, zero ausentes, zero divergências, zero escritas. Nenhuma venda ou movimento de estoque criado para testes.
- Deploy Vercel inicial `dpl_48ZriGEnddpiYZdNkArHC1tvhXJk`, `READY`, promovido para `nova-leoes-preview.vercel.app`; A, B, animação 1600px sem erro, imagens e catálogo verificados. `/api/auth/status` pronto; sessão e manutenção anônimas 401. Ainda em modo somente leitura, pedidos desligados para validar primeiro acesso real.
- Workers aposentados: produção `540b45dd-7209-47ed-97d8-cbd40792b700`; staging `fa8a7eed-3407-4faa-bca0-8ea7276de474`. Ambos retornam 302 para navegações à Vercel, preservando caminho/parâmetros; APIs retornam 410. O antigo endereço de staging também leva agora à produção Vercel, não a um ambiente de testes. D1 preservados e sem bindings de execução.
- Firebase continua administrado por `trottinha12@gmail.com`; `arthurtrottac@gmail.com` aceitou o convite adicional de proprietário. Nenhuma conta anterior removida. Os três UIDs internos do Commerce não foram alterados.
- Validação local: 141 testes, zero falhas/skips, usando emulador; build Vercel e execução do artefato Node 24 aprovados. Imports backend usam `.js` e a API usa adaptador explícito para rotas aninhadas, após identificar diferenças do runtime Vercel em relação ao Worker.

Pendência operacional: primeiro login real no endereço Vercel, liberação final dos pedidos e confirmação das variáveis de operação no deploy ativo. Não tratar publicação ou testes de provedor simulado como confirmação de senha real.
