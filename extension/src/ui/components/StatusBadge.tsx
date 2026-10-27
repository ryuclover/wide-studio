export type PanelState =
  | 'SemProjeto'
  | 'Conectado'
  | 'Preparando'
  | 'PrecisaEsclarecer'
  | 'PlanoPronto'
  | 'Aplicando'
  | 'Concluido'
  | 'FalhaParcial'
  | 'Incompativel';

interface StatusBadgeProps {
  state: PanelState;
  version?: string | null;
}

export function StatusBadge({ state, version }: StatusBadgeProps) {
  const config = {
    SemProjeto: {
      label: 'Desconectado',
      color: '#64748b',
      bg: 'rgba(100, 116, 139, 0.15)',
      pulse: false
    },
    Conectado: {
      label: version ? `wide.video v${version}` : 'Conectado',
      color: '#10b981',
      bg: 'rgba(16, 185, 129, 0.15)',
      pulse: false
    },
    Preparando: {
      label: 'Analisando...',
      color: '#3b82f6',
      bg: 'rgba(59, 130, 246, 0.15)',
      pulse: true
    },
    PrecisaEsclarecer: {
      label: 'Atenção Necessária',
      color: '#f59e0b',
      bg: 'rgba(245, 158, 11, 0.15)',
      pulse: false
    },
    PlanoPronto: {
      label: 'Revisão Pendente',
      color: '#3b82f6',
      bg: 'rgba(59, 130, 246, 0.15)',
      pulse: false
    },
    Aplicando: {
      label: 'Aplicando no Editor...',
      color: '#f59e0b',
      bg: 'rgba(245, 158, 11, 0.15)',
      pulse: true
    },
    Concluido: {
      label: 'Operação Verificada',
      color: '#10b981',
      bg: 'rgba(16, 185, 129, 0.15)',
      pulse: false
    },
    FalhaParcial: {
      label: 'Falha Parcial',
      color: '#ef4444',
      bg: 'rgba(239, 68, 68, 0.15)',
      pulse: false
    },
    Incompativel: {
      label: 'Não Suportado',
      color: '#ef4444',
      bg: 'rgba(239, 68, 68, 0.15)',
      pulse: false
    }
  }[state];

  return (
    <div
      className="badge"
      style={{
        backgroundColor: config.bg,
        color: config.color,
        border: `1px solid ${config.color}40`
      }}
    >
      <span
        className={`badge-dot ${config.pulse ? 'pulse' : ''}`}
        style={{ backgroundColor: config.color }}
      />
      <span>{config.label}</span>
    </div>
  );
}
