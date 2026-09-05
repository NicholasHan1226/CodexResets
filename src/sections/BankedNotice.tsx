import { useI18n } from '@/contexts/I18nContext';
import { publicBankedNotices, type BankedNotice as Notice } from '@/lib/banked-notices';

export function BankedNotice({ notices, currentTime }: { notices?: Notice[]; currentTime: number }) {
  const { t, locale } = useI18n();
  const recent = publicBankedNotices(notices, currentTime);
  if (!recent.length) return null;
  const latest = recent[0];
  const date = (ts: number) => new Date(ts).toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  });
  return <aside aria-label={t('banked.title')} className="border-b border-primary/25 bg-primary/5 px-4 py-4 sm:px-5">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-sm font-semibold text-primary">{t('banked.title')} · {t(`banked.${latest.state}`)}</h2>
      <a href={latest.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-xs underline underline-offset-4">{t('banked.source')} ↗</a>
    </div>
    <p className="mt-2 text-sm">{t('banked.eligibility')}: {latest.plans.length ? latest.plans.map((plan) => plan === 'paid' ? t('banked.paid') : plan).join(' / ') : t('banked.seeSource')}</p>
    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t('banked.caveat')}</p>
    <p className="mt-2 font-mono text-xs text-muted-foreground">{date(latest.publishedAt)}</p>
    {recent.length > 1 && <details className="mt-2 text-xs text-muted-foreground">
      <summary className="cursor-pointer py-1">{t('banked.updates')}</summary>
      <ul className="mt-1 space-y-2">
        {recent.slice(1).map((notice) => <li key={notice.sourceUrl}>
          <a href={notice.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">{date(notice.publishedAt)} · {t(`banked.${notice.state}`)} ↗</a>
        </li>)}
      </ul>
    </details>}
  </aside>;
}
