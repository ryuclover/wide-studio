import { useState } from 'preact/hooks';
import { ExtensionSettings } from '../../storage';

interface SettingsModalProps {
  currentSettings: ExtensionSettings;
  onSave: (settings: Partial<ExtensionSettings>) => Promise<void>;
  onClose: () => void;
}

export function SettingsModal({ currentSettings, onSave, onClose }: SettingsModalProps) {
  const [provider, setProvider] = useState<'nim' | 'mock'>(
    currentSettings.provider === 'nim' ? 'nim' : 'mock'
  );
  const [apiKey, setApiKey] = useState(currentSettings.apiKey || '');
  const [model, setModel] = useState(currentSettings.nimModel || 'nvidia/nemotron-3.5-lightning-30b-a3b');

  const [error, setError] = useState('');
  const handleSave = async (e: Event) => {
    e.preventDefault();
    try {
    if (provider === 'nim' && !await chrome.permissions.request({ origins: ['https://integrate.api.nvidia.com/*'] })) throw new Error('Permissão NVIDIA não concedida.');
    await onSave({
      provider,
      apiKey: apiKey.trim(),
      nimModel: model.trim()
    });
    onClose();
    } catch (e) { setError(String(e)); }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: 16
      }}
    >
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: 380,
          backgroundColor: 'var(--bg-secondary)',
          border: '1px solid var(--border-color)',
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.6)'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600 }}>Configurações de IA</h3>
          <button type="button" className="btn-ghost" onClick={onClose} style={{ padding: '4px 8px' }}>
            ✕
          </button>
        </div>

        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {error && <p role="alert">{error}</p>}
          <p style={{ fontSize: 12 }}>NVIDIA NIM envia seu pedido e metadados do projeto à NVIDIA. Vídeo e áudio não são enviados. Sem chave, a conexão remota permanece indisponível.</p>
          <label style={{fontSize:12}}>Importar conexão local
            <input type="file" accept=".json,application/json" onChange={async e => {
              const file=e.currentTarget.files?.[0]; if(!file)return;
              try {
                if(file.size>16000)throw new Error('Arquivo de configuração muito grande.');
                const data=JSON.parse(await file.text());
                if(typeof data.apiKey!=='string' || !/^nvapi-[A-Za-z0-9_-]{20,}$/.test(data.apiKey) || typeof data.nimModel!=='string' || !data.nimModel.trim() || data.nimModel.length>256)throw new Error('Configuração NVIDIA inválida.');
                setProvider('nim');setApiKey(data.apiKey);setModel(data.nimModel);setError('');
              }catch {setError('Não foi possível importar a conexão NVIDIA. Confira o arquivo.');}
            }}/>
          </label>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
              Provedor de Inferência
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                className={provider === 'mock' ? 'btn-primary' : 'btn-secondary'}
                style={{ flex: 1 }}
                onClick={() => setProvider('mock')}
              >
                Local (sem IA)
              </button>
              <button
                type="button"
                className={provider === 'nim' ? 'btn-primary' : 'btn-secondary'}
                style={{ flex: 1 }}
                onClick={() => setProvider('nim')}
              >
                NVIDIA NIM
              </button>
            </div>
          </div>

          {provider === 'nim' && (
            <>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
                  NVIDIA NIM API Key
                </label>
                <input
                  type="password"
                  placeholder="nvapi-..."
                  value={apiKey}
                  onInput={(e: any) => setApiKey(e.target.value)}
                  required={provider === 'nim'}
                />
                <span style={{ fontSize: 11, color: 'var(--text-subtle)', marginTop: 4, display: 'block' }}>
                  Armazenada exclusivamente no storage local isolado da extensão.
                </span>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
                  Modelo Remoto
                </label>
                <input
                  type="text"
                  value={model}
                  placeholder="ID de um modelo disponível na sua conta"
                  required
                  onInput={(e: any) => setModel(e.target.value)}
                />
              </div>
            </>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="btn-primary">
              Salvar Alterações
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
