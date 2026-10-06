/* ZenFlow 静态内容数据（全局变量，兼容 file:// 直接打开）
 * icon 字段为内联 SVG 图标名（Lucide，ISC 许可，见 LICENSE-icons） */
window.ZF_DATA = {
  milestones: [
    { days: 1,  icon: 'sprout', name: '起步' },
    { days: 3,  icon: 'leaf', name: '三日' },
    { days: 7,  icon: 'clover', name: '一周' },
    { days: 14, icon: 'trees', name: '两周' },
    { days: 30, icon: 'mountain', name: '一个月' },
    { days: 60, icon: 'mountain-snow', name: '两个月' },
    { days: 90, icon: 'crown', name: '九十天' }
  ],
  moods: [
    { v: 5, icon: 'laugh', t: '很好' },
    { v: 4, icon: 'smile', t: '不错' },
    { v: 3, icon: 'meh', t: '一般' },
    { v: 2, icon: 'frown', t: '低落' },
    { v: 1, icon: 'annoyed', t: '挣扎' }
  ],
  /* 破戒 / 记录类型。id 稳定存储，label 仅用于界面。旧数据没有 types 时视为空数组，不丢记录。 */
  lapseTypes: [
    { id: 'masturbation', label: '自慰', icon: 'flame' },
    { id: 'porn', label: '看黄', icon: 'eye' },
    { id: 'sex', label: '性行为', icon: 'heart' },
    { id: 'fantasy', label: '意淫', icon: 'brain' },
    { id: 'dream', label: '梦淫', icon: 'moon' }
  ],
  triggers: ['无聊', '压力', '熬夜', '独处', '刷手机', '情绪低落', '其他'],
  actions: [
    { icon: 'droplets', t: '冷水洗脸' },
    { icon: 'dumbbell', t: '做 20 个俯卧撑' },
    { icon: 'activity', t: '做 30 个开合跳' },
    { icon: 'footprints', t: '出门走 10 分钟' },
    { icon: 'glass-water', t: '喝一杯水' },
    { icon: 'message-circle', t: '给朋友发条消息' },
    { icon: 'book-open', t: '读 5 页书' },
    { icon: 'brush-cleaning', t: '整理 5 分钟' },
    { icon: 'headphones', t: '听一首歌' },
    { icon: 'pen-line', t: '写下现在的感受' },
    { icon: 'person-standing', t: '伸展 2 分钟' },
    { icon: 'smartphone', t: '把手机放到别处' },
    { icon: 'eye', t: '看远处 1 分钟' },
    { icon: 'shower-head', t: '去洗澡' },
    { icon: 'apple', t: '吃点东西' },
    { icon: 'users', t: '去有人的地方' },
    { icon: 'list-checks', t: '做完一件小事' },
    { icon: 'arrow-down-up', t: '做 20 个深蹲' }
  ]
};
