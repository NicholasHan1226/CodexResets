// i18n - Internationalization support
// Auto-detects user's system language and provides translations

export type Locale = 'en' | 'zh';

// Flat key-value translation structure
const translations: Record<Locale, Record<string, string>> = {
  en: {
    // Common
    'common.loading': 'Initializing signal model...',

    // Hero Section
    'hero.signalNo': 'no official reset signal',
    'hero.signalYes': 'reset signal detected',
    'hero.answerNo': 'No.',
    'hero.answerYes': 'Likely.',
    'hero.lastResetWas': 'The last verified global reset was',
    'hero.lastResetLabel': 'last verified reset',
    'hero.daysAgo': 'days ago',
    'hero.flatNote': 'Waiting longer does not raise the odds — the 24h number stays flat while the quiet stretch runs.',
    'hero.medianGap': 'median gap',
    'hero.adviceLabel': 'Advice —',
    'hero.probLabel': 'reset probability',
    'hero.withinHours': 'within next {n}h',
    'hero.windowShort': 'likely window',
    'hero.shareText': 'Codex reset probability: {n}% in next {h}h — live forecast:',
    'hero.shareLink': '[share]',
    'hero.copied': '[copied ✓]',
    'hero.prob24h': '24h Reset Probability',
    'hero.prob48h': '48h Reset Probability',
    'hero.trend': '+9 pts / 24h',
    'hero.waitedPrefix': 'Waited',
    'hero.waitedSuffix': 'since last reset, median',
    'hero.days': 'days',
    'hero.windowLabel': 'Most Likely Window',
    'hero.windowHint': 'Conditional probability ≈ 41% within window',
    'hero.waitProgress': 'Wait Progress',
    'hero.lastReset': 'Last reset',
    'hero.prob48hHint': 'Most likely window entering 48h range',

    // Header
    'app.title': 'Codex Resets',
    'app.subtitle': 'Next reset prediction',

    // Anchor nav
    'nav.curve': 'curve',
    'nav.signals': 'signals',
    'nav.rhythm': 'rhythm',
    'nav.history': 'history',
    'nav.calendar': 'calendar',
    'nav.alerts': 'alerts',
    'header.liveMonitoring': 'LIVE MONITORING',
    'header.simulated': 'SIMULATED',
    'header.model': 'Model',
    'header.updated': 'Updated',
    'header.justNow': 'just now',
    'header.minutesAgo': '{n}m ago',
    'header.hoursAgo': '{n}h ago',
    'header.refresh': 'Refresh',
    'header.share': 'Share',
    'header.export': 'Export',
    'header.language': 'Language',

    // Reset Outlook
    'outlook.title': 'RESET OUTLOOK',
    'outlook.highSignal': 'HIGH SIGNAL',
    'outlook.moderateSignal': 'MODERATE SIGNAL',
    'outlook.lowSignal': 'LOW SIGNAL',
    'outlook.prob24hDesc': 'probability of reset within 24h',
    'outlook.confidence': 'Confidence',
    'outlook.daysSinceLastReset': 'Days since last reset',
    'outlook.median': 'median',
    'outlook.overdue': 'overdue',
    'outlook.pastMedian': 'past median',
    'outlook.building': 'building',
    'outlook.recommendWait': 'Recommend waiting',
    'outlook.useCaution': 'Use cautiously',
    'outlook.normalConditions': 'Normal conditions',
    'outlook.criticalWait': 'Critical — wait',

    // Probability Gauges
    'gauges.title': 'RESET PROBABILITY',
    'gauges.24h': '24h',
    'gauges.48h': '48h',

    // Probability Curve
    'curve.title': 'PROBABILITY PULSE',
    'curve.subtitle': '7-day reset probability curve',
    'curve.mostLikelyWindow': 'Most likely window',
    'curve.peak': 'Peak',
    'curve.now': 'NOW',
    'curve.nowMarker': 'Current time',
    'curve.lowerProb': 'Lower probability',
    'curve.higherProb': 'Higher probability',

    // Signal Radar
    'signals.title': 'SIGNAL RADAR',
    'signals.sources': '{n} sources',
    'signals.tibo': 'Tibo Posts',
    'signals.status': 'OpenAI Status',
    'signals.cooldown': 'Time Cooldown',
    'signals.launch': 'Launch Noise',
    'signals.noIncidents': 'No open incidents',
    'signals.activeIncident': 'Active incident',
    'signals.lastReset': 'Last reset',
    'signals.daysAgo': '{n}d ago',
    'signals.noHints': 'No hints detected',
    'signals.resetAnnounced': 'Reset announced {n}h ago',
    'signals.resetAnnouncedDays': 'Reset announced {n}d ago',
    'signals.resetHinted': 'Reset hinted {n}h ago',
    'signals.resetHintedDays': 'Reset hinted {n}d ago',
    'signals.resetConfirmed': 'Reset confirmed {n}h ago',
    'signals.resetConfirmedDays': 'Reset confirmed {n}d ago',
    'signals.hintDetected': 'Hint detected: "{text}"',
    'signals.vaguepost': 'Team vagueposting detected',
    'signals.milestone': 'Milestone mentioned',
    'signals.noResetHints': 'No reset hints in recent posts',
    'signals.lastPost': 'Last post: {n}h ago',
    'signals.lastPostDays': 'Last post: {n}d ago',
    'signals.activeToday': 'Active today, no reset hints',
    'signals.moderateActivity': 'Moderate activity, no clear signals',
    'signals.quietPeriod': 'Quiet period, monitoring',
    'signals.recentIncident': 'Recent incident: {text}',
    'signals.noIncidentsStatus': 'No open Codex incidents',
    'signals.serviceDegraded': 'Service degraded',
    'signals.majorOutage': 'Major outage',
    'signals.cooldownNormal': 'Cooldown normal',
    'signals.cooldownBuilding': 'Cooldown building',
    'signals.cooldownLong': 'Long cooldown — odds rising',
    'signals.cooldownVeryLong': 'Very long cooldown',
    'signals.cooldownShort': 'Recent reset — cooldown short',
    'signals.noLaunchSignals': 'No launch signals',
    'signals.possibleRelease': 'Possible release hint',
    'signals.productHint': 'Product hint: "{text}"',
    'signals.milestoneReached': 'Milestone reached',
    'signals.loading': 'Loading signals...',
    'signals.liveData': 'Live data',
    'signals.cachedData': 'Cached',
    'signals.fallbackData': 'Fallback',
    'signals.tiboUnavailable': 'Post feed temporarily unavailable — monitoring via pipeline',
    'signals.statusActiveIncidents': '{n} open Codex-related incidents',
    'signals.statusClear': 'No open incidents',
    'signals.statusDown': 'Status page unreachable',
    'signals.cooldownDesc': '{d}d since last reset (median gap: {m}d)',
    'signals.launchActive': 'Elevated launch-window noise',
    'signals.launchQuiet': 'No product launch signals',

    // Time Distribution
    'distribution.title': 'RESET TIMING',
    'distribution.subtitle': 'When resets typically happen',
    'distribution.peakHours': 'Peak hours',
    'distribution.events': '{n} events',

    // Subscribe
    'subscribe.title': 'RESET RADAR',
    'subscribe.description': "We'll email at 70%, then once more if the button actually gets pressed.",
    'subscribe.placeholder': 'your@email.com',
    'subscribe.button': 'Subscribe',
    'subscribe.subscribed': 'Subscribed!',
    'subscribe.subscribers': '{n} subscribers',
    'subscribe.invalidEmail': 'Please enter a valid email',

    // Push Notifications
    'push.title': 'BROWSER NOTIFICATIONS',
    'push.description': 'Get instant alerts when a Codex reset is imminent.',
    'push.enable': 'Enable Notifications',
    'push.disable': 'Disable Notifications',
    'push.active': 'Notifications active',
    'push.notSupported': 'Not supported in this browser',
    'push.enabled': 'Browser push enabled',
    'push.disabled': 'Enable browser push',
    'push.unsubscribe': 'Disable notifications',

    // History
    'history.title': 'Reset History',
    'history.recent': 'Recent Resets',
    'history.lastReset': 'Last reset',
    'history.totalResets': 'Total resets',
    'history.medianInterval': 'Median interval',
    'history.longestWait': 'Longest wait',
    'history.days': '{n}d',
    'history.rhythm': 'Reset rhythm',
    'history.rhythmNote': 'days between resets, oldest → latest',
    'history.currentWait': 'current wait:',

    // Model Info
    'model.title': 'How the model works',
    'model.signalBased': 'Signal-based',
    'model.signalBasedDesc': 'The model watches public signals — posts from the Codex engineering lead, OpenAI status changes, and community reports — and weights them by recency and historical reliability.',
    'model.historicalData': 'Historical intervals',
    'model.historicalDataDesc': 'Every verified goodwill reset since September 2025 is recorded. The gap distribution between consecutive resets drives the baseline probability curve.',
    'model.weibullModel': 'Time-decay estimate',
    'model.weibullModelDesc': 'A survival model over the historical gap distribution yields the 24h / 48h probabilities. Waiting longer does not raise the odds during a quiet stretch — the model avoids the "due for a reset" fallacy.',
    'model.disclaimerDesc': 'This is a probability estimate, not a guarantee. Resets are manually triggered by OpenAI and cannot be precisely predicted. Use at your own discretion.',

    // Limits (how Codex limits work)
    'limits.title': 'How Codex usage limits work',
    'limits.5hTitle': 'The 5-hour window',
    'limits.5hDesc': 'The short clock. Local messages (CLI, IDE extension, desktop app) and cloud chats draw from one shared 5-hour budget. Your client shows its percentage left and reset time in /status.',
    'limits.weeklyTitle': 'The weekly window',
    'limits.weeklyDesc': 'The ceiling behind it, running seven days on its own clock. Each account\'s window anchors to its own first request after the previous reset — there is no universal weekly reset moment shared by everyone.',
    'limits.resetTitle': 'What a reset actually is',
    'limits.resetDesc': 'A reset restores your percentage to 100% — it does not add credits or change your plan. The reset time is computed on OpenAI\'s servers and sent as an absolute timestamp with each usage report.',
    'limits.bankedTitle': 'Goodwill & banked resets',
    'limits.bankedDesc': 'Separately from scheduled windows, OpenAI keeps resetting everyone\'s usage as a gesture — announced almost only on @thsottiaux\'s X feed. Banked resets sit in your account until you spend them, and expire 30 days after they are granted.',

    // About / Documentation page
    'about.title': 'Documentation',
    'about.heading': 'Method, limits, and data sources',
    'about.intro': 'Everything about how this tracker estimates reset probability, how Codex usage limits actually work, and where the data comes from.',
    'about.sourcesTitle': 'Data sources',
    'about.sourcesDesc': 'All inputs are public. No OpenAI account access is required or used — your personal usage numbers never leave this browser.',
    'about.sourceTibo': 'reset announcements from the Codex lead',
    'about.sourceStatus': 'official OpenAI service health',
    'about.sourceHistory': 'Verified reset history',
    'about.sourceHistoryDesc': 'every confirmed goodwill reset since Sep 2025',
    'about.backHome': 'back to the tracker',

    // Footer
    'footer.modelVersion': 'Model v2.4.1',
    'footer.dataSources': 'Data: @thsottiaux posts · OpenAI Status · Historical patterns',
    'footer.disclaimer': 'Not affiliated with OpenAI. Resets are manually triggered and cannot be precisely predicted.',

    // Calendar
    'calendar.title': 'Reset Calendar',
    'calendar.less': 'Less',
    'calendar.more': 'More',
    'calendar.totalResets': 'Total Resets',
    'calendar.daysWithResets': 'Days with Resets',
    'calendar.maxPerDay': 'Max per Day',

    // Accuracy
    'accuracy.title': 'Prediction Accuracy',
    'accuracy.accuracy': 'Accuracy',
    'accuracy.predictions': 'Predictions',
    'accuracy.correct': 'Correct',
    'accuracy.missed': 'Missed',
    'accuracy.falseAlarms': 'False Alarms',
    'accuracy.showHistory': 'Show History',
    'accuracy.hideHistory': 'Hide History',
    'accuracy.pending': 'Pending',
    'accuracy.reset': 'Reset',
    'accuracy.noReset': 'No Reset',
  },
  zh: {
    // Common
    'common.loading': '正在初始化信号模型...',

    // Hero Section
    'hero.signalNo': '暂无官方重置信号',
    'hero.signalYes': '检测到重置信号',
    'hero.answerNo': '不会。',
    'hero.answerYes': '很可能。',
    'hero.lastResetWas': '上次已验证的全局重置发生在',
    'hero.lastResetLabel': '上次已验证重置',
    'hero.daysAgo': '天前',
    'hero.flatNote': '等待不会提高概率——在平静期内，24 小时数值保持不变。',
    'hero.medianGap': '中位间隔',
    'hero.adviceLabel': '建议 —',
    'hero.probLabel': '重置概率',
    'hero.withinHours': '未来 {n} 小时内',
    'hero.windowShort': '最可能窗口',
    'hero.shareText': 'Codex 重置概率：未来 {h} 小时内 {n}% — 实时预测：',
    'hero.shareLink': '[分享]',
    'hero.copied': '[已复制 ✓]',
    'hero.prob24h': '24h 内重置概率',
    'hero.prob48h': '48h 内重置概率',
    'hero.trend': '+9 点 / 24h',
    'hero.waitedPrefix': '距上次重置已等待',
    'hero.waitedSuffix': '，中位间隔',
    'hero.days': '天',
    'hero.windowLabel': '最可能重置窗口',
    'hero.windowHint': '窗口内条件概率 ≈ 41%',
    'hero.waitProgress': '等待进度',
    'hero.lastReset': '上次重置',
    'hero.prob48hHint': '最可能窗口进入 48h 射程',

    // Header
    'app.title': 'Codex 重置预判',
    'app.subtitle': '下次重置预测',

    // Anchor nav
    'nav.curve': '曲线',
    'nav.signals': '信号',
    'nav.rhythm': '节奏',
    'nav.history': '历史',
    'nav.calendar': '日历',
    'nav.alerts': '订阅',
    'header.liveMonitoring': '实时监控',
    'header.simulated': '模拟数据',
    'header.model': '模型',
    'header.updated': '更新',
    'header.justNow': '刚刚',
    'header.minutesAgo': '{n}分钟前',
    'header.hoursAgo': '{n}小时前',
    'header.refresh': '刷新',
    'header.share': '分享',
    'header.export': '导出',
    'header.language': '语言',

    // Reset Outlook
    'outlook.title': '重置预估',
    'outlook.highSignal': '强信号',
    'outlook.moderateSignal': '中等信号',
    'outlook.lowSignal': '弱信号',
    'outlook.prob24hDesc': '24小时内重置概率',
    'outlook.confidence': '置信度',
    'outlook.daysSinceLastReset': '距上次重置天数',
    'outlook.median': '中位数',
    'outlook.overdue': '已超期',
    'outlook.pastMedian': '超过中位数',
    'outlook.building': '积累中',
    'outlook.recommendWait': '建议等待',
    'outlook.useCaution': '谨慎使用',
    'outlook.normalConditions': '正常使用',
    'outlook.criticalWait': '紧急 — 请等待',

    // Probability Gauges
    'gauges.title': '重置概率',
    'gauges.24h': '24小时',
    'gauges.48h': '48小时',

    // Probability Curve
    'curve.title': '概率脉搏',
    'curve.subtitle': '7天重置概率曲线',
    'curve.mostLikelyWindow': '最可能窗口',
    'curve.peak': '峰值',
    'curve.now': '现在',
    'curve.nowMarker': '当前时间',
    'curve.lowerProb': '较低概率',
    'curve.higherProb': '较高概率',

    // Signal Radar
    'signals.title': '信号雷达',
    'signals.sources': '{n} 个信号源',
    'signals.tibo': 'Tibo 推文',
    'signals.status': 'OpenAI 状态',
    'signals.cooldown': '时间冷却',
    'signals.launch': '发布噪音',
    'signals.noIncidents': '无事故',
    'signals.activeIncident': '有事故',
    'signals.lastReset': '上次重置',
    'signals.daysAgo': '{n}天前',
    'signals.noHints': '无发布暗示',
    'signals.resetAnnounced': '重置已宣布 {n}小时前',
    'signals.resetAnnouncedDays': '重置已宣布 {n}天前',
    'signals.resetHinted': '重置暗示 {n}小时前',
    'signals.resetHintedDays': '重置暗示 {n}天前',
    'signals.resetConfirmed': '重置已确认 {n}小时前',
    'signals.resetConfirmedDays': '重置已确认 {n}天前',
    'signals.hintDetected': '检测到暗示："{text}"',
    'signals.vaguepost': '检测到团队暗示性发言',
    'signals.milestone': '提及里程碑',
    'signals.noResetHints': '近期推文无重置暗示',
    'signals.lastPost': '最新推文：{n}小时前',
    'signals.lastPostDays': '最新推文：{n}天前',
    'signals.activeToday': '今日活跃，无重置暗示',
    'signals.moderateActivity': '活动适中，无明显信号',
    'signals.quietPeriod': '静默期，持续监控中',
    'signals.recentIncident': '近期事故：{text}',
    'signals.noIncidentsStatus': '无 Codex 相关事故',
    'signals.serviceDegraded': '服务降级中',
    'signals.majorOutage': '重大故障',
    'signals.cooldownNormal': '冷却正常',
    'signals.cooldownBuilding': '冷却积累中',
    'signals.cooldownLong': '长时间冷却 — 概率上升',
    'signals.cooldownVeryLong': '超长冷却期',
    'signals.cooldownShort': '近期已重置 — 冷却较短',
    'signals.noLaunchSignals': '无发布信号',
    'signals.possibleRelease': '疑似发布暗示',
    'signals.productHint': '产品暗示："{text}"',
    'signals.milestoneReached': '达成里程碑',
    'signals.liveData': '实时数据',
    'signals.cachedData': '已缓存',
    'signals.fallbackData': '降级数据',
    'signals.tiboUnavailable': '推文源暂时不可用 — 管道持续监控中',
    'signals.statusActiveIncidents': '{n} 个进行中的 Codex 相关事故',
    'signals.statusClear': '无进行中事故',
    'signals.statusDown': '状态页无法访问',
    'signals.cooldownDesc': '距上次重置 {d} 天（间隔中位数：{m} 天）',
    'signals.launchActive': '发布窗口噪音升高',
    'signals.launchQuiet': '无产品发布信号',

    // Time Distribution
    'distribution.title': '重置时间分布',
    'distribution.subtitle': '重置通常发生的时间',
    'distribution.peakHours': '高峰时段',
    'distribution.events': '{n} 次事件',

    // Subscribe
    'subscribe.title': '重置雷达',
    'subscribe.description': '概率达到70%时邮件通知，重置确认后再次通知。',
    'subscribe.placeholder': '你的邮箱',
    'subscribe.button': '订阅',
    'subscribe.subscribed': '已订阅！',
    'subscribe.subscribers': '{n} 位订阅者',
    'subscribe.invalidEmail': '请输入有效的邮箱地址',

    // Push Notifications
    'push.title': '浏览器通知',
    'push.description': '当 Codex 重置即将发生时获取即时通知。',
    'push.enable': '开启通知',
    'push.disable': '关闭通知',
    'push.active': '通知已激活',
    'push.notSupported': '此浏览器不支持',
    'push.enabled': '浏览器推送已开启',
    'push.disabled': '开启浏览器推送',
    'push.unsubscribe': '关闭通知',

    // History
    'history.title': '重置历史',
    'history.recent': '最近重置',
    'history.lastReset': '上次重置',
    'history.totalResets': '总重置次数',
    'history.medianInterval': '中位间隔',
    'history.longestWait': '最长等待',
    'history.rhythm': '重置节奏',
    'history.rhythmNote': '相邻重置间隔天数，最旧 → 最新',
    'history.currentWait': '当前已等待：',
    'history.days': '{n}天',

    // Model Info
    'model.title': '模型如何工作',
    'model.signalBased': '信号驱动',
    'model.signalBasedDesc': '模型持续监测公开信号——Codex 工程负责人的帖子、OpenAI 状态变更、社区报告——并按时间近远和历史可靠性加权。',
    'model.historicalData': '历史间隔',
    'model.historicalDataDesc': '记录了自 2025 年 9 月以来每一次已验证的全局重置。相邻重置之间的间隔分布驱动基线概率曲线。',
    'model.weibullModel': '时间衰减估计',
    'model.weibullModelDesc': '基于历史间隔分布的生存模型给出 24h / 48h 概率。在平静期内等待不会提高概率——模型避免"该重置了"的谬误。',
    'model.disclaimerDesc': '这是概率估计，不是保证。重置由 OpenAI 手动触发，无法精确预测。请自行判断使用。',

    // Limits
    'limits.title': 'Codex 限额机制',
    'limits.5hTitle': '5 小时窗口',
    'limits.5hDesc': '短时钟。本地消息（CLI、IDE 扩展、桌面应用）和云端对话共用一个 5 小时预算。客户端在 /status 中显示剩余百分比和重置时间。',
    'limits.weeklyTitle': '每周窗口',
    'limits.weeklyDesc': '背后的上限，独立运行七天。每个账户的窗口锚定在上次重置后自己的第一个请求——不存在所有人共享的统一每周重置时刻。',
    'limits.resetTitle': '重置到底是什么',
    'limits.resetDesc': '重置将你的百分比恢复到 100%——不增加额度也不改变计划。重置时间由 OpenAI 服务器计算，随每次用量报告以绝对时间戳下发。',
    'limits.bankedTitle': '善意重置与存储重置',
    'limits.bankedDesc': '在计划窗口之外，OpenAI 持续以善意姿态重置所有人的用量——几乎只在 @thsottiaux 的 X 动态上宣布。存储重置存放在你的账户中，使用后生效，发放 30 天后过期。',

    // About page
    'about.title': '说明文档',
    'about.heading': '方法、限额机制与数据来源',
    'about.intro': '关于此追踪器如何估计重置概率、Codex 限额如何运作、以及数据来自哪里的完整说明。',
    'about.sourcesTitle': '数据来源',
    'about.sourcesDesc': '所有输入均为公开信息。不需要也不使用 OpenAI 账户访问——你的个人用量数据永不离开此浏览器。',
    'about.sourceTibo': 'Codex 负责人的重置公告',
    'about.sourceStatus': 'OpenAI 官方服务状态',
    'about.sourceHistory': '已验证的重置历史',
    'about.sourceHistoryDesc': '自 2025 年 9 月以来每次确认的善意重置',
    'about.backHome': '返回追踪器',

    // Footer
    'footer.modelVersion': '模型 v2.4.1',
    'footer.dataSources': '数据源：@thsottiaux 推文 · OpenAI 状态页 · 历史模式',
    'footer.disclaimer': '非 OpenAI 官方产品。重置由手动触发，无法精确预测。',

    // Calendar
    'calendar.title': '重置日历',
    'calendar.less': '少',
    'calendar.more': '多',
    'calendar.totalResets': '总重置次数',
    'calendar.daysWithResets': '有重置的天数',
    'calendar.maxPerDay': '每日最多',

    // Accuracy
    'accuracy.title': '预测准确度',
    'accuracy.accuracy': '准确度',
    'accuracy.predictions': '预测数',
    'accuracy.correct': '正确',
    'accuracy.missed': '遗漏',
    'accuracy.falseAlarms': '误报',
    'accuracy.showHistory': '显示历史',
    'accuracy.hideHistory': '隐藏历史',
    'accuracy.pending': '待验证',
    'accuracy.reset': '已重置',
    'accuracy.noReset': '未重置',
  },
};

/**
 * Detect user's preferred language from browser settings
 */
export function detectLocale(): Locale {
  if (typeof window === 'undefined') return 'en';
  
  const saved = localStorage.getItem('locale');
  if (saved === 'en' || saved === 'zh') return saved;
  
  const browserLang = navigator.language.toLowerCase();
  if (browserLang.startsWith('zh')) return 'zh';
  return 'en';
}

/**
 * Translation function with parameter substitution
 */
export function t(locale: Locale, key: string, params?: Record<string, string | number>): string {
  let text = translations[locale]?.[key] || translations.en[key] || key;
  
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      text = text.replace(`{${k}}`, String(v));
    });
  }
  
  return text;
}

/**
 * Get all translations for a locale
 */
export function getTranslations(locale: Locale): Record<string, string> {
  return translations[locale] || translations.en;
}
