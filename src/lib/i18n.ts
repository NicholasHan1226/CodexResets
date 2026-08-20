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
    'hero.daysAgo': 'days ago',
    'hero.flatNote': 'Waiting longer does not raise the odds — the 24h number stays flat while the quiet stretch runs.',
    'hero.medianGap': 'median gap',
    'hero.adviceLabel': 'Advice —',
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

    // Usage Tracker
    'usage.title': 'codex /status',
    'usage.weeklyWindow': 'Weekly window',
    'usage.resetAnchor': 'Reset anchor',
    'usage.setUsage': 'Set my usage',
    'usage.setResetTime': 'Set reset time',
    'usage.canYouMakeIt': 'Can you make it to reset?',
    'usage.yesEasily': 'Yes, you have plenty of buffer',
    'usage.tight': 'Tight — consider waiting',
    'usage.no': 'No, you will likely hit the wall',
    'usage.setUsageFirst': 'Set your usage above to see prediction',

    // Banked Resets
    'banked.title': 'BANKED RESETS',
    'banked.description': 'Stored resets expire 30 days after being issued.',
    'banked.add': 'Add reset',
    'banked.available': 'Available',
    'banked.used': 'Used',
    'banked.expired': 'Expired',
    'banked.expiresIn': 'Expires in {n}d',
    'banked.daysLeft': '{n}d left',
    'banked.noResets': 'No banked resets',

    // History
    'history.title': 'Reset History & Banked',
    'history.recent': 'Recent Resets',
    'history.lastReset': 'Last reset',
    'history.totalResets': 'Total resets',
    'history.medianInterval': 'Median interval',
    'history.longestWait': 'Longest wait',
    'history.days': '{n}d',

    // Model Info
    'model.title': 'ABOUT THE MODEL',
    'model.description': 'This prediction is based on historical reset patterns, time decay analysis, and public signal monitoring. Resets are manually triggered by OpenAI and cannot be precisely predicted.',
    'model.disclaimer': 'This is a probability estimate, not a guarantee. Use at your own discretion.',

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
    'hero.daysAgo': '天前',
    'hero.flatNote': '等待不会提高概率——在平静期内，24 小时数值保持不变。',
    'hero.medianGap': '中位间隔',
    'hero.adviceLabel': '建议 —',
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

    // Usage Tracker
    'usage.title': 'codex /status',
    'usage.weeklyWindow': '每周窗口',
    'usage.resetAnchor': '重置锚点',
    'usage.setUsage': '设置使用率',
    'usage.setResetTime': '设置重置时间',
    'usage.canYouMakeIt': '你能撑到重置吗？',
    'usage.yesEasily': '可以，你有充足的缓冲',
    'usage.tight': '紧张 — 建议等待',
    'usage.no': '不行，你可能会撞墙',
    'usage.setUsageFirst': '先设置使用率以查看预测',

    // Banked Resets
    'banked.title': '存储重置',
    'banked.description': '存储重置在发放30天后过期。',
    'banked.add': '添加重置',
    'banked.available': '可用',
    'banked.used': '已用',
    'banked.expired': '已过期',
    'banked.expiresIn': '{n}天后过期',
    'banked.daysLeft': '剩余{n}天',
    'banked.noResets': '无存储重置',

    // History
    'history.title': '重置历史与存储',
    'history.recent': '最近重置',
    'history.lastReset': '上次重置',
    'history.totalResets': '总重置次数',
    'history.medianInterval': '中位间隔',
    'history.longestWait': '最长等待',
    'history.days': '{n}天',

    // Model Info
    'model.title': '关于模型',
    'model.description': '此预测基于历史重置模式、时间衰减分析和公开信号监测。重置由 OpenAI 手动触发，无法精确预测。',
    'model.disclaimer': '这是概率估计，不是保证。请自行判断使用。',

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
