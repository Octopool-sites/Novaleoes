# Octopool Commerce — Nova Leões

Aplicação independente do Nexus, hospedada na conta Cloudflare da Octopool. A vitrine e a gestão usam Vite/React; uma API Worker e D1 guardam pedidos e auditoria. O conector de estoque se comunica com o Nexus por contrato `octopool.stock.v1`, credencial exclusiva da loja e chamadas de servidor.

## Regra da venda

1. O cliente envia uma solicitação: `AWAITING_APPROVAL` / `UNRESERVED`. Nenhuma reserva, baixa, reposição ou chamada ao ERP ocorre nesse envio, mesmo em uma repetição.
2. Uma pessoa autorizada usa **Aprovar venda** na gestão e confirma a operação. O servidor verifica novamente preço, estoque, revisão do pedido e configuração da loja.
3. O responsável e o horário ficam registrados. No modo integrado, uma tarefa durável solicita a reserva e sua confirmação no ERP. Respostas perdidas são recuperadas com a mesma identidade da operação. O pedido fica pendente enquanto a resposta não estiver confirmada.
4. Separação e pronto para retirada não baixam estoque físico. **Concluir retirada** solicita a baixa; cancelamento libera somente uma reserva existente. Cancelar uma solicitação não aprovada nunca soma peças ao estoque.

O banco impede a criação de tarefa de reserva sem uma aprovação registrada. As consultas e comandos privados exigem JWT Cloudflare Access válido, audiência correta e e-mail na lista explícita de responsáveis. Cabeçalhos antigos do Sites não dão acesso.

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

- Login da equipe: `ACCESS_ISSUER`, `ACCESS_AUDIENCE`, `COMMERCE_APPROVERS`. Criar a aplicação Access para gestão e APIs privadas, mantendo `/api/public/*` e a vitrine públicos. Configurar políticas somente para os responsáveis informados pelo proprietário.
- Estoque: publicar e verificar o conector Nexus, provisionar o vínculo exclusivo da Nova Leões e os SKUs conferidos. Guardar `COMMERCE_ERP_TOKEN` exclusivamente como secret Worker, com `COMMERCE_ERP_ORIGIN=https://api.octopool.com.br` e `COMMERCE_ERP_OWNER` igual ao `STORE_OWNER`. Nenhuma credencial no frontend, Git ou logs.
- Importar catálogo real e ativar a integração pela API privada. O script de provisionamento Nexus deve reler e conferir os saldos no momento da ativação; o plano local é apenas uma fotografia da auditoria.
- Testar login real, aprovação, recusa, retomada e isolamento no ambiente de teste. Só depois configurar `PUBLIC_ORDERS_ENABLED=1`. Produção exige `REQUIRE_SHARED_STOCK=1`; sem configuração compartilhada e responsáveis, a entrada de pedidos continua fechada.
- Confirmar retirada/pagamento na loja e forma de contato com o cliente. Não há gateway de pagamento, frete, confirmação automática por e-mail nem emissão fiscal neste fluxo.

O cron de produção executa a recuperação de estoque a cada cinco minutos. A gestão também pode recuperar uma operação já aprovada. Um pedido incerto continua pendente; não criar outro pedido para contornar uma falha de conexão.

## Situação em 12/09/2026

Staging publicado em https://octopool-commerce-nova-leoes-staging.nova-leoes-storefront.workers.dev/ — Worker versão `27d907b1-d923-48eb-adf6-08bcd6757830`, fonte `e8cc875`. As três migrações D1 foram aplicadas somente em staging. Verificação hospedada: vitrine e seis fotos HTTP 200; catálogo com sete peças; pedidos desligados; gestão anônima e JWT forjado HTTP 401; envio público bloqueado HTTP 503. D1 confirmou zero pedidos e zero tarefas de estoque após os testes. O navegador mostrou o carrinho bloqueado e nenhum erro ou aviso de console foi registrado nessa navegação.

O login da equipe ainda aguarda configuração e a identificação dos responsáveis. A ativação do Zero Trust Free apresentou exigência de cartão e autorização de excedentes; essa etapa não foi aceita. Nenhum plano pago foi contratado. `PUBLIC_ORDERS_ENABLED=0` em ambos os ambientes.

Foi feita auditoria **somente leitura** no ERP em produção, sem alterar saldos. O catálogo de teste contém sete peças com preço e disponibilidade dessa fotografia. O óleo de unidade LT ficou fora do piloto de peças inteiras. A foto da lâmpada foi omitida porque o cadastro referencia outro SKU. Catálogo em produção deve ser atualizado no momento da ativação.

O conector Nexus está na branch local `codex/commerce-stock-20260912`, com `origin/main` incorporado em `e4a2a2b7`; não foi publicado nesta etapa. Não há migrações Commerce aplicadas no PostgreSQL de produção nem vínculo real de estoque ativado. O checkout principal do Nexus foi preservado.

## Validação e limites

- 37 testes Node aprovados: exercitam o Worker, SQL transacional em SQLite, JWT assinado, isolamento, aprovação, cancelamento e falhas de comunicação. O ERP desses testes do Worker é simulado; não confundir com validação da conexão em produção.
- A suíte Nexus usa PostgreSQL real, isolado em localhost: 20 testes aprovados em 12/09/2026, incluindo balcão x site, última peça, cancelamento simultâneo e 20 solicitações sobre sete peças.
- Build TypeScript/Vite e empacotamento Worker verificados. A auditoria npm retornou zero vulnerabilidades após atualização das ferramentas de build.
- Falta autenticação real da equipe e teste operacional completo no ambiente hospedado. Aprovação protege o fluxo, mas não representa garantia de ausência de falhas. Falhas devem permanecer visíveis e recuperáveis.

Resultados temporários e planos operacionais ficam em `outputs/`, fora do Git. Tokens e arquivos de credenciais nunca devem ser salvos lá como documentação pública.
