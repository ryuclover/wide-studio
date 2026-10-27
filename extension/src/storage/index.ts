/**
 * Wrappers tipados para armazenamento seguro no Manifest V3
 * - storage.session: dados voláteis de transação e reconciliação
 * - storage.local: configurações persistentes e segredos (API Keys)
 */

export interface TransactionState {
  transactionId: string;
  projectId: string;
  status: 'idle' | 'preparing' | 'running' | 'verifying' | 'completed' | 'failed';
  currentStepIndex: number;
  totalSteps: number;
  commandName: string;
  startedAt: number;
}

export interface ExtensionSettings {
  apiKey?: string;
  provider: 'nim' | 'mock' | 'local';
  nimModel: string;
  apiEndpoint?: string;
  autoApplyQuickPlans: boolean;
}

const DEFAULT_SETTINGS: ExtensionSettings = {
  provider: 'mock',
  nimModel: '',
  autoApplyQuickPlans: false
};

export const StorageService = {
  // Session storage (persiste durante a sessão do browser, mesmo se o SW suspender)
  async getTransaction(): Promise<TransactionState | null> {
    try {
      if (!chrome?.storage?.session) throw new Error('Session storage indisponível');
      const res = await chrome.storage.session.get('activeTransaction');
      return (res.activeTransaction as TransactionState) || null;
    } catch (e) {
      throw e;
    }
  },

  async setTransaction(transaction: TransactionState): Promise<void> {
    try {
      if (chrome?.storage?.session) {
        await chrome.storage.session.set({ activeTransaction: transaction });
      }
    } catch (e) {
      console.warn('[WideStudio] Erro ao gravar transaction no session storage:', e);
      throw e;
    }
  },

  async clearTransaction(): Promise<void> {
    try {
      if (chrome?.storage?.session) {
        await chrome.storage.session.remove('activeTransaction');
      }
    } catch (e) {
      console.warn('[WideStudio] Erro ao limpar transaction:', e);
      throw e;
    }
  },

  // Local storage (persistente para configurações e chaves de API no Service Worker)
  async getSettings(): Promise<ExtensionSettings> {
    try {
      if (!chrome?.storage?.local) return DEFAULT_SETTINGS;
      const res = await chrome.storage.local.get('settings');
      const settings = { ...DEFAULT_SETTINGS, ...(res.settings || {}) };
      if (settings.nimModel === 'meta/llama-3.1-70b-instruct') settings.nimModel = '';
      return settings;
    } catch {
      return DEFAULT_SETTINGS;
    }
  },

  async saveSettings(settings: Partial<ExtensionSettings>): Promise<ExtensionSettings> {
    try {
      const current = await this.getSettings();
      const updated = { ...current, ...settings };
      if (chrome?.storage?.local) {
        await chrome.storage.local.set({ settings: updated });
      }
      return updated;
    } catch (e) {
      console.error('[WideStudio] Erro ao salvar configurações:', e);
      throw e;
    }
  }
};
