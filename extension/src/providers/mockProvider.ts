import { LLMProvider, ProviderResponse } from './types';
import { EditorContext } from '../types/context';
import { EditPlan } from '../types/commands';
import { secondsToFrames } from '../commands/temporal';

export class MockProvider implements LLMProvider {
  name = 'Mock Provider (Offline Determinístico)';

  async generatePlan(prompt: string, context: EditorContext): Promise<ProviderResponse> {
    const rawText = prompt.trim();
    const fps = { numerator: context.composition.fpsNumerator, denominator: context.composition.fpsDenominator };
    const text = rawText
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    if (/silencio|sem (?:audio|som)|nao (?:tem|tenha) audio/.test(text)) return { type:'unsupported', message:'Ainda não consigo analisar o áudio e remover silêncio. Essa função depende de leitura do áudio e de cortes nativos verificados; nenhuma edição foi aplicada.' };
    if (/image(?:m|ns)|google|busc(?:a|ar) fotos/.test(text)) return { type:'unsupported', message:'Busca e inserção de imagens ainda não estão integradas. Nenhuma imagem foi buscada ou adicionada ao projeto.' };
    if (/\b(nao|não|nunca)\b/i.test(rawText)) return { type: 'clarification', question: 'Qual ação você deseja executar? O pedido contém uma negação.' };
    const intent = /divid|cort/.test(text) ? 'split_clip' : /titulo|texto|legenda/.test(text) ? 'add_text' : /db|volume|ganho/.test(text) ? 'set_clip_gain' : 'seek';
    if (!context.capabilities.includes(intent)) return { type: 'unsupported', message: `A ação ${intent} ainda não está disponível nesta integração. Apenas navegação temporal está habilitada.` };
    if (intent !== 'seek' && /(?:e depois| e (?:coloc|divid|cort|abaix|aument))/.test(text)) return { type: 'clarification', question: 'Envie uma ação por vez.' };
    // 1. Defesa contra Prompt Injection / Scripts maliciosos
    if (text.includes('window.alert') || text.includes('eval(') || text.includes('document.cookie')) {
      return {
        type: 'unsupported',
        message: 'Comando rejeitado por segurança (argumento inválido ou tentativa de injeção).'
      };
    }

    // 2. Casos fora do catálogo
    if (text.includes('gere uma narracao') || text.includes('sintetizar voz') || text.includes('narracao')) {
      return {
        type: 'unsupported',
        message: 'A geração de voz por IA ainda é operada manualmente na aba de síntese do wide.video.'
      };
    }
    if (text.includes('exporte') || text.includes('exportar em 4k')) {
      return {
        type: 'unsupported',
        message: 'A exportação é acionada diretamente pelo botão Export do editor.'
      };
    }

    // 3. Ambiguidades que requerem esclarecimento
    if (text === 'corta ai' || text === 'cortar' || text === 'divide') {
      if (context.selectedClipIds.length === 0) {
        return {
          type: 'clarification',
          question: 'Qual clipe você deseja cortar?',
          options: context.clips.map(c => `Clipe: ${c.name} (${c.clipId})`)
        };
      }
    }

    if (text.includes('abaixa o audio') && !text.match(/\d+/) && context.selectedClipIds.length === 0) {
      return {
        type: 'clarification',
        question: 'Quantos dB você deseja diminuir e em qual clipe?',
        options: ['Diminuir em 3 dB', 'Diminuir em 6 dB', 'Silenciar (-60 dB)']
      };
    }

    // 4. Seek / Navegação temporal ("vá para 10 segundos", "vá para o segundo 12", "move a agulha para 5s")
    const seekMatch = text.match(/va para (?:o segundo )?(\d+(?:\.\d+)?)\s*(?:s|segundos?)?/i) 
      || text.match(/segundo (\d+)/i)
      || text.match(/move(?:r)? (?:a agulha|playhead)? para (\d+)s?/i);

    if (seekMatch && intent === 'seek') {
      const sec = parseFloat(seekMatch[1]);
      const frame = secondsToFrames(sec, fps);
      const plan: EditPlan = {
        schemaVersion: '0.1',
        planId: `plan-${Date.now()}`,
        projectId: context.project.id,
        expectedRevision: context.revision,
        summary: `Mover agulha para ${sec}s (Frame ${frame})`,
        operations: [
          {
            operationId: `op-${Date.now()}-1`,
            command: 'seek',
            args: { frame }
          }
        ]
      };
      return { type: 'plan', plan };
    }

    // 5. Ganho de áudio ("abaixa em 6 db", "aumenta 3 db", "mude o volume para 0 db")
    const gainMatch = text.match(/(abaix[ae]|diminui|aument[ae]|mude|alterar).*(?:volume|ganho|musica|audio)?.*?(-?\d+(?:\.\d+)?)\s*db/i);
    if (gainMatch) {
      if (context.selectedClipIds.length !== 1) return { type: 'clarification', question: 'Selecione exatamente um clipe para alterar o ganho.' };
      const action = gainMatch[1].toLowerCase();
      const val = parseFloat(gainMatch[2]);
      const targetId = context.selectedClipIds[0];
      const targetClip = context.clips.find(c => c.clipId === targetId);
      if (!targetClip || targetClip.locked !== false || targetClip.gainDb === undefined) return { type: 'unsupported', message: 'Ganho ou alvo indisponível.' };
      const currentGain = targetClip.gainDb;

      let finalGain = val;
      if (action.startsWith('abaix') || action.startsWith('diminui')) {
        finalGain = currentGain - Math.abs(val);
      } else if (action.startsWith('aument')) {
        finalGain = currentGain + Math.abs(val);
      }

      // Clamping [-60, 12]
      finalGain = Math.max(-60, Math.min(12, finalGain));

      const plan: EditPlan = {
        schemaVersion: '0.1',
        planId: `plan-${Date.now()}`,
        projectId: context.project.id,
        expectedRevision: context.revision,
        summary: `Alterar ganho de áudio para ${finalGain} dB`,
        operations: [
          {
            operationId: `op-${Date.now()}-1`,
            command: 'set_clip_gain',
            targetId,
            args: { targetId, gainDb: finalGain }
          }
        ]
      };
      return { type: 'plan', plan };
    }

    // 6. Adicionar texto ("coloca um título 'Intro' de 0 a 3s", "adiciona texto 'X'")
    const hasTextIntent = text.includes('titulo') || text.includes('texto') || text.includes('legenda');
    const isAddAction = text.includes('coloq') || text.includes('coloc') || text.includes('adicion') || text.includes('inser');
    if (hasTextIntent && isAddAction) {
      const quoteMatch = prompt.match(/['"“](.+?)['"”]/);
      const textContent = quoteMatch ? quoteMatch[1] : 'Título';
      const interval = text.match(/de (\d+(?:\.\d+)?)\s*(?:s|segundos?)? a (\d+(?:\.\d+)?)\s*(?:s|segundos?)/);
      if (!interval || !quoteMatch) return { type: 'clarification', question: 'Informe o texto entre aspas e o intervalo, por exemplo: de 0 a 3s.' };
      const startFrame = secondsToFrames(Number(interval[1]), fps);
      const endFrame = secondsToFrames(Number(interval[2]), fps);
      if (endFrame <= startFrame) return { type: 'clarification', question: 'O fim deve ser posterior ao início.' };

      const plan: EditPlan = {
        schemaVersion: '0.1',
        planId: `plan-${Date.now()}`,
        projectId: context.project.id,
        expectedRevision: context.revision,
        summary: `Inserir clipe de texto "${textContent}"`,
        operations: [
          {
            operationId: `op-${Date.now()}-1`,
            command: 'add_text',
            args: {
              text: textContent,
              startFrame,
              endFrame
            }
          }
        ]
      };
      return { type: 'plan', plan };
    }

    // 7. Divisão de clipe ("divide este clipe no segundo 5", "corta no segundo 5")
    const splitMatch = text.match(/(?:divid[ae]|corta).*?segundo (\d+)/i);
    if (splitMatch) {
      if (context.selectedClipIds.length !== 1) return { type: 'clarification', question: 'Selecione exatamente um clipe para dividir.' };
      const sec = parseFloat(splitMatch[1]);
      const splitFrame = secondsToFrames(sec, fps);
      const targetId = context.selectedClipIds[0];
      const clip = context.clips.find(c => c.clipId === targetId);
      if (!clip || clip.locked !== false || clip.startFrame === null || clip.endFrame === null || splitFrame <= clip.startFrame || splitFrame >= clip.endFrame) return { type: 'unsupported', message: 'Ponto de corte fora do clipe ou clipe bloqueado.' };

      const plan: EditPlan = {
        schemaVersion: '0.1',
        planId: `plan-${Date.now()}`,
        projectId: context.project.id,
        expectedRevision: context.revision,
        summary: `Dividir clipe no segundo ${sec} (Frame ${splitFrame})`,
        operations: [
          {
            operationId: `op-${Date.now()}-1`,
            command: 'split_clip',
            targetId,
            args: { targetId, splitFrame }
          }
        ]
      };
      return { type: 'plan', plan };
    }

    // Default fallback: esclarecimento
    return {
      type: 'clarification',
      question: `Não identifiquei uma ação precisa para "${prompt}". O que você gostaria de fazer?`,
      options: [
        'Mover a agulha de reprodução',
        'Ajustar o volume do clipe selecionado',
        'Adicionar um título de texto'
      ]
    };
  }
}
