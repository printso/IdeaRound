import React, { useMemo, useState } from 'react';
import {
  Card,
  Typography,
  Space,
  Tag,
  List,
  Row,
  Col,
  Button,
  message,
  Avatar,
  Select,
  Tooltip,
} from 'antd';
import {
  CheckCircleOutlined,
  FileTextOutlined,
  TeamOutlined,
  AimOutlined,
  ClockCircleOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const AUDIENCE_OPTIONS = [
  { value: 'auto', label: '自动（AI推荐）' },
  { value: 'tech', label: '偏技术' },
  { value: 'product', label: '偏产品' },
  { value: 'operation', label: '偏运营' },
  { value: 'general', label: '普通（通俗易懂）' },
];

// 关键词权重配置，用于不同受众的内容优先级排序
const AUDIENCE_KEYWORDS = {
  tech: [
    '技术', '架构', '方案', '实现', '代码', '系统', '模块', '接口', '数据库',
    '性能', '安全', '可扩展', '部署', '运维', 'DevOps', '测试', '自动化',
    '微服务', '云原生', '容器', 'Kubernetes', 'API', 'SDK', '技术选型',
  ],
  product: [
    '产品', '功能', '需求', '用户', '体验', '价值', '场景', '迭代', '优先级',
    'MVP', '验证', '痛点', '解决方案', '用户研究', '可用性', '交互', 'UI',
    '路线图', '版本', '发布', '反馈', '满意度', 'NPS',
  ],
  operation: [
    '运营', '数据', '增长', '指标', 'KPI', '转化率', 'DAU', 'MAU', '留存',
    '拉新', '促活', '变现', '用户画像', 'AB测试', '活动', '内容运营',
    '用户运营', '渠道', 'ROI', '预算', '成本', '效率', '自动化运营',
  ],
  general: [
    '简单', '容易', '快速', '省钱', '省时', '方便', '实用', '有效', '清晰',
    '明确', '直接', '轻松', '高效', '安全', '可靠', '易懂', '直观',
  ],
};

const { Text, Paragraph } = Typography;

const STOP_WORDS = new Set([
  '我们',
  '你们',
  '他们',
  '这个',
  '那个',
  '以及',
  '进行',
  '需要',
  '可以',
  '已经',
  '如果',
  '因为',
  '关于',
  '通过',
  '为了',
  '当前',
  '阶段',
  '讨论',
  '问题',
  '方案',
  '总结',
  '最终',
  '目标',
  '结果',
]);

const normalizeText = (value: string) =>
  value
    .replace(/\s+/g, ' ')
    .replace(/[。！？!?,，；;：:（）()[\]{}"'`]/g, '')
    .trim();

const extractKeywordCandidates = (text: string) => {
  const tokens = text.match(/[\u4e00-\u9fa5a-zA-Z0-9]+/g) || [];
  return Array.from(
    new Set(
      tokens
        .map((item) => item.trim().toLowerCase())
        .filter((item) => item.length >= 2 && !STOP_WORDS.has(item)),
    ),
  ).slice(0, 25);
};

const extractBulletLikePoints = (content: string) => {
  const lines = content
    .split('\n')
    .map((line) => line.replace(/^[-*+\d.\s]+/, '').trim())
    .filter(Boolean);
  return lines.filter((line) => line.length >= 8 && line.length <= 120);
};

const scoreByIntent = (text: string, keywords: string[], isFinal: boolean) => {
  const normalized = text.toLowerCase();
  const hitCount = keywords.filter((keyword) => normalized.includes(keyword)).length;
  const planBonus = /(路径|行动|里程碑|指标|验证|风险|落地|优先级|时间线)/.test(text) ? 2 : 0;
  const finalBonus = isFinal ? 3 : 0;
  return hitCount * 2 + planBonus + finalBonus;
};

interface Message {
  id: string;
  speakerId: string;
  speakerName: string;
  speakerType: 'user' | 'agent' | 'host';
  content: string;
  createdAt: string;
}

interface RoleMember {
  id: string;
  name: string;
  stance: '建设' | '对抗' | '中立' | '评审';
  desc: string;
}

interface ConsensusSummaryProps {
  initialDemand: string;
  expectedResult: string;
  messages: Message[];
  roles: RoleMember[];
  canvasConsensus: string[];
  canvasDisputes: string[];
  roundtableStage: 'brief' | 'final';
}

const ConsensusSummary: React.FC<ConsensusSummaryProps> = ({
  initialDemand,
  expectedResult,
  messages,
  roles,
  canvasConsensus,
  canvasDisputes,
  roundtableStage,
}) => {
  const [audienceType, setAudienceType] = useState<string>('auto');
  const agentMessages = useMemo(() => messages.filter((m) => m.speakerType === 'agent'), [messages]);
  const uniqueSpeakers = useMemo(
    () => [...new Set(agentMessages.map((m) => m.speakerName))],
    [agentMessages],
  );
  const latestRoundAgentMessages = useMemo(() => {
    const collected: Message[] = [];
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const item = messages[i];
      if (item.speakerType === 'agent') {
        collected.push(item);
        continue;
      }
      break;
    }
    return collected.reverse();
  }, [messages]);
  const finalPlanMessages = useMemo(() => {
    if (roundtableStage !== 'final') {
      return [];
    }
    const finalCandidates = latestRoundAgentMessages.filter(
      (item) =>
        /(总结|方案|路径|行动|指标|验证|风险|落地|里程碑)/.test(item.content) ||
        item.content.length >= 100,
    );
    if (finalCandidates.length > 0) {
      return finalCandidates;
    }
    if (latestRoundAgentMessages.length > 0) {
      return latestRoundAgentMessages;
    }
    return agentMessages.slice(-Math.max(1, Math.min(uniqueSpeakers.length, 4)));
  }, [agentMessages, latestRoundAgentMessages, roundtableStage, uniqueSpeakers.length]);
  const keywords = useMemo(
    () =>
      extractKeywordCandidates(
        `${initialDemand} ${expectedResult}`,
      ),
    [expectedResult, initialDemand],
  );
  const focusedFindings = useMemo(() => {
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
          score: scoreByIntent(item, keywords, finalPlanMessages.some((m) => m.id === msg.id)),
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
  }, [agentMessages, canvasConsensus, finalPlanMessages, keywords, roundtableStage]);
  const isConverged = roundtableStage === 'final' && finalPlanMessages.length > 0;

  // 根据受众类型对 findings 进行优先级排序
  const prioritizedFindings = useMemo(() => {
    if (audienceType === 'auto' || !AUDIENCE_KEYWORDS[audienceType as keyof typeof AUDIENCE_KEYWORDS]) {
      return focusedFindings;
    }
    const keywords = AUDIENCE_KEYWORDS[audienceType as keyof typeof AUDIENCE_KEYWORDS];
    const scored = focusedFindings.map((item, index) => {
      const text = item.toLowerCase();
      let score = 0;
      keywords.forEach((kw) => {
        if (text.includes(kw.toLowerCase())) {
          score += 2;
        }
      });
      return { text: item, originalIndex: index, score };
    });
    // 按得分排序，保留原始顺序作为secondary排序
    return scored
      .sort((a, b) => b.score - a.score || a.originalIndex - b.originalIndex)
      .map((item) => item.text);
  }, [audienceType, focusedFindings]);

  const hasContent =
    canvasConsensus.length > 0 ||
    agentMessages.length > 0 ||
    focusedFindings.length > 0 ||
    finalPlanMessages.length > 0;
  const stageSummary = isConverged
    ? '已形成最终方案'
    : canvasConsensus.length > 0
      ? '讨论进行中，已沉淀阶段成果'
      : '讨论进行中，尚未形成明确结论';
  const stageTagColor = isConverged ? 'success' : canvasConsensus.length > 0 ? 'processing' : 'default';

  const handleExport = () => {
    let content = `# 圆桌共识报告\n\n`;
    content += `> 生成时间：${new Date().toLocaleString('zh-CN')}\n`;
    content += `> 需求：${initialDemand || '-'}\n\n`;
    content += `> 状态：${stageSummary}\n\n`;

    if (finalPlanMessages.length > 0) {
      content += `## 最终方案（最高权重）\n\n`;
      finalPlanMessages.forEach((msg, i) => {
        content += `### ${i + 1}. ${msg.speakerName}\n\n${msg.content}\n\n`;
      });
      content += `\n`;
    }

    if (prioritizedFindings.length > 0) {
      content += `## 当前可交付成果\n\n`;
      const audienceNote = audienceType !== 'auto'
        ? `（呈现视角：${AUDIENCE_OPTIONS.find(o => o.value === audienceType)?.label}）`
        : '';
      content += `> ${audienceNote}\n\n`;
      prioritizedFindings.forEach((item, i) => (content += `${i + 1}. ${item}\n`));
      content += `\n`;
    }

    if (canvasConsensus.length > 0) {
      content += `## 共识成果\n\n`;
      canvasConsensus.forEach((item, i) => (content += `${i + 1}. ${item}\n`));
      content += `\n`;
    }

    if (canvasDisputes.length > 0) {
      content += `## 遗留争议\n\n`;
      canvasDisputes.forEach((item, i) => (content += `${i + 1}. ${item}\n`));
      content += `\n`;
    }

    if (agentMessages.length > 0 && finalPlanMessages.length === 0) {
      content += `## 角色发言\n\n`;
      agentMessages.forEach((msg) => {
        content += `### ${msg.speakerName}\n\n${msg.content}\n\n---\n\n`;
      });
    }

    const blob = new Blob([content], { type: 'text/markdown' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `圆桌共识_${new Date().toLocaleDateString('zh-CN').replace(/\//g, '-')}.md`;
    a.click();
    message.success('报告已导出');
  };

  return (
    <div style={{ padding: 16, background: '#f5f5f5', height: 'calc(100vh - 64px)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {/* 顶部：需求锚点 + 操作 - 限制最大高度 */}
      <Card
        style={{
          borderRadius: 12,
          marginBottom: 16,
          background: 'linear-gradient(135deg, #1890ff 0%, #0958d9 100%)',
          border: 'none',
          flexShrink: 0,
          maxHeight: '120px',
        }}
        bodyStyle={{ padding: '12px 20px' }}
      >
        <Row justify="space-between" align="middle">
          <Col flex="1" style={{ minWidth: 0, marginRight: 16 }}>
            <Space direction="vertical" size={2} style={{ width: '100%' }}>
              <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13 }}>
                <AimOutlined /> 需求锚点
              </Text>
              <Text 
                strong 
                style={{ 
                  color: '#fff', 
                  fontSize: 16,
                  display: 'block',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title={initialDemand || '未指定'}
              >
                {initialDemand || '未指定'}
              </Text>
              <Space size={8}>
                <Tag color={stageTagColor}>{stageSummary}</Tag>
              </Space>
            </Space>
          </Col>
          <Col>
            <Button
              type="primary"
              icon={<FileTextOutlined />}
              onClick={handleExport}
              style={{ background: 'rgba(255,255,255,0.2)', border: 'none' }}
            >
              导出报告
            </Button>
          </Col>
        </Row>
      </Card>

      {/* 成果展示区 - 以当前可交付成果为主 */}
      <Row gutter={16} style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <Col span={16} style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, overflow: 'hidden' }}>
          {/* 最终方案 */}
          {finalPlanMessages.length > 0 && (
            <Card
              title={
                <Space>
                  <CheckCircleOutlined style={{ color: '#52c41a' }} />
                  <span>最终方案（最高权重）</span>
                  <Tag color="green">{finalPlanMessages.length} 条</Tag>
                </Space>
              }
              style={{
                borderRadius: 12,
                marginBottom: 16,
                border: '1px solid #b7eb8f',
                background: '#f6ffed',
                flexShrink: 0,
              }}
            >
              <List
                dataSource={finalPlanMessages}
                renderItem={(msg) => (
                  <List.Item key={msg.id} style={{ border: 'none', padding: '12px 0' }}>
                    <Card
                      size="small"
                      style={{
                        width: '100%',
                        borderRadius: 10,
                        background: '#fff',
                        border: '1px solid #d9f7be',
                      }}
                      bodyStyle={{ padding: 14 }}
                    >
                      <Space direction="vertical" size={6} style={{ width: '100%' }}>
                        <Row justify="space-between" align="middle">
                          <Space>
                            <Avatar size="small" style={{ background: '#52c41a' }}>
                              {msg.speakerName.slice(0, 1)}
                            </Avatar>
                            <Text strong>{msg.speakerName}</Text>
                          </Space>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            <ClockCircleOutlined /> {msg.createdAt}
                          </Text>
                        </Row>
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                      </Space>
                    </Card>
                  </List.Item>
                )}
              />
            </Card>
          )}

          {/* 当前可交付成果 - 铺满剩余高度，自带滚动条 */}
          {focusedFindings.length > 0 && (
            <Card
              title={
                <Space>
                  <TeamOutlined />
                  <span>当前可交付成果</span>
                  <Tag color="blue">{prioritizedFindings.length} 条</Tag>
                  <Tooltip title="选择呈现方式，AI会自动优先展示相关度高的内容">
                    <InfoCircleOutlined style={{ color: '#8c8c8c', fontSize: 12 }} />
                  </Tooltip>
                </Space>
              }
              extra={
                <Select
                  value={audienceType}
                  onChange={setAudienceType}
                  options={AUDIENCE_OPTIONS}
                  style={{ width: 140 }}
                  size="small"
                />
              }
              style={{ borderRadius: 12, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
              bodyStyle={{ padding: '8px 12px', flex: 1, overflowY: 'auto', minHeight: 0 }}
            >
              {audienceType !== 'auto' && (
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
                  已调整为「{AUDIENCE_OPTIONS.find(o => o.value === audienceType)?.label}」视角
                </Text>
              )}
              <List
                dataSource={prioritizedFindings}
                renderItem={(item, index) => (
                  <List.Item key={`${item}-${index}`} style={{ border: 'none', padding: '10px 0' }}>
                    <Space align="start">
                      <Tag color="blue" style={{ borderRadius: '50%', width: 22, height: 22, textAlign: 'center', lineHeight: '18px', padding: '0 6px' }}>
                        {index + 1}
                      </Tag>
                      <Text>{item}</Text>
                    </Space>
                  </List.Item>
                )}
              />
            </Card>
          )}

        </Col>

        <Col span={8} style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
          {/* 右侧信息栏 - 限制高度，内部滚动 */}
          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            {/* 期望结果 */}
            <Card title="期望结果" style={{ borderRadius: 12, marginBottom: 12 }} size="small">
              <Paragraph style={{ marginBottom: 0, fontSize: 13 }} ellipsis={{ rows: 3, expandable: true }}>
                {expectedResult || '未指定'}
              </Paragraph>
            </Card>

            {initialDemand.trim() && (
              <Card title="核心议题" style={{ borderRadius: 12, marginBottom: 12 }} size="small">
                <Paragraph style={{ marginBottom: 0, fontSize: 13 }} ellipsis={{ rows: 3, expandable: true }}>
                  {initialDemand.trim()}
                </Paragraph>
              </Card>
            )}

            {/* 参与角色 - 简化显示 */}
            {roles.length > 0 && (
              <Card title="参与角色" style={{ borderRadius: 12 }} size="small">
                <Space wrap size={[4, 4]}>
                  {roles.map((role) => (
                    <Tag
                      key={role.id}
                      color={
                        role.stance === '对抗'
                          ? 'red'
                          : role.stance === '评审'
                            ? 'purple'
                            : 'blue'
                      }
                      style={{ fontSize: 12 }}
                    >
                      {role.name}
                    </Tag>
                  ))}
                </Space>
              </Card>
            )}
          </div>
        </Col>
      </Row>

      {!hasContent && (
        <Card style={{ borderRadius: 12, marginTop: 16, textAlign: 'center', padding: 40 }}>
          <Text type="secondary" style={{ fontSize: 16 }}>
            暂无讨论内容，请在圆桌空间中开始讨论
          </Text>
        </Card>
      )}
    </div>
  );
};

export default ConsensusSummary;
