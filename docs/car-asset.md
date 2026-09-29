# Carro ilustrativo da vitrine Nova Leões

## Atual: hatch cinza "da Higgsfield" em 3D (29/09/2026)

O Luca pediu de volta o carro do começo (o hatch cinza das imagens da Higgsfield de 22/09, `nova-leoes-assembled.webp` e `nova-leoes-exploded.webp`), agora em 3D com giro e os 9 números.

- **Base:** "2020 Hyundai i20 N- Line", de shreyanshchaurasia13, no Sketchfab, licença **CC BY 4.0** (baixado pela conta do Luca, GLB 38,9 MB, 633 malhas sem nome). É o modelo mais parecido com o carro da Higgsfield. Crédito em `/assets/car/ATTRIBUTION.txt`.
- **Montagem:** `scripts/carro/montar-hatch.mjs` (glTF-Transform + meshoptimizer + three, fora do build) gera `public/assets/car/nova-leoes-hatch-v1.glb` (3,2 MB, ~1,5 MB comprimido, 176 mil triângulos, 15 materiais, sem textura, só `KHR_mesh_quantization`). `scripts/carro/malhas-i20.json` é o índice das malhas do original usado para separar as peças.
  - metros, Y para cima, +Z frente, +X lado do motorista, chão em y = 0;
  - peças com nome e origem na dobradiça ou no cubo: `NL_CAPO`, `NL_TETO`, `NL_PORTA_DE`, `NL_PORTA_TE`, `NL_RODA_DE`, `NL_RODA_TE`, `NL_PARALAMA_DE`, `NL_DISCO_DE`, `NL_PINCA_DE`, `NL_FAROL_E`, `NL_VOLANTE`, `NL_CAMBIO`, `NL_ESCAPAMENTO`; o resto é `NL_CARROCERIA`;
  - feitas por código (o original não tem motor nem suspensão): `NL_MOTOR` (bloco, cabeçote, bobinas, coletor, alternador), `NL_CORREIA` (engrenagens dentadas vazadas e correia), `NL_FILTRO_AR` (elemento laranja que sobe na abertura) e `NL_AMORTECEDOR_DE` (mola vermelha);
  - fora do arquivo: emblemas, letreiros, logos do centro das rodas e placas;
  - materiais próprios: pintura cinza com verniz (único `MeshPhysicalMaterial`), preto acetinado, plástico, vidro, lente, cromo, roda, pneu, disco, lanterna, interior, motor, mola, filtro.
- **Movimento e números:** `components/carro-modelo.ts` (`MOVIMENTOS` com deslocamento e giro na dobradiça; `ZONAS` com o nó de cada número e a posição na foto de reserva). `tests/carro.test.mjs` confere nós, extensões, peso e departamentos.
- **Reserva sem 3D** (sem WebGL, economia de dados ou rede 2G): a própria foto da Higgsfield do carro aberto com os 9 números em HTML.
- **Foto de espera:** `nova-leoes-hatch-poster.webp`, capturada do 3D no enquadramento inicial, com fundo transparente sobre o estúdio bege.

## Anterior: Uno Mille 2001 (28–29/09/2026), registro histórico

- **Origem:** "UNO MILLE SMART 2001 - RIGGED MODEL", de bruno_sales, no Sketchfab, licença **CC BY 4.0** (uso comercial permitido com crédito). Baixado pela conta do Luca (GLB, texturas 1k, 27 MB). Crédito em `/assets/car/ATTRIBUTION.txt`, com link na abertura ("Créditos do modelo").
- **Otimização** (`public/assets/car/nova-leoes-uno-v1.glb`, 2,9 MB; ~1,3 MB com a compressão da Vercel): texturas até 1024 px em WebP, estepe e animação do autor removidos, malha simplificada (pneus 10%, resto 30%) e quantizada, sem decodificador (sem Draco/Meshopt, que exigiriam `wasm-unsafe-eval` na CSP). Script: `otimizar-uno.mjs` (glTF-Transform), fora do repositório.
- **Marca:** emblema da grade, adesivos da tampa e as duas placas escondidos em runtime (`OCULTAR` em `components/carro-3d.ts`). O carro é ilustrativo.
- **Peças que se movem** (`MOVIMENTOS`, em metros no mundo: x = lado do motorista, y = cima, z = frente): capô, bloco do motor, as duas portas, tampa do porta-malas, as quatro rodas, faróis, setas, grade e lanternas traseiras. Os nomes dos nós vieram com acento corrompido ("CAPÔ" → "CAP" + dois caracteres inválidos); `achar()` compara só letras e números.
- **Botões nas partes:** presos a nós reais (bloco do motor, cubo da roda dianteira, amortecedor dianteiro esquerdo dentro da malha dos quatro, painel, console, farol, traseira, porta). Ver `ZONAS` em `components/carro-interativo.tsx`.
- **Imagem de espera:** `nova-leoes-uno-poster.jpg`, capturada do próprio 3D.

## Anterior: Car Concept (22–28/09/2026), registro histórico

## Origem e licença

O asset deriva de [Car Concept, Khronos glTF Sample Assets](https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/CarConcept). O [README oficial, seção Legal](https://github.com/KhronosGroup/glTF-Sample-Assets/blob/main/Models/CarConcept/README.md#legal) atribui modelo e texturas a **Eric Chadwick, Darmstadt Graphics Group GmbH, 2024**, sob [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

O material original contém logos Khronos sujeitos a condições próprias. Esta derivação remove **todas** as imagens/mapas, além da geometria de emblema do volante e placa. Os materiais são neutros e não exibem marcas de fabricante ou Khronos. O veículo é ilustrativo: sua presença não comprova aplicação/compatibilidade dos produtos vendidos.

Manter um link de créditos acessível na vitrine para `/assets/car/ATTRIBUTION.txt`, junto à licença pública em `/assets/car/CC-BY-4.0.txt`. Os créditos também permanecem no campo `asset.copyright` do GLB.

## Arquivo e adaptação

- Original: `https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/CarConcept/GLB/CarConcept.glb` (10.267.996 bytes).
- Derivado: `public/assets/car/nova-leoes-concept.glb` (**4.637.048 bytes**, 4,42 MiB).
- SHA-256: `cb610e3436b5077664fbbeb576ef2a3af51f068143b3330d7d327628e6460db4`.
- 101 nós; 97 meshes; a hierarquia original foi mantida.
- Sem texturas, arquivos externos ou decoders Draco/KTX2. Usa apenas `KHR_mesh_quantization`, suportado pelo GLTFLoader, para normais `int16` normalizadas.
- Posições e índices preservados. Normais quantizadas, UVs e tangentes removidas, buffers reempacotados. Nenhuma redução da malha de posições.
- Materiais originais substituídos por materiais procedurais neutros no runtime.

Os nós separados incluem `Engine`, `BodyHood`, `BodyRoofPanel`, `BodyRearPanelsColor1`, `BodyDoorLColor1`, `BodyDoorRColor1`, `WheelFrontL/R` e `WheelRearL/R`. O parent original converte Z-up para Y-up. Portanto, os deslocamentos dos componentes usam Z local como altura.

## Cena e ciclo de vida

`components/car-scene.ts` exporta `mountCarScene(host, onReady, onError)`. O handle retornado possui `update(progress)` e `dispose()`. Progresso 0–0,45 separa os componentes; 0,45–1 aplica uma órbita discreta da câmera. A frente aponta para a esquerda.

O chamador deve carregar a cena de forma lazy e chamar `dispose()` no cleanup; se a Promise resolver depois do cleanup, deve descartar o handle imediatamente. Montagens repetidas no mesmo host descartam a anterior. Fetch tem AbortController; falhas de carregamento/WebGL chamam `onError` para manter o fallback estático do chamador.

Renderiza somente no carregamento, mudanças de tamanho e atualizações de scroll; não há loop contínuo nem rolagem capturada. DPR máximo 1,5 no desktop e 1,25 abaixo de 600px. Câmera ortográfica calcula o enquadramento integral da malha, inclusive rodas destacadas, em telas estreitas. O canvas é decorativo e invisível à árvore de acessibilidade; conteúdo, botões e explicação das peças permanecem em HTML no chamador.

## Verificação

A versão otimizada foi carregada via `GLTFLoader.parseAsync` em Node sem dependências de textura/DOM. Foram conferidas as hierarquias de capô, rodas e portas e o bounding box completo. A validação visual da composição ocorre no navegador junto à integração da vitrine.
