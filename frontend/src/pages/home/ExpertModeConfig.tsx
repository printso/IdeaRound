// Generated with Engineering Prompt v2026.04 - Quality & Efficiency Enforced
import { Avatar, Button, Card, Col, Divider, Empty, Input, InputNumber, List, Row, Select, Space, Switch, Typography } from 'antd';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import MaterialUploader from '../../components/MaterialUploader';
import MaterialIntentSynthesis from '../../components/MaterialIntentSynthesis';
import type { LLMConfig } from '../../api/llm';
import type { MaterialInfo } from '../../api/material';

const { Text } = Typography;

export interface ExpertModeConfigProps {
  initialDemand: string;
  isExpertMode: boolean;
  roomId: string;
  preUploadRoomId: string;
  uploadedMaterials: MaterialInfo[];
  probeTurns: any[];
  probeQuestions: any[];
  customProbeOptions: Record<string, string>;
  selectedModelId?: number;
  models: LLMConfig[];
  loadingModels: boolean;
  systemPrompt: string;
  promptTemplates: Record<string, string>;
  expectedResult: string;
  generatingExpectedResult: boolean;
  maxDialogueRounds: number;
  onInitialDemandChange: (val: string) => void;
  onMaterialsAnalyzed: (mats: MaterialInfo[]) => void;
  onIntentSynthesized: (result: any) => void;
  onStartIntentProbing: () => void;
  onIsExpertModeChange: (val: boolean) => void;
  onResetAnalysisState: () => void;
  onApplyProbeAnswer: (id: string, label: string) => void;
  onCustomProbeOptionsChange: (opts: Record<string, string>) => void;
  onSelectedModelIdChange: (val?: number) => void;
  onSystemPromptChange: (val: string) => void;
  onExpectedResultChange: (val: string) => void;
  onGenerateExpectedResult: () => void;
  onMaxDialogueRoundsChange: (val: number) => void;
  onConfirmIntent: () => void;
}

export function ExpertModeConfig({
  initialDemand,
  isExpertMode,
  roomId,
  preUploadRoomId,
  uploadedMaterials,
  probeTurns,
  probeQuestions,
  customProbeOptions,
  selectedModelId,
  models,
  loadingModels,
  systemPrompt,
  promptTemplates,
  expectedResult,
  generatingExpectedResult,
  maxDialogueRounds,
  onInitialDemandChange,
  onMaterialsAnalyzed,
  onIntentSynthesized,
  onStartIntentProbing,
  onIsExpertModeChange,
  onResetAnalysisState,
  onApplyProbeAnswer,
  onCustomProbeOptionsChange,
  onSelectedModelIdChange,
  onSystemPromptChange,
  onExpectedResultChange,
  onGenerateExpectedResult,
  onMaxDialogueRoundsChange,
  onConfirmIntent,
}: ExpertModeConfigProps) {
  return (
    <Row gutter={24} style={{ maxWidth: 1200, margin: '0 auto', width: '100%' }}>
      <Col xs={24} xl={14}>
        <Card title="需求识别交互" style={{ borderRadius: 8 }}>
          <div style={{ maxHeight: 'calc(100dvh - 64px - 140px)', overflowY: 'auto', paddingRight: 8 }}>
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              <Input.TextArea
                rows={3}
                value={initialDemand}
                onChange={(e) => onInitialDemandChange(e.target.value)}
                placeholder="请简要描述你的需求（一句话，或直接上传文档）"
              />
              <MaterialUploader
                roomId={roomId || preUploadRoomId}
                onMaterialsAnalyzed={onMaterialsAnalyzed}
                maxFiles={10}
              />

              {uploadedMaterials.length > 0 && (
                <MaterialIntentSynthesis
                  roomId={roomId || preUploadRoomId}
                  materials={uploadedMaterials}
                  onIntentSynthesized={onIntentSynthesized}
                />
              )}

              <Divider style={{ margin: '12px 0' }} />

              <Space direction="vertical" size={16} style={{ width: '100%' }}>
                <Button 
                  type="primary" 
                  size="large" 
                  block 
                  onClick={onStartIntentProbing}
                  style={{ height: 48, fontSize: 16, borderRadius: 8 }}
                >
                  开始深度洞察 (多轮问答)
                </Button>

                <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                  <Button 
                    type="link"
                    onClick={() => {
                      const sampleContent = `“小秘”：你的隐私优先、全感官个人 AI 管家\n核心理念：将碎片信息转化为有序智慧，打造属于你的“数字第二大脑”。\n• 零门槛全能录入：支持语音、截图、文档、即时消息等 8 种媒介，随手拍、随口说、随心存，彻底打破应用间的“信息孤岛”。\n• 隐私主权架构：坚持“本地优先”，所有 RAG 索引与数据库均存于本地，支持端侧轻量化运行。你的数据，只有你拥有。\n• 反焦虑缓冲机制：首创“收件箱缓冲区”，AI 解析的内容需经你确认才进入日程或知识库，拒绝任务堆积，维护生活的秩序感。\n• 情境感知助手：它懂你的节奏。平日里它是静默的守门人，在开会前或关键时刻，它会精准推送关联文档与任务汇总，化碎片为行动。`;
                      onInitialDemandChange(sampleContent);
                    }}
                  >
                    加载示例输入
                  </Button>
                  <Space>
                    <Switch checked={isExpertMode} onChange={onIsExpertModeChange} />
                    <Text>高级模式（多轮澄清 + 可选高级配置）</Text>
                  </Space>
                </Space>
              </Space>
            </Space>

            <>
              <Divider style={{ margin: '16px 0' }} />
              <Space style={{ marginBottom: 16 }}>
                <Button onClick={onResetAnalysisState}>
                  重置分析状态
                </Button>
              </Space>
              {probeTurns.length === 0 && <Empty description="输入需求后点击「开始洞察」，系统将提出澄清问题并生成需求卡片" />}
              {probeTurns.length > 0 && (
                <List
                  dataSource={probeTurns}
                  renderItem={(item) => (
                    <List.Item style={{ border: 'none', padding: '6px 0' }}>
                      <Space align="start">
                        <Avatar style={{ background: item.role === 'user' ? '#1677ff' : '#52c41a' }}>
                          {item.role === 'user' ? '我' : '问'}
                        </Avatar>
                        <Card size="small" style={{ width: '100%' }}>
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{item.content}</ReactMarkdown>
                        </Card>
                      </Space>
                    </List.Item>
                  )}
                />
              )}
              {probeQuestions.length > 0 && (
                <Space direction="vertical" size={10} style={{ width: '100%' }}>
                  {probeQuestions.map((q) => (
                    <Card key={q.id} size="small" title={q.question}>
                      <Space wrap>
                        {q.options.map((opt: any) => (
                          <Button key={opt.id} onClick={() => onApplyProbeAnswer(q.id, opt.label)}>
                            {opt.label}
                          </Button>
                        ))}
                        <Input
                          key={`input-${q.id}`}
                          placeholder="其他（请输入）"
                          style={{ width: 200 }}
                          value={customProbeOptions[q.id] || ''}
                          onChange={(e) => onCustomProbeOptionsChange({ ...customProbeOptions, [q.id]: e.target.value })}
                          onPressEnter={() => {
                            const customValue = customProbeOptions[q.id]?.trim();
                            if (customValue) {
                              onApplyProbeAnswer(q.id, customValue);
                              onCustomProbeOptionsChange({ ...customProbeOptions, [q.id]: '' });
                            }
                          }}
                        />
                        <Button
                          key={`add-${q.id}`}
                          onClick={() => {
                            const customValue = customProbeOptions[q.id]?.trim();
                            if (customValue) {
                              onApplyProbeAnswer(q.id, customValue);
                              onCustomProbeOptionsChange({ ...customProbeOptions, [q.id]: '' });
                            }
                          }}
                        >
                          添加
                        </Button>
                      </Space>
                    </Card>
                  ))}
                </Space>
              )}
            </>
          </div>
        </Card>
      </Col>
      <Col xs={24} xl={10}>
        <Card title="高级配置" style={{ borderRadius: 8 }}>
          <div style={{ maxHeight: 'calc(100dvh - 64px - 140px)', overflowY: 'auto', paddingRight: 8 }}>
            <Space direction="vertical" size={16} style={{ width: '100%' }}>
              <Card type="inner" title="全局配置" style={{ borderRadius: 8 }}>
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                    <Text type="secondary">模型选择</Text>
                    <Select
                      style={{ width: 200 }}
                      value={selectedModelId}
                      onChange={onSelectedModelIdChange}
                      options={models.map((m) => ({ value: m.id, label: m.name }))}
                      loading={loadingModels}
                      placeholder="请选择大模型"
                    />
                  </Space>
                  <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                    <Text type="secondary">全局提示词 (System Prompt)</Text>
                    <Button type="link" size="small" onClick={() => onSystemPromptChange(promptTemplates.prompt_base || '')}>重置默认</Button>
                  </Space>
                  <Input.TextArea
                    rows={4}
                    value={systemPrompt}
                    onChange={(e) => onSystemPromptChange(e.target.value)}
                    placeholder="可选：输入全局系统提示词，这将影响所有角色的行为"
                  />
                </Space>
              </Card>
              <Card type="inner" title="期望结果" style={{ borderRadius: 8 }}>
                <Space direction="vertical" size={10} style={{ width: '100%' }}>
                  <Input.TextArea
                    rows={4}
                    value={expectedResult}
                    onChange={(e) => onExpectedResultChange(e.target.value)}
                    placeholder="填写希望这次圆桌讨论最终达到的结果。可由AI基于意图洞察自动生成，再手动微调。"
                  />
                  <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                    <Button
                      loading={generatingExpectedResult}
                      onClick={onGenerateExpectedResult}
                    >
                      AI生成期望结果
                    </Button>
                    <Space>
                      <Text type="secondary">对话轮数上限</Text>
                      <InputNumber min={1} max={30} value={maxDialogueRounds} onChange={(v) => onMaxDialogueRoundsChange(Number(v || 6))} />
                    </Space>
                  </Space>
                  <Button type="primary" onClick={onConfirmIntent} loading={generatingExpectedResult} block>
                    确认并进入角色矩阵
                  </Button>
                </Space>
              </Card>
            </Space>
          </div>
        </Card>
      </Col>
    </Row>
  );
}
