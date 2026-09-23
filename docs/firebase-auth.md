# Firebase Authentication — Nova Leões Commerce

## Modelo confirmado — 23/09/2026

O usuário confirmou a manutenção de três logins internos: `arthur@octopool.com.br`, `carlos@octopool.com.br` e `luca@octopool.com.br`. São identificadores de acesso, sem depender de caixas de e-mail. A autorização exige a presença em `COMMERCE_APPROVERS` e o vínculo de cada endereço ao **UID exato** da conta previamente provisionada no Firebase por `COMMERCE_LOGIN_ALIASES`.

Esses acessos usam senha e recuperação administradas pelo responsável. Não enviar `VERIFY_EMAIL` nem recuperação por e-mail para esses aliases, não marcar endereço fictício como verificado e não compartilhar senhas no chat. O Commerce mantém login próprio: não há SSO com o Master/ERP, cópia automática de senha nem herança de papel do Master.

A exceção é restrita aos pares configurados e não dispensa token válido, projeto correto, provedor de senha, conta ativa, consulta ao Firebase, revogação e allowlist. Mesmo que o e-mail apareça como verificado, outro UID não herda o acesso. Sem o mapa, permanece a confirmação obrigatória do e-mail; configuração inválida bloqueia autenticação e novas solicitações. Contas futuras com e-mail real seguem confirmação e recuperação por e-mail.

Código validado em 66 testes e build em 23/09. Staging publicado na versão `fa2b0568-dc5b-4bee-b944-61ac49cdf340` e produção em `fb5aa351-7ea7-43d5-949d-2c5f580ce44c`, com os três vínculos confirmados no console. Ambos selecionam Firebase exclusivamente. Status público: configuração e allowlist prontas, recuperação por e-mail desativada; sessão sem login recebe 401. **Os primeiros logins reais ainda aguardam validação pelos responsáveis.** A publicação autorizada foi realizada com as contas e UIDs conferidos e a suíte aprovada, antes dessa validação interativa; a homologação dos acessos permanece aberta. O diagnóstico de 22/09 abaixo é histórico.

## Histórico da migração — 22/09/2026

Implementação e configuração de **staging publicadas em 22/09/2026**. Projeto Firebase dedicado `nova-leoes-commerce`, aplicativo Web `1:21188332383:web:bb42f85855f58da05e44ea`, plano Spark ($0/mês no console), sem Analytics/Gemini. E-mail/senha habilitado, cadastro e exclusão públicos desativados, proteção contra enumeração ligada e política de senha exigida (12–128 caracteres). Chave de projeto instalada como secret Worker somente em staging; não há chave privada de service account.

Versão staging: `8373d58c-4dfc-466b-becb-1765d6056a88`. `/api/auth/status` indicou autenticação configurada e recuperação disponível; pedidos de staging estavam desligados. Cadastro de Arthur preparado no console. Na ocasião, senha, confirmação do e-mail e login real ficaram pendentes. A confirmação por e-mail inicialmente prevista foi substituída em 23/09 pelo modelo de alias vinculado ao UID; o registro anterior não comprova caixa postal existente nem login bem-sucedido.

Nesse diagnóstico, produção selecionava Supabase explicitamente e não foi publicada na etapa de 22/09. O Supabase antigo estava indisponível; conservar sua configuração não restaura o serviço. Não remover projetos de outros produtos para liberar uma vaga. Não alegar que a migração está concluída até validar as contas e publicar a troca em produção.

Escopo: somente login da equipe e recuperação de senha. Pedidos, catálogo e auditoria permanecem no Cloudflare D1; estoque permanece no Nexus. Não há migração de dados comerciais, usuário do ERP ou saldo. Uma solicitação pública continua sem reserva; só a equipe autorizada aprova uma venda.

## Configuração gratuita

1. Na conta Google da Octopool, criar ou selecionar um projeto Firebase dedicado ao Commerce da Nova Leões, **plano Spark, sem vincular faturamento**. Não ativar Analytics, Firestore, Storage, Functions, SMS ou recursos de outro produto para este login.
2. Em Authentication, ativar **E-mail/senha**; manter anônimo e provedores não utilizados desligados. Configurar política de senha com no mínimo 12 caracteres e proteção contra enumeração de e-mails. Usar endereços reais para recuperação.
3. Registrar um aplicativo Web para obter `projectId` e `apiKey`. O Worker usa apenas esses dois valores. Não criar nem carregar chave privada de service account, não usar Firebase Admin no navegador. A API key Firebase identifica o projeto; ela não concede acesso aos pedidos e não substitui a autorização do servidor.
4. Manter inicialmente o **handler de ações de e-mail hospedado pelo Firebase**, que recebe e consome o código de uso único. Os domínios padrão do projeto foram preservados; não há provedor OAuth nem `continueUrl` externa neste fluxo. Caso sejam adicionados, autorizar apenas os hosts exatos necessários. Não redirecionar os links de recuperação para `/gestao/primeiro-acesso`: essa rota é o fluxo histórico Supabase.
5. Provisionar por administração os três logins internos confirmados, conferir o UID de cada conta no console e configurar seu vínculo explícito por ambiente. Não importar senhas do Master ou do Supabase. Definir e recuperar as senhas por procedimento administrativo privado, sem enviá-las no chat. A criação no Firebase não concede acesso sem a allowlist e o mapa.
6. Para futuras contas com endereço real, revisar remetente, nome da aplicação e modelos de recuperação/verificação em português. Essas contas precisam confirmar o endereço. Uma tentativa com senha correta e endereço ainda não confirmado envia verificação sem abrir sessão; após confirmar, entrar novamente. Não marcar contas arbitrárias como verificadas para contornar esse controle.

O app não expõe cadastro público. Somente identidade Firebase válida e presença em `COMMERCE_APPROVERS` permitem acesso, com e-mail confirmado ou a exceção explícita de alias e UID. A allowlist e o mapa são do servidor; metadados editáveis do usuário não atribuem papel. Eventos históricos permanecem intactos e a auditoria da aprovação continua identificada pelo login do responsável. Recriar uma conta muda o UID: conferir a nova identidade antes de alterar seu vínculo, sem copiar permissões automaticamente.

## Variáveis por ambiente

```text
COMMERCE_AUTH_PROVIDER=firebase
FIREBASE_PROJECT_ID=<projectId confirmado no console>
FIREBASE_API_KEY=<apiKey do aplicativo Web confirmado>
COMMERCE_APPROVERS=arthur@octopool.com.br,carlos@octopool.com.br,luca@octopool.com.br
COMMERCE_LOGIN_ALIASES={"arthur@octopool.com.br":"UID_ARTHUR_CONFIRMADO","carlos@octopool.com.br":"UID_CARLOS_CONFIRMADO","luca@octopool.com.br":"UID_LUCA_CONFIRMADO"}
```

Os UIDs acima são marcadores de documentação: substituir pelos valores exatos conferidos no console, nunca publicar os marcadores. O mapa aceita objeto JSON de e-mail para UID, e-mails válidos sem duplicação após normalização para minúsculas e UIDs únicos de 1–128 caracteres alfanuméricos, `_` ou `-`. Nenhuma senha ou chave privada pertence a esse mapa. Removê-lo faz as contas voltarem à regra de confirmação de e-mail; isso bloqueia os aliases não verificados.

Configurar em staging primeiro. Preferir `wrangler secret put FIREBASE_API_KEY --env staging` para evitar copiar a chave desnecessariamente em documentos; ela é uma chave publicável, porém pode sofrer abuso de cotas. `FIREBASE_PROJECT_ID` e `COMMERCE_AUTH_PROVIDER` podem ficar nas vars do ambiente. Restrições de chave devem permitir Identity Toolkit e Secure Token; restrições por Referer do navegador não servem para chamadas originadas no Worker. Nunca digitar a chave como argumento de shell nem imprimir arquivos com credenciais.

O valor `firebase` seleciona exclusivamente Firebase. Falha de login, ausência de configuração ou queda do provedor **não** aciona Supabase automaticamente. `supabase` é uma opção explícita de compatibilidade durante a migração. Valor desconhecido bloqueia autenticação e novas solicitações. Remover o código e as dependências legadas somente após a homologação e o período de retorno definido para a troca.

## Comportamento e proteção

- Login via REST no Worker. A senha vai somente ao endpoint fixo Identity Toolkit por HTTPS; não é armazenada. Redirecionamentos são recusados e o tempo de espera é limitado.
- JWT validado com chaves públicas Google, assinatura RS256, emissor, audiência do projeto, expiração, UID, `auth_time`, e-mail e provedor de senha. A consulta `accounts:lookup` ocorre antes de autorizar para conferir conta ativa, e-mail, UID e `validSince` após revogação/troca de senha. A confirmação do e-mail é exigida fora dos pares de alias e UID explicitamente configurados; o vínculo também é verificado no refresh.
- Tokens ficam exclusivamente em cookies `__Host-commerce-session-firebase-*`, Secure, HttpOnly, SameSite=Lax, sem domínio. Não chegam ao JSON da aplicação nem a localStorage. Refresh feito no servidor; a sessão exige novo login após sete dias desde a autenticação, mesmo que continue sendo usada.
- A saída limpa os cookies desse navegador, inclusive cookies antigos Supabase. Não revoga todas as sessões de outros dispositivos; para isso usar revogação administrativa ou recuperação/troca de senha no Firebase.
- Recuperação exige origem da própria aplicação, limitador por IP/e-mail e allowlist. Aliases internos não fazem chamada de envio ao Firebase e recebem a mesma resposta neutra dos demais endereços. `passwordRecovery` fica falso quando todos os aprovadores são aliases; em lista mista, a recuperação continua disponível somente para os endereços reais. Para eles, erros de rede/cota retornam indisponibilidade, e o link individual chega pelo provedor; nenhum token de recuperação é devolvido pela API Commerce. O status indica configuração, não saúde do provedor nem prova de login.
- Login também exige origem e rate limit. Respostas de auth/sessão usam no-store. Falha de autenticação não altera pedidos ou estoque.

## Homologação antes da troca

1. Executar `npm test` e `npm run build` com Node 22.13+ neste repositório.
2. Publicar apenas staging com Firebase configurado e `PUBLIC_ORDERS_ENABLED=0`.
3. Arthur, Carlos e Luca entram com seus logins internos e senhas definidas administrativamente. Cada pessoa deve digitar sua senha fora do chat. Conferir a identidade retornada e o acesso privado de cada conta, sem enviar confirmação para os aliases nem alterar `emailVerified` para verdadeiro.
4. Conferir saída, senha errada, login sem autorização, UID divergente, conta desativada e sessão invalidada após troca administrativa de senha. Confirmar que recuperação de alias não envia e-mail e que tokens não aparecem no JSON nem no armazenamento acessível a JavaScript. Se houver uma conta real de teste, validar separadamente confirmação e recebimento da recuperação.
5. Exercitar pedido aguardando aprovação e aprovação idempotente apenas no ambiente isolado de teste, com catálogo/conector de teste. Não fazer baixa real para testar autenticação.
6. Somente depois trocar as vars/secret de produção e publicar. Repetir login e consulta privada em produção, sem pedido técnico que movimente estoque. Conservar o D1 e o vínculo Nexus existentes. Registrar versão Worker, horário e resultado da homologação.

O código contém testes simulados de assinatura/projeto, refresh, recuperação, revogação, e-mail não confirmado, queda/redirecionamento, CSRF, allowlist, logout, ausência de fallback e aprovação manual. A suíte também cobre alias sem envio de e-mail, UID divergente mesmo com e-mail verificado, mapa inválido, preservação da regra para contas reais e recuperação em lista mista. Esses testes não comprovam login real, entregabilidade do e-mail nem estado do projeto Firebase.

## Fontes oficiais

- [Firebase Auth REST API](https://firebase.google.com/docs/reference/rest/auth)
- [Validação de ID tokens](https://firebase.google.com/docs/auth/admin/verify-id-tokens)
- [Sessões e revogação](https://firebase.google.com/docs/auth/admin/manage-sessions)
- [Ações de e-mail](https://firebase.google.com/docs/auth/custom-email-handler)
- [Limites Authentication](https://firebase.google.com/docs/auth/limits)
- [Planos Firebase](https://firebase.google.com/pricing)

Consultar cotas e disponibilidade na ativação. Não contratar Blaze nem alegar custo ou disponibilidade garantidos para qualquer volume.
