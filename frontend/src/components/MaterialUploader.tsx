import React, { useState, useCallback, useRef } from 'react';
import {
  Upload,
  Button,
  Card,
  List,
  Space,
  Tag,
  Typography,
  Progress,
  Modal,
  message,
  Popconfirm,
  Spin,
  Alert,
} from 'antd';
import {
  UploadOutlined,
  FileOutlined,
  PictureOutlined,
  DeleteOutlined,
  EyeOutlined,
  SyncOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  InboxOutlined,
} from '@ant-design/icons';
import type { UploadFile, UploadProps } from 'antd';
import {
  uploadMaterial,
  uploadMultipleMaterials,
  deleteMaterial,
  analyzeMaterial,
  getMaterial,
  listMaterials,
  formatFileSize,
  getFileTypeIcon,
  type MaterialInfo,
} from '../api/material';

const { Text, Title } = Typography;

interface MaterialUploaderProps {
  roomId: string;
  onMaterialsAnalyzed?: (materials: MaterialInfo[]) => void;
  maxFiles?: number;
}

const MaterialUploader: React.FC<MaterialUploaderProps> = ({
  roomId,
  onMaterialsAnalyzed,
  maxFiles = 10,
}) => {
  const [materials, setMaterials] = useState<MaterialInfo[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [analyzingIds, setAnalyzingIds] = useState<Set<string>>(new Set());
  const [previewMaterial, setPreviewMaterial] = useState<MaterialInfo | null>(null);
  const [loading, setLoading] = useState(false);

  const loadMaterials = useCallback(async () => {
    if (!roomId) return;
    setLoading(true);
    try {
      const list = await listMaterials(roomId);
      setMaterials(list);
    } catch (error) {
      console.error('Failed to load materials:', error);
    } finally {
      setLoading(false);
    }
  }, [roomId]);

  React.useEffect(() => {
    if (roomId) {
      loadMaterials();
    }
  }, [roomId, loadMaterials]);

  const handleUpload = useCallback(
    async (file: File) => {
      if (materials.length >= maxFiles) {
        message.warning(`最多只能上传 ${maxFiles} 个文件`);
        return false;
      }

      const validTypes = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain',
        'image/jpeg',
        'image/png',
        'image/gif',
      ];

      if (!validTypes.includes(file.type)) {
        message.error('不支持的文件类型');
        return false;
      }

      const maxSizes: Record<string, number> = {
        document: 50 * 1024 * 1024,
        image: 20 * 1024 * 1024,
      };

      const fileSize = file.type.startsWith('image/') ? maxSizes.image : maxSizes.document;
      if (file.size > fileSize) {
        message.error(`文件大小不能超过 ${formatFileSize(fileSize)}`);
        return false;
      }

      try {
        setUploading(true);
        const result = await uploadMaterial(file, roomId, (percent) => {
          setUploadProgress((prev) => ({ ...prev, [file.name]: percent }));
        });

        setMaterials((prev) => [...prev, result]);
        setUploadProgress((prev) => {
          const next = { ...prev };
          delete next[file.name];
          return next;
        });

        if (result.processing_status !== 'completed') {
          await handleAnalyze(result.id);
        }

        message.success(`${file.name} 上传成功`);
        return true;
      } catch (error: any) {
        message.error(`${file.name} 上传失败: ${error.message}`);
        setUploadProgress((prev) => {
          const next = { ...prev };
          delete next[file.name];
          return next;
        });
        return false;
      } finally {
        setUploading(false);
      }
    },
    [roomId, materials.length, maxFiles]
  );

  const handleAnalyze = async (materialId: string) => {
    setAnalyzingIds((prev) => new Set(prev).add(materialId));
    try {
      const result = await analyzeMaterial(materialId);
      setMaterials((prev) =>
        prev.map((m) =>
          m.id === materialId
            ? {
                ...m,
                processing_status: result.status as MaterialInfo['processing_status'],
                extracted_content: result.extracted_content,
                key_info: result.key_info as MaterialInfo['key_info'],
                intent_indicators: result.intent_indicators,
                summary: result.summary,
              }
            : m
        )
      );
      message.success('材料分析完成');
    } catch (error: any) {
      message.error(`分析失败: ${error.message}`);
    } finally {
      setAnalyzingIds((prev) => {
        const next = new Set(prev);
        next.delete(materialId);
        return next;
      });
    }
  };

  const handleDelete = async (materialId: string) => {
    try {
      await deleteMaterial(materialId);
      setMaterials((prev) => prev.filter((m) => m.id !== materialId));
      message.success('材料已删除');
    } catch (error: any) {
      message.error(`删除失败: ${error.message}`);
    }
  };

  const handlePreview = async (material: MaterialInfo) => {
    if (material.processing_status === 'completed') {
      setPreviewMaterial(material);
    } else {
      try {
        const updated = await getMaterial(material.id);
        setPreviewMaterial(updated);
        setMaterials((prev) =>
          prev.map((m) => (m.id === material.id ? updated : m))
        );
      } catch (error) {
        message.error('获取材料详情失败');
      }
    }
  };

  const uploadProps: UploadProps = {
    name: 'file',
    multiple: true,
    showUploadList: false,
    beforeUpload: handleUpload,
    disabled: uploading || materials.length >= maxFiles,
  };

  const getStatusTag = (status: MaterialInfo['processing_status']) => {
    switch (status) {
      case 'completed':
        return <Tag icon={<CheckCircleOutlined />} color="success">已完成</Tag>;
      case 'processing':
        return <Tag icon={<SyncOutlined spin />} color="processing">分析中</Tag>;
      case 'failed':
        return <Tag icon={<CloseCircleOutlined />} color="error">失败</Tag>;
      default:
        return <Tag color="default">待处理</Tag>;
    }
  };

  const getMaterialIcon = (material: MaterialInfo) => {
    if (material.material_type === 'image') {
      return <PictureOutlined style={{ fontSize: 24, color: '#1890ff' }} />;
    }
    return <FileOutlined style={{ fontSize: 24, color: '#722ed1' }} />;
  };

  return (
    <Card
      title={
        <Space>
          <span>材料上传与分析</span>
          <Tag>{materials.length}/{maxFiles}</Tag>
        </Space>
      }
      extra={
        <Upload {...uploadProps}>
          <Button
            type="primary"
            icon={<UploadOutlined />}
            loading={uploading}
            disabled={materials.length >= maxFiles}
          >
            添加材料
          </Button>
        </Upload>
      }
      style={{ marginBottom: 16 }}
    >
      {materials.length === 0 ? (
        <Upload.Dragger
          {...uploadProps}
          style={{ padding: 20 }}
        >
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">点击或拖拽文件到此区域上传</p>
          <p className="ant-upload-hint">
            支持 PDF、Word、TXT 文档以及 JPG、PNG、GIF 图片
          </p>
          <p className="ant-upload-hint" style={{ fontSize: 12, color: '#999' }}>
            文档最大 50MB，图片最大 20MB
          </p>
        </Upload.Dragger>
      ) : (
        <List
          loading={loading}
          dataSource={materials}
          renderItem={(material) => (
            <List.Item
              key={material.id}
              actions={[
                analyzingIds.has(material.id) ? (
                  <Spin key="analyze" size="small" />
                ) : material.processing_status !== 'completed' ? (
                  <Button
                    key="analyze"
                    type="link"
                    size="small"
                    icon={<SyncOutlined />}
                    onClick={() => handleAnalyze(material.id)}
                  >
                    分析
                  </Button>
                ) : null,
                material.processing_status === 'completed' ? (
                  <Button
                    key="preview"
                    type="link"
                    size="small"
                    icon={<EyeOutlined />}
                    onClick={() => handlePreview(material)}
                  >
                    查看
                  </Button>
                ) : null,
                <Popconfirm
                  key="delete"
                  title="确定删除此材料？"
                  onConfirm={() => handleDelete(material.id)}
                  okText="确定"
                  cancelText="取消"
                >
                  <Button
                    type="link"
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                  >
                    删除
                  </Button>
                </Popconfirm>,
              ].filter(Boolean)}
            >
              <List.Item.Meta
                avatar={getMaterialIcon(material)}
                title={
                  <Space>
                    <Text strong>{material.filename}</Text>
                    {getStatusTag(material.processing_status)}
                    {material.intent_indicators && material.intent_indicators.length > 0 && (
                      <span>
                        {material.intent_indicators.map((indicator) => (
                          <Tag key={indicator} color="blue" style={{ marginLeft: 4 }}>
                            {indicator}
                          </Tag>
                        ))}
                      </span>
                    )}
                  </Space>
                }
                description={
                  <Space direction="vertical" size={0}>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {getFileTypeIcon(material.format)} {material.format.toUpperCase()} · {formatFileSize(material.size)}
                      {material.key_info?.keywords && material.key_info.keywords.length > 0 && (
                        <span> · 关键词: {material.key_info.keywords.slice(0, 5).join(', ')}</span>
                      )}
                    </Text>
                    {material.summary && (
                      <Text type="secondary" style={{ fontSize: 12 }} ellipsis>
                        摘要: {material.summary}
                      </Text>
                    )}
                    {uploadProgress[material.filename] !== undefined && (
                      <Progress
                        percent={uploadProgress[material.filename]}
                        size="small"
                        status="active"
                      />
                    )}
                  </Space>
                }
              />
            </List.Item>
          )}
        />
      )}

      <Modal
        title="材料内容预览"
        open={!!previewMaterial}
        onCancel={() => setPreviewMaterial(null)}
        footer={null}
        width={700}
      >
        {previewMaterial && (
          <div>
            <Space direction="vertical" style={{ width: '100%' }} size={16}>
              <div>
                <Text strong>文件名: </Text>
                <Text>{previewMaterial.filename}</Text>
              </div>
              <div>
                <Text strong>类型: </Text>
                <Tag>{previewMaterial.material_type}</Tag>
                <Tag>{previewMaterial.format.toUpperCase()}</Tag>
              </div>
              {previewMaterial.key_info && (
                <div>
                  <Text strong>关键词: </Text>
                  <div style={{ marginTop: 8 }}>
                    {previewMaterial.key_info.keywords?.map((kw) => (
                      <Tag key={kw} color="processing" style={{ marginBottom: 4 }}>
                        {kw}
                      </Tag>
                    ))}
                  </div>
                </div>
              )}
              {previewMaterial.extracted_content && (
                <div>
                  <Text strong>提取内容:</Text>
                  <Card
                    size="small"
                    style={{
                      marginTop: 8,
                      maxHeight: 400,
                      overflow: 'auto',
                      whiteSpace: 'pre-wrap',
                      fontFamily: 'monospace',
                    }}
                  >
                    {previewMaterial.extracted_content}
                  </Card>
                </div>
              )}
              {previewMaterial.summary && (
                <Alert
                  message="智能摘要"
                  description={previewMaterial.summary}
                  type="info"
                  showIcon
                />
              )}
            </Space>
          </div>
        )}
      </Modal>
    </Card>
  );
};

export default MaterialUploader;
