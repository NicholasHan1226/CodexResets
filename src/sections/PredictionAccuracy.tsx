import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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

  // Save records to localStorage

  // Add a new prediction record

  // Mark a record as reset or not

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
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-slate-400 flex items-center gap-2">
          <Target className="w-4 h-4" />
          {t('accuracy.title')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Accuracy display */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-2xl font-mono text-emerald-400">
              {accuracy.toFixed(0)}%
            </div>
            <div className="text-xs text-slate-500">{t('accuracy.accuracy')}</div>
          </div>
          <div className="text-right">
            <div className="text-lg font-mono text-slate-300">{stats.total}</div>
            <div className="text-xs text-slate-500">{t('accuracy.predictions')}</div>
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className="text-center p-2 bg-slate-800/50 rounded">
            <TrendingUp className="w-4 h-4 text-emerald-400 mx-auto mb-1" />
            <div className="text-sm font-mono text-emerald-400">{stats.correct}</div>
            <div className="text-xs text-slate-500">{t('accuracy.correct')}</div>
          </div>
          <div className="text-center p-2 bg-slate-800/50 rounded">
            <TrendingDown className="w-4 h-4 text-amber-400 mx-auto mb-1" />
            <div className="text-sm font-mono text-amber-400">{stats.missed}</div>
            <div className="text-xs text-slate-500">{t('accuracy.missed')}</div>
          </div>
          <div className="text-center p-2 bg-slate-800/50 rounded">
            <Minus className="w-4 h-4 text-red-400 mx-auto mb-1" />
            <div className="text-sm font-mono text-red-400">{stats.falseAlarms}</div>
            <div className="text-xs text-slate-500">{t('accuracy.falseAlarms')}</div>
          </div>
        </div>

        {/* Toggle details */}
        <Button
          variant="ghost"
          size="sm"
          className="w-full text-slate-400 hover:text-slate-200"
          onClick={() => setShowDetails(!showDetails)}
        >
          {showDetails ? t('accuracy.hideHistory') : t('accuracy.showHistory')}
        </Button>

        {/* History list */}
        {showDetails && (
          <div className="mt-3 max-h-48 overflow-y-auto space-y-1">
            {records.slice(0, 10).map((record) => (
              <div
                key={record.id}
                className="flex items-center justify-between p-2 bg-slate-800/30 rounded text-xs"
              >
                <span className="text-slate-400">
                  {new Date(record.timestamp).toLocaleDateString()}
                </span>
                <span className="font-mono text-slate-300">{record.probability24h}%</span>
                <span>
                  {record.actualReset === null ? (
                    <span className="text-slate-500">{t('accuracy.pending')}</span>
                  ) : record.actualReset ? (
                    <span className="text-emerald-400">{t('accuracy.reset')}</span>
                  ) : (
                    <span className="text-red-400">{t('accuracy.noReset')}</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

