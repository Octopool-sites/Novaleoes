# Organização dos projetos de clientes

Padrão adotado em 21/09/2026 para manter uma pasta de trabalho e um repositório próprio por cliente.

```text
Documents/Octopool/
  README.md
  clientes/
    nova-leoes/
      README.md             # índice local do cliente
      site/                 # repositório Novaleoes: vitrine + gestão + API
    <slug-do-cliente>/
      README.md
      site/                 # repositório exclusivo desse cliente
  modelos/
    cliente-README.md        # modelo do índice local
```

A raiz Octopool é um organizador local, não um repositório que reúne todos os clientes. O ERP Nexus mantém seu repositório próprio. Material pessoal e o vault Estudos ficam fora desta estrutura.

Os repositórios de sites de clientes ficam na organização GitHub [Octopool-sites](https://github.com/Octopool-sites). A pasta local não precisa mudar quando o proprietário GitHub muda. Nova Leões: `git@github.com:Octopool-sites/Novaleoes.git`.

Diretriz reafirmada em 23/09/2026: enviar os sites dos clientes para essa organização, cada cliente em seu próprio repositório. Manter a versão consolidada em `main` e usar branches para trabalho em andamento. A/B são variações do mesmo site e permanecem no mesmo repositório. A hospedagem é configurada separadamente por cliente; conferir a integração de deploy antes de presumir que um push publica o site.

A organização dos produtos centrais (ERPs, Conteúdo e componentes compartilhados) é uma decisão separada. Não transferir esses repositórios nem separar módulos existentes apenas para seguir a organização dos sites.

## Repetir para um novo cliente

1. Escolher nome e slug estável, em letras minúsculas sem acentos, separados por hífen.
2. Criar um repositório próprio na organização GitHub `Octopool-sites`, preferencialmente privado, e conferir seu proprietário e conteúdo antes de enviar arquivos. Se o repositório já existir em uma conta pessoal, transferi-lo preservando a identidade/histórico e atualizar o remoto local; não criar uma cópia concorrente.
3. Criar `clientes/<slug>/README.md` a partir do modelo local e preencher repositório, responsável, ambientes e situação do projeto.
4. Clonar o repositório em `clientes/<slug>/site`. Se já existe trabalho local, conferir seu Git, arquivos ignorados e dependências, mover a pasta inteira e preservar os commits. Não sobrescrever histórico remoto existente nem usar force-push para conciliar projetos.
5. Separar configuração e dados do cliente: marca, catálogo, domínio, projeto de hospedagem, API, bancos de teste/produção, autenticação, responsáveis e integração opcional com o ERP. Criar recursos somente quando forem necessários e dentro do orçamento combinado.
6. Guardar credenciais no cofre do serviço e, quando necessário, em arquivo local protegido fora do Git. Não copiar credenciais, dumps, pedidos, contas ou vínculos de outro cliente.
7. Instalar dependências próprias, validar testes/build e revisar o conteúdo que será enviado. Confirmar o SHA publicado no remoto.
8. Publicar somente no ambiente escolhido para esse cliente e validar os fluxos aplicáveis. Ter o código no GitHub não significa que o site foi publicado.

Este repositório da Nova Leões não é um template genérico: a configuração Vercel/Firebase e o conector são próprios dela; `wrangler.jsonc` preserva recursos históricos reais. Reutilização de componentes deve separar código comum de dados/configuração de cliente antes da publicação. Desde o corte de 23/09/2026, Vercel hospeda site e API, Firebase fornece autenticação e Firestore, e Cloudflare mantém somente redirecionamentos e os bancos arquivados.

## Arquivos locais e históricos

- Código e documentação operacional: versionados no repositório do cliente.
- `node_modules`, `dist`, `.wrangler`, `outputs`, `.env*`, `.dev.vars*`, backups e chaves privadas: locais/ignorados, sem envio automático ao GitHub.
- Versões antigas: identificadas como históricas e apontadas no índice do cliente. Não apagar ou mover junctions/worktrees sem conferir seus alvos e dependências.
- Obsidian empresarial: decisões, entregas e pendências. Evidências de execução são datadas; não representam monitoramento permanente.
- Não migrar o ERP, outros clientes ou pastas pessoais como consequência de organizar um cliente.
