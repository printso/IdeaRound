import React, { useState, useCallback } from 'react';
import {
  Card,
  Typography,
  Space,
  Tag,
  List,
  Button,
  message,
  Collapse,
  Row,
  Col,
  Divider,
} from 'antd';
import {
  BulbOutlined,
  ThunderboltOutlined,
  WarningOutlined,
  SolutionOutlined,
  CheckCircleOutlined,
  SyncOutlined,
} from '@ant-design/icons';
import {
  synthesizeIntent,
  batchAnalyzeMaterials,
  type MaterialInfo,
  type IntentSynthesisResult,
} from '../api/material';

const { Text, Paragraph } = Typography;

interface MaterialIntentSynthesisProps {
  roomId: string;
  materials: MaterialInfo[];
  onIntentSynthesized?: (result: IntentSynthesisResult) => void;
}

const MaterialIntentSynthesis: React.FC<MaterialIntentSynthesisProps> = ({
  roomId,
  materials,
  onIntentSynthesized,
}) => {
  const [synthesizing, setSynthesizing] = useState(false);
  const [result, setResult] = useState<IntentSynthesisResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  const completedMaterials = materials.filter(
    (m) => m.processing_status === 'completed'
  );

  const handleSynthesize = useCallback(async () => {
    if (completedMaterials.length === 0) {
      message.warning('请先上传并分析至少一个材料');
      return;
    }

    setSynthesizing(true);
    try {
      const synthesized = await synthesizeIntent(
        roomId,
        completedMaterials.map((m) => m.id)
      );
      setResult(synthesized);
      if (onIntentSynthesized) {
        onIntentSynthesized(synthesized);
      }
      message.success('意图综合完成');
    } catch (error: any) {
      message.error(`意图综合失败: ${error.message}`);
    } finally {
      setSynthesizing(false);
    }
  }, [roomId, completedMaterials, onIntentSynthesized]);

  const handleAnalyzeAll = useCallback(async () => {
    const pendingMaterials = materials.filter(
      (m) => m.processing_status !== 'completed' && m.processing_status !== 'processing'
    );

    if (pendingMaterials.length === 0) {
      message.info('所有材料已完成分析');
      return;
    }

    setAnalyzing(true);
    try {
      await batchAnalyzeMaterials(pendingMaterials.map((m) => m.id));
      message.success('批量分析完成');
    } catch (error: any) {
      message.error(`批量分析失败: ${error.message}`);
    } finally {
      setAnalyzing(false);
    }
  }, [materials]);

  const getIntentIcon = (intent: string) => {
    switch (intent) {
      case 'goal':
        return <BulbOutlined />;
      case 'requirement':
        return <CheckCircleOutlined />;
      case 'constraint':
        return <WarningOutlined />;
      case 'problem':
        return <WarningOutlined />;
      case 'solution':
        return <SolutionOutlined />;
      case 'evaluation':
        return <ThunderboltOutlined />;
      case 'stakeholder':
        return <BulbOutlined />;
      default:
        return <BulbOutlined />;
    }
  };

  const getIntentLabel = (intent: string) => {
    const labels: Record<string, string> = {
      goal: '核心目标',
      requirement: '具体需求',
      constraint: '限制条件',
      problem: '痛点问题',
      solution: '解决方案',
      evaluation: '评估指标',
      stakeholder: '利益相关者',
    };
    return labels[intent] || intent;
  };

  const getIntentColor = (intent: string) => {
    switch (intent) {
      case 'goal':
        return 'blue';
      case 'requirement':
        return 'green';
      case 'constraint':
        return 'orange';
      case 'problem':
        return 'red';
      case 'solution':
        return 'purple';
      case 'evaluation':
        return 'cyan';
      case 'stakeholder':
        return 'magenta';
      default:
        return 'default';
    }
  };

  return (
    <Card
      title={
        <Space>
          <span>多类型材料意图洞察</span>
          <Tag color={completedMaterials.length > 0 ? 'success' : 'default'}>
            {completedMaterials.length} 个已分析材料
          </Tag>
        </Space>
      }
      extra={
        <Space>
          {materials.length > completedMaterials.length && (
            <Button
              icon={<SyncOutlined />}
              onClick={handleAnalyzeAll}
              loading={analyzing}
            >
              分析全部
            </Button>
          )}
          <Button
            type="primary"
            icon={<BulbOutlined />}
            onClick={handleSynthesize}
            loading={synthesizing}
            disabled={completedMaterials.length === 0}
          >
            综合洞察
          </Button>
        </Space>
      }
    >
      {!result ? (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <Text type="secondary">
            上传材料并分析后，点击「综合洞察」按钮获取多类型材料的综合意图分析
          </Text>
          <div style={{ marginTop: 16 }}>
            <Space direction="vertical" size={8}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                支持文档类型: PDF, Word, TXT
              </Text>
              <Text type="secondary" style={{ fontSize: 12 }}>
                支持图片类型: JPG, PNG, GIF
              </Text>
            </Space>
          </div>
        </div>
      ) : (
        <div>
          <Row gutter={[16, 16]}>
            <Col span={24}>
              <Card size="small" title="🔍 核心意图指标" style={{ background: '#fafafa' }}>
                <Space wrap>
                  {result.core_intent_indicators.map((indicator) => (
                    <Tag
                      key={indicator}
                      icon={getIntentIcon(indicator)}
                      color={getIntentColor(indicator)}
                      style={{ padding: '4px 12px', fontSize: 14 }}
                    >
                      {getIntentLabel(indicator)}
                    </Tag>
                  ))}
                </Space>
              </Card>
            </Col>
          </Row>

          <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
            <Col xs={24} lg={12}>
              <Card
                size="small"
                title="🎯 核心目标"
                extra={<Tag color="blue">GOAL</Tag>}
              >
                <Paragraph ellipsis={{ rows: 3, expandable: true }}>
                  {result.synthesized_intent.core_goal || '暂无'}
                </Paragraph>
              </Card>
            </Col>
            <Col xs={24} lg={12}>
              <Card
                size="small"
                title="📋 需求描述"
                extra={<Tag color="green">REQUIREMENT</Tag>}
              >
                <Paragraph ellipsis={{ rows: 3, expandable: true }}>
                  {result.synthesized_intent.requirements || '暂无'}
                </Paragraph>
              </Card>
            </Col>
          </Row>

          <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
            <Col xs={24} lg={12}>
              <Card
                size="small"
                title="⚠️ 限制条件"
                extra={<Tag color="orange">CONSTRAINT</Tag>}
              >
                <Paragraph ellipsis={{ rows: 3, expandable: true }}>
                  {result.synthesized_intent.constraints || '暂无'}
                </Paragraph>
              </Card>
            </Col>
            <Col xs={24} lg={12}>
              <Card
                size="small"
                title="🔥 痛点问题"
                extra={<Tag color="red">PROBLEM</Tag>}
              >
                <Paragraph ellipsis={{ rows: 3, expandable: true }}>
                  {result.synthesized_intent.pain_points || '暂无'}
                </Paragraph>
              </Card>
            </Col>
          </Row>

          <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
            <Col span={24}>
              <Card size="small" title="🏷️ 关键主题词">
                <Space wrap>
                  {result.key_topics.map((topic, index) => (
                    <Tag key={index} color="processing" style={{ fontSize: 13 }}>
                      {topic}
                    </Tag>
                  ))}
                </Space>
              </Card>
            </Col>
          </Row>

          <Divider />

          <Card size="small" title="💡 分析建议">
            <List
              size="small"
              dataSource={result.recommendations}
              renderItem={(item, index) => (
                <List.Item key={index}>
                  <Space>
                    <Tag>{index + 1}</Tag>
                    <Text>{item}</Text>
                  </Space>
                </List.Item>
              )}
            />
          </Card>

          <Collapse
            style={{ marginTop: 16 }}
            items={[
              {
                key: 'materials',
                label: `📎 材料摘要 (${result.material_summaries.length})`,
                children: (
                  <List
                    size="small"
                    dataSource={result.material_summaries}
                    renderItem={(item) => (
                      <List.Item>
                        <List.Item.Meta
                          title={
                            <Space>
                              <Text strong>{item.material_id.slice(0, 20)}...</Text>
                              {item.intent_indicators?.map((ind) => (
                                <Tag key={ind} color="blue" style={{ fontSize: 10 }}>
                                  {ind}
                                </Tag>
                              ))}
                            </Space>
                          }
                          description={
                            <Text type="secondary" ellipsis>
                              {item.summary || '无摘要'}
                            </Text>
                          }
                        />
                      </List.Item>
                    )}
                  />
                ),
              },
            ]}
          />
        </div>
      )}
    </Card>
  );
};

export default MaterialIntentSynthesis;
