// Generated with Engineering Prompt v2026.04 - Quality & Efficiency Enforced
import { memo, useEffect, useRef } from 'react';
import { Alert, Avatar, Button, Card, Col, Dropdown, Empty, Grid, List, Progress, Row, Space, Tag, Tooltip, Typography } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ConsensusBoardState, JudgeState, RoundtableMessage } from '../../hooks/useWorkspace';

const { Text } = Typography;

export interface StepRoundtableViewProps {
  roomReady: boolean;
  messages: RoundtableMessage[];
  judgeState: JudgeState;
  judgeScore: number;
  judgeReason: string;
  discussionMetrics?: {
    round: number;
    new_points: number;
    duplicate_rate: number;
    problem_solution_ratio: string;
    conflict_count: number;
    avg_role_duration_ms: number;
    resolved_topics: number;
  } | null;
  consensusBoard: ConsensusBoardState;
  runtimePendingTasks: number;
  isSending: boolean;
  exportingFormat?: 'md' | 'pdf' | 'docx' | null;
  onStartDemo: () => void;
  onExport: (format: 'md' | 'pdf' | 'docx') => void;
  notice?: {
    type: 'info' | 'warning' | 'error';
    message: string;
    actionText?: string;
    onAction?: () => void;
    closable?: boolean;
    onClose?: () => void;
  } | null;
}

interface MessageItemProps {
  item: RoundtableMessage;
}

const MessageItem = memo(function MessageItem({ item }: MessageItemProps) {
  const isHost = item.speakerType === 'host';
  const displayContent = item.content || '';

  return (
    <List.Item
      style={{
        border: 'none',
        justifyContent: isHost ? 'center' : item.speakerType === 'user' ? 'flex-end' : 'flex-start',
        padding: '8px 0',
      }}
    >
      <Space align="start" style={{ width: isHost ? '100%' : '100%', maxWidth: '100%', justifyContent: isHost ? 'center' : undefined }}>
        {!isHost && item.speakerType !== 'user' && (
          <Avatar style={{ background: '#52c41a' }}>{item.speakerName.slice(0, 1)}</Avatar>
        )}
        {isHost && (
          <Avatar style={{ background: '#faad14', fontSize: 12 }}>主持</Avatar>
        )}
        <Card
          size="small"
          style={{
            maxWidth: isHost ? '80%' : '100%',
            width: '100%',
            borderRadius: 10,
            border: isHost ? '1px solid #ffd666' : item.speakerType === 'user' ? '1px solid #1677ff' : '1px solid #f0f0f0',
            background: isHost ? '#fffbe6' : item.speakerType === 'user' ? '#e6f4ff' : '#ffffff',
          }}
        >
          <Space direction="vertical" size={6} style={{ width: '100%' }}>
            <Space style={{ width: '100%', justifyContent: 'space-between' }}>
              <Space wrap>
                <Text strong>{item.speakerName}</Text>
                {isHost && <Tag color="gold">调度</Tag>}
                {item.streaming && <Tag color="processing">生成中</Tag>}
              </Space>
              <Text type="secondary">{item.createdAt}</Text>
            </Space>
            <div className="roundtable-reply-content">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {displayContent}
              </ReactMarkdown>
            </div>
          </Space>
        </Card>
      </Space>
    </List.Item>
  );
});

export function StepRoundtableView({
  roomReady,
  messages,
  judgeState,
  judgeScore,
  judgeReason,
  discussionMetrics,
  consensusBoard,
  runtimePendingTasks,
  isSending,
  exportingFormat,
  onStartDemo,
  onExport,
  notice,
}: StepRoundtableViewProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  const activeStreamingMessages = messages.filter((item) => item.streaming && item.speakerType !== 'user');
  const activeStreamingNames = Array.from(
    new Set(
      activeStreamingMessages
        .map((item) => item.speakerName?.trim())
        .filter((name): name is string => Boolean(name)),
    ),
  );
  const activeTypingLabel = activeStreamingNames.length > 0
    ? `当前正在输入：${activeStreamingNames.join('、')}`
    : '';

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const lastMessage = messages[messages.length - 1];
    if (lastMessage?.streaming || lastMessage?.speakerType === 'agent') {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages]);

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <Row gutter={[16, 16]} style={{ flex: 1, minHeight: 0, overflow: 'visible' }}>
        <Col xs={24} xl={17} style={{ display: 'flex', flexDirection: 'column', gap: 16, minHeight: 0, overflow: 'hidden' }}>
          <Card
            title={
              <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                <Space>
                  <span>圆桌空间</span>
                  <Tag>{messages.length}</Tag>
                  {activeTypingLabel && <Tag color="processing">{activeTypingLabel}</Tag>}
                </Space>
                <Dropdown
                  menu={{
                    items: [
                      { key: 'md', label: '导出 Markdown (.md)' },
                      { key: 'pdf', label: '导出 PDF (.pdf)' },
                      { key: 'docx', label: '导出 Word (.docx)' },
                    ],
                    onClick: ({ key }) => onExport(key as 'md' | 'pdf' | 'docx'),
                  }}
                  trigger={['click']}
                >
                  <Button icon={<DownloadOutlined />} loading={!!exportingFormat}>
                    {exportingFormat ? `导出 ${exportingFormat.toUpperCase()}` : '导出'}
                  </Button>
                </Dropdown>
              </Space>
            }
            style={{ borderRadius: 8, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}
            bodyStyle={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
          >
            {!roomReady && <Empty description="请先完成需求识别与角色确认" />}
            {roomReady && (
              <div
                ref={scrollContainerRef}
                style={{ flex: 1, minHeight: 0, maxHeight: isMobile ? 'calc(100dvh - 300px)' : 'calc(100vh - 350px)', overflowY: 'auto', padding: isMobile ? '0 8px 8px' : '0 16px 16px', overflowX: 'hidden' }}
              >
                {!!notice?.message && (
                  <Alert
                    style={{ margin: isMobile ? '0 0 8px' : '0 0 12px' }}
                    type={notice.type}
                    message={notice.message}
                    showIcon
                    closable={notice.closable}
                    onClose={notice.onClose}
                    action={
                      notice.actionText ? (
                        <Button size="small" type="text" onClick={notice.onAction}>
                          {notice.actionText}
                        </Button>
                      ) : undefined
                    }
                  />
                )}
                {messages.length === 0 && (
                  <Empty
                    description={runtimePendingTasks > 0 || isSending ? '圆桌已启动，AI 正在生成中…' : '暂无讨论内容，可直接开始演练'}
                  >
                    <Space wrap>
                      <Button type="primary" loading={isSending} onClick={onStartDemo}>
                        开始演练
                      </Button>
                    </Space>
                  </Empty>
                )}
                <List
                  dataSource={messages}
                  renderItem={(item) => (
                    <MessageItem
                      key={item.id}
                      item={item}
                    />
                  )}
                  pagination={messages.length > 50 ? {
                    pageSize: 50,
                    size: 'small',
                    position: 'both',
                    showTotal: (total) => `共 ${total} 条`,
                  } : undefined}
                />
              </div>
            )}
          </Card>
        </Col>

        <Col xs={24} xl={7} style={{ display: 'flex', flexDirection: 'column', gap: 16, minHeight: 0 }}>
          <Card size="small" style={{ borderRadius: 8 }}>
            <Space direction="vertical" size={6} style={{ width: '100%' }}>
              <Row align="middle" justify="space-between">
                <Col><Text strong>讨论仪表盘</Text></Col>
                <Col><Tag color="blue">第 {discussionMetrics?.round || 0} 轮</Tag></Col>
              </Row>
              <Row gutter={[8, 8]}>
                <Col span={12}><Text type="secondary">新观点数</Text><div>{discussionMetrics?.new_points ?? 0}</div></Col>
                <Col span={12}><Text type="secondary">重复率</Text><div>{discussionMetrics?.duplicate_rate ?? 0}%</div></Col>
                <Col span={12}><Text type="secondary">问题:方案</Text><div>{discussionMetrics?.problem_solution_ratio ?? '0:0'}</div></Col>
                <Col span={12}><Text type="secondary">冲突点</Text><div>{discussionMetrics?.conflict_count ?? 0}</div></Col>
                <Col span={12}><Text type="secondary">平均耗时</Text><div>{discussionMetrics?.avg_role_duration_ms ?? 0}ms</div></Col>
                <Col span={12}><Text type="secondary">已解议题</Text><div>{discussionMetrics?.resolved_topics ?? 0}</div></Col>
              </Row>
            </Space>
          </Card>

          <Card size="small" style={{ borderRadius: 8 }}>
            <Space direction="vertical" size={4} style={{ width: '100%' }}>
              <Row align="middle" justify="space-between">
                <Col><Text strong>目标达成度</Text></Col>
                <Col>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    共识 {judgeState.consensusCount} · 已解痛点 {judgeState.resolvedPainPoints} · 任务 {runtimePendingTasks}
                  </Text>
                </Col>
              </Row>
              <Tooltip title={judgeReason || '等待裁判评估中...'}>
                <Progress 
                  percent={judgeScore} 
                  status={judgeScore >= 90 ? 'success' : 'active'} 
                  strokeColor={{ '0%': '#108ee9', '100%': '#87d068' }}
                  size="small"
                />
              </Tooltip>
              <Text type="secondary" style={{ fontSize: 12, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={judgeReason || '等待裁判评估中...'}>
                {judgeReason || '等待裁判评估中...'}
              </Text>
            </Space>
          </Card>

          <Card
            title={
              <Space>
                <span>书记员看板</span>
                <Tag color={consensusBoard.disputes.length > 0 ? 'orange' : 'green'}>
                  {consensusBoard.disputes.length > 0 ? '存在争议' : '持续收敛'}
                </Tag>
              </Space>
            }
            style={{ borderRadius: 8 }}
            bodyStyle={{ maxHeight: isMobile ? 300 : 'calc(100vh - 420px)', overflowY: 'auto' }}
          >
            <Space direction="vertical" size={10} style={{ width: '100%' }}>
              <Text>{consensusBoard.summary || '书记员正在整理当前共识与争议...'}</Text>
              <div>
                <Text strong>当前共识</Text>
                <List
                  size="small"
                  dataSource={consensusBoard.consensus.slice(0, 4)}
                  locale={{ emptyText: '暂无共识' }}
                  renderItem={(text) => (
                    <List.Item style={{ border: 'none', padding: '6px 0' }}>
                      <Text>{text}</Text>
                    </List.Item>
                  )}
                />
              </div>
              <div>
                <Text strong>核心争议</Text>
                <List
                  size="small"
                  dataSource={consensusBoard.disputes.slice(0, 2)}
                  locale={{ emptyText: '暂无争议' }}
                  renderItem={(item) => (
                    <List.Item style={{ border: 'none', padding: '6px 0' }}>
                      <Space direction="vertical" size={2} style={{ width: '100%' }}>
                        <Text strong>{item.topic || '未命名争议'}</Text>
                        <Text type="secondary">正方：{item.pro || '待补充'}</Text>
                        <Text type="secondary">反方：{item.con || '待补充'}</Text>
                      </Space>
                    </List.Item>
                  )}
                />
              </div>
            </Space>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
