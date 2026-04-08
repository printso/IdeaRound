// Generated with Engineering Prompt v2026.04 - Quality & Efficiency Enforced
import { Button, Card, Col, Empty, Input, Modal, Row, Select, Space, Tag, Typography } from 'antd';
import type { RoleMember } from '../../hooks/useWorkspace';

const { Text } = Typography;

export interface RoleModalsProps {
  editingSoulConfigRole: RoleMember | null;
  editingSoulConfigText: string;
  addRoleModalVisible: boolean;
  newRoleName: string;
  addRoleForm: { name: string; stance: '建设' | '对抗' | '中立' | '评审'; desc: string };
  templatePickerVisible: boolean;
  roleTemplates: any[];
  roles: RoleMember[];
  onEditingSoulConfigRoleChange: (role: RoleMember | null) => void;
  onEditingSoulConfigTextChange: (text: string) => void;
  onSaveSoulConfig: () => void;
  onAddRoleModalVisibleChange: (visible: boolean) => void;
  onNewRoleNameChange: (name: string) => void;
  onAddRoleFormChange: (form: { name: string; stance: '建设' | '对抗' | '中立' | '评审'; desc: string }) => void;
  onAddCustomRole: () => void;
  onTemplatePickerVisibleChange: (visible: boolean) => void;
  onAddRoleFromTemplate: (templateId: number) => void;
}

export function RoleModals({
  editingSoulConfigRole,
  editingSoulConfigText,
  addRoleModalVisible,
  newRoleName,
  addRoleForm,
  templatePickerVisible,
  roleTemplates,
  roles,
  onEditingSoulConfigRoleChange,
  onEditingSoulConfigTextChange,
  onSaveSoulConfig,
  onAddRoleModalVisibleChange,
  onNewRoleNameChange,
  onAddRoleFormChange,
  onAddCustomRole,
  onTemplatePickerVisibleChange,
  onAddRoleFromTemplate,
}: RoleModalsProps) {
  return (
    <>
      {/* 灵魂配置编辑弹窗 */}
      <Modal
        title={<Space><span>🧬 灵魂配置</span><Tag color="blue">{editingSoulConfigRole?.name}</Tag></Space>}
        open={!!editingSoulConfigRole}
        onCancel={() => onEditingSoulConfigRoleChange(null)}
        footer={
          <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
            <Button onClick={() => onEditingSoulConfigRoleChange(null)}>取消</Button>
            <Button type="primary" onClick={onSaveSoulConfig}>
              保存配置
            </Button>
          </Space>
        }
        width={700}
      >
        <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
          请输入角色的完整灵魂配置提示词，定义角色的性格、偏好、表达风格等
        </Text>
        <Input.TextArea
          rows={20}
          value={editingSoulConfigText}
          onChange={(e) => onEditingSoulConfigTextChange(e.target.value)}
          placeholder="【角色名称】\n\n1. 灵魂内核\n- 信条：...\n- 性格：...\n- 使命：...\n- 底色：...\n\n2. 认知偏见与偏好\n- 偏好：...\n- 反感：...\n- 观点：...\n\n3. 专家领域\n- 专长：...\n- 领地：...\n\n4. 边界与抗拒\n- 抗拒：...\n- 红线：...\n\n5. 表达风格\n- 风格：...\n- 语气：..."
        />
      </Modal>

      {/* 添加自定义角色 Modal */}
      <Modal
        title="添加自定义角色"
        open={addRoleModalVisible}
        onCancel={() => onAddRoleModalVisibleChange(false)}
        onOk={onAddCustomRole}
        okText="添加"
        cancelText="取消"
        destroyOnClose
      >
        <Space direction="vertical" size={14} style={{ width: '100%', marginTop: 8 }}>
          <div>
            <Text strong style={{ display: 'block', marginBottom: 4 }}>角色名称 <span style={{ color: '#ff4d4f' }}>*</span></Text>
            <Input
              placeholder="例如：数据安全专家、市场分析师"
              value={newRoleName}
              onChange={(e) => onNewRoleNameChange(e.target.value)}
              onPressEnter={onAddCustomRole}
              maxLength={20}
              showCount
            />
          </div>
          <div>
            <Text strong style={{ display: 'block', marginBottom: 4 }}>角色立场</Text>
            <Select
              value={addRoleForm.stance}
              onChange={(val) => onAddRoleFormChange({ ...addRoleForm, stance: val })}
              style={{ width: '100%' }}
              options={[
                { value: '建设', label: '建设 - 积极推动、贡献方案' },
                { value: '对抗', label: '对抗 - 质疑挑战、压力测试' },
                { value: '中立', label: '中立 - 客观分析、多面评估' },
                { value: '评审', label: '评审 - 严格审核、质量把关' },
              ]}
            />
          </div>
          <div>
            <Text strong style={{ display: 'block', marginBottom: 4 }}>角色描述</Text>
            <Input.TextArea
              rows={3}
              placeholder="简要描述该角色的职责和视角，帮助圆桌讨论时更好地理解角色定位"
              value={addRoleForm.desc}
              onChange={(e) => onAddRoleFormChange({ ...addRoleForm, desc: e.target.value })}
              maxLength={200}
              showCount
            />
          </div>
        </Space>
      </Modal>

      {/* 从模板库添加角色 Modal */}
      <Modal
        title="从模板库添加角色"
        open={templatePickerVisible}
        onCancel={() => onTemplatePickerVisibleChange(false)}
        footer={null}
        width={700}
        destroyOnClose
      >
        <Input
          placeholder="搜索角色名称或描述..."
          style={{ width: '100%', marginBottom: 12 }}
          allowClear
        />
        <div style={{ maxHeight: 480, overflowY: 'auto' }}>
          {roleTemplates.filter(t => t.is_active !== false).length === 0 ? (
            <Empty description="暂无可用角色模板" />
          ) : (
            <Row gutter={[8, 8]}>
              {roleTemplates
                .filter(t => t.is_active !== false)
                .filter(t => !roles.some(r => r.id === `role_${t.id}`))
                .map((template) => (
                  <Col xs={24} md={12} key={template.id}>
                    <Card
                      hoverable
                      size="small"
                      style={{ borderRadius: 6 }}
                      onClick={() => onAddRoleFromTemplate(template.id)}
                    >
                      <Space direction="vertical" size={2} style={{ width: '100%' }}>
                        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                          <Text strong>{template.name}</Text>
                          <Tag color={
                            template.stance === '建设' ? 'blue' :
                            template.stance === '对抗' ? 'red' :
                            template.stance === '评审' ? 'gold' : 'default'
                          }>
                            {template.stance}
                          </Tag>
                        </Space>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {template.description || '暂无描述'}
                        </Text>
                        {(template.category || template.skill_tags?.length) && (
                          <Space wrap size={2}>
                            {template.category && <Tag style={{ fontSize: 10 }}>{template.category}</Tag>}
                            {(template.skill_tags || []).slice(0, 2).map((tag: string) => (
                              <Tag key={tag} style={{ fontSize: 10 }} color="processing">{tag}</Tag>
                            ))}
                          </Space>
                        )}
                      </Space>
                    </Card>
                  </Col>
                ))}
            </Row>
          )}
          {roleTemplates.filter(t => t.is_active !== false).length > 0 &&
            roleTemplates.filter(t => t.is_active !== false).filter(t => !roles.some(r => r.id === `role_${t.id}`)).length === 0 && (
            <Empty description="所有可用模板角色已添加" />
          )}
        </div>
      </Modal>
    </>
  );
}
