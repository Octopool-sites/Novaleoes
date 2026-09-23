# Octopool Commerce — Nova Leões

## Firebase e nova vitrine publicados — 23/09/2026

O usuário confirmou três **logins internos** no Firebase Authentication: `arthur@octopool.com.br`, `carlos@octopool.com.br` e `luca@octopool.com.br`. Esses identificadores não são tratados como caixas de e-mail. Cada um deve constar em `COMMERCE_APPROVERS` e no mapa `COMMERCE_LOGIN_ALIASES`, vinculado ao UID exato da conta previamente criada no Firebase.

Senha e recuperação desses três acessos são administradas pelo responsável, sem envio de confirmação ou recuperação por e-mail e sem marcar um endereço fictício como verificado. O login do Commerce é independente do Master/ERP: **não há SSO, compartilhamento automático de senha ou importação de permissões do Master**. Para futuras contas com caixa de e-mail real, continua obrigatória a confirmação do endereço; a recuperação por e-mail permanece disponível para elas.

A implementação passou em 66 testes e no build e foi publicada em staging (`fa2b0568-dc5b-4bee-b944-61ac49cdf340`) e produção (`ae8b0502-963f-4bb2-a7be-7d48a04becdb`). Os dois ambientes usam Firebase e responderam `configured:true`, `accessReady:true`, `passwordRecovery:false`; a sessão anônima recebeu 401. Os pedidos de staging continuam desligados; produção aceita solicitações sujeitas à aprovação. **Os primeiros logins reais ainda aguardam validação pelos responsáveis; publicação não equivale a homologação de acesso.** Cloudflare continua hospedando site, API e D1; Firebase cuida somente da autenticação. [Configuração e homologação dos acessos](docs/firebase-auth.md).

A [vitrine de produção](https://nova-leoes-storefront.nova-leoes-storefront.workers.dev/) inclui o carro Higgsfield aprovado e os refinamentos de catálogo, carrinho e conteúdo. A versão A permanece padrão; a [versão B editorial](https://nova-leoes-storefront.nova-leoes-storefront.workers.dev/?visual=editorial) é optativa, com três destaques de cuidados e navegação para as categorias. Reutiliza a mídia Higgsfield já produzida e fotos do catálogo; novas gerações estão pendentes de acesso ao provedor. [Gestão](https://nova-leoes-storefront.nova-leoes-storefront.workers.dev/gestao), [registro da entrega](docs/release-2026-09-23.md) e [roteiro de apresentação](docs/apresentacao-nova-leoes.md).

## Histórico do diagnóstico — 22/09/2026

O quadro e as pendências abaixo registram o diagnóstico de 22/09, anterior à confirmação dos logins internos em 23/09. A exigência inicialmente prevista de confirmar o e-mail de Arthur foi substituída pelo vínculo explícito de alias e UID descrito acima.

**Firebase foi escolhido para o login da equipe. Cloudflare continua hospedando o site, a API e o banco.** São funções distintas; escolher Firebase Authentication não migra a hospedagem para o Google.

| Camada | Staging | Produção |
| --- | --- | --- |
| Site e API | Cloudflare Workers | Cloudflare Workers |
| Pedidos, catálogo e auditoria | Cloudflare D1, ambiente de teste | Cloudflare D1, banco de produção |
| Login da equipe | Firebase Authentication, projeto `nova-leoes-commerce`, configurado e publicado | Supabase legado; troca para Firebase ainda pendente |
| Estoque integrado | Testes isolados, sem movimentação de produção | Nexus/AWS, vínculo exclusivo da Nova Leões |

O Firebase ainda precisa da validação real da conta: definição da senha pelo responsável, confirmação do e-mail, recebimento da recuperação e entrada/saída da gestão. A publicação em staging não comprova esse acesso e não conclui a troca em produção. [Procedimento da migração](docs/firebase-auth.md).

Na consulta pública de 22/09, staging respondeu `configured:true`, `accessReady:true`, `passwordRecovery:true`; produção respondeu `configured:true`, `accessReady:true`, no formato anterior. Esses campos verificam configuração e lista de responsáveis: **não são uma consulta de saúde ao provedor nem evidência de login bem-sucedido**.

Reautenticar a **Cloudflare** autoriza a ferramenta de deploy a publicar o projeto. Essa credencial de infraestrutura é separada do login **Firebase** utilizado pela equipe da loja. A publicação do redesign continua pendente de autenticação Cloudflare e confirmação do deploy.

## Refinamento visual validado localmente — 22/09/2026

Catálogo, cartões de produto, modal, carrinho, rodapé e conteúdo editorial receberam melhorias visuais. A animação Higgsfield aprovada foi preservada e a mídia existente foi reaproveitada, sem nova geração ou gasto de mídia nesta etapa. Build e 59 testes passaram; catálogo, detalhes, carrinho, navegação e dúvidas foram revisados no navegador em larguras de computador e celular. Publicação pendente. [Registro desta revisão](docs/visual-polish-2026-09-22.md).

## Revisão Higgsfield em 22/09/2026

Nova abertura fotorealista produzida com imagens e vídeo da API Higgsfield, controlada pela rolagem, integrada e validada localmente. Substitui o carregamento do modelo Three.js anterior. Filme otimizado de 2,4 MB, três destaques ligados ao catálogo e imagem estática para movimento reduzido/falhas. [Registro técnico e validação](docs/higgsfield-car-20260922.md).

O deploy desta revisão aguarda reautenticação Cloudflare. A prévia hospedada abaixo ainda apresenta a versão anterior. Produção não foi modificada nesta revisão.

## Prévia publicada em 22/09/2026 — versão anterior

Nova vitrine com carro 3D que se separa durante a rolagem, três destaques ligados ao catálogo real, busca, carrinho e explicação de aprovação/retirada publicada **somente em staging**. [Abrir prévia](https://octopool-commerce-nova-leoes-staging.nova-leoes-storefront.workers.dev/).

Staging usa Firebase Authentication no projeto dedicado `nova-leoes-commerce` (Spark, sem Analytics), com recuperação por e-mail implementada. A definição da senha, confirmação do e-mail e primeiro login real de Arthur ainda precisam ser validados pelo usuário. Produção conserva a versão anterior e a configuração Supabase legada; o último diagnóstico registrou o projeto Supabase indisponível. Esta prévia não significa recuperação do login de produção. Consulte [migração Firebase](docs/firebase-auth.md) e [registro da vitrine](docs/storefront-scroll-20260922.md).

As seções de publicação de 12/09 abaixo são histórico, não o estado atual de staging.

Aplicação independente do Nexus, hospedada na conta Cloudflare da Octopool. A vitrine e a gestão usam Vite/React; uma API Worker e D1 guardam pedidos e auditoria. A identificação da equipe segue o provedor selecionado em cada ambiente, conforme o quadro acima. O conector de estoque se comunica com o Nexus por contrato `octopool.stock.v1`, credencial exclusiva da loja e chamadas de servidor.

## Repositório e organização

- GitHub: [Octopool-sites/Novaleoes](https://github.com/Octopool-sites/Novaleoes).
- Remoto SSH: `git@github.com:Octopool-sites/Novaleoes.git`.
- Organização dos sites de clientes: `Octopool-sites`. O repositório foi transferido da conta pessoal em 21/09/2026, mantendo sua identidade e histórico.
- Pasta de trabalho padrão: `%USERPROFILE%\Documents\Octopool\clientes\nova-leoes\site`.
- Este repositório contém a vitrine, a gestão do Commerce, a API Worker e as migrations D1. O Nexus ERP permanece em outro repositório.
- O histórico original foi preservado. A organização de pastas e o envio ao GitHub em 21/09/2026 não publicam uma nova versão na Cloudflare nem alteram o banco ou o estoque.
- Previews antigos são históricos; não usar suas configurações para publicar a operação atual.

Para outros clientes, seguir [o padrão de organização](docs/organizacao-clientes.md). Este projeto contém vínculos reais da Nova Leões e **não é um template pronto para duplicar e publicar**.

## Histórico da escolha de hospedagem — 12/09/2026

Este registro descreve a implantação original com Supabase. Para a autenticação atual de staging e a troca planejada em produção, seguir [Firebase Authentication](docs/firebase-auth.md).

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

O banco impede a criação de tarefa de reserva sem uma aprovação registrada. As consultas e comandos privados exigem identidade verificada pelo servidor no provedor selecionado: Firebase valida o token e consulta a conta; o fluxo legado Supabase usa `getUser()`. São obrigatórios usuário autenticado não anônimo e presença na lista explícita de responsáveis. O e-mail deve estar confirmado, exceto nos logins internos Firebase vinculados explicitamente ao UID exato em `COMMERCE_LOGIN_ALIASES`; essa exceção preserva as verificações de senha, conta ativa e revogação. Sessões ficam em cookies `__Host-`, Secure, HttpOnly e SameSite=Lax; respostas de autenticação não são armazenáveis em cache. Tokens não são devolvidos em JSON. Cabeçalhos antigos do Sites, cabeçalhos Cloudflare Access e metadados editáveis pelo cliente não dão acesso. Login tem limitação por IP/e-mail e exige origem válida.

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

- Login Firebase: `COMMERCE_AUTH_PROVIDER=firebase`, `FIREBASE_PROJECT_ID`, `FIREBASE_API_KEY` e `COMMERCE_APPROVERS`. Para os três logins internos confirmados em 23/09, configurar também `COMMERCE_LOGIN_ALIASES` com os UIDs exatos observados no console. Seguir [configuração e homologação](docs/firebase-auth.md) em cada ambiente; os primeiros logins reais ainda precisam de validação após a publicação. Sem o mapa, volta a ser obrigatória a confirmação do e-mail. Mapa inválido bloqueia autenticação e novas solicitações.
- Login Supabase legado, selecionado em produção no diagnóstico de 22/09: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `COMMERCE_APPROVERS`. A configuração mantida não restaura um projeto indisponível. A lista histórica tinha somente Arthur; isso não define a lista atual de três usuários Firebase. Nunca usar `service_role` ou chave privada na aplicação ou no Git.
- Convite/recuperação por e-mail no legado Supabase: não configurados. O [SMTP padrão Supabase](https://supabase.com/docs/guides/auth/auth-smtp) é limitado a membros da organização e não serve para e-mail de produção. Essa limitação histórica não se refere à recuperação implementada no Firebase; não adicionar operadores à organização Supabase para contorná-la.
- Primeiro acesso sem envio de e-mail, **somente no legado Supabase**: o administrador pode gerar um link individual com `auth.admin.generateLink`, tipo `invite` para nova conta ou `recovery` para conta existente. Entregar de forma privada `/gestao/primeiro-acesso#type=invite&email=...&token_hash=...`. O token fica no fragmento, é removido da barra de endereço após carregar e só é enviado no POST quando a pessoa salva a senha. Nunca guardar o link no Git ou em logs. O fluxo legado configura expiração de uma hora e senha de 12 a 128 caracteres; o servidor confere token de uso único, origem, limite de tentativas e identidade autorizada antes de salvar. O usuário define a própria senha, sem compartilhá-la no chat. Abrir a página não consome o token; atualizar a página exige reabrir o link original. **Não usar essa rota para Firebase**: suas ações de e-mail usam o handler hospedado pelo próprio Firebase.
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

## Histórico de validação e limites — 12/09/2026

- 48 testes Node aprovados: exercitam o Worker, SQL transacional em SQLite, identidade assinada, login/logout, primeiro acesso, falha na definição de senha, recusa de reutilização e de identidade diferente, proteção contra redirecionamento, isolamento, aprovação, cancelamento e falhas de comunicação. Supabase e ERP são simulados nessa suíte; os testes hospedados de autenticação e ativação usam o Supabase real separadamente.
- A suíte Nexus usa PostgreSQL real, isolado em localhost: 20 testes aprovados em 12/09/2026, incluindo balcão x site, última peça, cancelamento simultâneo, retirada, devolução e 20 solicitações sobre sete peças. Também passaram 243 testes de regressão ERP e oito testes de presença/ausência do botão por empresa, módulo e papel.
- Build TypeScript/Vite e empacotamento Worker verificados. A auditoria npm retornou zero vulnerabilidades após atualização das ferramentas de build.
- A retirada física foi exercitada no PostgreSQL isolado, não em uma venda real da loja. A primeira operação real da equipe, a capacidade sob carga e a atualização do cache da aba antiga do ERP continuam sujeitos à homologação operacional. Não há gateway, frete, emissão fiscal nem recuperação de senha por e-mail automáticos nesta etapa. Uma retirada concluída no Commerce já baixa estoque; não lançar uma segunda baixa no balcão para a mesma retirada. O tratamento financeiro/fiscal precisa de fluxo próprio antes de automatizar essa parte.
- Nenhum plano pago foi contratado. Custos de uso AWS podem variar; não há garantia de custo invariável, capacidade ilimitada ou ausência de falhas. Falhas devem permanecer visíveis e recuperáveis.

## Pausa e recuperação

Para interromper novas solicitações, publicar o mesmo código com `PUBLIC_ORDERS_ENABLED=0` em produção. Isso preserva pedidos, histórico, reservas existentes e o trabalho da equipe. Não excluir banco, vínculo, módulo ou guarda de estoque para resolver erro de comunicação. Em operações pendentes, consultar a gestão e recuperar a operação com sua mesma identidade; não reenviar outra reserva nem compensar saldo manualmente.

Não fazer rollback do backend para uma imagem anterior às guardas enquanto houver produtos vinculados. Reverter a apresentação do site não reverte automaticamente o contrato de estoque. Backup, migrations e retorno de operação são verificações distintas. As cópias privadas de recuperação das credenciais estão protegidas pelo Windows DPAPI, fora do Git; o Worker usa seu secret de servidor.

Resultados temporários e planos operacionais ficam em `outputs/`, fora do Git. Tokens e arquivos de credenciais nunca devem ser salvos lá como documentação pública.
