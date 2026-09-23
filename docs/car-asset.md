# Carro ilustrativo da vitrine Nova Leões

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
