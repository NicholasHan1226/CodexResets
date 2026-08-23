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
    'hero.signalWatch': 'related activity to watch',
    'hero.signalYes': 'reset signal detected',
    'hero.signalScheduled': 'official reset announced',
    'hero.question': 'will Codex reset within {n}h?',
    'hero.answerNo': 'Not likely.',
    'hero.answerWatch': 'Possible — keep watching.',
    'hero.answerYes': 'Likely.',
    'hero.lastResetWas': 'The last verified global reset was',
    'hero.lastResetLabel': 'last verified reset',
    'hero.daysAgo': 'days ago',
    'hero.flatNote': 'Waiting longer does not raise the odds — the 24h number stays flat while the quiet stretch runs.',
    'hero.medianGap': 'median gap',
    'hero.adviceLabel': 'Advice:',
    'hero.probLabel': 'reset probability',
    'hero.withinHours': 'within next {n}h',
    'hero.windowShort': 'likely window',
    'hero.shareText': 'Codex reset probability: {n}% in next {h}h — live forecast:',
    'hero.shareLink': '[share]',
    'hero.copied': '[copied ✓]',
    'hero.alertLink': '[set alert]',
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

    // Planning advice (model emits only a level; copy lives here)
    'advice.wait': 'Preserve heavy tasks until the signal is clearer.',
    'advice.cautious': 'Keep some capacity for critical tasks.',
    'advice.use_freely': 'No strong near-term signal — use normally.',
    'advice.approaching': 'The interval is approaching its usual range.',

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
    'header.guide': 'guide',
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
    'curve.peakWindow': 'Single 3h peak',
    'curve.window': 'next {n}h · each 3h',
    'curve.now': 'NOW',
    'curve.fromNow': 'from now',
    'curve.nowMarker': 'Current time',
    'curve.lowerProb': 'Lower probability',
    'curve.higherProb': 'Higher probability',

    // Signal Radar
    'signals.title': 'SIGNAL RADAR',
    'signals.sources': '{n} sources',
    'signals.composite': 'signal strength',
    'signals.strength.low': 'low',
    'signals.strength.medium': 'medium',
    'signals.strength.high': 'high',
    'signals.strongCount': '{a}/{n} strong signals',
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
    'signals.resetScheduled': 'Official reset is scheduled',
    'signals.resetMentionedDays': 'Reset mentioned {n}d ago (unconfirmed)',
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
    'timeDistribution.title': 'RESET TIMING',
    'timeDistribution.resets': 'resets',
    'timeDistribution.ofResets': 'of resets',
    'timeDistribution.peakWindow': 'peak window',

    // Subscribe
    'subscribe.title': 'RESET RADAR',
    'subscribe.description': 'After a reset is confirmed, we’ll email its type and the official announcement. Confirm your email first.',
    'subscribe.command': 'watch confirmed-resets --channel email',
    'subscribe.armed': 'ARMED',
    'subscribe.standby': 'STANDBY',
    'subscribe.placeholder': 'your@email.com',
    'subscribe.button': 'Subscribe',
    'subscribe.subscribed': 'Subscribed!',
    'subscribe.subscribers': '{n} subscribers',
    'subscribe.invalidEmail': 'Please enter a valid email',
    'subscribe.success': "Subscribed — we'll email you when a reset is confirmed.",
    'subscribe.confirmationSent': 'Check your inbox to confirm your subscription.',
    'subscribe.verificationRequired': 'Complete the human verification before subscribing.',
    'subscribe.verificationUnavailable': 'Subscription verification is temporarily unavailable.',
    'subscribe.alreadySubscribed': 'This email is already subscribed.',
    'subscribe.welcomeBack': 'Subscription re-activated — welcome back.',
    'subscribe.errorRetry': 'Something went wrong — please try again.',

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
    'push.errorRetry': 'Could not update notification settings. Try again.',

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
    'model.signalBasedDesc': 'The model combines reset intervals with current product conditions and recalculates as fresh evidence arrives.',
    'model.historicalData': 'Historical intervals',
    'model.historicalDataDesc': 'Reviewed public reset episodes form the baseline. Production-confirmed records extend it as they accumulate.',
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
    'limits.bankedDesc': 'Separately from scheduled windows, eligible plans may receive banked resets. They remain in your account until you use them and can expire after the applicable offer period.',

    // About / Documentation page
    'about.title': 'Documentation',
    'about.heading': 'Method and limits',
    'about.intro': 'How this tracker estimates reset probability and how Codex usage limits work.',
    'about.sourcesTitle': 'Data sources',
    'about.sourcesDesc': 'All inputs are public. No OpenAI account access is required or used — your personal usage numbers never leave this browser.',
    'about.sourceTibo': 'reset announcements from the Codex lead',
    'about.sourceStatus': 'official OpenAI service health',
    'about.sourceHistory': 'Verified reset history',
    'about.sourceHistoryDesc': 'reviewed public reset episodes and production-confirmed records',
    'about.privacyTitle': 'Email and privacy',
    'about.privacyDesc': 'An email address is stored only after its recipient confirms the subscription. It is used to send reset alerts and to process unsubscribe requests; this site does not ask for an OpenAI account or personal usage data.',
    'about.privacyRetention': 'Unconfirmed email addresses expire after 24 hours. A confirmed address is deleted when you unsubscribe, or when its mail provider reports a permanent delivery failure or spam complaint.',
    'about.privacyAbuse': 'To protect the subscription form, the service temporarily keeps a hashed network address for up to 10 minutes. It is used only to limit automated requests.',
    'about.backHome': 'back to the tracker',

    // Footer
    'footer.modelVersion': 'Model v2.4.1',
    'footer.dataSources': 'Data: @thsottiaux posts · OpenAI Status · Historical patterns',
    'footer.disclaimer': 'Not affiliated with OpenAI. Reset timing can change; estimates are for planning only.',

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
    'hero.signalWatch': '存在待观察的相关动态',
    'hero.signalYes': '检测到重置信号',
    'hero.signalScheduled': '官方已预告即将重置',
    'hero.question': '未来 {n} 小时会重置吗？',
    'hero.answerNo': '暂不太可能。',
    'hero.answerWatch': '有一定可能，继续观察。',
    'hero.answerYes': '很可能。',
    'hero.lastResetWas': '上次已验证的全局重置发生在',
    'hero.lastResetLabel': '上次已验证重置',
    'hero.daysAgo': '天前',
    'hero.flatNote': '等待不会提高概率——在平静期内，24 小时数值保持不变。',
    'hero.medianGap': '中位间隔',
    'hero.adviceLabel': '建议：',
    'hero.probLabel': '重置概率',
    'hero.withinHours': '未来 {n} 小时内',
    'hero.windowShort': '最可能窗口',
    'hero.shareText': 'Codex 重置概率：未来 {h} 小时内 {n}% — 实时预测：',
    'hero.shareLink': '[分享]',
    'hero.copied': '[已复制 ✓]',
    'hero.alertLink': '[订阅提醒]',
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

    // Planning advice
    'advice.wait': '重任务可先保留，等待更清晰的信号。',
    'advice.cautious': '关键任务建议保留一些用量余量。',
    'advice.use_freely': '近期没有强信号，可按正常节奏使用。',
    'advice.approaching': '间隔正接近常见范围，可留意后续变化。',

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
    'header.guide': '指南',
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
    'curve.peakWindow': '单个 3 小时峰值',
    'curve.window': '未来 {n} 小时 · 每 3 小时',
    'curve.now': '现在',
    'curve.fromNow': '从现在起',
    'curve.nowMarker': '当前时间',
    'curve.lowerProb': '较低概率',
    'curve.higherProb': '较高概率',

    // Signal Radar
    'signals.title': '信号雷达',
    'signals.sources': '{n} 个信号源',
    'signals.composite': '信号强度',
    'signals.strength.low': '低',
    'signals.strength.medium': '中',
    'signals.strength.high': '高',
    'signals.strongCount': '{a}/{n} 强信号',
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
    'signals.resetScheduled': '官方已预告即将重置',
    'signals.resetMentionedDays': '{n}天前提及重置（未确认）',
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
    'signals.loading': '信号加载中…',
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
    'timeDistribution.title': '重置时间分布',
    'timeDistribution.resets': '次重置',
    'timeDistribution.ofResets': '的重置',
    'timeDistribution.peakWindow': '高峰窗口',

    // Subscribe
    'subscribe.title': '重置雷达',
    'subscribe.description': '重置确认后，会邮件告知重置类型并附官方公告。请先完成邮箱确认。',
    'subscribe.command': 'watch confirmed-resets --channel email',
    'subscribe.armed': '已生效',
    'subscribe.standby': '待命',
    'subscribe.placeholder': '你的邮箱',
    'subscribe.button': '订阅',
    'subscribe.subscribed': '已订阅！',
    'subscribe.subscribers': '{n} 位订阅者',
    'subscribe.invalidEmail': '请输入有效的邮箱地址',
    'subscribe.success': '已订阅——重置确认后会邮件通知你。',
    'subscribe.confirmationSent': '请查收邮箱并完成订阅确认。',
    'subscribe.verificationRequired': '请先完成人机验证，再订阅。',
    'subscribe.verificationUnavailable': '订阅验证暂时不可用。',
    'subscribe.alreadySubscribed': '该邮箱已订阅。',
    'subscribe.welcomeBack': '订阅已重新激活。',
    'subscribe.errorRetry': '出错了，请稍后重试。',

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
    'push.errorRetry': '通知设置未同步，请重试。',

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
    'model.signalBasedDesc': '模型结合重置间隔与当前产品状态，并在获得新证据时重新计算。',
    'model.historicalData': '历史间隔',
    'model.historicalDataDesc': '经复核的公开重置事件构成基线，生产环境确认的记录会随积累纳入计算。',
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
    'limits.bankedDesc': '在计划窗口之外，符合条件的方案可能获得可存储的重置次数。它会保留在你的账户中直到使用，并可能按活动规则过期。',

    // About page
    'about.title': '说明文档',
    'about.heading': '方法与限额机制',
    'about.intro': '了解本追踪器如何估计重置概率，以及 Codex 限额如何运作。',
    'about.sourcesTitle': '数据来源',
    'about.sourcesDesc': '所有输入均为公开信息。不需要也不使用 OpenAI 账户访问——你的个人用量数据永不离开此浏览器。',
    'about.sourceTibo': 'Codex 负责人的重置公告',
    'about.sourceStatus': 'OpenAI 官方服务状态',
    'about.sourceHistory': '已验证的重置历史',
    'about.sourceHistoryDesc': '经复核的公开重置事件与生产确认记录',
    'about.privacyTitle': '邮箱与隐私',
    'about.privacyDesc': '只有收件人完成确认后，邮箱才会写入订阅名单。邮箱仅用于发送重置提醒和处理退订；本站不会索取 OpenAI 账户或个人用量数据。',
    'about.privacyRetention': '未确认的邮箱会在 24 小时后过期。已确认的邮箱会在退订后删除；若邮箱服务商报告永久投递失败或垃圾邮件投诉，也会删除。',
    'about.privacyAbuse': '为保护订阅表单，服务会暂存经过哈希处理的网络地址，最长 10 分钟，仅用于限制自动化请求。',
    'about.backHome': '返回追踪器',

    // Footer
    'footer.modelVersion': '模型 v2.4.1',
    'footer.dataSources': '数据源：@thsottiaux 推文 · OpenAI 状态页 · 历史模式',
    'footer.disclaimer': '非 OpenAI 官方产品。重置节奏可能变化，预测仅供参考。',

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
