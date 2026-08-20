import { useState, useEffect } from 'react';
import { useI18n } from '@/contexts/I18nContext';

interface PredictionRecord {
  id: string;
  timestamp: number;
  probability24h: number;
  probability48h: number;
  actualReset: boolean | null;
  resetDate?: number;
}

const STORAGE_KEY = 'codex_prediction_history';

export function PredictionAccuracy() {
  const { t } = useI18n();
  const [records, setRecords] = useState<PredictionRecord[]>([]);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try { setRecords(JSON.parse(stored)); } catch { setRecords([]); }
    }
  }, []);

  const stats = {
    total: records.filter((r) => r.actualReset !== null).length,
    correct: records.filter((r) => r.actualReset === true && r.probability24h > 50).length,
    missed: records.filter((r) => r.actualReset === true && r.probability24h <= 50).length,
    falseAlarms: records.filter((r) => r.actualReset === false && r.probability24h > 70).length,
  };

  const accuracy = stats.total > 0 ? (stats.correct / stats.total) * 100 : 0;

  return (
    <section aria-label="Prediction accuracy" className="max-w-3xl">
      <h2 className="text-lg font-semibold text-foreground">
        {t('accuracy.title')}
      </h2>

      {/* Stats — inline text */}
      <p className="mt-3 font-mono text-sm text-foreground">
        <span className="text-primary font-semibold">{accuracy.toFixed(0)}%</span>{' '}
        <span className="text-muted-foreground">{t('accuracy.accuracy').toLowerCase()}</span>
        <span className="mx-2 text-border">·</span>
        <span className="text-foreground">{stats.total}</span>{' '}
        <span className="text-muted-foreground">{t('accuracy.predictions').toLowerCase()}</span>
      </p>

      <p className="mt-2 font-mono text-xs text-muted-foreground">
        <span className="text-primary">{stats.correct}</span> {t('accuracy.correct').toLowerCase()}
        <span className="mx-2 text-border">·</span>
        <span className="text-warning">{stats.missed}</span> {t('accuracy.missed').toLowerCase()}
        <span className="mx-2 text-border">·</span>
        <span className="text-destructive">{stats.falseAlarms}</span> {t('accuracy.falseAlarms').toLowerCase()}
      </p>

      {/* Toggle */}
      <button
        className="mt-3 font-mono text-xs text-muted-foreground hover:text-foreground transition-colors"
        onClick={() => setShowDetails(!showDetails)}
      >
        [{showDetails ? t('accuracy.hideHistory') : t('accuracy.showHistory')}]
      </button>

      {/* History */}
      {showDetails && (
        <div className="mt-3 space-y-0">
          {records.slice(0, 10).map((record, i) => (
            <div
              key={record.id}
              className={`flex items-center gap-3 py-1.5 text-sm ${i > 0 ? 'border-t border-border/10' : ''}`}
            >
              <span className="font-mono text-muted-foreground">
                {new Date(record.timestamp).toLocaleDateString()}
              </span>
              <span className="font-mono text-foreground">{record.probability24h}%</span>
              <span className="ml-auto font-mono text-xs">
                {record.actualReset === null ? (
                  <span className="text-muted-foreground">{t('accuracy.pending')}</span>
                ) : record.actualReset ? (
                  <span className="text-primary">{t('accuracy.reset')}</span>
                ) : (
                  <span className="text-destructive">{t('accuracy.noReset')}</span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
