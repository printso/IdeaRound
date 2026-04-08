// Generated with Engineering Prompt v2026.04 - Quality & Efficiency Enforced
import { Avatar, Button, Card, Col, Empty, List, Progress, Row, Space, Tag, Tooltip, Typography } from 'antd';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ConsensusBoardState, JudgeState, RoundtableMessage } from '../../hooks/useWorkspace';

const { Text } = Typography;

export interface StepRoundtableViewProps {
  roomReady: boolean;
  messages: RoundtableMessage[];
  expandedMessageIds: string[];
  replyViewMode: 'compact' | 'detailed';
  judgeState: JudgeState;
  judgeScore: number;
  judgeReason: string;
  consensusBoard: ConsensusBoardState;
  runtimePendingTasks: number;
  onToggleExpandedMessage: (id: string) => void;
  onReplyViewModeChange: (mode: 'compact' | 'detailed') => void;
}

export function StepRoundtableView({
  roomReady,
  messages,
  expandedMessageIds,
  replyViewMode,
  judgeState,
  judgeScore,
  judgeReason,
  consensusBoard,
  runtimePendingTasks,
  onToggleExpandedMessage,
  onReplyViewModeChange,
}: StepRoundtableViewProps) {
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <Row gutter={16} style={{ flex: 1, minHeight: 0, overflow: 'visible' }}>
        <Col xs={24} xl={17} style={{ display: 'flex', flexDirection: 'column', gap: 16, minHeight: 0, overflow: 'hidden' }}>
          <Card
            title={
              <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                <Space>
                  <span>圆桌空间</span>
                  <Tag>{messages.length}</Tag>
                </Space>
                <Space>
                  <Text type="secondary" style={{ fontSize: 12 }}>回复展示</Text>
                  <Space.Compact>
                    <Button
                      size="small"
                      type={replyViewMode === 'compact' ? 'primary' : 'default'}
                      onClick={() => onReplyViewModeChange('compact')}
                    >
                      精简
                    </Button>
                    <Button
                      size="small"
                      type={replyViewMode === 'detailed' ? 'primary' : 'default'}
                      onClick={() => onReplyViewModeChange('detailed')}
                    >
                      详细
                    </Button>
                  </Space.Compact>
                </Space>
              </Space>
            }
            style={{ borderRadius: 8, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}
            bodyStyle={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
          >
            {!roomReady && <Empty description="请先完成需求识别与角色确认" />}
            {roomReady && (
              <div style={{ flex: 1, minHeight: 0, maxHeight: 'calc(100vh - 350px)', overflowY: 'auto', padding: '0 16px 16px', overflowX: 'hidden' }}>
                {messages.length === 0 && <Empty description="暂无讨论内容，先在底部输入并发送" />}
                <List
                  dataSource={messages}
                  renderItem={(item) => {
                    const isExpanded = expandedMessageIds.includes(item.id);
                    const canUseCompact = item.speakerType === 'agent' && replyViewMode === 'compact';
                    const displayContent = canUseCompact && !isExpanded
                      ? (item.summary?.trim() || (item.summaryStatus === 'loading' ? '正在提炼核心要点...' : item.content || '正在思考...'))
                      : (item.content || '正在思考...');

                    return (
                      <List.Item
                        style={{
                          border: 'none',
                          justifyContent: item.speakerType === 'user' ? 'flex-end' : 'flex-start',
                          padding: '8px 0',
                        }}
                      >
                        <Space align="start" style={{ width: '100%', maxWidth: '100%' }}>
                          {item.speakerType !== 'user' && (
                            <Avatar style={{ background: '#52c41a' }}>{item.speakerName.slice(0, 1)}</Avatar>
                          )}
                          <Card
                            size="small"
                            style={{
                              maxWidth: '100%',
                              width: '100%',
                              borderRadius: 10,
                              border: item.speakerType === 'user' ? '1px solid #1677ff' : '1px solid #f0f0f0',
                              background: item.speakerType === 'user' ? '#e6f4ff' : '#ffffff',
                            }}
                          >
                            <Space direction="vertical" size={6} style={{ width: '100%' }}>
                              <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                                <Space wrap>
                                  <Text strong>{item.speakerName}</Text>
                                  {item.streaming && <Tag color="processing">流式中</Tag>}
                                  {canUseCompact && !isExpanded && <Tag color="blue">精简模式</Tag>}
                                  {canUseCompact && isExpanded && <Tag color="gold">原文展开</Tag>}
                                </Space>
                                <Text type="secondary">{item.createdAt}</Text>
                              </Space>
                              {canUseCompact && (
                                <Space size={4} wrap>
                                  <Button
                                    type="link"
                                    size="small"
                                    style={{ paddingInline: 0 }}
                                    onClick={() => onToggleExpandedMessage(item.id)}
                                  >
                                    {isExpanded ? '收起原文' : '展开原文'}
                                  </Button>
                                  {typeof item.summaryMetrics?.semantic_consistency === 'number' && (
                                    <Text type="secondary" style={{ fontSize: 12 }}>
                                      语义一致性 {item.summaryMetrics.semantic_consistency}%
                                    </Text>
                                  )}
                                  {item.summaryStatus === 'loading' && (
                                    <Text type="secondary" style={{ fontSize: 12 }}>
                                      摘要生成中
                                    </Text>
                                  )}
                                </Space>
                              )}
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
                  }}
                />
              </div>
            )}
          </Card>
        </Col>

        <Col xs={24} xl={7} style={{ display: 'flex', flexDirection: 'column', gap: 16, minHeight: 0 }}>
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
            bodyStyle={{ maxHeight: 'calc(100vh - 420px)', overflowY: 'auto' }}
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
