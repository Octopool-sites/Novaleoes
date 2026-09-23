# Octopool Commerce — Nova Leões

## Prévia em 22/09/2026

Nova vitrine com carro 3D que se separa durante a rolagem, três destaques ligados ao catálogo real, busca, carrinho e explicação de aprovação/retirada publicada **somente em staging**. [Abrir prévia](https://octopool-commerce-nova-leoes-staging.nova-leoes-storefront.workers.dev/).

Staging usa Firebase Authentication no projeto dedicado `nova-leoes-commerce` (Spark, sem Analytics), com recuperação por e-mail implementada. A definição da senha, confirmação do e-mail e primeiro login real de Arthur ainda precisam ser concluídos pelo usuário. Produção conserva a versão anterior e seu Supabase inativo: esta prévia não significa recuperação do login de produção. Consulte [migração Firebase](docs/firebase-auth.md) e [registro da vitrine](docs/storefront-scroll-20260922.md).

As seções de publicação de 12/09 abaixo são histórico, não o estado atual de staging.

Aplicação independente do Nexus, hospedada na conta Cloudflare da Octopool. A vitrine e a gestão usam Vite/React; uma API Worker e D1 guardam pedidos e auditoria. O Supabase Auth identifica a equipe. O conector de estoque se comunica com o Nexus por contrato `octopool.stock.v1`, credencial exclusiva da loja e chamadas de servidor.

## Repositório e organização

- GitHub: [Octopool-sites/Novaleoes](https://github.com/Octopool-sites/Novaleoes).
- Remoto SSH: `git@github.com:Octopool-sites/Novaleoes.git`.
- Organização dos sites de clientes: `Octopool-sites`. O repositório foi transferido da conta pessoal em 21/09/2026, mantendo sua identidade e histórico.
- Pasta de trabalho padrão: `%USERPROFILE%\Documents\Octopool\clientes\nova-leoes\site`.
- Este repositório contém a vitrine, a gestão do Commerce, a API Worker e as migrations D1. O Nexus ERP permanece em outro repositório.
- O histórico original foi preservado. A organização de pastas e o envio ao GitHub em 21/09/2026 não publicam uma nova versão na Cloudflare nem alteram o banco ou o estoque.
- Previews antigos são históricos; não usar suas configurações para publicar a operação atual.

Para outros clientes, seguir [o padrão de organização](docs/organizacao-clientes.md). Este projeto contém vínculos reais da Nova Leões e **não é um template pronto para duplicar e publicar**.

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

- Login da equipe: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `COMMERCE_APPROVERS`. Staging e produção permitem exclusivamente `arthur@octopool.com.br`, com e-mail confirmado e senha definida pelo próprio responsável. A chave publicável não é secreta; nunca usar `service_role` ou chave secreta na aplicação ou no Git.
- Convite/recuperação por e-mail: ainda não configurados. O [SMTP padrão Supabase](https://supabase.com/docs/guides/auth/auth-smtp) é limitado a membros da organização e não serve para e-mail de produção. Configurar um provedor SMTP antes de prometer convites e recuperação automática; não adicionar operadores à organização Supabase para contornar essa restrição. A interface orienta contato com o administrador enquanto isso.
- Primeiro acesso sem envio de e-mail: o administrador pode gerar um link individual com `auth.admin.generateLink`, tipo `invite` para nova conta ou `recovery` para conta existente. Entregar de forma privada `/gestao/primeiro-acesso#type=invite&email=...&token_hash=...`. O token fica no fragmento, é removido da barra de endereço após carregar e só é enviado no POST quando a pessoa salva a senha. Nunca guardar o link no Git ou em logs. A configuração atual expira o link após uma hora. O formulário exige 12 a 128 caracteres; o servidor confere token de uso único, origem, limite de tentativas e identidade autorizada antes de salvar. O usuário define a própria senha, sem compartilhá-la no chat. Abrir a página não consome o token; atualizar a página exige reabrir o link original.
- Estoque: publicar e verificar o conector Nexus, provisionar o vínculo exclusivo da Nova Leões e os SKUs conferidos. Guardar `COMMERCE_ERP_TOKEN` exclusivamente como secret Worker, com `COMMERCE_ERP_ORIGIN=https://api.octopool.com.br` e `COMMERCE_ERP_OWNER` igual ao `STORE_OWNER`. Nenhuma credencial no frontend, Git ou logs.
- Importar catálogo real e ativar a integração pela API privada. O script de provisionamento Nexus deve reler e conferir os saldos no momento da ativação; o plano local é apenas uma fotografia da auditoria.
- Testar login real, aprovação, recusa, retomada e isolamento no ambiente de teste. Só depois configurar `PUBLIC_ORDERS_ENABLED=1`. Produção exige `REQUIRE_SHARED_STOCK=1`; sem configuração compartilhada e responsáveis, a entrada de pedidos continua fechada.
- Confirmar retirada/pagamento na loja e forma de contato com o cliente. Não há gateway de pagamento, frete, confirmação automática por e-mail nem emissão fiscal neste fluxo.

O cron de produção executa a recuperação de estoque a cada cinco minutos. A gestão também pode recuperar uma operação já aprovada. Um pedido incerto continua pendente; não criar outro pedido para contornar uma falha de conexão.

## Publicação em 12/09/2026, horário de Brasília

- Loja: https://nova-leoes-storefront.nova-leoes-storefront.workers.dev/
- Gestão: https://nova-leoes-storefront.nova-leoes-storefront.workers.dev/gestao
- Worker de produção: versão `1d38025d-d3a5-4301-822e-15f179c5215f`, código Commerce `9559506`. As três migrações D1 foram aplicadas também em produção; pedidos públicos habilitados, aprovação manual obrigatória e estoque integrado exigido. O Worker substituiu a vitrine estática anterior.
- Staging permanece separado, com pedidos bloqueados: https://octopool-commerce-nova-leoes-staging.nova-leoes-storefront.workers.dev/gestao — versão `32a0da46-da7e-4184-836b-055ce0c0fe04`.
- Primeiro acesso de Arthur concluído pelo usuário. A mesma senha funciona nos dois ambientes; é necessário entrar separadamente em cada endereço, pois os cookies são restritos ao host.
- Nexus publicado no commit `ec7dc94f2f650c3c9d9b9205b350ce33b2c9f0b0`, também enviado para `origin/main`. Snapshot RDS `octopool-20260912-2154` disponível antes da publicação. Migrações `20260912190000_commerce_stock` e `20260912200000_commerce_binding_fk` confirmadas no PostgreSQL.
- Imagem backend `sha256:b2cf15575d41515df95ac7f007774c6d606c66bda41173aa36c9e1901ac3951f`; ECS web 2/2 e worker 1/1 estáveis, API saudável. Nenhum serviço permanente novo na AWS.
- Botão do ERP atualizado para a gestão Cloudflare. HTML e bundle público `/assets/index-CNAN-4gJ.js` verificados; invalidação CloudFront `IBG1TL2F6EZYZKCFC1DK72O19T` concluída. A aba Chrome já aberta ainda mostrou o bundle antigo em cache; a confirmação visual do novo destino nessa aba depende da atualização local pelo usuário.

O módulo privado `commerce-estoque-nova-leoes` e a proteção de saldo estão ativos exclusivamente na empresa `cmr9m6jgi001lx34fzpaeyrzn`, para sete peças conferidas. Conexão `cmtz4ld0500019e7uonvvn9ti`. Preços e quantidades foram conferidos por API real entre Cloudflare e ERP. O óleo em LT continua fora deste piloto de peças inteiras. A lâmpada continua sem foto porque o cadastro do ERP referencia outro SKU.

Verificação hospedada: envio e repetição de solicitação não criaram reserva no ERP; cancelamento antes de aprovar não movimentou estoque; aprovação autenticada reservou uma peça uma única vez; repetição não duplicou reserva; cancelamento liberou a peça. Os dois pedidos técnicos ficaram cancelados, explicitamente identificados como testes. A conta técnica temporária foi excluída e removida da lista de responsáveis. Auditoria PostgreSQL posterior confirmou todos os saldos físicos iguais aos iniciais e reservas zeradas. O cron recebeu os eventos restantes; às 22:26:33 não havia eventos sem reconhecimento nem tarefas D1 pendentes.

As publicações antigas do Sites e do Vercel são previews, preservados separadamente; o endereço operacional é o Cloudflare acima. O repositório Commerce permanece independente do Nexus e foi conectado ao remoto `Octopool-sites/Novaleoes` em 21/09/2026.

## Validação e limites

- 48 testes Node aprovados: exercitam o Worker, SQL transacional em SQLite, identidade assinada, login/logout, primeiro acesso, falha na definição de senha, recusa de reutilização e de identidade diferente, proteção contra redirecionamento, isolamento, aprovação, cancelamento e falhas de comunicação. Supabase e ERP são simulados nessa suíte; os testes hospedados de autenticação e ativação usam o Supabase real separadamente.
- A suíte Nexus usa PostgreSQL real, isolado em localhost: 20 testes aprovados em 12/09/2026, incluindo balcão x site, última peça, cancelamento simultâneo, retirada, devolução e 20 solicitações sobre sete peças. Também passaram 243 testes de regressão ERP e oito testes de presença/ausência do botão por empresa, módulo e papel.
- Build TypeScript/Vite e empacotamento Worker verificados. A auditoria npm retornou zero vulnerabilidades após atualização das ferramentas de build.
- A retirada física foi exercitada no PostgreSQL isolado, não em uma venda real da loja. A primeira operação real da equipe, a capacidade sob carga e a atualização do cache da aba antiga do ERP continuam sujeitos à homologação operacional. Não há gateway, frete, emissão fiscal nem recuperação de senha por e-mail automáticos nesta etapa. Uma retirada concluída no Commerce já baixa estoque; não lançar uma segunda baixa no balcão para a mesma retirada. O tratamento financeiro/fiscal precisa de fluxo próprio antes de automatizar essa parte.
- Nenhum plano pago foi contratado. Custos de uso AWS podem variar; não há garantia de custo invariável, capacidade ilimitada ou ausência de falhas. Falhas devem permanecer visíveis e recuperáveis.

## Pausa e recuperação

Para interromper novas solicitações, publicar o mesmo código com `PUBLIC_ORDERS_ENABLED=0` em produção. Isso preserva pedidos, histórico, reservas existentes e o trabalho da equipe. Não excluir banco, vínculo, módulo ou guarda de estoque para resolver erro de comunicação. Em operações pendentes, consultar a gestão e recuperar a operação com sua mesma identidade; não reenviar outra reserva nem compensar saldo manualmente.

Não fazer rollback do backend para uma imagem anterior às guardas enquanto houver produtos vinculados. Reverter a apresentação do site não reverte automaticamente o contrato de estoque. Backup, migrations e retorno de operação são verificações distintas. As cópias privadas de recuperação das credenciais estão protegidas pelo Windows DPAPI, fora do Git; o Worker usa seu secret de servidor.

Resultados temporários e planos operacionais ficam em `outputs/`, fora do Git. Tokens e arquivos de credenciais nunca devem ser salvos lá como documentação pública.
