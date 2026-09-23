# Firebase Authentication — Nova Leões Commerce

## Situação desta migração

Implementação e configuração de **staging publicadas em 22/09/2026**. Projeto Firebase dedicado `nova-leoes-commerce`, aplicativo Web `1:21188332383:web:bb42f85855f58da05e44ea`, plano Spark ($0/mês no console), sem Analytics/Gemini. E-mail/senha habilitado, cadastro e exclusão públicos desativados, proteção contra enumeração ligada e política de senha exigida (12–128 caracteres). Chave de projeto instalada como secret Worker somente em staging; não há chave privada de service account.

Versão staging: `8373d58c-4dfc-466b-becb-1765d6056a88`. `/api/auth/status` confirmou autenticação configurada e recuperação disponível; pedidos de staging permanecem desligados. Cadastro de `arthur@octopool.com.br` preparado no console; **senha, confirmação do e-mail e login real ainda pendentes do usuário**. As regras da ferramenta de navegador exigem que o usuário insira e salve a nova senha pessoalmente.

Produção ainda seleciona Supabase explicitamente e não foi publicada nesta etapa. O Supabase antigo estava indisponível; conservar sua configuração não restaura o serviço. Não remover projetos de outros produtos para liberar uma vaga. Não alegar que a migração está concluída até validar a conta e publicar a troca em produção.

Escopo: somente login da equipe e recuperação de senha. Pedidos, catálogo e auditoria permanecem no Cloudflare D1; estoque permanece no Nexus. Não há migração de dados comerciais, usuário do ERP ou saldo. Uma solicitação pública continua sem reserva; só a equipe autorizada aprova uma venda.

## Configuração gratuita

1. Na conta Google da Octopool, criar ou selecionar um projeto Firebase dedicado ao Commerce da Nova Leões, **plano Spark, sem vincular faturamento**. Não ativar Analytics, Firestore, Storage, Functions, SMS ou recursos de outro produto para este login.
2. Em Authentication, ativar **E-mail/senha**; manter anônimo e provedores não utilizados desligados. Configurar política de senha com no mínimo 12 caracteres e proteção contra enumeração de e-mails. Usar endereços reais para recuperação.
3. Registrar um aplicativo Web para obter `projectId` e `apiKey`. O Worker usa apenas esses dois valores. Não criar nem carregar chave privada de service account, não usar Firebase Admin no navegador. A API key Firebase identifica o projeto; ela não concede acesso aos pedidos e não substitui a autorização do servidor.
4. Manter inicialmente o **handler de ações de e-mail hospedado pelo Firebase**, que recebe e consome o código de uso único. Os domínios padrão do projeto foram preservados; não há provedor OAuth nem `continueUrl` externa neste fluxo. Caso sejam adicionados, autorizar apenas os hosts exatos necessários. Não redirecionar os links de recuperação para `/gestao/primeiro-acesso`: essa rota é o fluxo histórico Supabase.
5. Revisar remetente, nome da aplicação e modelos de recuperação/verificação em português. Criar o usuário `arthur@octopool.com.br` no Authentication por administração. Não importar a senha antiga. Usar a recuperação para Arthur definir a própria senha, sem compartilhá-la.
6. A nova conta precisa confirmar o endereço real. Caso ainda não esteja confirmado, uma tentativa com a senha correta envia um link de verificação, sem abrir sessão da gestão. Após confirmar o e-mail, entrar novamente. Não marcar contas arbitrárias como verificadas para contornar esse controle.

O app não expõe cadastro público. Somente e-mail confirmado, identidade Firebase válida e presença em `COMMERCE_APPROVERS` permitem acesso. A allowlist é do servidor; metadados editáveis do usuário não atribuem papel. O usuário Firebase tem UID novo; eventos históricos permanecem intactos e a auditoria da aprovação continua identificada pelo e-mail do responsável.

## Variáveis por ambiente

```text
COMMERCE_AUTH_PROVIDER=firebase
FIREBASE_PROJECT_ID=<projectId confirmado no console>
FIREBASE_API_KEY=<apiKey do aplicativo Web confirmado>
COMMERCE_APPROVERS=arthur@octopool.com.br
```

Configurar em staging primeiro. Preferir `wrangler secret put FIREBASE_API_KEY --env staging` para evitar copiar a chave desnecessariamente em documentos; ela é uma chave publicável, porém pode sofrer abuso de cotas. `FIREBASE_PROJECT_ID` e `COMMERCE_AUTH_PROVIDER` podem ficar nas vars do ambiente. Restrições de chave devem permitir Identity Toolkit e Secure Token; restrições por Referer do navegador não servem para chamadas originadas no Worker. Nunca digitar a chave como argumento de shell nem imprimir arquivos com credenciais.

O valor `firebase` seleciona exclusivamente Firebase. Falha de login, ausência de configuração ou queda do provedor **não** aciona Supabase automaticamente. `supabase` é uma opção explícita de compatibilidade durante a migração. Valor desconhecido bloqueia autenticação e novas solicitações. Remover o código e as dependências legadas somente após a homologação e o período de retorno definido para a troca.

## Comportamento e proteção

- Login via REST no Worker. A senha vai somente ao endpoint fixo Identity Toolkit por HTTPS; não é armazenada. Redirecionamentos são recusados e o tempo de espera é limitado.
- JWT validado com chaves públicas Google, assinatura RS256, emissor, audiência do projeto, expiração, UID, `auth_time`, e-mail e provedor de senha. A consulta `accounts:lookup` ocorre antes de autorizar para conferir conta ativa, e-mail confirmado, UID e `validSince` após revogação/troca de senha.
- Tokens ficam exclusivamente em cookies `__Host-commerce-session-firebase-*`, Secure, HttpOnly, SameSite=Lax, sem domínio. Não chegam ao JSON da aplicação nem a localStorage. Refresh feito no servidor; a sessão exige novo login após sete dias desde a autenticação, mesmo que continue sendo usada.
- A saída limpa os cookies desse navegador, inclusive cookies antigos Supabase. Não revoga todas as sessões de outros dispositivos; para isso usar revogação administrativa ou recuperação/troca de senha no Firebase.
- Recuperação exige origem da própria aplicação, limitador por IP/e-mail e allowlist. A resposta pública é igual para e-mail desconhecido, não autorizado ou autorizado. Erros de rede/cota retornam indisponibilidade, sem fingir envio bem-sucedido. O link individual chega pelo provedor; nenhum token de recuperação é devolvido pela API Commerce.
- Login também exige origem e rate limit. Respostas de auth/sessão usam no-store. Falha de autenticação não altera pedidos ou estoque.

## Homologação antes da troca

1. Executar `npm test` e `npm run build` com Node 22.13+ neste repositório.
2. Publicar apenas staging com Firebase configurado e `PUBLIC_ORDERS_ENABLED=0`.
3. Arthur solicita recuperação, recebe o e-mail real, define senha no Firebase, confirma e-mail se necessário e entra na gestão. A senha deve ser digitada pelo usuário, fora do chat.
4. Conferir saída, senha errada, e-mail sem autorização, conta desativada e sessão invalidada após recuperação. Confirmar no navegador que tokens não aparecem no JSON nem no armazenamento acessível a JavaScript.
5. Exercitar pedido aguardando aprovação e aprovação idempotente apenas no ambiente isolado de teste, com catálogo/conector de teste. Não fazer baixa real para testar autenticação.
6. Somente depois trocar as vars/secret de produção e publicar. Repetir login e consulta privada em produção, sem pedido técnico que movimente estoque. Conservar o D1 e o vínculo Nexus existentes. Registrar versão Worker, horário e resultado da homologação.

O código contém testes simulados de assinatura/projeto, refresh, recuperação, revogação, e-mail não confirmado, queda/redirecionamento, CSRF, allowlist, logout, ausência de fallback e aprovação manual. Esses testes não comprovam entregabilidade do e-mail ou estado real de um projeto Firebase ainda não configurado.

## Fontes oficiais

- [Firebase Auth REST API](https://firebase.google.com/docs/reference/rest/auth)
- [Validação de ID tokens](https://firebase.google.com/docs/auth/admin/verify-id-tokens)
- [Sessões e revogação](https://firebase.google.com/docs/auth/admin/manage-sessions)
- [Ações de e-mail](https://firebase.google.com/docs/auth/custom-email-handler)
- [Limites Authentication](https://firebase.google.com/docs/auth/limits)
- [Planos Firebase](https://firebase.google.com/pricing)

Consultar cotas e disponibilidade na ativação. Não contratar Blaze nem alegar custo ou disponibilidade garantidos para qualquer volume.
