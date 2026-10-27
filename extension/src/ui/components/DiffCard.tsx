import { PreparedPlan } from '../../types/commands';

interface DiffCardProps {
  plan: PreparedPlan;
  summary: string;
  onApply: () => void;
  onDiscard: () => void;
  isApplying?: boolean;
}

export function DiffCard({ plan, summary, onApply, onDiscard, isApplying }: DiffCardProps) {
  const operations = plan.operations;

  return (
    <div
      className="card"
      style={{
        borderLeft: '4px solid var(--accent-blue)',
        backgroundColor: '#131e32',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          <h4 style={{ fontSize: 14, fontWeight: 600, color: '#f8fafc' }}>
            {summary || 'Plano de Edição'}
          </h4>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {operations.length} {operations.length === 1 ? 'operação' : 'operações'} planejada(s)
          </span>
        </div>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            padding: '2px 6px',
            borderRadius: 4,
            backgroundColor: 'rgba(59, 130, 246, 0.2)',
            color: 'var(--accent-blue)'
          }}
        >
          Revisão
        </span>
      </div>

      {operations.map((op, idx) => (
        <div
          key={op.operationId || idx}
          style={{
            padding: '10px 12px',
            backgroundColor: 'var(--bg-primary)',
            borderRadius: 6,
            marginBottom: 8,
            border: '1px solid var(--border-color)'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 12 }}>
            <strong style={{ color: 'var(--text-main)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {op.command}
            </strong>
            {op.resolvedTarget && (
              <span style={{ color: 'var(--accent-amber)' }}>
                Alvo: {op.resolvedTarget.name}
              </span>
            )}
          </div>

          {op.computedDiff && op.computedDiff.length > 0 ? (
            <div style={{ fontSize: 13, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {op.computedDiff.map((d, dIdx) => (
                <div key={dIdx} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: 'var(--text-muted)' }}>{d.field}:</span>
                  <span className="mono" style={{ color: 'var(--accent-red)', textDecoration: 'line-through' }}>
                    {String(d.before)}
                  </span>
                  <span style={{ color: 'var(--text-subtle)' }}>──►</span>
                  <span className="mono" style={{ color: 'var(--accent-green)', fontWeight: 600 }}>
                    {String(d.after)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Argumentos: <code className="mono">{JSON.stringify(op.args)}</code>
            </div>
          )}
        </div>
      ))}

      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 8,
          marginTop: 14,
          paddingTop: 10,
          borderTop: '1px solid rgba(255, 255, 255, 0.08)'
        }}
      >
        <button
          type="button"
          className="btn-secondary"
          onClick={onDiscard}
          disabled={isApplying || !plan.valid}
          title="Atalho: Esc"
        >
          Descartar <span style={{ opacity: 0.6, fontSize: 11 }}>(Esc)</span>
        </button>
        <button
          type="button"
          className="btn-primary"
          onClick={onApply}
          disabled={isApplying || !plan.valid}
          title="Atalho: Enter"
        >
          {isApplying ? 'Aplicando...' : 'Aplicar'} <span style={{ opacity: 0.8, fontSize: 11 }}>(Enter)</span>
        </button>
      </div>
    </div>
  );
}
