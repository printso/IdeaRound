// Generated with Engineering Prompt v2026.04 - Quality & Efficiency Enforced
import { Button, Card, Divider, Grid, Input, Space, Switch, Typography } from 'antd';
import MaterialUploader from '../../components/MaterialUploader';
import MaterialIntentSynthesis from '../../components/MaterialIntentSynthesis';
import type { MaterialInfo } from '../../api/material';
import type { IntentCardState } from '../../hooks/useWorkspace';

const { Text } = Typography;

export interface StepDemandRecognitionProps {
  initialDemand: string;
  uploadedMaterials: MaterialInfo[];
  intentCard: IntentCardState;
  isExpertMode: boolean;
  scenarioTemplates: any[];
  roomId: string;
  preUploadRoomId: string;
  onInitialDemandChange: (val: string) => void;
  onMaterialsAnalyzed: (mats: MaterialInfo[]) => void;
  onIntentSynthesized: (result: any) => void;
  onStartIntentProbing: () => void;
  onIsExpertModeChange: (val: boolean) => void;
  onSelectScenarioTemplate: (id: number) => void;
}

export function StepDemandRecognition({
  initialDemand,
  uploadedMaterials,
  // intentCard is not used here but passed for consistency
  isExpertMode,
  scenarioTemplates,
  roomId,
  preUploadRoomId,
  onInitialDemandChange,
  onMaterialsAnalyzed,
  onIntentSynthesized,
  onStartIntentProbing,
  onIsExpertModeChange,
  onSelectScenarioTemplate,
}: StepDemandRecognitionProps) {
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;

  return (
    <div style={{ width: '100%', maxWidth: 860, margin: '0 auto' }}>
      <Card title="需求识别交互" style={{ borderRadius: 8 }}>
        <div style={{ maxHeight: 'calc(100dvh - 64px - 140px)', overflowY: 'auto', paddingRight: isMobile ? 0 : 8 }}>
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              <Input.TextArea
                rows={isMobile ? 3 : 3}
                value={initialDemand}
                onChange={(e) => onInitialDemandChange(e.target.value)}
                placeholder={isMobile ? '描述你的需求或上传文档' : '请简要描述你的需求（一句话，或直接上传文档）'}
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
                  ✨ 智能分析需求并组建团队
                </Button>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between', alignItems: 'center' }}>
                  <Button
                    type="link"
                    style={{ paddingInline: 0 }}
                    onClick={() => {
                      const sampleContent = `“小秘”：你的隐私优先、全感官个人 AI 管家\n核心理念：将碎片信息转化为有序智慧，打造属于你的“数字第二大脑”。\n• 零门槛全能录入：支持语音、截图、文档、即时消息等 8 种媒介，随手拍、随口说、随心存，彻底打破应用间的“信息孤岛”。\n• 隐私主权架构：坚持“本地优先”，所有 RAG 索引与数据库均存于本地，支持端侧轻量化运行。你的数据，只有你拥有。\n• 反焦虑缓冲机制：首创“收件箱缓冲区”，AI 解析的内容需经你确认才进入日程或知识库，拒绝任务堆积，维护生活的秩序感。\n• 情境感知助手：它懂你的节奏。平日里它是静默的守门人，在开会前或关键时刻，它会精准推送关联文档与任务汇总，化碎片为行动。`;
                      onInitialDemandChange(sampleContent);
                    }}
                  >
                    加载示例输入
                  </Button>
                  <Space>
                    <Switch checked={isExpertMode} onChange={onIsExpertModeChange} />
                    <Text style={{ fontSize: isMobile ? 12 : 14 }}>
                      {isMobile ? '高级模式' : '高级模式 (自定义探针、角色与结构化意图)'}
                    </Text>
                  </Space>
                </div>
              </Space>

              {scenarioTemplates.length > 0 && (
                <div style={{ marginTop: 16, padding: '16px', background: '#fafafa', borderRadius: 8 }}>
                  <Text strong style={{ display: 'block', marginBottom: 12 }}>或使用场景模板一键上桌：</Text>
                  <Space wrap>
                    {scenarioTemplates.filter((t) => t.is_active).map((template) => (
                      <Button
                        key={template.id}
                        onClick={() => onSelectScenarioTemplate(template.id)}
                        disabled={!initialDemand.trim() && uploadedMaterials.length === 0}
                        title={(!initialDemand.trim() && uploadedMaterials.length === 0) ? '请先输入需求或上传资料' : template.description}
                      >
                        {template.name}
                      </Button>
                    ))}
                  </Space>
                </div>
              )}
            </Space>
        </div>
      </Card>
    </div>
  );
}
