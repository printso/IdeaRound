import type { ExpertStance, MessageItem } from './types';
import { STOP_WORDS } from './constants';

export const getNowText = () => new Date().toLocaleString();

export const createId = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now()}`;

export const compressText = (text: string, maxLength: number = 20): string => {
  if (!text) return '';
  const cleanText = text.replace(/[#*`[\]()]/g, '').replace(/\n+/g, ' ').trim();
  if (cleanText.length <= maxLength) return cleanText;
  return cleanText.slice(0, maxLength - 1) + '…';
};

export const getStanceColor = (stance: string): ExpertStance => {
  switch (stance) {
    case '建设': return 'positive';
    case '对抗': return 'negative';
    case '评审': return 'review';
    default: return 'neutral';
  }
};

export const toNodeSafeId = (text: string) => text.replace(/[^a-zA-Z0-9_-]/g, '_');

export const normalizeText = (value: string) =>
  value.replace(/\s+/g, ' ').replace(/[。！？!?,，；;：:（）()[\]{}"'`]/g, '').trim();

export const extractKeywordCandidates = (text: string) => {
  const tokens = text.match(/[\u4e00-\u9fa5a-zA-Z0-9]+/g) || [];
  return Array.from(
    new Set(
      tokens
        .map((item) => item.trim().toLowerCase())
        .filter((item) => item.length >= 2 && !STOP_WORDS.has(item)),
    ),
  ).slice(0, 25);
};

export const extractBulletLikePoints = (content: string) => {
  const lines = content
    .split('\n')
    .map((line) => line.replace(/^[-*+\d.\s]+/, '').trim())
    .filter(Boolean);
  return lines.filter((line) => line.length >= 8 && line.length <= 120);
};

export const scoreByIntent = (text: string, keywords: string[], isFinal: boolean) => {
  const normalized = text.toLowerCase();
  const hitCount = keywords.filter((keyword) => normalized.includes(keyword)).length;
  const planBonus = /(路径|行动|里程碑|指标|验证|风险|落地|优先级|时间线)/.test(text) ? 2 : 0;
  const finalBonus = isFinal ? 3 : 0;
  return hitCount * 2 + planBonus + finalBonus;
};

export const extractDeliverableFindings = (
  topic: string,
  expectedResult: string,
  messages: MessageItem[],
  canvasConsensus: string[],
  roundtableStage: 'brief' | 'final',
) => {
  const keywords = extractKeywordCandidates(`${topic} ${expectedResult}`);
  const agentMessages = messages.filter((item) => item.speakerType === 'agent');
  const candidates: Array<{ text: string; score: number }> = [];

  canvasConsensus.forEach((item) => {
    candidates.push({
      text: item,
      score: scoreByIntent(item, keywords, roundtableStage === 'final'),
    });
  });

  agentMessages.slice(-10).forEach((msg) => {
    extractBulletLikePoints(msg.content).forEach((item) => {
      candidates.push({
        text: item,
        score: scoreByIntent(item, keywords, roundtableStage === 'final'),
      });
    });
  });

  const deduped = new Map<string, { text: string; score: number }>();
  candidates.forEach((item) => {
    const key = normalizeText(item.text).toLowerCase();
    if (!key) {
      return;
    }
    const exist = deduped.get(key);
    if (!exist || item.score > exist.score) {
      deduped.set(key, item);
    }
  });

  return Array.from(deduped.values())
    .sort((a, b) => b.score - a.score || b.text.length - a.text.length)
    .slice(0, 8)
    .map((item) => item.text);
};

export const downloadData = (dataUrl: string, name: string) => {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = name;
  link.click();
};
