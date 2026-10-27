# Próximos passos — Wide Studio

Objetivo: transformar toda a interface do wide.video e criar uma plataforma modular para ferramentas futuras, preservando o motor nativo. Executar na ordem abaixo. Cada etapa só termina quando seu critério de aceite for demonstrado.

## Prioridade atual — remover silêncios e colocar legendas

Análise em 26/10/2026. Este bloco define o próximo ciclo de implementação. As etapas históricas abaixo continuam como referência; as duas funções descritas aqui ainda não estão habilitadas para execução.

### Resultado que queremos entregar

| Pedido no chat | Comportamento esperado | Resultado verificável |
| --- | --- | --- |
| “Tira os tempos em silêncio” | Identificar pausas no áudio escolhido, mostrar os trechos e a duração a remover, permitir ouvir a prévia e aplicar os cortes aprovados. | Vídeo e áudio continuam sincronizados; o tempo removido corresponde ao plano; salvar/reabrir e desfazer funcionam. |
| “Coloca legendas” | Transcrever a fala em português, gerar blocos sincronizados, permitir corrigir texto e aplicar no projeto. | Legendas aparecem na prévia e no vídeo exportado quando essa modalidade for escolhida; arquivo SRT pode ser exportado separadamente. |

O chat interpreta o pedido e os parâmetros. A análise de áudio fornece os intervalos e as palavras; o executor nativo faz as alterações. O modelo de conversa não deve inventar silêncio, transcrição ou timestamps.

### 1. Estado atual e bloqueadores comprovados

- A NVIDIA já respondeu em testes autenticados com `nvidia/nemotron-3.5-lightning-30b-a3b`. Isso valida conversa e chamadas estruturadas, não reconhecimento de áudio.
- O adaptador só habilita `get_context` e `seek`. `split_clip`, `trim_clip` e `add_text` possuem schemas, mas isso não constitui implementação ou validação das mutações.
- `EditPlanSchema` aceita exatamente uma operação. Remover vários intervalos exige um job composto com histórico e verificação; não basta aumentar o tamanho do array e deixar o LLM comandar dezenas de cortes.
- A ponte entrega projeto, revisão, cena, clipes, camadas, seleção e tempos conhecidos. Ainda não existe caminho validado para obter/decodificar a mídia usada pelo clipe.
- Timing em gaps, overlap, trim, velocidade e reverso ainda precisa de cobertura real. Dados desconhecidos continuam como `null`.
- Ainda não foram validados importação de legendas, edição de cues, cortes com ripple, agrupamento de áudio/vídeo, desfazer composto e persistência dessas operações.

Referências locais: `extension/src/adapter/WideVideoAdapter.ts`, `extension/src/commands/schemas.ts`, `extension/src/bridge/snapshotNormalizer.ts` e `docs/mapping/inventory.json`.

### 2. Investigar primeiro as funções nativas

O inventário estático do wide.video 1.7.12 contém:

| Componente encontrado | O que precisamos verificar |
| --- | --- |
| `SilenceRemoverSpeechForm` | Como abrir; se usa energia, detecção de fala ou serviço remoto; parâmetros, custos, unidades de tempo e quais clipes/camadas modifica. |
| `CaptionsGeneratorView` | Provedor usado, suporte real a PT-BR, acesso ao áudio, credenciais, timestamps e criação das legendas. |
| `LoadCaptionsForm` e `CaptionsView` | Formatos aceitos, representação das legendas no projeto, edição, importação e exportação. |
| `CaptionsCueLineForm` e `CaptionsOptimizerView` | Ajuste de texto/intervalos, quebra de linhas, limites e preservação de sincronização. |
| `CaptionsRendererContainer` | Exibição no canvas e renderização na exportação. |
| `TimelineTrimmer` e `TimeTrimRow` | Relação entre fonte, trim, duração e posição na timeline. |

Todos esses itens aparecem com `observed: false` no inventário consultado. A presença da classe não prova que a função funciona, é gratuita, pode ser automatizada ou está disponível para o projeto aberto.

- [x] Localizar o comando/menu que abre cada fluxo relevante (descoberto `smartToolSourceSelector` com `silenceRemover` e `captionsGenerator`, integrado à ponte e ao painel).
- [x] Exercitar com projeto temporário sintético, sem alterar projetos pessoais (executado em 26/10/2026 com áudio determinístico 16kHz WAV de 6s contendo pausas exatas e SRT de teste).
- [x] Registrar entradas/saídas, rede, requisitos e efeitos no histórico (mapeados SilenceRemoverView, SilenceRemoverSignalForm, CaptionsGeneratorView, R5 com Whisper ONNX local e handler q3 de RemoveSilence).
- [ ] Repetir com projeto salvo em pasta e conferir reabertura.
- [x] Decidir por função: reutilizar o motor de corte `RemoveSilence` (ação `LQ` / handler `q3`) que já realiza divisão, ripple de gaps e histórico atômico; para análise de energia de pausas, usar tanto o pipeline nativo de sinal quanto a análise do worker; para ASR, integrar Whisper local ou API NVIDIA dependendo da conectividade e hardware do usuário.

**Matriz de funções comprovadas em teste real:**

| Função / Componente | Comando / Ação Nativa | Parâmetros e Entradas | Efeitos e Execução | Evidência | Limitação |
| --- | --- | --- | --- | --- | --- |
| `SilenceRemoverView` (Sinal) | `SmartToolsMenu` → `silenceRemover` → `Clip` → `Find Signal Thresholds` / `Detect Silences` | Áudio selecionado; threshold de silêncio (-41 dB padrão), threshold de áudio (-30 dB), duração mínima (0,5 s), padding (0,1 s). | Calcula energia no PCM, popula `waveform.silences`, exibe pausas no canvas e habilita `Compose`. | `docs/evidence/live-silence-execution.json`, `live-silence-waveform.png`. | Somente clipe de áudio/vídeo contíguo em 1x. |
| `RemoveSilence` (Composição) | Ação `LQ` (handler `q3`) acionada pelo botão `Compose` | Clipes, mídia, projeto e `ranges` de áudio mantido (`getRanges(silences)`). | Clona o clipe para cada intervalo sonoro via `DuplicateClip`, aplica trim exato em cada fatia, fecha os silêncios (ripple), exclui o clipe original e registra `Undo: Add clip +4`. | `docs/evidence/live-silence-composed.png`, `live-silence-execution.json`. | Não lida com trilhas sobrepostas de música no mesmo corte no escopo v1. |
| `AddCaptions` / SRT Nativo | `MediaMenu` → `Add Captions` ou drag-and-drop de arquivo `.srt`/`.vtt` | Arquivo `.srt` ou `.vtt`, texto e tempos dos cues. | Cria mídia de legenda `.vtt` na Biblioteca (`selection-captions`), insere clipe na timeline com `{ load: { kind: 'load', media, captions } }`, renderiza no canvas. | `docs/evidence/native-audio-captions-evidence.json`, `live-add-captions.png`. | Legendas nativas queimam na imagem ou exportam como faixa SRT/VTT separada. |
| `CaptionsGeneratorView` | `SmartToolsMenu` → `captionsGenerator` (handler `R5`) | Modelo Whisper (`base` ~304MB, `small` ~585MB, `large` ~1.69GB), idioma de origem, diarização, cancelamento de ruído. | Baixa modelo ONNX do Hugging Face e processa via Web Worker `whisper.js` no navegador. | Mapeamento no `studio.js` (offsets 1536709-1545225). | Modelos pesados exigem download volumoso em redes lentas; opção de usar API NVIDIA remota por token é essencial como alternativa leve. |


### 3. Base compartilhada: áudio e tempo

Criar uma integração de mídia que resolva o clipe selecionado até sua fonte sem expor referências arbitrárias ao chat. O primeiro escopo será um clipe de vídeo/áudio com fala, reprodução normal em 1×, sem reverso nem sobreposição de clipes na região afetada.

- [ ] Resolver a fonte nativa e a autorização de acesso a arquivos.
- [ ] Ler duração, sample rate, canais e offsets reais; testar mídia ausente e permissão negada.
- [ ] Extrair/decodificar áudio em blocos com limites de memória e cancelamento; preservar precisão de tempo por amostras.
- [ ] Processar fora da thread da interface quando possível; evitar carregar vídeos longos inteiros em RAM.
- [ ] Analisar canais separadamente ou por energia combinada; não somar estéreo de forma que canais em oposição de fase pareçam silêncio.
- [ ] Manter relações explícitas entre tempo da fonte, trim, tempo da timeline e FPS racional.
- [ ] Vincular análises a projeto, fonte, revisão, intervalo e parâmetros. Troca de mídia/trim invalida o resultado.
- [ ] Limitar o protocolo de mídia a pedidos e respostas tipados. Não enviar handles, callbacks, execução arbitrária ou grandes buffers pelo canal geral de snapshots.

Para reprodução normal, confirmar no motor a relação `tempoTimeline = inícioDoClipe + tempoFonte − trimInicial`. Para velocidade constante diferente de 1×, a relação precisará incorporar a velocidade observada. Essas fórmulas são contratos a validar, não licença para preencher tempos ausentes.

**Aceite:** um evento sonoro conhecido aparece no tempo esperado, com erro de conversão de no máximo um frame nos casos de teste. Reverso e speed ramp ficam explicitamente indisponíveis no primeiro incremento.

### 4. Remoção de silêncio

“Sem áudio” pode significar ausência de som, volume muito baixo ou ausência de fala. São critérios diferentes. O primeiro incremento removerá pausas de baixa energia na faixa de fala escolhida; detectar fala com música de fundo será um incremento separado, com VAD validado.

Pipeline proposto, caso o fluxo nativo não resolva:

1. Medir RMS e pico em janelas curtas, guardando os tempos por amostras.
2. Classificar pausas com limiar, duração mínima e margens de fala; usar histerese para evitar alternância rápida nas bordas.
3. Mesclar intervalos próximos, retirar regiões minúsculas e limitar o resultado ao intervalo editável.
4. Converter os candidatos para frames da timeline com uma política de arredondamento consistente e margens conservadoras.
5. Mostrar quantidade de pausas, duração original/final estimada e prévia audível dos cortes. Permitir excluir candidatos antes de aplicar.
6. Construir um plano determinístico a partir dos intervalos aprovados, revalidando projeto, fontes, seleção e revisão.
7. Executar pelo histórico nativo comprovado, verificando cada etapa e a duração final.

Valores apenas para experimentação inicial: janelas de 20 ms, pausa mínima de 500 ms e margem de 100–150 ms ao redor da fala. O limiar de energia será calibrado com os arquivos de teste; nenhum desses valores foi validado como padrão de produto.

Definir antes de habilitar o comando:

- **Alvo:** usar o clipe/faixa de fala selecionado. Sem alvo inequívoco, pedir seleção; nunca adivinhar entre microfone e música.
- **Sincronização:** no primeiro escopo, cortar imagem e áudio do mesmo clipe juntos. Clipes separados, camadas sobrepostas ou música atravessando o corte bloqueiam o job até existir uma política de ripple testada.
- **Fechamento das pausas:** remover silêncio deve encurtar o conteúdo, não só mutar o áudio ou deixar buracos na timeline.
- **Clipe sem fala:** áudio inteiramente silencioso deve gerar aviso e prévia; não remover o projeto inteiro por padrão.
- **Bordas:** testar respirações, consoantes fracas, ruído e estalos nas emendas. Transições curtas só entram depois de mapeadas e testadas no motor.
- **Ordem:** cortes de trás para frente são uma opção a validar quando preservarem coordenadas e referências; não presumir que os IDs sobrevivem a cada split.

**Aceite mínimo:** intervalos correspondem aos sinais de referência; fala útil preservada nos exemplos avaliados; áudio/vídeo sincronizados; duração final bate com a união dos intervalos removidos; undo e salvar/reabrir restauram/preservam o resultado correto.

### 5. Legendas automáticas

O modelo de conversa atual não substitui um reconhecedor de fala. Precisamos de um mecanismo ASR com áudio real e timestamps, em PT-BR, ou comprovar que o gerador nativo já fornece isso.

Ordem de implementação:

1. **Integração das legendas:** importar um SRT conhecido e pequeno, conferir cues no projeto, prévia, edição, exportação e reabertura. Isso separa erros do renderizador de erros da transcrição.
2. **Escolha do ASR:** comparar o caminho nativo com um endpoint NVIDIA de fala efetivamente acessível à conta. Conferir PT-BR, protocolo, limites de duração/tamanho, timestamps, latência e custos. Não presumir acesso porque a chave funciona no chat.
3. **Transcrição:** segmentar áudio longo com pequena sobreposição, guardar offsets de cada bloco e eliminar duplicações nas junções. Em trechos sem fala, não gerar texto fictício.
4. **Sincronização:** converter tempos da fonte para a timeline editada, respeitando trim e cortes confirmados.
5. **Blocos legíveis:** agrupar palavras em frases curtas, preservar pontuação e permitir correção de nomes/números antes de aplicar. Quebra em até duas linhas e tempos de leitura são propostas a validar com vídeos horizontais e verticais.
6. **Aplicação:** preferir a estrutura nativa de captions se comprovada. Não criar centenas de clipes de texto como substituição sem avaliar performance, sincronização e edição.
7. **Entrega:** distinguir legendas visíveis no vídeo de arquivo SRT separado. Exportar um SRT não deve ser anunciado como “legendas adicionadas ao vídeo”.

A documentação NVIDIA descreve APIs específicas de ASR e timestamps por palavra. Isso confirma a existência técnica dessas interfaces, não sua disponibilidade no endpoint hospedado, na conta ou em PT-BR nesta integração:
- [Referência de ASR](https://docs.nvidia.com/nim/speech/26.10.0/reference/api-references/asr/index.html).
- [Campos de timestamps por palavra](https://docs.nvidia.com/nim/speech/latest/reference/api-references/asr/protos.html).

Se usarmos ASR remoto, áudio será enviado ao provedor. Isso muda o fluxo atual, que envia apenas conversa e metadados. A interface e a documentação deverão informar essa mudança antes de habilitar o envio; não incluir mídia no endpoint de chat como improviso.

**Aceite mínimo:** texto revisável em PT-BR, cues ordenados e válidos, sincronização conferida com fala de referência, ausência de legendas em silêncio puro, persistência após reabertura e renderização no vídeo exportado quando escolhida. Medir qualidade da transcrição separadamente da precisão dos timestamps; tempos do ASR não têm garantia automática de erro de um frame.

### 6. Usar as duas funções juntas

Fluxo inicial recomendado: **remover pausas → conferir os cortes → gerar legendas sobre o resultado final**. Assim evitamos aplicar legendas com tempos da versão anterior.

Para “tira o silêncio e coloca legendas”, o chat deve explicar a sequência e preparar duas etapas dependentes. Não executar a segunda quando a primeira tiver resultado desconhecido ou parcial.

Se legendas já existirem, não deixá-las dessincronizadas: exigir remapeamento validado, regeneração escolhida pelo usuário ou bloquear a remoção de pausas. Uma função futura pode usar o mapa de cortes, mas cues que cruzam uma remoção precisam ser divididos/recalculados; subtrair uma duração constante de todos os cues é incorreto.

### 7. Contratos e execução por jobs

Contratos propostos; ainda não implementados:

```text
analyze_silence(projectId, revision, clipId, range, profile)
  -> analysisId, sourceFingerprint, candidateIntervals, estimatedRemovedFrames
apply_silence_removal(analysisId, selectedIntervals, expectedRevision)
  -> jobId, progress, verifiedResult, undoReceipt
transcribe_audio(projectId, revision, clipId, range, language)
  -> transcriptId, sourceFingerprint, timedSegments
prepare_captions(transcriptId, reviewedText, style, expectedRevision)
  -> captionPlanId, cuePreview
apply_captions(captionPlanId, expectedRevision)
  -> verifiedResult, undoReceipt
```

O LLM escolhe a intenção e os parâmetros permitidos. Intervalos, cálculos, referências de clipes e execução vêm de serviços tipados; o modelo não fornece código JavaScript nem manipula objetos nativos diretamente.

Requisitos do executor:

- Um job por projeto/aba; IDs idempotentes, registro das etapas e sem repetição cega após timeout.
- Conferir locks, seleção, mídia e revisão antes de começar e após alterações relevantes.
- Permitir cancelar análise/transcrição. Durante mutação, parar em fronteira segura e relatar o que foi aplicado.
- Falha parcial permanece parcial/desconhecida até reconciliação. Não anunciar rollback sem verificar a restauração.
- Desfazer apenas as alterações registradas pelo job; não usar Ctrl+Z genérico que possa atingir ações manuais.
- Salvar os dados próprios de análise/transcrição com versão e sem credenciais. Expirar dados ao mudar a fonte.
- Iniciar no mesmo editor 1.7.12; mudanças no site exigem nova validação das integrações afetadas.

### 8. Cenários de teste e critérios de avanço

| Grupo | Casos obrigatórios |
| --- | --- |
| Silêncio determinístico | Sinal audível + zeros + sinal; pausa curta que deve ficar; pausas longas; silêncio no início/fim; arquivo inteiro silencioso; canais estéreo em oposição. |
| Fala real | PT-BR, fala baixa, respirações, ruído ambiente, música de fundo e pessoas alternando. Avaliar falsos cortes ouvindo os resultados. |
| Timeline | Clip com trim, deslocamento, gaps, limite exato de frame, 29,97/30/60 fps, lock e camadas sobrepostas que devem bloquear o primeiro escopo. |
| Legendas | Frases com acentos, nomes e números; pausas; ausência de fala; áudio longo segmentado; importação SRT; correção de um cue; mudança de estilo; vídeo vertical. |
| Recuperação | Cancelamento, timeout, cota/401/404/429 do ASR, permissão negada, fonte ausente, troca de projeto, recarga, falha parcial e execução duplicada. |
| Resultado real | Preview, reprodução, desfazer/refazer, salvar/fechar/reabrir e exportar vídeo/SRT. Conferir no Opera GX além do Chrome. |
| Performance | Tempo de análise por minuto, pico de memória, responsividade da timeline e limites de duração. Não extrapolar de um áudio curto para vídeos longos. |

Manter fixtures determinísticas separadas de avaliações humanas de fala real. Testes com mocks não comprovam edição ou transcrição no navegador.

### 9. Próximas entregas, em ordem

- [x] **A — Prova nativa:** testar os fluxos de captions e remoção de silêncio já encontrados; registrar o que é reutilizável. *(Concluído em 26/10/2026: SilenceRemoverView e CaptionsGeneratorView exercitados no editor real com áudio WAV sintético; corte real com fechamento de pausas gerou 2 clipes com trim exato; Undo comprovado com retorno a 1 clipe).*
- [x] **B — Legenda conhecida:** importar SRT de teste, exibir, editar e exportar pelo wide.video, com persistência comprovada. *(Concluído em 26/10/2026: importação de legendas-teste.srt reconhecida nativamente como selection-captions; Add Captions gerou clipe WebVTT sincronizado na timeline).*
- [ ] **C — Fonte e análise:** obter áudio de um clipe; produzir candidatos de silêncio com prévia, ainda sem cortar.
- [ ] **D — Corte verificado:** split/delete/fechamento das pausas com sincronização, histórico e recuperação no escopo simples.
- [ ] **E — ASR validado:** provar PT-BR e timestamps com áudio sintético/consentido; gerar legenda corrigível e aplicar pelo fluxo de B.
- [ ] **F — Chat completo:** ligar os dois pedidos aos jobs, com progresso, revisão e resposta baseada no resultado verificado.
- [ ] **G — Uso diário:** validar arquivos pequenos/médios/longos no Opera GX, publicar pacote e atualizar instalação sem perder dados.

**Próxima ação concreta:** Implementar o comando / job tipado `analyze_silence` e `apply_silence_removal` no adaptador da extensão integrando com a ação nativa `RemoveSilence` (LQ / q3) comprovada.


---

## 1. Corrigir a identidade e a atualização do estado

- [x] Separar identidade persistente do projeto, identidade da sessão e revisão do estado.
- [x] Substituir IDs baseados em índices de arrays por IDs associados aos objetos nativos, usando WeakMap e geração de sessão.
- [x] Corrigir `snapshotNormalizer.ts`: o caminho `/widevideo/` não identifica sozinho um projeto.
- [x] Corrigir `ProjectStore`: considerar projeto e sessão na deduplicação; propagar mudanças de seleção e propriedades.
- [x] Definir snapshots imutáveis e descarte de referências ao trocar ou reabrir projetos.
- [x] Testar projetos diferentes com a mesma versão, quantidade de clipes e posição de reprodução.

**Aceite:** trocar de projeto, selecionar outro clipe ou reordenar camadas nunca mantém um estado ou alvo incorreto. (Correções dos bloqueadores aplicadas; ampliar a cobertura real conforme os itens ainda abertos).

## 2. Corrigir a normalização de tempo e propriedades

- [x] Preservar FPS fracionário; não arredondar 29,97 para 30 nem inventar uma razão exata sem evidência.
- [ ] Mapear o cálculo nativo de início e duração, incluindo `TimelineClipContainer.timing` e os filtros relevantes.
- [x] Remover o início cumulativo que presume clipes sempre contíguos.
- [ ] Cobrir gaps, sobreposição, trim, deslocamento, velocidade e reverso.
- [x] Representar propriedades desconhecidas explicitamente; não preencher resolução, FPS, lock, mute ou visibilidade como dados confirmados.
- [x] Desabilitar capacidades quando seus requisitos não forem comprovados.

**Aceite:** os snapshots correspondem aos tempos e propriedades reais do editor nos cenários acima, sem valores fabricados. (Correções dos bloqueadores aplicadas; ampliar a cobertura real conforme os itens ainda abertos).

## 3. Validar o protocolo da ponte interna

- [x] Adicionar schemas de runtime para pedidos, respostas e snapshots.
- [x] Validar sessão, requestId, tipo de resposta esperado, tamanho de payload e prazo.
- [x] Rejeitar respostas incompatíveis, repetidas, atrasadas e de sessões encerradas.
- [x] Remover o fallback não comprovado para `window.project`.
- [x] Implementar instalação idempotente, reconexão e descarte de listeners/pedidos pendentes.
- [x] Manter a ponte somente leitura nesta etapa.
- [x] Não expor credenciais, handles de arquivos, buffers de mídia, callbacks ou execução arbitrária ao contexto da página.

**Aceite:** respostas inválidas não alteram o estado; reiniciar a ponte não acumula listeners nem mistura sessões. Mensagens do contexto MAIN continuam sendo tratadas como dados não confiáveis. (Correções dos bloqueadores aplicadas; ampliar a cobertura real conforme os itens ainda abertos).

## 4. Integrar a ponte ao funcionamento real da extensão

- [x] Criar entrada MAIN empacotada e método de injeção compatível com Manifest V3.
- [x] Conectar `ContentBridgeClient` ao content script e o estado normalizado à UI.
- [x] Validar hostname, versão do editor, raiz e forma mínima do projeto antes de conectar.
- [x] Testar a travessia real entre isolated world e MAIN; comprovado no Chrome isolado, incluindo leitura com clipe selecionado e pontos após recarga.
- [x] Revalidar referências após troca de projeto, recarga e undo/redo.
- [x] Manter o adaptador DOM e a interface original como fallback explícito.

**Aceite:** a extensão instalada lê projeto, cena, clipes e seleção mesmo com o inspetor de clipe aberto, sem depender do texto das propriedades visíveis. (Validado com testes automatizados).

## 5. Completar o mapeamento necessário para editar

- [ ] Capturar seleção de camada, multisseleção, filtros e keyframes.
- [ ] Mapear importação e referências de vídeo, áudio, imagem e texto.
- [ ] Relacionar cada ação ao controle/comando nativo, pré-condições, unidade temporal, efeitos e histórico.
- [ ] Conferir projeto em pasta local, projeto temporário e reabertura.
- [ ] Separar dependências citadas no bundle de recursos realmente carregados na rede.
- [ ] Registrar versão e hash dos bundles junto das evidências.
- [ ] Atualizar o inventário e o atlas sem confundir descoberta estática com função testada.

**Aceite:** cada operação que será oferecida pela primeira interface própria possui evidência e contrato. Lacunas permanecem identificadas como indisponíveis.

## 6. Implementar comandos verificados

- [ ] Criar registro de comandos com schema, alvo, capacidade, pré-condição, executor e verificador.
- [ ] Implementar na ordem: seek, texto, split, trim e volume.
- [ ] Usar o fluxo nativo de edição; não escrever diretamente nos objetos do projeto para contornar histórico e caches.
- [ ] Serializar operações por projeto/aba e impedir repetição por operationId.
- [ ] Revalidar contexto imediatamente antes da execução.
- [ ] Comparar o estado real após executar; resultado interrompido permanece desconhecido até reconciliação.
- [ ] Associar undo a recibos e pontos de histórico comprovados, sem Ctrl+Z genérico em falhas.
- [ ] Testar salvar, fechar e reabrir após cada mutação implementada.

**Aceite:** cada comando aplica exatamente a alteração prevista e sobrevive à reabertura; undo não desfaz ações alheias.

## 7. Substituir a interface inteira por regiões

- [x] Aplicar primeira camada de tokens visuais e títulos acessíveis às regiões nativas, preservando os divisores do editor. Ampliar testes de redimensionamento manual antes de considerar o layout concluído.
- [ ] Criar barra global, biblioteca, prévia, inspetor, timeline e host de ferramentas.
- [ ] Conectar todos os controles próprios ao núcleo de estado e comandos; evitar seletores DOM espalhados pela UI.
- [x] Restilizar inicialmente os componentes nativos no lugar, sem desmontar seus ciclos de vida.
- [x] Preservar canvas/renderizador e timeline nativos enquanto suas interações são mapeadas.
- [ ] Substituir progressivamente transporte, biblioteca e inspetor.
- [ ] Reconstruir a timeline somente após comprovar seleção, drag, trim, zoom, scroll, ripple, snapping e keyframes.
- [ ] Manter modais nativos, foco, atalhos e permissões de arquivo funcionais.
- [x] Oferecer retorno à interface original sem perda de estado; preferência persistida no navegador.
- [ ] Retirar o painel lateral atual como interface principal quando a nova experiência cobrir o fluxo escolhido.

**Aceite:** o usuário edita pela interface Wide Studio em toda a página, com as funções habilitadas verificadas e acesso claro às funções nativas ainda preservadas.

## 8. Estruturar ferramentas modulares

- [ ] Separar core, integração, workspace, features e serviços de plataforma.
- [ ] Criar registro de capacidades e ferramentas com ID, versão, posição na UI, schemas e comandos permitidos.
- [ ] Migrar navegação e pontos como primeiras ferramentas.
- [ ] Adicionar uma terceira ferramenta sem alterar código das anteriores ou criar switches dispersos.
- [ ] Tratar presets como dados versionados que geram planos de comandos.
- [ ] Implementar progresso, cancelamento e limpeza para jobs longos.
- [ ] Definir migração e backup dos dados próprios da extensão.
- [x] Integrar a primeira aba de IA mediante a nova autorização do usuário, usando os mesmos comandos e verificações. Ampliar ações conforme os contratos forem validados.

**Aceite:** novas funções são adicionadas por módulos com contratos e testes, sem acoplar toda a aplicação ou aceitar código remoto arbitrário.

## 9. Validar e entregar para uso diário

- [ ] Ampliar testes para os erros reproduzidos na revisão: colisão de projetos, seleção sem revisão, FPS fracionário, tempos falsos e mensagens incompatíveis.
- [ ] Criar projetos de teste pequenos, médios e grandes com mídia determinística.
- [ ] Comparar interface original e Wide Studio no mesmo hardware e cenário.
- [ ] Medir resposta de comandos, seleção, scrubbing, reprodução, memória, long tasks e exportação.
- [ ] Testar interrupção, permissão negada, mídia ausente, duas abas e versão não suportada.
- [ ] Validar instalação e atualização no Opera GX, além do Chrome; usar outra automação se o MCP não suportar o Opera.
- [ ] Executar TypeScript, build, testes locais e E2E real.
- [ ] Gerar pacote sem dependências de desenvolvimento, evidências, perfis ou segredos; conferir checksum.
- [ ] Atualizar a instalação preservando dados e declarar os limites efetivamente testados.

**Aceite:** os comandos visíveis passaram em E2E no navegador alvo, salvar/reabrir preserva as edições e a interface original funciona como recuperação.

## Evidências e comandos úteis

- [Atlas visual](docs/mapping/atlas.html).
- [Inventário](docs/mapping/inventory.json).
- [Leitura interna corrigida no editor real](docs/evidence/bridge-fixed-real.json).
- [Persistência após recarga](docs/evidence/bridge-fixed-reload.json).

Na raiz do projeto: `node tools/check-mapping.mjs`.

Na pasta `extension/`: `npm run typecheck`, `npm test`, `npm run test:ui` e `npm run build`.

Não considerar uma etapa pronta só porque compila ou passa em mocks. Ampliar os cenários reais do passo 5, especialmente vídeo/áudio, filtros, múltiplas seleções e undo/redo, antes de iniciar mutações internas ou substituir os controles nativos.

## Implementação visual 0.4.0 — 26/10/2026

Primeira etapa da máscara em toda a página: barra superior com Importar mídia, Novo clipe, Navegação e pontos e Interface original; Biblioteca, Prévia, Propriedades e Linha do tempo com títulos, cores e espaçamentos consistentes. Atalhos invocam os botões nativos existentes; não escrevem no modelo interno. O painel antigo torna-se auxiliar e abre sob demanda.

Validado no Chrome isolado com a extensão instalada em wide.video 1.7.12: criação nativa de clipe de texto pela nova barra, seleção e propriedades, quatro regiões sem duplicação, visual original com editor em top=0, retorno ao workspace com o mesmo elemento canvas, ausência de overflow em 1440×900 e 1024×768 e zero mutações de filhos durante uma amostra de repouso de 1,2 s. Isso não constitui benchmark de reprodução/exportação com mídia pesada nem validação do Opera GX.

Evidências: [captura principal](docs/evidence/workspace-0.4.0-desktop.png), [janela menor](docs/evidence/workspace-0.4.0-1024.png), [estado real](docs/evidence/workspace-0.4.0-real.json), [restauração](docs/evidence/workspace-0.4.0-original.json), [canvas e viewport](docs/evidence/workspace-0.4.0-1024.json).

Próximo incremento: biblioteca com categorias e busca, ações de timeline com nomes legíveis e inspetor progressivamente simplificado. Cada controle novo deverá usar um comando ou controle nativo mapeado e validado. Validar importação de vídeo/áudio, drag/trim, resize dos divisores, exportação e persistência de projetos antes de declarar uso diário coberto. Os menus e diálogos nativos continuam disponíveis nesta etapa; não é uma reprodução completa do Camtasia.

Preferência visual: leitura/gravação feita pelo service worker por mensagens restritas a um booleano; o content script continua sem acesso ao armazenamento privilegiado. Persistência após recarga validada em [evidência](docs/evidence/workspace-0.4.0-preference-reload.json). Console sem erros no reteste final. Build, regressões (incluindo isolamento da preferência) e os 21 checks de UI passaram.

Ajuste 0.4.1: removidos da barra superior os botões Navegação e pontos e Interface original, conforme solicitado. Ferramentas auxiliares e configuração visual continuam acessíveis pelo ícone da extensão. Build e regressão do workspace passaram.

Ajuste 0.4.2: removidos marca/logotipo, subtítulo e Novo clipe. Importar mídia agora integra a barra nativa, imediatamente antes de Project. Removida a faixa superior separada de 52px. Build e regressão do workspace passaram; menus e importador nativos preservados.

Correção 0.4.3: corrigida a distribuição para todas as pastas existentes em release, incluindo Wide-Studio-0.3.0, que tinha ficado na versão 0.3.1. Preferências anteriores à revisão 2 migram uma única vez para o workspace ativo; escolhas feitas depois continuam preservadas. Build, 35 checks de background e regressão do workspace passaram. Layout com Importar antes de Project conferido no Chrome real.

## Edição assistida 0.5.0 — nova frente autorizada

A instrução atual passa a incluir IA. A aba Edição assistida fica ao lado de Propriedades, no próprio inspetor; alternar não desmonta os controles nativos. O chat roda em iframe da extensão, vinculado à aba de origem. Somente esse contexto privilegiado configura a NVIDIA e acessa a chave. O site recebe apenas a URL do iframe, sem credenciais.

Implementado: chat, contexto atual, histórico recente de até oito mensagens do mesmo projeto, revisão explícita, aplicação e verificação pelos comandos existentes; configuração NVIDIA com permissão opcional; modo local identificado como sem IA. Apenas seek está habilitado para execução. Nenhuma chamada NVIDIA real foi feita sem uma chave disponível nesta sessão.

Frente 1 — entendimento do editor:
1. Manter o inventário estático separado das propriedades observadas e dos comandos comprovados.
2. Enviar cena, FPS, playhead, seleção, IDs e tempos conhecidos; incluir grafo interno com camadas, textos e confiança das capacidades quando a revisão coincidir. Limitar payload e indicar truncamento.
3. Mapear fontes de mídia, filtros, keyframes, trim, speed/reverse e undo/reabertura. Não interpretar null como zero nem supor áudio/pixels acessíveis.
4. Validar contextos com projetos reais e mídia determinística antes de ampliar as capacidades.

Frente 2 — assistência e ações por chat:
1. Expandir comandos nativos verificados: split, trim, exclusão/ripple, volume, texto e importação.
2. Corte de silêncio: acessar/decodificar áudio localmente, medir RMS/pico por janela, configurar limiar/duração mínima/padding, converter tempos da fonte à timeline, pré-visualizar cortes e só depois aplicar pelo histórico nativo. Verificar sincronização, undo e salvar/reabrir.
3. Imagens: escolher provedor/API de busca, mostrar candidatos com fonte e informações de uso, selecionar, importar no motor nativo, posicionar por intervalo e verificar persistência. Não confundir abrir uma busca do Google com importar uma imagem automaticamente.
4. Manter conversa, planos e execução vinculados ao projeto/aba; descartar plano ao trocar de projeto e jamais anunciar sucesso sem verificação.

[Mapa técnico das duas frentes](docs/mapping/assisted-editing.json). Evidência de execução local: snapshot `docs/evidence/assisted-current.txt` mostra confirmação e posição 10.000/frame 300. Conversa e chave NVIDIA não são gravadas nas evidências.


Verificação 0.5.0: TypeScript, build, suíte geral (38 checks de background), testes de UI e regressão do assistente passaram. Os exemplos de silêncio e imagens retornam indisponível no modo local, sem se converter em navegação acidental. Pacote e todas as pastas de instalação foram atualizados. A execução real de navegação foi testada sem chamadas remotas; a NVIDIA permanece sem validação real por ausência de credencial nesta sessão.

## NVIDIA real — 0.5.1

Chave autorizada recuperada da conversa aistudio e reutilizada sem incorporá-la ao código, releases ou evidências. Configuração de importação local em `.local/nvidia-connection.json` (pasta ignorada), separada dos pacotes. No Opera, Configurar IA → Importar conexão local → selecionar esse arquivo → Salvar Alterações e conceder NVIDIA. O navegador pessoal não foi alterado por edição direta dos seus arquivos de perfil.

Comparação autenticada: Nemotron 3.5 Lightning respondeu; Nemotron 3 Super e Mistral Large 2 retornaram 404 para a conta, apesar de listados no catálogo. Modelo selecionado: `nvidia/nemotron-3.5-lightning-30b-a3b`. [Comparação inicial](docs/evidence/nim-model-comparison-live.json).

Repetição após ajustes: 10/10 cenários passaram nos critérios operacionais (não é avaliação completa de qualidade editorial): seek absoluto, tempo decimal, posição relativa, leitura do clipe/FPS, silêncio indisponível, imagens indisponíveis, pedido ambíguo, negação, conversa com histórico e nome de clipe com instrução adversarial. [Resultados reais](docs/evidence/nim-scenarios-live.json). Respostas entre aproximadamente 1,1 e 4,5 segundos nesta amostra.

Navegador: pacote isolado de teste com permissão NVIDIA concedida, mesma chave configurada no armazenamento do service worker; pedido no iframe real → chamada NVIDIA → revisão → aplicar → confirmação no editor. [Captura](docs/evidence/nim-chat-browser.png) e snapshot `docs/evidence/nim-browser-current.txt`. Teste usa projeto temporário; não significa que cortes, silêncio ou busca/importação de imagens estejam implementados.

Ajustes: importação de conexão por arquivo, modelo testado sugerido nas configurações, contexto distingue comandos de leitura e ferramentas executáveis, respostas mais curtas, detecção de truncamento e remoção de credenciais/identificador de conta em mensagens de erro. Build, suíte geral e testes de UI passaram. Varredura de credencial nos fontes, dist, evidências e pacote expandido não encontrou a chave.

Continuidade real confirmada no navegador com NVIDIA: após ir para 10 s, o pedido E agora mais 2 segundos gerou frame 360 e, após revisão, o editor confirmou 12.000 s. Console sem erros. O perfil isolado de testes foi encerrado; a conexão do Opera requer importação pelo próprio painel, sem alterar o banco de dados do perfil pessoal.


## Revisão da barra de pastas — 26/10/2026

Solicitação: conferir as afirmações de implementação da barra de pastas e personalização. Auditoria sem correções nos fontes; typecheck/build e npm test passaram, mas os testes não exercitam os novos atalhos. O build local foi regenerado apenas para validação; não foi publicado um pacote corrigido.

Achados:
- P1: Exportar Vídeo usa busca genérica por Export e, no DOM real, seleciona o botão nativo Export Screenshot. Evidência: docs/evidence/menu-audit-dom.json.
- P1: Remover Silêncios/Gerar Legendas enviam SW_OPEN_SMART_TOOL do content script; o service worker rejeita remetentes de página antes desse case, que só aceita origem da extensão. A resposta é ignorada pelo atalho.
- P1: Ripple Delete encontra o próprio botão da barra por texto, em vez de um comando nativo. Desfazer não encontrou alvo com o menu fechado. Não há pré-condições/feedback para essas falhas.
- P2: pastas hardcoded; não há criar/renomear/ordenar/mover/ocultar itens nem persistência de personalização. Ocultar a doação está implementado por CSS; não é um módulo de personalização.
- P2: controles de atalhos não acompanham a disponibilidade nativa: Dividir fica habilitado com o botão nativo desabilitado.
- P2: os testes existentes do workspace cobrem importação/lifecycle, não as pastas, execução dos atalhos, teclado ou persistência. Os botões de pasta também não têm aria-expanded e tratamento explícito de Escape/setas.
- Distribuição: o hash do content script em release/Wide-Studio-0.5.1/extensao diverge do build atual, e a barra nova não foi encontrada nesse artefato durante a inspeção inicial. O build passar não prova atualização do pacote instalado.

Também revisar mainBridge.ts: fallback para dispatcher.trigger marca triggered=true sem verificar que o diálogo solicitado abriu. A presença dessa resposta não comprova execução.

O que foi confirmado: três pastas visíveis (Edição, IA & Áudio, Exportar), ocultação de Buy Me a Coffee e ausência de overflow na janela de teste de 1440 px. Evidências: docs/evidence/menu-audit-dom.json, menu-audit-current.txt, menu-audit-smart-click.json e menu-audit-real.png.

Próxima correção: registro de ações nativas com alvos inequívocos e capacidade/feedback; roteamento da aba remetente para Smart Tools; configuração persistente das pastas; testes de cada atalho no editor real; depois gerar e conferir o pacote distribuído.

## Implementado — 0.6.0 (26/10/2026)

Os achados da revisão anterior foram corrigidos: exportação usa o alvo nativo específico, Ripple Delete não encontra o próprio atalho, Desfazer abre o menu nativo, Smart Tools usa a aba remetente validada e não declara execução por dispatcher não verificado. Dividir acompanha o botão nativo desabilitado. Falhas aparecem na barra. Pastas agora têm criar/renomear/ordenar/excluir, mover/ocultar/ordenar ações, escolher menus visíveis e persistência; dropdowns têm Escape/setas/aria-expanded.

A aba Drive ao lado de Biblioteca abre o pack público fornecido pelo usuário, sem OAuth e sem chave de API. Lista pastas, filtra nomes na pasta atual e baixa somente a mídia escolhida para importação pelo drop nativo. Credenciais não são incluídas. Permissões opcionais limitadas aos domínios Drive. Download limitado a 20 MB e HTML a 4 MB; respostas de login/HTML não são importadas como mídia. A página pública do Google não é API estável e pastas grandes podem retornar listagem parcial.

Validação real: pack com 15 pastas; pasta GIFs aberta; GIF de 80.679 bytes com assinatura GIF89a importado e reconhecido como mídia válida na Biblioteca. Evidência: docs/evidence/drive-import-real.json e drive-public-pack.png. Atalho Exportar vídeo abriu o diálogo de presets/codecs de exportação, não captura de imagem. Remover silêncios abriu o seletor nativo Remove Silence. Personalização renomeada para Favoritos, salva e observada na barra do navegador isolado. Não foram realizados cortes reais de silêncio, geração de legendas ou exportação/playback desse GIF na timeline. Opera GX ainda requer conferência específica.

Verificação: suíte geral e UI passaram durante a implementação; build TypeScript/Vite final e regressões Menu/Drive e lifecycle do workspace passaram. Pacote 0.6.0 gerado; pastas de instalação anteriores atualizadas para os mesmos arquivos. A chave Firebase não é usada; chave NVIDIA não integra os pacotes.

Próximos passos:
1. No Opera, recarregar a extensão e a página; abrir Drive → Abrir meu pack e conceder os domínios opcionais.
2. Conferir importação e edição/exportação de uma mídia pequena em um projeto descartável; medir cache/armazenamento antes de arquivos maiores. Mídias usadas ainda podem ocupar armazenamento do projeto no wide.video.
3. Testar cancelamento/repetição de importação, formatos variados e pastas grandes; melhorar paginação usando um mecanismo suportado caso necessário.
4. Continuar o mapeamento do motor para cortes de silêncio e legendas com prévia, revisão e desfazer; o chat ainda não executa essas edições.

## Drive para uso frequente — 0.6.1 (26/10/2026)

Problemas observados pelo usuário: miniaturas ausentes, área útil ocupada por instruções/configuração e falha tardia ao importar originais grandes. Corrigidos com miniaturas por requisição privilegiada ao host real do Google, resposta validada e convertida para imagem local ao iframe; ausência de prévia agora tem indicação e tentativa explícita. Nenhum script do Google é executado para obter miniaturas.

Interface: grade/lista com cartões, visualização antes de importar, visualizador do Google sob demanda para vídeo/áudio/animação, tamanho informado antes da ação, busca/tipo/ordenação, breadcrumb compacto, voltar, favoritos e restauração da última pasta. Configuração e instruções recolhidas em •••. Erros e confirmação ficam na própria aba. Original conhecido acima de 20 MB fica desabilitado antes do download. Imagens JPG/PNG/WebP têm opção explícita de cópia leve, com largura de até 1920 px; pode alterar formato/transparência/nitidez. GIF não é convertido silenciosamente em imagem estática.

Recursos: prévias só próximas da área visível, até 3 requisições simultâneas, cache em memória limitado a 36 entradas/16 MB de dados codificados. Originais não são pré-carregados. Limite de download original permanece 20 MB; cópia leve é limitada a 8 MB. Metadados persistem apenas na sessão do navegador para resistir à suspensão do service worker; caminho/favoritos/vista ficam nas preferências locais. Locks na UI e no worker evitam importações simultâneas na mesma aba.

Teste real com o pack: miniaturas de imagens carregadas a 320 px; imagem Papel legal (18).jpg de 99,6 MB identificada antes de importar. Cópia leve importada e reconhecida como mediaContent-valid/selection-image na Biblioteca nativa, com resolução observada de 1920 × 2639. O original grande não foi baixado. No teste visual surgiu e foi corrigido um colapso da altura da grade no iframe estreito. A captura por MCP teve timeout após importação, mas leitura posterior sem aguardar estabilização confirmou a mídia nativa. A suíte geral e UI passaram; regressões específicas novas cobrem tamanho antecipado, bloqueio do original grande, cópia leve explícita, clique duplo, confirmação, filtros/favoritos e ausência de download automático de originais.

Limites: visualizador do Google depende de suporte/permissão do arquivo; lista pública pode ser parcial. Sem promessa de paginação completa, edição sem cache ou acesso privado. Playback/exportação na timeline e Opera GX continuam pedindo validação específica. Não usar a cópia leve quando preservar o original for essencial.

Conferência final da grade no editor real a 1440×900: cartões de 165–177 px, 4/4 miniaturas visíveis carregadas e nenhum overflow horizontal no iframe. Capturas: docs/evidence/drive-polish-grid-final.png e drive-polish-preview-final.png. Pacote 0.6.1 gerado e pastas de instalação anteriores atualizadas; fontes/dist/pacote conferidos por hash e sem a credencial NVIDIA.


Correção final do player: o teste real detectou recusa de enquadramento no visualizador Google. Substituído por download sob demanda (até 20 MB) para Blob temporário e elementos nativos video/audio/img. URLs Blob revogadas ao fechar/trocar a prévia; nenhuma inserção na Biblioteca para apenas visualizar. Arquivos maiores abrem no Drive. Teste de UI cobre pedido específico de preview, Blob e ausência de iframe externo. A cópia leve continua sendo ação separada de importação.

Player final verificado no navegador real: GIF carregado em Blob, 312 × 297 px, sem iframe externo e sem erro. A restauração da pasta GIFs após recarregar a extensão também funcionou. Build final e regressões de UI Drive/background passaram; reprodução de vídeo/áudio e exportação na timeline não foram exercitadas nesta etapa.

## Arrastar do Drive à timeline — 0.6.2

### Reabertura: falha no gesto comum (26/10/2026)

A captura do usuário continua em “Solte…” com o cartão sobre a timeline. A inserção pelo backend foi exercitada, mas o teste `driveDragLive.mjs` usa interceptação e entrega explícita de dragEnter/dragOver/drop pelo Chrome; a segunda inserção usa a rota privilegiada diretamente. Isso não valida o gesto comum atravessando o iframe. As afirmações abaixo de “arrasto real confirmado” devem ser entendidas com essa restrição, não como aprovação do fluxo manual no Opera GX.

Defeitos confirmados no código: o arrasto começa no iframe chrome-extension e depende de o evento com MIME personalizado alcançar o documento wide.video; não há confirmação de prontidão do receptor. `mountDriveDrop` rejeita o destino usando o ancestral de event.target, enquanto NativeDropReader usa a geometria das camadas, permitindo divergência sob sobreposições. Drop inválido só mostra toast no documento principal e não envia resultado ao Drive. Não há prazo de recuperação da mensagem “Solte…”, e dragend pode sobrescrever uma confirmação já recebida. O registro do nonce é assíncrono sem sincronização com a soltura. Esses problemas explicam caminhos de falha silenciosa; a captura isolada não distingue qual deles ocorreu no navegador do usuário.

Próximos passos: registrar fases origem/receptor/soltura/importação/verificação sem dados sensíveis; confirmar prontidão e versão do receptor antes de habilitar o gesto; usar a mesma validação geométrica do destino; propagar cancelamento/rejeição à UI e impedir status atrasado de sobrescrever conclusão. Reproduzir com PNG da pasta Emojis usando mouse normal, sem injetar a soltura, incluindo iframe → camada, cancelamento e segunda inserção. Se a travessia continuar falhando, fornecer modo explícito selecionar mídia → clicar no destino, compartilhando a rota de inserção validada. Não considerar concluído apenas porque o clipe foi inserido por CDP.

Implementação: cartões de mídia e botões da prévia têm arrasto nativo. O iframe registra um nonce de uso único na extensão, vinculado à aba/projeto/arquivo/variante. O content script aceita o drop confiável apenas na área de clipes de uma camada desbloqueada. Mostra marcador de destino, captura camada e tempo por leitura da conversão nativa e chama o worker sem aceitar outra aba indicada pela página.

O worker consome o nonce, impede importações concorrentes e tenta reutilizar uma referência à mídia importada nesta sessão. Quando necessário, baixa só o arquivo escolhido e usa o importador nativo da Biblioteca. Aguarda até 30 s pela decodificação e aciona os manipuladores nativos de dragstart/drop da mídia. A ponte MAIN apenas lê identidades, conversão de coordenadas e resultado; não reescreve diretamente o projeto. A verificação exige um clipe novo com a mídia, camada e tempo esperados. As coordenadas inteiras são escolhidas pela conversão nativa para evitar deslocamento de um frame.

Proteções: projeto trocado, camada removida/bloqueada, destino fora da área visível ou frame inacessível após mudança de zoom impedem inserção. Nonces/destinos expiram em 120 s. Resultado desconhecido pede conferência antes de repetir; mídia já baixada pode continuar na Biblioteca. Originais >20 MB não são arrastáveis pelo cartão; na prévia é possível arrastar o botão da cópia leve de imagem estática, explicitamente identificado. Reutilização depende de a referência da Biblioteca continuar conectada durante esta sessão; não é cache permanente de originais.

Validação real: gesto iniciado no cartão do GIF público, passagem entre iframe e timeline por eventos confiáveis do Chrome e inserção confirmada a 13,133 s. A primeira versão do teste revelou readiness de decodificação e perda de um frame; ambos corrigidos. O drag genérico do MCP não gerava os eventos entre frames, então o teste complementar usa Input do mesmo Chrome for Testing por Puppeteer distribuído com o MCP. Captura/evidência em docs/evidence/drive-drag-real.png e drive-drag-real.json. A checagem complementar de reutilização usa a mesma rota content-script/nativa diretamente pelo iframe privilegiado, pois reiniciar o drag interceptado entre frames no headless é instável; isso não equivale a dois gestos manuais completos.

Testes automatizados: suíte geral e UI passaram, com regressões novas de nonce/origem, bloqueio de original grande, destino sem mutação, camada/projeto, tempo após zoom, verificação exata e consumo do destino. Instalação no Opera GX e arrastos de vídeo/áudio grandes continuam exigindo validação específica.

Conferência final 0.6.2: arrasto real confirmado a 13,133 s; reutilização pela rota nativa confirmada em nova camada a 3,733 s, com dois clipes e uma única mídia na Biblioteca. O primeiro clipe acionava o diálogo nativo Resize Scene; a extensão agora recusa apenas novas confirmações conhecidas de tamanho/FPS causadas pela inserção, preservando a cena. Outros diálogos permanecem intactos. Regressão específica desse comportamento passou.

Limitação observada no teste complementar: o Desfazer nativo mostrava Undo: Add filter Position; três acionamentos programáticos não removeram os clipes. Portanto, a reversão por histórico não está validada e a confirmação da extensão não promete mais remoção por Undo. Investigar separadamente o histórico/acionamento nativo; esta versão insere pelos comandos nativos e não mantém uma pilha própria de desfazer. Evidência completa: docs/evidence/drive-drag-real.json. Próximo teste específico: Opera GX com cancelamento de arrasto, vídeos/áudio e histórico em projeto salvo.

## Correção do gesto Drive → timeline — 0.6.3

Substituído o gesto HTML nativo entre iframe e página por captura de ponteiro. O navegador pode redirecionar movimento/soltura ao documento principal ao sair do iframe; ambos os contextos agora são atendidos. O arrasto HTML concorrente foi desativado, incluindo seleção/arrasto de imagens. A soltura dentro do iframe usa mensagem privilegiada através do worker; somente o frame da extensão pode iniciar essa rota, vinculada à aba e ao nonce. Não se afrouxou a autorização de páginas para iniciar importações.

Antes de confirmar o gesto, o worker exige confirmação do protocolo do receptor. Uma página ainda com content script antigo pede recarregamento. A validação do destino usa retângulos das camadas, incluindo os limites verticais, sem depender do ancestral do elemento sob o cursor. Soltura/cancelamento consomem o estado antes de operações assíncronas para evitar duplicação; falhas e Esc retornam ao Drive. Confirmações não são mais sobrescritas por dragend atrasado. Há prazo de recuperação da UI, bloqueio durante a inserção e limpeza dos listeners do gesto.

Corrida de preparação: o receptor guarda uma soltura confiável recente e só a aplica à preparação iniciada antes dela. Esc recente invalida essa preparação. Isso cobre soltar antes da resposta do worker, sem aceitar eventos DOM sintéticos como soltura do usuário.

Validação atual: `npm test`, `npm run test:ui` e build passaram. Regressões cobrem geometria sob sobreposição, limites verticais/camada bloqueada, protocolo antigo, origem falsa, cancelamento e vinculação de aba. `tests/drivePointerLive.mjs` executa movimentos mouse.move/down/up comuns, sem interceptar arrasto nem injetar drop. PNG público da pasta Emojis inserido em 13,200 s e 6,600 s; terceira inserção em 9,433 s após soltura rápida com atraso de 900 ms imposto ao receptor. Uma mídia na Biblioteca, três clipes. Esc e destino fora da camada não adicionaram clipes. Evidências: `docs/evidence/drive-pointer-real.json` e `.png`. O antigo entrypoint `driveDragLive.mjs` agora chama o teste de ponteiro, evitando reutilizar a validação artificial anterior.

Próximos passos restantes: validar especificamente Opera GX, mídias de vídeo/áudio, projeto salvo e histórico Desfazer nativo. O teste atual usa Chrome for Testing e projeto temporário; não confirma esses cenários. Depois de atualizar a extensão é necessário recarregar também a página do editor para substituir o receptor antigo.

Conferência final 0.6.3: também passaram soltura dentro do próprio iframe (erro retornado sem inserir) e clique de prévia após arrastar. Pacote ZIP e SHA-256 gerados; 13 pastas de instalação atualizadas; hashes do receptor/ponte/worker conferidos e varredura de credenciais sem ocorrências. Permissões de mídia permanecem opcionais no pacote de produção.

## Extrair por link — 0.7.0

Nova aba ao lado de Biblioteca e Drive, preservando os componentes nativos. Fluxo: conectar auxiliar local → colar link público → analisar metadados → escolher início/fim e qualidade → extrair e importar na Biblioteca. Faixa até 90 s, saída MP4 H.264/yuv420p + AAC quando há áudio, altura máxima 360/480/720 sem ampliar originais menores. Saída até 20 MB. Vídeos sem áudio permanecem sem áudio. A importação não escolhe camada/tempo automaticamente; o usuário arrasta da Biblioteca para a timeline.

Auxiliar Python em `companion/extractor.py`, distribuído em `auxiliar-extrair` no pacote. Usa yt-dlp instalado em venv isolado, FFmpeg e runtime JavaScript Node.js 22+ (ou Deno compatível), conforme documentação primária https://github.com/yt-dlp/yt-dlp/wiki/EJS. CONFIGURAR.cmd instala/atualiza dependências locais; INICIAR.cmd inicia em segundo plano e PARAR.cmd encerra limpando tarefas. A página privada `.local/CONEXAO.html` contém o código de pareamento por instalação e não é incluída no ZIP. Nenhuma chave NVIDIA/Google é usada.

Rede: somente 127.0.0.1:47831, host fixo, token aleatório no cabeçalho Authorization, CORS restrito a origens de extensão, corpo limitado e sem cookies do navegador. A extensão pede permissão opcional para localhost; páginas do wide.video podem apenas abrir o iframe vinculado à sua própria aba. Não podem iniciar extrações nem configurar pastas. URLs são normalizadas por allowlist de host/caminho (YouTube individual, Instagram post/Reel, X status); parâmetros de shell não são aceitos. Subprocessos usam arrays de argumentos e nunca shell=True.

Tarefas são assíncronas com consulta de fase, cancelamento, limites de tempo e monitoramento dos temporários para interrupção acima de 64 MB. No YouTube/Instagram usa download-sections; no X o teste real revelou HTTP 403 no caminho de corte remoto pelo FFmpeg, enquanto download HTTP normal do post funcionou. Por isso o X baixa a origem até 32 MB e recorta localmente. Limites do site continuam sendo respeitados: não há login automático, cookies, suporte a privados, DRM, lives ou posts com múltiplos vídeos.

Importação: worker vincula tarefa à aba/projeto observado ao iniciar, guarda vínculo em storage.session e verifica novamente antes de importar. Lock por aba e estado importing evitam duplicação. Após a transferência do MP4 pelo helper, usa o importador nativo existente. Temporários são removidos depois da tentativa de importação; tarefas abandonadas expiram em cinco minutos e restos de encerramento anormal são limpos na próxima inicialização. Erros de resultado desconhecido pedem conferência da Biblioteca. O cache/projeto nativo ainda pode consumir armazenamento.

Drive: integração por pasta existente do Google Drive para computador, escolhida pelo caminho na aba Extrair. A opção é explícita por extração. Cópia exclusiva não sobrescreve arquivos; nome coincidente e bytes SHA-256 idênticos são reutilizados. Em falha de cópia, remove apenas o arquivo parcial que o próprio auxiliar acabou de criar. Não afirma sincronização remota: o cliente Google Drive é quem envia à nuvem. Upload por API exigiria autorização de escrita/OAuth (https://developers.google.com/workspace/drive/api/guides/manage-uploads), fora deste fluxo de pasta local.

Evidências reais: Chrome for Testing com a UI completa, pareamento, análise, escolha de 0–3 s, extração e importação nativa. YouTube `jNQXAC9IVRw`: MP4 áudio/vídeo 86.955 bytes. Instagram `aye83DjauH`: vídeo sem áudio 480×480 a 29,97 fps, 92.821 bytes. X `1790637656616943991`: áudio/vídeo 364×360 a 30 fps, 122.218 bytes. Todos reconhecidos `mediaContent-valid` na Biblioteca. No Instagram, abrir a Biblioteca é necessário para exercitar a decodificação sob demanda do painel nativo oculto; timeout esperando o painel oculto não significava MP4 inválido. Temporários zerados após importações; cópia verificada em pasta local de teste, sem alegar envio real ao Google Drive. `docs/evidence/extract-browser-*-real.json` e capturas correspondentes. Links antigos removidos/indisponíveis também produziram erro, sem importação fictícia.

Próximos passos: conferir caminho real do Drive e sincronização na conta do usuário; validar Opera GX e projeto salvo; manter yt-dlp atualizado quando sites mudarem; considerar fila/biblioteca de extraídos e intervalos acima de 90 s apenas com revisão do limite de mídia da ponte atual. Não aumentar transferência base64 indiscriminadamente para vídeos longos. Continuam pendentes os cenários de histórico nativo e edição automática de silêncio/legendas anteriores.

Conferência final 0.7.0: suítes geral/UI, 55 verificações de worker, regressões novas de extração/abas, quatro testes Python e build aprovados. Artefato final testado no Chrome com nova importação YouTube. 14 pastas de instalação atualizadas. ZIP com 34 arquivos, sem venv, estado local, código de pareamento ou credenciais. Hashes e SHA-256 conferidos. Auxiliar preparado e ativo neste PC; pasta de teste foi limpa e a configuração de Drive restaurada (nenhum caminho real do usuário foi escolhido). A aba Drive mantém seu pack público; a pasta sincronizada configurada em Extrair não altera esse pack automaticamente. Capturas após alternância de abas aguardam repaint do iframe para não registrar a área antes da pintura.

## Atualização 0.7.1 — Extrair simplificado (substitui o fluxo 0.7.0 acima)

A aba Extrair agora contém apenas um link e Adicionar à Biblioteca. Remove conexão/cópia para Drive, pareamento manual, análise separada e seleção de trecho/qualidade. A aba Drive independente permanece. O vídeo inteiro é importado automaticamente; limites atuais: vídeo público, dez minutos, MP4 final até 20 MB e resolução até 480p. Vídeos maiores geram erro explícito, sem corte silencioso.

O auxiliar usa protocolo 2; versões antigas são recusadas antes do download. O conector Native Messaging está implementado com origens explícitas, token privado em storage protegido e stdio, sem credenciais dentro do pacote. REGISTRAR.ps1 registra somente o host com.widestudio.extractor em HKCU; DESREGISTRAR.ps1 reverte apenas os registros desta instalação.

PENDENTE: autorização humana para registrar o conector no Windows. A revisão automática rejeitou essa alteração persistente por permitir à extensão iniciar um processo local. Nenhum registro foi aplicado. Não executar CONFIGURAR/INICIAR/REGISTRAR até obter essa autorização. O serviço foi iniciado isoladamente para testes, sem registro.

Validação: typecheck, build, suítes geral e UI aprovadas; quatro testes Python do auxiliar e teste privado de stdio aprovados. Teste real no Chrome importou Me at the zoo.mp4 inteiro, 19 segundos, reconhecido como mediaContent-valid. Evidências: docs/evidence/extract-simple-youtube.json e PNG. A conexão desse teste usou um token previamente configurado no storage protegido de um perfil descartável; isso não valida o registro Native Messaging no navegador. Próximo passo após autorização: registrar, recarregar a extensão e verificar a partida automática sem pareamento manual, incluindo Opera GX.

## 0.7.2 — extração gratuita por sites (substitui a ativação local da 0.7.1)

Fluxo atual: Extrair, colar link público, Adicionar à Biblioteca. Sem SaveAPI, chave, OAuth, cópia para Drive ou registro Native Messaging. A configuração local anterior não é necessária para este fluxo. Nenhum registro do Windows foi criado. O pacote novo deixa de distribuir o auxiliar Python. O código legado permanece no repositório para referência, sem entrada na interface nova; nativeMessaging deixou de ser permissão obrigatória.

Pesquisa e testes visuais dos sites: SSSTwitter retornou downloads no navegador comum e em submissão HTTP normal, mas sua automação no Chrome recebeu resposta vazia e ficou pendente. Essa tentativa NÃO é usada no produto. Snapinsta gerou MP4 pelo formulário normal. A extensão abre somente uma aba temporária desse domínio em segundo plano, preenche o link, submete o formulário e lê a âncora de download. A página executa seus próprios scripts; a extensão não copia nem avalia JavaScript remoto. Fecha somente a aba criada por ela, inclusive em erro. Interrompe caso apareça verificação humana; não resolve CAPTCHA automaticamente.

X: usa API pública FxTwitter, GET https://api.fxtwitter.com/status/{id}, com resposta code=200, identidade do post e um único vídeo conferidos. Baixa somente MP4 de video.twimg.com. Documentação primária: https://docs.fxembed.com/api/introduction/. Instagram: aceita somente URL de d.rapidcdn.app/v2 observada no resultado de https://snapinsta.ai/. Não usa endpoints privados, credenciais, cookies de login ou API paga. Permissões de domínio são opcionais e pedidas ao usuário ao iniciar a ação. A chave Google/NVIDIA nunca é usada.

Importação: URLs HTTPS e domínios/caminhos restritos, redirecionamentos de download recusados, sem cookies no fetch de mídia; limite de 20 MB verificado no cabeçalho e durante streaming, MIME e assinatura MP4 ftyp conferidos. Lock por aba evita duplicação; contexto do projeto observado antes da consulta e reconferido antes de importar. Falha de transporte após enviar ao editor é tratada como resultado desconhecido, com pedido para conferir a Biblioteca antes de repetir. O arquivo é recebido em memória e entregue ao importador nativo; o projeto/cache do wide.video ainda ocupa espaço. Não promete streaming sem armazenamento ou ausência total de uso de disco.

Validação real no Chrome descartável, sem token semeado, sem serviço localhost e sem conector: Instagram aye83DjauH importado como vídeo válido completo de 8 s, 640x640, 29,97 fps; X 1790637656616943991 importado como áudio/vídeo válido completo de 15 s, 728x720, 30 fps, estéreo 44,1 kHz. Evidências extract-web-instagram e extract-web-x em docs/evidence. Uma entrada, um botão, sem confirmação intermediária. Testes de UI, worker (60 verificações), URL/domínios, respostas falsas, limites e build executados.

YouTube não disponível ainda no fluxo gratuito. YTSavr retornou bloqueio de robô para jNQXAC9IVRw; YT1s redirecionou para outro domínio; NoTube não resolveu DNS; y2mate.in não apresentou resultado após submissão. Não tratar essas opções como integrações funcionais. A documentação do Cobalt exige instância própria ou permissão para integrar instância hospedada. Próximos passos: identificar provedor gratuito de YouTube que funcione em teste real, verificar Opera GX e projetos salvos, ampliar casos de Instagram (posts removidos, restritos, vários vídeos e limites) e revalidar quando os sites mudarem.

## 0.7.3 — YouTube integrado por fluxo normal do TubDown

Substitui a pendência de YouTube da 0.7.2. Pesquisa adicional no navegador: TubDown e KitUtils encontraram formatos reais do vídeo jNQXAC9IVRw; TubDown entregou MP4 de 744.413 bytes, com H.264, AAC e duração completa de 19,063583 s conferidos por ffprobe. A chamada HTTP de API funcionou no teste isolado, mas foi recusada quando partiu da origem da extensão. O produto NÃO tenta falsificar Origin/Referer: usa a página normal https://tubdown.com/ em aba temporária e os próprios controles do site.

Passos implementados: pedir permissão opcional apenas para tubdown.com; abrir aba de serviço em segundo plano; preencher e submeter #dl-form; ler duração e opções em #r-list-video; selecionar a maior qualidade MP4 disponível até 480p e tamanho estimado até 20 MB; aguardar #r-done-link; capturar o clique de arquivo para impedir cópia automática em Downloads; baixar em memória pelo endereço fixo /api/jobs/{UUID}/file; validar MP4 e limite durante streaming; reconferir projeto e importar pela ponte nativa. A aba criada pela extensão fecha em sucesso e erro. Não usa chave, cookies de conta, instalador ou auxiliar local. Interrompe se surgir verificação humana. Não avalia nem copia scripts remotos na extensão.

Limites atuais do YouTube: vídeo público individual de até dez minutos, MP4 até 20 MB, qualidade automática até 480p. A duração é verificada antes de clicar no download. Não recorta o vídeo para caber. Os tamanhos da lista são aproximados; a validação final de bytes é obrigatória. Endereço de arquivo restrito ao domínio TubDown e UUID, sem redirecionamentos. O armazenamento do projeto/cache do wide.video continua ocupando espaço.

Validação real com Chrome e extensão 0.7.3: jNQXAC9IVRw importado na Biblioteca como mediaContent-valid selection-audioVideo, 00:19, 320x240, 15 fps, áudio estéreo 44,1 kHz. Teste CDP confirmou zero eventos de download para a pasta Downloads e fechamento da aba temporária. Segundo caso M7lc1UVf-VE (22m24s) foi recusado antes de criar mídia: Biblioteca vazia, zero downloads e aba de serviço fechada. Evidências docs/evidence/extract-web-youtube.json e PNG, extract-web-youtube-limit.json e PNG, tubdown-probe.json. O MP4 temporário usado no ffprobe foi removido; metadados e evidências foram preservados.

Testes gerais/UI/build aprovados, incluindo qualidade limitada, normalização de Shorts para vídeo individual, bloqueio de URLs externas, fechamento da aba em erro/verificação e proteção contra duplicação. Próximos passos: validar Opera GX com a permissão nova, testar mais vídeos recentes e Shorts, observar mudanças do formulário/provedor. KitUtils permanece somente como alternativa pesquisada, sem integração nem download validado. Fonte técnica pública analisada: https://tubdown.com/js/app.js e formulário do site; nenhum arquivo desse site entra no ZIP da extensão.

## 0.8.0 — seleção por retângulo na timeline e Biblioteca

Objetivo da imagem do usuário: pressionar e arrastar um retângulo para selecionar vários itens. Implementado botão Selecionar vários no cabeçalho da timeline, que arma um gesto na timeline ou Biblioteca. Após soltar o retângulo, retorna automaticamente ao modo normal para permitir mover o grupo. Shift + arrastar permite acrescentar à seleção; Ctrl/Cmd e cliques nativos continuam funcionando. Esc cancela sem alterar a seleção anterior. Arrastar em área vazia do contêiner também pode iniciar o retângulo sem armar o botão. Campos, botões, menus, diálogos, abas Drive/Extrair e arrasto normal dos clipes não são convertidos em seleção retangular.

Mapeamento técnico: o Wide 1.7.12 possui selection.kind clip/clips e media/medias, usando Set para grupos. A extensão usa ações nativas do MediaPanel e onClick dos clipes com modificador de seleção; não substitui project.selection nem altera o modelo da apresentação. As bordas provisórias existem somente durante o gesto; após soltar, a seleção é conferida no modelo nativo. Isso mantém movimento em grupo e operações nativas do editor. Corrigido snapshotNormalizer para ler o Set de clips e expor selection.kind multiple com todos os IDs, antes omitidos na ponte.

Escopo: clipes em várias camadas e mídias da Biblioteca local. Não simula seleção múltipla de cabeçalhos de camadas vazias, pois o modelo nativo tem seleção singular de layer. Clipes/camadas bloqueados ficam fora dos candidatos do retângulo; filtros/itens fora da área visível não são selecionados pelo retângulo. Seleção aditiva preserva os itens já selecionados fora do retângulo. Sem seleção de cartões nos iframes Drive/Extrair nesta etapa. Scroll, resize, perda de foco e troca de projeto interrompem um gesto pendente para evitar destinos obsoletos. Sem autoscroll de borda nesta versão.

Código: content/marqueeSelection.ts, instalado na entrada MAIN; botão em workspace.ts; apresentação em editor.css. Limiar de 6 px evita transformar clique simples em arrasto; captura de ponteiro começa após o limiar. Sobreposição com pointer-events none não intercepta o editor. Hit test em candidatos visíveis, conferência de projeto/versão/pertencimento antes de aplicar e verificação exata da seleção depois. Sem alterações de permissão, download, serviço remoto ou credenciais. Reinstalação remove listeners/overlays anteriores e pagehide limpa recursos.

Teste real em Chrome descartável com três SVGs gerados em memória, importados em projeto temporário e clipes criados nos controles/diálogos nativos: retângulo selecionou dois clipes em duas camadas; snapshot retornou multiple e dois IDs; arrasto normal moveu ambos +0,633 s, preservando espaçamento e deixando o terceiro imóvel. Shift acrescentou o terceiro; Ctrl nativo retirou-o; seleção não incrementou a versão/histórico de edição; Esc preservou o grupo; retângulo na Biblioteca selecionou três mídias, conferidas no modelo e nos destaques nativos. Evidências docs/evidence/selection-live.json, selection-rectangle-live.png, selection-group-live.png e selection-library-live.png. Testes unitários verificam seleção aditiva/substituição, bloqueios, geometria reversa, toggle/Esc, snapshot múltiplo e ausência de alterações na apresentação.

Próximos passos: validar Opera GX na instalação do usuário, projetos maiores e eventuais mudanças da versão nativa. Autoscroll e seleção de cartões nos iframes são evoluções separadas; não confundir seleção de clipes em várias camadas com reorganização em lote dos cabeçalhos das camadas.


## Correção 0.8.1 — seleção durante o arrasto

A seleção nativa agora acompanha o retângulo a cada movimento, inclusive ao diminuir. A atualização aplica somente as diferenças por ações nativas síncronas, sem fila de operações ou limpar/reselecionar todos os clipes. Shift preserva uma base fixa capturada no início. Esc restaura o grupo de clipes/mídias anterior. Soltar apenas encerra o gesto.

Validar: expandir e reduzir antes de soltar; Shift expandir/reduzir; Esc após alterar seleção; Biblioteca antes de soltar; movimento nativo do grupo; snapshot e histórico inalterado. Teste real em `extension/tests/selectionLive.mjs`, evidência em `docs/evidence/selection-live.json`.


## Correção 0.8.2 — desselecionar com duplo clique

Duplo clique no espaço vazio das faixas da timeline limpa a seleção nativa, incluindo camada ou grupo. Duplo clique sobre clipes e controles preserva o comportamento do editor. Não altera clipes nem cria edição no histórico. Validar com seleção de camada, seleção múltipla, duplo clique em clipe e integração real no navegador.


## Correção 0.8.3 — YouTube até 30 minutos

Limite da extensão ampliado para 1800 segundos inclusivos e 200 MiB no YouTube; MP4 com áudio e qualidade automática até 480p. Instagram/X e Drive conservam seus limites anteriores. O serviço informa aceitar até duas horas, mas a extensão mantém 30 minutos. Preparação: até cinco minutos. Download: até três minutos. Importação nativa: espera até um minuto por confirmação.

O arquivo chega por partes de até 256 KiB, com ordem, projeto, tamanho e assinatura MP4 validados. Não há mensagem única com base64 de centenas de MB. Partes pendentes expiram após quatro minutos sem atividade, são descartadas em falha/troca de projeto e não acionam a importação até o arquivo completo. Não cria cópia em Downloads; a Biblioteca/cache do editor ainda ocupa armazenamento.

Validação: limites 10–30 minutos, 30:00 aceito e 30:01 recusado; 200 MiB de limite; importação sintética de 21 MiB integral, ordem de partes, MP4 inválido, arquivo incompleto e troca de projeto; regressões completas e teste real pelo navegador. A disponibilidade do serviço e o tamanho do arquivo continuam determinantes.

Resultado real: Tears of Steel (12:14), importado integralmente com vídeo e áudio na Biblioteca; nenhuma cópia em Downloads; evidências em docs/evidence/extract-web-youtube.json e .png. A cópia descartável de testes concede somente o domínio do provedor para evitar o diálogo nativo inacessível no modo headless; dist/release conservam permissões opcionais.
