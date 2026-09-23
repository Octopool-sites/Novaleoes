# Nova Leões — roteiro de apresentação e ensaio

Preparado em 23/09/2026 para a equipe da Octopool. Duração sugerida: 7 minutos. Este roteiro explica o produto e orienta a demonstração. As versões visuais e a configuração Firebase foram publicadas em staging e produção; o primeiro login real da equipe ainda aguarda confirmação.

## Antes da reunião

- [ ] Confirmar o endereço e a versão que serão apresentados. `localhost`/`127.0.0.1` funciona apenas no computador que executa a prévia; não é um link para o cliente abrir no próprio aparelho.
- [ ] Abrir a vitrine e a gestão no navegador que será usado na reunião. Conferir o ambiente exibido pela gestão: teste ou operação da loja.
- [ ] Usar o modo aprovado de três logins internos sem caixa de e-mail, com cada conta vinculada ao identificador único do Firebase (UID). Ele já está implementado e publicado em staging e produção; validar a entrada real de cada responsável.
- [ ] Validar individualmente o acesso de Arthur, Carlos e Luca com a conta autorizada e a senha definida pelo próprio responsável. Usar os mesmos identificadores do Master não cria login único nem transfere a senha do Master.
- [ ] Confirmar entrada, saída e o procedimento administrativo de recuperação. Esses identificadores não recebem mensagens: não solicitar confirmação de e-mail nem prometer recuperação por link de e-mail. Uma configuração pronta ou uma conta na lista de responsáveis não comprova um login bem-sucedido.
- [ ] Abrir as duas versões visuais publicadas: V1 em `/` e V2 em `/?visual=editorial`. A V2 pública e seus três destaques foram conferidos; repetir o percurso no dispositivo da apresentação.
- [ ] Ensaiar busca, detalhes, adicionar/remover do carrinho e perguntas frequentes em computador e celular. Não enviar pedido técnico, aprovar venda, concluir retirada ou alterar integração em produção durante o ensaio.
- [ ] Se houver demonstração de aprovação, usar somente ambiente isolado, catálogo de teste e conector de teste já conferidos. Se esse ambiente não estiver disponível, explicar o fluxo abaixo sem executar a operação.

O login real ainda precisa ser confirmado antes de declarar os acessos da equipe homologados. Consulte o [estado do projeto](../README.md) e o [procedimento Firebase](firebase-auth.md); os registros anteriores são datados e devem ser confrontados com a versão efetivamente acessível.

Em 23/09, o usuário confirmou os três logins internos sem caixa de e-mail. O vínculo por UID foi implementado, 66 testes passaram e staging foi publicado na versão `fa2b0568-dc5b-4bee-b944-61ac49cdf340`. A mesma build foi publicada em produção na versão `ae8b0502-963f-4bb2-a7be-7d48a04becdb`.

A verificação pública confirmou página disponível, HTML correspondente à build, sete produtos, pedidos habilitados com aprovação obrigatória e sessão anônima recusada. A autenticação respondeu configurada, com acesso preparado e recuperação por e-mail desligada. Esses resultados não comprovam o login pessoal: a primeira entrada real de Arthur e a homologação individual de Carlos e Luca continuam pendentes.

Endereços de produção para apresentar a vitrine: [V1 — versão A](https://nova-leoes-storefront.nova-leoes-storefront.workers.dev/), [V2 — versão B](https://nova-leoes-storefront.nova-leoes-storefront.workers.dev/?visual=editorial) e [gestão](https://nova-leoes-storefront.nova-leoes-storefront.workers.dev/gestao). Pedidos estão habilitados neste ambiente; durante o ensaio, não enviar solicitações técnicas nem executar operações de estoque.

Staging continua como opção separada para ensaio, com pedidos públicos desligados: [V1](https://octopool-commerce-nova-leoes-staging.nova-leoes-storefront.workers.dev/), [V2](https://octopool-commerce-nova-leoes-staging.nova-leoes-storefront.workers.dev/?visual=editorial) e [gestão](https://octopool-commerce-nova-leoes-staging.nova-leoes-storefront.workers.dev/gestao). Isso permite revisar navegação e acesso; não significa que já exista um cenário de aprovação preparado para demonstração.

## Roteiro de 7 minutos

| Tempo | O que mostrar | Explicação sugerida |
| --- | --- | --- |
| 0:00–1:00 | Abertura do carro e os três destaques | “A Nova Leões ganha uma vitrine que apresenta as peças no contexto do carro e conduz o cliente ao catálogo. Ele também pode ir direto às peças.” O carro é ilustrativo: não comprova aplicação de um SKU. |
| 1:00–2:15 | Catálogo, busca, categoria e detalhes de uma peça | “O cliente encontra nome, marca, código e preço, e abre os detalhes antes de escolher. Modelo, ano e motor ajudam a equipe a conferir a aplicação.” Usar os dados exibidos pela API; não inventar desconto ou compatibilidade. |
| 2:15–3:00 | Carrinho e orientação de compra | Adicionar e remover uma peça sem enviar pedido. “O envio é uma solicitação. A equipe confere aplicação, preço e disponibilidade antes de aprovar. Pagamento e retirada são combinados com a loja.” |
| 3:00–4:00 | Como funciona, aplicação e dúvidas | “O site explica o próximo passo e reduz dúvidas sobre a peça e a retirada.” Comparar V1 e V2 pelo mesmo percurso, conforme a seção seguinte. |
| 4:00–6:00 | Gestão: Visão geral, Pedidos, Catálogo e Conexão com o ERP | Entrar com conta autorizada. Explicar os estados do pedido e a confirmação de aprovação; executar transições apenas no ambiente isolado previamente preparado. Em produção, limitar-se à consulta e não expor dados pessoais dos compradores na apresentação. |
| 6:00–7:00 | Retomar a vitrine | “A proposta é facilitar a escolha do cliente mantendo a decisão comercial com a equipe.” Pedir ao cliente que procure uma peça e explique o que acredita que acontecerá depois de enviar a solicitação. |

Os números da Visão geral representam os pedidos e estados disponíveis nesse ambiente. Não apresentar totais de pedidos como recebimento financeiro confirmado.

## O que muda usando Higgsfield

Higgsfield produz mídia: imagens e animações que depois são integradas ao site. O filme do carro aprovado já foi produzido dessa forma. A V2 reorganiza o visual e reaproveita a mídia Higgsfield existente, junto às fotos reais do catálogo. Não há novas imagens geradas nem novo gasto de geração nesta revisão: a nova geração permanece bloqueada pela autenticação de dois fatores do provedor de mídia.

A mudança pode ser significativa na hierarquia, no ritmo da página e na forma de apresentar as peças, mesmo usando os mesmos materiais. Essa comparação ensina o efeito da composição, do texto e do percurso até o catálogo; não isola o efeito de gerar novas imagens.

| Comparação | V1 — `/` | V2 — `/?visual=editorial` |
| --- | --- | --- |
| O que observar | Vitrine de referência, com o carro animado aprovado e navegação ao catálogo | Nova composição visual com reaproveitamento da mídia Higgsfield e fotos reais do catálogo, conforme a build de revisão |
| O que deve continuar igual | Catálogo, preços, disponibilidade, carrinho e regras de pedido | Os mesmos dados e regras; a mudança é na apresentação |
| Como avaliar | Localizar uma peça e entender a solicitação | Repetir a mesma tarefa e verificar se a mídia ajuda, distrai ou deixa o percurso mais lento |

As imagens editoriais são ilustrativas. Elas não substituem a foto real de uma peça, não demonstram a loja física, não são depoimentos de clientes e não comprovam compatibilidade. O catálogo continua sendo a fonte para o produto oferecido.

Higgsfield não autentica a equipe, não calcula disponibilidade, não aprova pedidos e não movimenta estoque. Mais imagens, por si só, não comprovam aumento de conversão. Para aprender com as versões, anotar manualmente o tempo para encontrar uma peça, as dúvidas recorrentes e se o cliente entende que o envio aguarda aprovação. O parâmetro visual não é, por si só, um experimento automático com medição de vendas.

## Da solicitação à baixa de estoque

| Etapa | Ação e efeito |
| --- | --- |
| 1. Solicitação | O cliente envia o pedido. Ele fica **Aguardando aprovação**, sem reserva ou baixa e sem comando de movimentação ao ERP. |
| 2. Aprovação | Uma pessoa autorizada confere o pedido e confirma **Aprovar e reservar peças**. O servidor revalida preço e disponibilidade e registra o responsável. |
| 3. Reserva | No modo integrado, a reserva é solicitada ao Nexus. Enquanto a confirmação não chega, o pedido pode ficar **Verificando estoque**; não tratá-lo como confirmado. As repetições usam a mesma identidade para evitar duplicação. |
| 4. Separação | **Em separação** e **Pronto para retirada** organizam o trabalho. Essas etapas não baixam o estoque físico. |
| 5. Retirada | Concluir a retirada solicita a baixa definitiva. Não lançar uma segunda baixa no balcão para a mesma retirada. |
| Cancelamento | Antes da aprovação, não há peça para repor. Depois de uma reserva, o cancelamento libera somente a reserva existente. |

Uma resposta incerta deve permanecer visível e ser recuperada, sem criar outro pedido para contorná-la. O fluxo busca evitar movimentos indevidos; não é uma promessa de ausência absoluta de falhas.

## Como o produto está organizado

| Parte | Responsabilidade |
| --- | --- |
| Site Nova Leões | Apresentação, busca, detalhes e solicitação do cliente. |
| Gestão Commerce | Equipe, pedidos, aprovação, catálogo e acompanhamento da integração. |
| Firebase Authentication | Identificação da equipe e validação da senha. No modo de três logins internos aprovado e publicado em staging e produção, o Commerce exige conta previamente autorizada e vínculo com o UID. Não exige verificação de e-mail nem oferece recuperação por e-mail para esses identificadores. O primeiro login real ainda precisa ser confirmado. |
| Cloudflare Workers e D1 | Hospedagem do site e da API, pedidos, catálogo e auditoria. O login de publicação da Cloudflare é separado do login da equipe. |
| Nexus ERP na AWS | Autoridade de estoque quando a integração da Nova Leões está ativa. Possui código e publicação independentes. |

Mudar o visual do site não publica alterações no Nexus. O compartilhamento de estoque acontece por um contrato específico de integração. O botão para abrir o ERP/Commerce é um atalho; ele não substitui esse contrato nem cria uma sessão de login compartilhada.

Neste fluxo, não há cobrança online, cálculo de frete, emissão fiscal automática ou confirmação automática do pedido por e-mail. Os três logins internos não dependem de uma caixa de e-mail. Validar o procedimento administrativo de recuperação antes da operação; não prometer um link de recuperação por e-mail.

## Se algo não estiver pronto no ensaio

- **Sem acesso Firebase confirmado:** apresentar a vitrine e o fluxo documentado; identificar a gestão como pendente de validação de acesso. Não emprestar uma senha nem usar a conta de outra pessoa.
- **Falha ao abrir a versão no dispositivo da reunião:** conferir o endereço e recarregar a página. Se precisar usar staging, identificá-lo como ambiente de validação com pedidos públicos desligados.
- **Sem cenário isolado de pedido:** explicar aprovação e estoque usando a tabela deste roteiro. Não usar uma venda real para provar o fluxo.
- **Sem mídia V2 integrada:** comparar somente o que realmente estiver visível. A geração de um arquivo não comprova sua presença na página.

Ao terminar, registrar qual versão foi apresentada, quais telas foram vistas, quem conseguiu acessar e quais pontos ficaram pendentes. As principais decisões com o cliente são: facilidade para encontrar a peça, compreensão da aprovação e informações que a equipe precisa para confirmar a aplicação.
