import React, { useEffect, useState } from 'react';
import { Card, Col, Row, Space, Statistic, Table, Tag, Typography, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { getRuntimeMetricsSummary, type RuntimeEvent, type RuntimeMetricsSummary } from '../../api/runtime';

const { Text } = Typography;

const RuntimeMonitor: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [metrics, setMetrics] = useState<RuntimeMetricsSummary | null>(null);

  const loadMetrics = async () => {
    setLoading(true);
    try {
      const data = await getRuntimeMetricsSummary();
      setMetrics(data);
    } catch (error) {
      console.error(error);
      message.error('加载运行时监控失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadMetrics();
  }, []);

  const columns: ColumnsType<RuntimeEvent> = [
    {
      title: '事件',
      dataIndex: 'event_type',
      render: (value) => <Text code>{value}</Text>,
    },
    {
      title: '房间',
      dataIndex: 'room_id',
      width: 180,
      render: (value) => value || '-',
    },
    {
      title: '状态',
      dataIndex: 'success',
      width: 90,
      render: (value) => <Tag color={value ? 'green' : 'red'}>{value ? '成功' : '失败'}</Tag>,
    },
    {
      title: '耗时',
      dataIndex: 'duration_ms',
      width: 100,
      render: (value) => (value ? `${value} ms` : '-'),
    },
    {
      title: '时间',
      dataIndex: 'created_at',
      width: 180,
      render: (value) => new Date(value).toLocaleString(),
    },
  ];

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Row gutter={16}>
        <Col xs={24} md={8} xl={6}>
          <Card loading={loading}>
            <Statistic title="任务总数" value={metrics?.total_tasks || 0} />
          </Card>
        </Col>
        <Col xs={24} md={8} xl={6}>
          <Card loading={loading}>
            <Statistic title="运行中任务" value={metrics?.pending_tasks || 0} />
          </Card>
        </Col>
        <Col xs={24} md={8} xl={6}>
          <Card loading={loading}>
            <Statistic title="平均耗时" value={metrics?.avg_task_duration_ms || 0} suffix="ms" />
          </Card>
        </Col>
        <Col xs={24} md={8} xl={6}>
          <Card loading={loading}>
            <Statistic title="导演干预次数" value={metrics?.director_events || 0} />
          </Card>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col xs={24} md={8}>
          <Card loading={loading}>
            <Statistic title="成功任务" value={metrics?.completed_tasks || 0} />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card loading={loading}>
            <Statistic title="失败任务" value={metrics?.failed_tasks || 0} />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card loading={loading}>
            <Statistic title="事件总量" value={metrics?.total_events || 0} />
          </Card>
        </Col>
      </Row>

      <Card title="最近事件" loading={loading}>
        <Table
          columns={columns}
          dataSource={metrics?.latest_events || []}
          rowKey="id"
          pagination={false}
          size="small"
        />
      </Card>
    </Space>
  );
};

export default RuntimeMonitor;
