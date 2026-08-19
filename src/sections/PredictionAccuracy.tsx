import { useState, useEffect } from 'react';
import { useI18n } from '@/contexts/I18nContext';
import { Target, TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface PredictionRecord {
  id: string;
  timestamp: number;
  probability24h: number;
  probability48h: number;
  actualReset: boolean | null; // null = not yet known
  resetDate?: number;
}

const STORAGE_KEY = 'codex_prediction_history';

/**
 * Prediction Accuracy Tracker
 * Records predictions and tracks their accuracy over time
 */
export function PredictionAccuracy() {
  const { t } = useI18n();
  const [records, setRecords] = useState<PredictionRecord[]>([]);
  const [showDetails, setShowDetails] = useState(false);

  // Load records from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setRecords(JSON.parse(stored));
      } catch {
        // Invalid data, reset
        setRecords([]);
      }
    }
  }, []);

  // Calculate accuracy stats
  const stats = {
    total: records.filter((r) => r.actualReset !== null).length,
    correct: records.filter((r) => r.actualReset === true && r.probability24h > 50).length,
    missed: records.filter((r) => r.actualReset === true && r.probability24h <= 50).length,
    falseAlarms: records.filter((r) => r.actualReset === false && r.probability24h > 70).length,
    avgProbability: records.length
      ? records.reduce((sum, r) => sum + r.probability24h, 0) / records.length
      : 0,
  };

  const accuracy = stats.total > 0 ? (stats.correct / stats.total) * 100 : 0;

  return (
    <section className="bg-card rounded-lg shadow-card p-5" aria-label="Prediction accuracy">
      <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
        <Target className="w-4 h-4 text-primary" />
        {t('accuracy.title')}
      </h2>

      <div className="mt-4">
        {/* Accuracy display */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-2xl font-mono font-bold text-primary">
              {accuracy.toFixed(0)}%
            </div>
            <div className="text-[11px] text-muted-foreground">{t('accuracy.accuracy')}</div>
          </div>
          <div className="text-right">
            <div className="text-lg font-mono text-foreground">{stats.total}</div>
            <div className="text-[11px] text-muted-foreground">{t('accuracy.predictions')}</div>
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className="text-center p-2 bg-muted rounded-md">
            <TrendingUp className="w-4 h-4 text-primary mx-auto mb-1" />
            <div className="text-sm font-mono text-primary">{stats.correct}</div>
            <div className="text-[11px] text-muted-foreground">{t('accuracy.correct')}</div>
          </div>
          <div className="text-center p-2 bg-muted rounded-md">
            <TrendingDown className="w-4 h-4 text-warning mx-auto mb-1" />
            <div className="text-sm font-mono text-warning">{stats.missed}</div>
            <div className="text-[11px] text-muted-foreground">{t('accuracy.missed')}</div>
          </div>
          <div className="text-center p-2 bg-muted rounded-md">
            <Minus className="w-4 h-4 text-destructive mx-auto mb-1" />
            <div className="text-sm font-mono text-destructive">{stats.falseAlarms}</div>
            <div className="text-[11px] text-muted-foreground">{t('accuracy.falseAlarms')}</div>
          </div>
        </div>

        {/* Toggle details */}
        <button
          className="w-full text-[11px] text-muted-foreground hover:text-foreground transition-colors py-1.5"
          onClick={() => setShowDetails(!showDetails)}
        >
          {showDetails ? t('accuracy.hideHistory') : t('accuracy.showHistory')}
        </button>

        {/* History list */}
        {showDetails && (
          <div className="mt-3 max-h-48 overflow-y-auto space-y-1">
            {records.slice(0, 10).map((record) => (
              <div
                key={record.id}
                className="flex items-center justify-between p-2 bg-muted/50 rounded-md text-xs"
              >
                <span className="text-muted-foreground">
                  {new Date(record.timestamp).toLocaleDateString()}
                </span>
                <span className="font-mono text-foreground">{record.probability24h}%</span>
                <span>
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
      </div>
    </section>
  );
}
