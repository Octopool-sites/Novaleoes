# Nova Leões — carro com animação Higgsfield

## Escopo

Substitui a abertura 3D anterior por imagens e animação produzidas na API Higgsfield, integradas ao site existente. A conta da API é independente do plano do plugin/MCP. O usuário autorizou até US$ 3 do saldo existente, incluindo ajustes, sem recarga ou assinatura.

O veículo é ilustrativo. Amortecedor, filtro de ar e correia dentada abrem os produtos publicados retornados pelo catálogo; preço e aplicação continuam sob controle da loja. A imagem não é um desenho técnico de compatibilidade.

## Produção de mídia

Produção na API pré-paga, sem recarga ou assinatura. Nenhuma chave persistente criada: geração pelo Playground autenticado. Os valores abaixo são estimativas exibidas antes da geração; não representam uma tabela de preços permanente.

| Material | Modelo | Solicitação | Estimativa exibida |
| --- | --- | --- | --- |
| Carro montado | Marketing Studio Image 2.0 Alpha, high, 2k, 16:9 | `d01e8b39-28f8-4235-a2a2-f1258b367863` | US$ 0,215 |
| Carro aberto com referência da primeira imagem | Mesmo modelo | `5cc32f06-54cb-444e-aa8e-b3a2100ccd68` | US$ 0,226 |
| Animação inicial, 7s, sem áudio | Kling O3 First/Last Frame | `5a10952a-78b7-4c1f-9bc5-d86876b99bea` | US$ 0,667 |
| Refinamento da animação, 7s, sem áudio | Kling O3 First/Last Frame | `430ae680-5d59-460c-b265-c06c96fc9a1c` | US$ 0,667 |

A segunda animação foi escolhida após comparação visual: reduziu a deformação intermediária de um painel observada na primeira tentativa. Ambas foram preservadas em `outputs/higgsfield-20260922`, fora do Git. Apenas os arquivos finais destinados à vitrine entram em `public/assets/car`.

O MP4 final tem 7,04 segundos, 1600x904, H.264, 24 fps, sem áudio, 2.387.884 bytes. Foi otimizado com faststart e keyframes a cada seis frames para facilitar a navegação pela rolagem. Poster WebP de 93.334 bytes. O módulo de controle substitui o carregamento do Three.js usado na prévia anterior.

## Integração

- Vídeo silencioso e pausado; o progresso de rolagem controla o frame, inclusive no sentido inverso.
- Uma busca de frame por vez, com prioridade para o último progresso solicitado; sem loop contínuo de reprodução.
- Download do MP4 local para Blob, com cancelamento e liberação ao desmontar. Isso mantém a navegação entre frames quando o host responde sem suporte a Range. No ambiente local, o MP4 carregava inteiro, mas o intervalo navegável era `[0,0]`; com Blob passou a `[0,7.041667]`.
- Imagem estática leve durante carregamento ou falha. Movimento reduzido e economia de dados impedem a criação/download do vídeo.
- Navegação HTML, acesso direto ao catálogo e produtos continuam disponíveis sem animação.
- Nenhuma alteração nos contratos de pedidos, aprovação manual, estoque compartilhado ou Nexus/AWS.

## Verificação e publicação

- Build TypeScript/Vite passou. Módulo do filme: 4,80 kB (2,10 kB gzip).
- 59 testes passaram, preservando contratos de autorização, aprovação e estoque. Harness direcionado do filme validou fila de seeks, reversão, cancelamento, liberação de objectURL, falhas de resposta, movimento reduzido e economia de dados.
- Chrome real: seek de 0 a 6s e retorno a 0, carro montado/aberto, capítulo e produto correspondente. IAB: viewport 1440x900 e 390x844, rolagem até 6,708s, sem overflow horizontal no celular.
- Busca por amortecedor, acesso direto ao catálogo, modal de filtro de ar e adicionar/remover item do carrinho validados com fixtures locais. Nenhum pedido real enviado.
- Fallback visual e altura mobile corrigidos e verificados; retorno de preferências de movimento sincroniza novamente o capítulo.
- Consumo aproximado desta produção: US$ 1,74 pela diferença do saldo exibido, abaixo dos US$ 3 autorizados. Nenhuma recarga ou assinatura.
- Publicação de staging tentada, mas não concluída: Wrangler sem autenticação local. Nova autenticação Cloudflare solicitada ao usuário. A prévia hospedada ainda é a versão anterior até novo deploy confirmado.
- Produção preservada. Login Firebase real e promoção para produção continuam pendentes conforme `firebase-auth.md`.

O desempenho foi conferido no navegador desktop e em viewport responsivo. Não houve teste em aparelho móvel físico ou rede celular limitada.
