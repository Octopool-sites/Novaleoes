# Octopool Commerce — Nova Leões

Aplicação independente do Nexus, hospedada na conta Cloudflare da Octopool. A vitrine e a gestão usam Vite/React; uma API Worker e D1 guardam pedidos e auditoria. O Supabase Auth identifica a equipe. O conector de estoque se comunica com o Nexus por contrato `octopool.stock.v1`, credencial exclusiva da loja e chamadas de servidor.

## Escolha de hospedagem gratuita

- Cloudflare Workers Free: arquivos estáticos da vitrine e gestão; Worker para a API e D1 para pedidos, catálogo e auditoria. Não exige Docker para publicar esse frontend/Worker.
- Supabase Free: projeto exclusivo `octopool-commerce-auth`, referência `vcmpehcvtywumwhathsr`, região São Paulo, somente autenticação. Os projetos existentes foram preservados. Cadastro público e usuários anônimos desativados.
- Nexus/AWS: continua como autoridade de estoque, com sua publicação Docker/ECS independente. Esta troca de login não cria serviço AWS permanente adicional; consumo de API/banco pode crescer com o uso.

Nenhum plano pago foi contratado. A etapa de cartão encontrada era do Cloudflare Zero Trust/Access, que não faz parte desta solução. As cotas Free não são ilimitadas: Workers tem 100 mil requisições dinâmicas/dia e 10 ms de CPU por requisição; arquivos estáticos são gratuitos e ilimitados. D1 Free tem 5 milhões de linhas lidas/dia, 100 mil escritas/dia e 5 GB no total. Ultrapassar cotas Free pode interromper operações. Supabase Free permite dois projetos ativos e 50 mil usuários ativos mensais, mas pode pausar projetos com pouca atividade após sete dias e não inclui backups automáticos. A conta tinha um projeto ativo antes da criação; a organização foi confirmada no plano Free.

Fontes oficiais: [Workers](https://developers.cloudflare.com/workers/platform/pricing/), [D1](https://developers.cloudflare.com/d1/platform/pricing/), [Supabase](https://supabase.com/pricing), [pausa de projetos](https://supabase.com/docs/guides/platform/free-project-pausing). Valores conferidos em 12/09/2026; reavaliar antes de ampliar a operação. Não prometer disponibilidade garantida ou custo zero em qualquer escala.

## Regra da venda

1. O cliente envia uma solicitação: `AWAITING_APPROVAL` / `UNRESERVED`. Nenhuma reserva, baixa, reposição ou chamada ao ERP ocorre nesse envio, mesmo em uma repetição.
2. Uma pessoa autorizada usa **Aprovar venda** na gestão e confirma a operação. O servidor verifica novamente preço, estoque, revisão do pedido e configuração da loja.
3. O responsável e o horário ficam registrados. No modo integrado, uma tarefa durável solicita a reserva e sua confirmação no ERP. Respostas perdidas são recuperadas com a mesma identidade da operação. O pedido fica pendente enquanto a resposta não estiver confirmada.
4. Separação e pronto para retirada não baixam estoque físico. **Concluir retirada** solicita a baixa; cancelamento libera somente uma reserva existente. Cancelar uma solicitação não aprovada nunca soma peças ao estoque.

O banco impede a criação de tarefa de reserva sem uma aprovação registrada. As consultas e comandos privados exigem identidade confirmada pelo servidor Supabase com `getUser()`, usuário autenticado não anônimo, e-mail confirmado e presença na lista explícita de responsáveis. Sessões ficam em cookies `__Host-`, Secure, HttpOnly e SameSite=Lax; respostas de autenticação não são armazenáveis em cache. Tokens não são devolvidos em JSON. Cabeçalhos antigos do Sites, cabeçalhos Cloudflare Access e metadados editáveis pelo cliente não dão acesso. Login tem limitação por IP/e-mail e exige origem válida.

## Ambientes e comandos

Use Node 22.13+ e `npm ci`. Cada ambiente tem D1 próprio; nunca apontar testes para o banco de produção.

```text
npm test
npm run build
npm run cf:check
npx wrangler d1 migrations apply DB --env staging --remote
npm run cf:deploy:staging
```

Produção substitui o Worker existente `nova-leoes-storefront`. Staging usa `octopool-commerce-nova-leoes-staging`. O ERP AWS, o site privado do Sites e o preview antigo Vercel têm publicações separadas.

## Configuração obrigatória antes de aceitar pedidos

- Login da equipe: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `COMMERCE_APPROVERS`. URL e chave publicável estão configuradas; a lista está vazia até o proprietário identificar os responsáveis. Provisionar somente as contas autorizadas, com e-mail confirmado e senha definida pelo próprio responsável. A chave publicável não é secreta; nunca usar `service_role` ou chave secreta na aplicação ou no Git.
- Convite/recuperação por e-mail: ainda não configurados. O [SMTP padrão Supabase](https://supabase.com/docs/guides/auth/auth-smtp) é limitado a membros da organização e não serve para e-mail de produção. Configurar um provedor SMTP antes de prometer convites e recuperação automática; não adicionar operadores à organização Supabase para contornar essa restrição. A interface orienta contato com o administrador enquanto isso.
- Estoque: publicar e verificar o conector Nexus, provisionar o vínculo exclusivo da Nova Leões e os SKUs conferidos. Guardar `COMMERCE_ERP_TOKEN` exclusivamente como secret Worker, com `COMMERCE_ERP_ORIGIN=https://api.octopool.com.br` e `COMMERCE_ERP_OWNER` igual ao `STORE_OWNER`. Nenhuma credencial no frontend, Git ou logs.
- Importar catálogo real e ativar a integração pela API privada. O script de provisionamento Nexus deve reler e conferir os saldos no momento da ativação; o plano local é apenas uma fotografia da auditoria.
- Testar login real, aprovação, recusa, retomada e isolamento no ambiente de teste. Só depois configurar `PUBLIC_ORDERS_ENABLED=1`. Produção exige `REQUIRE_SHARED_STOCK=1`; sem configuração compartilhada e responsáveis, a entrada de pedidos continua fechada.
- Confirmar retirada/pagamento na loja e forma de contato com o cliente. Não há gateway de pagamento, frete, confirmação automática por e-mail nem emissão fiscal neste fluxo.

O cron de produção executa a recuperação de estoque a cada cinco minutos. A gestão também pode recuperar uma operação já aprovada. Um pedido incerto continua pendente; não criar outro pedido para contornar uma falha de conexão.

## Situação em 12/09/2026

Staging publicado em https://octopool-commerce-nova-leoes-staging.nova-leoes-storefront.workers.dev/ — Worker versão `aeb85ca6-f088-4512-a536-ee80e4ca5ff7`. As três migrações D1 foram aplicadas somente em staging. A verificação anterior confirmou vitrine e seis fotos HTTP 200, catálogo com sete peças, envio público bloqueado HTTP 503 e D1 sem pedidos ou tarefas de estoque. `/gestao` agora entrega a tela pública de login; os dados da gestão continuam privados.

Login real Supabase foi validado na versão `a98ebc3b-6524-4e03-a92b-b94b17cd418e` usando conta sintética exclusiva: sessão verificada pelo servidor, API privada autorizada, bloqueio anônimo e de cabeçalhos forjados, cookies protegidos e logout. Nenhum pedido ou estoque foi alterado. A conta temporária foi excluída e a lista de responsáveis foi esvaziada na versão final. O teste revelou que o runtime hospedado rejeita `redirect:"error"`; usamos `manual` e recusamos respostas 3xx sem encaminhar credenciais. Há teste de regressão.

Falta identificar e liberar o primeiro responsável real. `PUBLIC_ORDERS_ENABLED=0` em ambos os ambientes. Produção continua servindo a vitrine estática anterior em https://nova-leoes-storefront.nova-leoes-storefront.workers.dev/; o Commerce dinâmico está somente em staging. O banco D1 de produção foi criado, mas não recebeu migrações nesta etapa.

Foi feita auditoria **somente leitura** no ERP em produção, sem alterar saldos. O catálogo de teste contém sete peças com preço e disponibilidade dessa fotografia. O óleo de unidade LT ficou fora do piloto de peças inteiras. A foto da lâmpada foi omitida porque o cadastro referencia outro SKU. Catálogo em produção deve ser atualizado no momento da ativação.

O conector Nexus está na branch local `codex/commerce-stock-20260912`, com `origin/main` incorporado em `e4a2a2b7`; não foi publicado nesta etapa. Não há migrações Commerce aplicadas no PostgreSQL de produção nem vínculo real de estoque ativado. O checkout principal do Nexus foi preservado.

## Validação e limites

- 42 testes Node aprovados: exercitam o Worker, SQL transacional em SQLite, identidade assinada, login/logout, proteção contra redirecionamento, isolamento, aprovação, cancelamento e falhas de comunicação. Supabase e ERP são simulados nessa suíte; o teste hospedado de autenticação usa o Supabase real separadamente.
- A suíte Nexus usa PostgreSQL real, isolado em localhost: 20 testes aprovados em 12/09/2026, incluindo balcão x site, última peça, cancelamento simultâneo e 20 solicitações sobre sete peças.
- Build TypeScript/Vite e empacotamento Worker verificados. A auditoria npm retornou zero vulnerabilidades após atualização das ferramentas de build.
- Falta acesso do responsável real e teste operacional completo do estoque no ambiente hospedado. A autenticação foi comprovada por API com conta temporária e a tela de login foi conferida no navegador; o fluxo visual autenticado da equipe e a capacidade sob carga ainda não foram homologados. Aprovação protege o fluxo, mas não representa garantia de ausência de falhas. Falhas devem permanecer visíveis e recuperáveis.

Resultados temporários e planos operacionais ficam em `outputs/`, fora do Git. Tokens e arquivos de credenciais nunca devem ser salvos lá como documentação pública.
