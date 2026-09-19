import type { Rule } from '../types';

export const LEGACY_YOUTUBE_RULES: Rule[] = [
  {
    id: 'sexual_content',
    name: '色情 / 性暗示',
    description: '隐藏标题、频道名或描述明确以色情、性挑逗或成人私密内容为卖点的视频。',
    instructions:
      '仅根据 YouTube 视频标题、频道名和卡片描述判断是否以色情、情色、性挑逗或成人私密内容为卖点。不得猜测缩略图或视频画面。医学、性教育、新闻、艺术、正常时尚和恋爱讨论不算。',
    trueCriteria: '可见文字明确推销色情、性挑逗或成人私密内容。',
    falseCriteria: '教育、医学、新闻、艺术等正常语境，或文字证据不足。',
    threshold: 0.85,
    enabled: true,
    builtin: true,
  },
  {
    id: 'sexual_solicitation',
    name: '色情引流 / 招揽',
    description: '隐藏通过成人内容引导私聊、加群、外链或购买服务的视频。',
    instructions:
      '只根据标题、频道名和描述判断是否结合成人色情语义引导联系、加群、外链或付费。普通会员、社群、直播和联系方式本身不构成色情引流。不要推测画面。',
    trueCriteria: '成人色情内容与联系、访问、加群或购买行动同时出现。',
    falseCriteria: '正常链接、会员、社群、教育、新闻；缺少成人色情上下文。',
    threshold: 0.85,
    enabled: true,
    builtin: true,
  },
  {
    id: 'spam_behavior',
    name: '诈骗 / 垃圾营销',
    description: '隐藏明显诈骗、虚假赠奖、保证收益或恶意诱导联系的视频。',
    instructions:
      '只根据视频标题、频道名和描述识别明显诈骗、虚假赠奖、保证收益和垃圾引流。不得仅凭 emoji、夸张标题、重复推荐或普通商业推广判定。新闻揭露诈骗、风险教育和正常产品评测不算。',
    trueCriteria: '文字明确包含诈骗式承诺或欺骗性营销诱导。',
    falseCriteria: '正常营销、评测、新闻、教育，或没有足够文字证据。',
    threshold: 0.9,
    enabled: true,
    builtin: true,
  },
];

const updates = [
  {
    description: '隐藏可见文字明确以色情、性挑逗或成人私密内容为卖点的内容。',
    instructions:
      '仅根据内容的标题、作者与正文或描述判断是否以色情、情色、性挑逗或成人私密内容为卖点。适用于视频推荐卡片和文字帖子。不得猜测图片、缩略图、音频或视频画面。医学、性教育、新闻、艺术、正常时尚和恋爱讨论不算。',
  },
  {
    description: '隐藏通过成人内容引导私聊、加群、外链或购买服务的内容。',
    instructions:
      '只根据标题、作者与正文或描述判断是否结合成人色情语义引导联系、加群、外链或付费。普通会员、社群、直播和联系方式本身不构成色情引流。不要推测图片或视频画面。',
  },
  {
    description: '隐藏明显诈骗、虚假赠奖、保证收益或恶意诱导联系的内容。',
    instructions:
      '只根据标题、作者与正文或描述识别明显诈骗、虚假赠奖、保证收益和垃圾引流。不得仅凭 emoji、夸张标题、重复推荐或普通商业推广判定。新闻揭露诈骗、风险教育和正常产品评测不算。',
  },
];
export const DEFAULT_RULES: Rule[] = LEGACY_YOUTUBE_RULES.map((rule, index) => ({
  ...rule,
  ...updates[index],
}));

/** Upgrade only untouched built-in wording. Keep custom text, thresholds and switches. */
export function migrateBuiltinRule(rule: Rule): Rule {
  const index = LEGACY_YOUTUBE_RULES.findIndex((old) => old.id === rule.id);
  if (!rule.builtin || index === -1) return rule;
  const old = LEGACY_YOUTUBE_RULES[index];
  const fields = ['name', 'description', 'instructions', 'trueCriteria', 'falseCriteria'] as const;
  if (!fields.every((field) => rule[field] === old[field])) return rule;
  return {
    ...rule,
    description: DEFAULT_RULES[index].description,
    instructions: DEFAULT_RULES[index].instructions,
  };
}
