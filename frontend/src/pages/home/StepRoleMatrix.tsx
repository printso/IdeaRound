// Generated with Engineering Prompt v2026.04 - Quality & Efficiency Enforced
import { AppstoreAddOutlined, PlusOutlined } from '@ant-design/icons';
import { Button, Card, Col, Divider, Grid, InputNumber, Row, Space, Switch, Tag, Typography } from 'antd';
import type { RoleMember } from '../../hooks/useWorkspace';

const { Paragraph, Text } = Typography;

export interface StepRoleMatrixProps {
  roles: RoleMember[];
  isReGeneratingRoles: boolean;
  initialDemand: string;
  intentReady: boolean;
  expectedResult: string;
  maxDialogueRounds: number;
  autoBrainstorm: boolean;
  onGenerateRoles: () => void;
  onRemoveRole: (id: string) => void;
  onToggleRoleSelected: (id: string) => void;
  onEditSoulConfig: (role: RoleMember) => void;
  onShowAddRoleModal: () => void;
  onShowTemplatePicker: () => void;
  onExpectedResultChange: (val: string) => void;
  onMaxRoundsChange: (val: number) => void;
  onAutoBrainstormChange: (val: boolean) => void;
  onConfirmRoles: () => void;
}

export function StepRoleMatrix({
  roles,
  isReGeneratingRoles,
  initialDemand,
  intentReady,
  expectedResult,
  maxDialogueRounds,
  autoBrainstorm,
  onGenerateRoles,
  onRemoveRole,
  onToggleRoleSelected,
  onEditSoulConfig,
  onShowAddRoleModal,
  onShowTemplatePicker,
  onMaxRoundsChange,
  onAutoBrainstormChange,
  onConfirmRoles,
}: StepRoleMatrixProps) {
  const screens = Grid.useBreakpoint();
  const isNarrow = !screens.lg;

  return (
    <div style={{ display: 'flex', flexDirection: isNarrow ? 'column' : 'row', gap: isNarrow ? 16 : 24, alignItems: 'stretch', width: '100%' }}>
      <div style={{ flex: '1 1 0', minWidth: 0 }}>
        <Card
          title={
            <Space style={{ width: '100%', justifyContent: 'space-between' }}>
              <span>角色矩阵组建</span>
              <Button
                type="link"
                onClick={onGenerateRoles}
                loading={isReGeneratingRoles}
                disabled={!intentReady}
              >
                {roles.length > 0 ? '重新智能推荐' : '智能推荐'}
              </Button>
            </Space>
          }
          style={{ borderRadius: 8 }}
        >
          {roles.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#8c8c8c' }}>
              点击右上角「智能推荐」或下方按钮手动添加角色
            </div>
          ) : (
            <Space direction="vertical" size={16} style={{ width: '100%' }}>
              <Row gutter={[12, 12]}>
                {roles.map((role) => (
                  <Col xs={24} md={12} key={role.id}>
                    <Card
                      size="small"
                      style={{
                        background: role.selected ? '#e6f4ff' : '#fafafa',
                        borderColor: role.selected ? '#91caff' : '#d9d9d9',
                        borderRadius: 6,
                        opacity: role.selected ? 1 : 0.6,
                      }}
                      actions={[
                        <Button type="link" size="small" onClick={() => onEditSoulConfig(role)}>
                          🧬 灵魂配置
                        </Button>,
                        <Button type="text" danger size="small" onClick={() => onRemoveRole(role.id)}>
                          移除
                        </Button>,
                      ]}
                    >
                      <Space direction="vertical" size={6} style={{ width: '100%' }}>
                        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                          <Space>
                            <Text strong>{role.name}</Text>
                            <Tag
                              color={
                                role.name.includes('黑帽') || role.stance === '对抗'
                                  ? 'volcano'
                                  : role.stance === '建设'
                                  ? 'blue'
                                  : 'default'
                              }
                            >
                              {role.stance}
                            </Tag>
                          </Space>
                          <Switch checked={role.selected} onChange={() => onToggleRoleSelected(role.id)} />
                        </Space>
                        <Text type="secondary">{role.desc}</Text>
                      </Space>
                    </Card>
                  </Col>
                ))}
              </Row>
              <Divider />
              <Space direction="vertical" size={8} style={{ width: '100%' }}>
                <Text strong>角色管理</Text>
                <Space wrap>
                  <Button icon={<PlusOutlined />} onClick={onShowAddRoleModal} type="primary">
                    添加自定义角色
                  </Button>
                  <Button icon={<AppstoreAddOutlined />} onClick={onShowTemplatePicker}>
                    从模板库添加
                  </Button>
                </Space>
              </Space>
            </Space>
          )}
        </Card>
      </div>
      <div style={{ width: isNarrow ? '100%' : 340, flexShrink: 0 }}>
        <Card title="确认与启动" style={{ borderRadius: 8 }}>
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Card size="small">
              <Text strong>核心议题</Text>
              <Paragraph style={{ marginBottom: 0 }} ellipsis={{ rows: 2, expandable: true }}>
                {initialDemand.trim() || '-'}
              </Paragraph>
            </Card>
            <Card size="small">
              <Text strong>期望结果</Text>
              <Paragraph style={{ marginBottom: 0 }}>{expectedResult || '-'}</Paragraph>
            </Card>
              <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                <Text>对话轮数上限</Text>
                <InputNumber
                  min={1}
                  max={30}
                  value={maxDialogueRounds}
                  onChange={(v) => onMaxRoundsChange(Number(v || 6))}
                />
              </Space>
            <Space style={{ width: '100%', justifyContent: 'space-between' }}>
              <Text>群聊模式（多角色脑暴）</Text>
              <Switch checked={autoBrainstorm} onChange={onAutoBrainstormChange} disabled title="已由系统后台调度模式接管" />
            </Space>
            <Button type="primary" onClick={onConfirmRoles} disabled={!intentReady}>
              确认角色并创建圆桌空间
            </Button>
            <Text type="secondary">
              圆桌空间中，你（"我"）是特殊角色：可以发言、暂停生成、清空讨论、通过系统提示词进行纠偏。
            </Text>
          </Space>
        </Card>
      </div>
    </div>
  );
}
