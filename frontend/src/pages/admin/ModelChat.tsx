import React, { useState, useRef, useEffect } from 'react';
import {
  Button,
  Input,
  Space,
  Typography,
  Card,
  Avatar,
  List,
  Select,
  message,
  Spin,
  Switch,
} from 'antd';
import {
  SendOutlined,
  PlusOutlined,
  MessageOutlined,
  RobotOutlined,
  BulbOutlined,
} from '@ant-design/icons';
import { useLocation } from 'react-router-dom';
import AdminPageLayout from '../../components/admin/AdminPageLayout';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { LLMConfig } from '../../api/llm';
import { getLLMConfigs, streamChatByLLMConfig } from '../../api/llm';

const { TextArea } = Input;
const { Text } = Typography;

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  thinking?: string;
  timestamp: Date;
}

interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: Date;
}

const ModelChat: React.FC = () => {
  const location = useLocation();
  const [models, setModels] = useState<LLMConfig[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<number | undefined>(undefined);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [enableThinking, setEnableThinking] = useState(false);

  // 当选中模型变化时，同步其 enable_thinking 配置
  useEffect(() => {
    const selectedModel = models.find((m) => m.id === selectedModelId);
    if (selectedModel) {
      setEnableThinking(selectedModel.enable_thinking ?? false);
    }
  }, [selectedModelId, models]);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 从路由状态获取模型 ID
  const initialModelId = (location.state as any)?.modelId;

  // 加载模型列表
  useEffect(() => {
    const fetchModels = async () => {
      try {
        const data = await getLLMConfigs();
        setModels(data);
        if (initialModelId) {
          setSelectedModelId(initialModelId);
        } else if (data.length > 0 && !selectedModelId) {
          setSelectedModelId(data[0].id);
        }
      } catch (error) {
        message.error('加载模型列表失败');
      }
    };
    fetchModels();
  }, [initialModelId]);

  // 自动滚动到底部
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [sessions, currentSessionId]);

  // 创建新会话
  const createNewSession = (): string => {
    const newSession: ChatSession = {
      id: `session_${Date.now()}`,
      title: '新对话',
      messages: [],
      createdAt: new Date(),
    };
    setSessions((prev) => [newSession, ...prev]);
    setCurrentSessionId(newSession.id);
    return newSession.id;
  };

  // 获取当前会话
  const currentSession = sessions.find((s) => s.id === currentSessionId);

  // 发送消息
  const sendMessage = async () => {
    if (!inputValue.trim() || !selectedModelId || isLoading) {
      return;
    }

    const trimmedInput = inputValue.trim();
    const targetSessionId = currentSessionId ?? `session_${Date.now()}`;
    const isNewSession = !currentSessionId;

    const userMessage: ChatMessage = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content: trimmedInput,
      timestamp: new Date(),
    };

    const assistantMessageId = `msg_${Date.now() + 1}`;

    setSessions((prev) => {
      const existingSession = prev.find((session) => session.id === targetSessionId);
      const baseSession: ChatSession = existingSession ?? {
        id: targetSessionId,
        title: '新对话',
        messages: [],
        createdAt: new Date(),
      };
      const updatedSession: ChatSession = {
        ...baseSession,
        title: baseSession.messages.length === 0 ? trimmedInput.slice(0, 30) : baseSession.title,
        messages: [
          ...baseSession.messages,
          userMessage,
          {
            id: assistantMessageId,
            role: 'assistant',
            content: '',
            timestamp: new Date(),
          },
        ],
      };

      if (existingSession) {
        return prev.map((session) => (session.id === targetSessionId ? updatedSession : session));
      }

      return [updatedSession, ...prev];
    });

    if (isNewSession) {
      setCurrentSessionId(targetSessionId);
    }

    setInputValue('');
    setIsLoading(true);

    try {
      // 获取选中的模型
      const selectedModel = models.find((m) => m.id === selectedModelId);
      if (!selectedModel) {
        throw new Error('模型不存在');
      }

      // 构建消息列表
      const allMessages = [...(currentSession?.messages || []), userMessage];
      const lastUserMessage = allMessages[allMessages.length - 1];

      // 流式调用
      await streamChatByLLMConfig(
        selectedModel.id,
        { message: lastUserMessage.content, enable_thinking: enableThinking },
        {
          onDelta: (delta) => {
            setSessions((prev) => {
              const newSessions = [...prev];
              const sessionIndex = newSessions.findIndex((s) => s.id === targetSessionId);
              if (sessionIndex === -1) return prev;
              const session = newSessions[sessionIndex];
              const messages = [...session.messages];
              const assistantIndex = messages.findIndex((msg) => msg.id === assistantMessageId);
              const assistantMessage = assistantIndex >= 0 ? messages[assistantIndex] : null;
              if (assistantMessage && assistantMessage.role === 'assistant') {
                messages[assistantIndex] = {
                  ...assistantMessage,
                  content: assistantMessage.content + delta,
                };
              }
              newSessions[sessionIndex] = { ...session, messages };
              return newSessions;
            });
          },
          onThinking: (delta) => {
            setSessions((prev) => {
              const newSessions = [...prev];
              const sessionIndex = newSessions.findIndex((s) => s.id === targetSessionId);
              if (sessionIndex === -1) return prev;
              const session = newSessions[sessionIndex];
              const messages = [...session.messages];
              const assistantIndex = messages.findIndex((msg) => msg.id === assistantMessageId);
              const assistantMessage = assistantIndex >= 0 ? messages[assistantIndex] : null;
              if (assistantMessage && assistantMessage.role === 'assistant') {
                messages[assistantIndex] = {
                  ...assistantMessage,
                  thinking: (assistantMessage.thinking || '') + delta,
                };
              }
              newSessions[sessionIndex] = { ...session, messages };
              return newSessions;
            });
          },
          onDone: () => {
            setIsLoading(false);
          },
          onError: (error) => {
            message.error(error);
            setIsLoading(false);
          },
        },
      );

    } catch (error: any) {
      message.error(`聊天失败：${error.message}`);
      // 移除失败的助手消息
      setSessions((prev) =>
        prev.map((session) => {
          if (session.id === targetSessionId) {
            return {
              ...session,
              messages: session.messages.filter((msg) => msg.id !== assistantMessageId),
            };
          }
          return session;
        })
      );
    } finally {
      setIsLoading(false);
    }
  };

  // 处理键盘事件
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const renderContent = () => {
    return (
      <div style={{ display: 'flex', height: '100%' }}>
        {/* 左侧会话列表 */}
        <div
          style={{
            width: 280,
            background: '#fafafa',
            borderRight: '1px solid #f0f0f0',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div style={{ padding: '16px', borderBottom: '1px solid #f0f0f0' }}>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={createNewSession}
              block
            >
              新建对话
            </Button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto' }}>
            <List
              dataSource={sessions}
              renderItem={(session) => (
                <List.Item
                  key={session.id}
                  onClick={() => setCurrentSessionId(session.id)}
                  style={{
                    padding: '12px 16px',
                    cursor: 'pointer',
                    background:
                      currentSessionId === session.id ? '#e6f7ff' : 'transparent',
                    transition: 'all 0.3s',
                  }}
                >
                  <List.Item.Meta
                    avatar={
                      <Avatar
                        style={{ backgroundColor: '#1890ff' }}
                        icon={<MessageOutlined />}
                      />
                    }
                    title={
                      <Text
                        ellipsis
                        style={{ maxWidth: 200, display: 'block' }}
                      >
                        {session.title}
                      </Text>
                    }
                    description={
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {session.messages.length} 条消息
                      </Text>
                    }
                  />
                </List.Item>
              )}
            />
          </div>
        </div>

        {/* 右侧聊天区域 */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            background: '#fff',
          }}
        >
          {/* 顶部模型选择器 */}
          <div
            style={{
              padding: '12px 24px',
              borderBottom: '1px solid #f0f0f0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Space>
              <RobotOutlined style={{ fontSize: 20, color: '#1890ff' }} />
              <Text strong>模型聊天</Text>
            </Space>
            <Select
              value={selectedModelId}
              onChange={setSelectedModelId}
              style={{ width: 250 }}
              options={models.map((m) => ({
                value: m.id,
                label: m.name,
              }))}
              placeholder="选择模型"
            />
            <Space style={{ fontSize: 13 }}>
              <BulbOutlined style={{ color: enableThinking ? '#faad14' : '#999' }} />
              <span style={{ color: '#666' }}>思考模式</span>
              <Switch
                size="small"
                checked={enableThinking}
                onChange={setEnableThinking}
                checkedChildren="开"
                unCheckedChildren="关"
              />
            </Space>
          </div>

          {/* 消息列表 */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '24px',
            }}
          >
            {!currentSession || currentSession.messages.length === 0 ? (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '100%',
                  color: '#999',
                }}
              >
                <Avatar
                  size={80}
                  style={{ backgroundColor: '#1890ff', marginBottom: 24 }}
                  icon={<RobotOutlined />}
                />
                <Text style={{ fontSize: 18, marginBottom: 8 }}>
                  你好！我是你的 AI 助手
                </Text>
                <Text type="secondary">
                  选择一个模型，开始对话吧
                </Text>
              </div>
            ) : (
              <List
                dataSource={currentSession.messages}
                renderItem={(msg) => (
                  <List.Item
                    style={{
                      padding: '16px 0',
                      justifyContent:
                        msg.role === 'user' ? 'flex-end' : 'flex-start',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        maxWidth: '80%',
                        flexDirection:
                          msg.role === 'user' ? 'row-reverse' : 'row',
                      }}
                    >
                      <Avatar
                        style={{
                          backgroundColor:
                            msg.role === 'user' ? '#87d068' : '#1890ff',
                          marginLeft: msg.role === 'user' ? 0 : 8,
                          marginRight: msg.role === 'user' ? 8 : 0,
                        }}
                        icon={
                          msg.role === 'user' ? (
                            <span style={{ fontSize: 16 }}>我</span>
                          ) : (
                            <RobotOutlined />
                          )
                        }
                      />
                      <Card
                        style={{
                          marginLeft: msg.role === 'user' ? 8 : 0,
                          marginRight: msg.role === 'user' ? 0 : 8,
                          borderRadius: 8,
                        }}
                        bodyStyle={{ padding: '12px 16px' }}
                      >
                        <div style={{ fontSize: 14, lineHeight: 1.6 }}>
                          {msg.role === 'assistant' && msg.thinking && (
                            <details style={{ marginBottom: 8, color: '#666' }}>
                              <summary style={{ cursor: 'pointer', fontSize: 12, userSelect: 'none' }}>
                                <BulbOutlined style={{ marginRight: 4 }} />
                                思考过程
                              </summary>
                              <div style={{
                                marginTop: 6,
                                padding: '8px 12px',
                                background: '#fffbe6',
                                borderRadius: 6,
                                fontSize: 13,
                                lineHeight: 1.5,
                                whiteSpace: 'pre-wrap',
                              }}>
                                {msg.thinking}
                              </div>
                            </details>
                          )}
                          {msg.role === 'assistant' ? (
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {msg.content}
                            </ReactMarkdown>
                          ) : (
                            msg.content
                          )}
                        </div>
                      </Card>
                    </div>
                  </List.Item>
                )}
              />
            )}
            {isLoading && (
              <div style={{ padding: '16px 0' }}>
                <Space>
                  <Spin size="small" />
                  <Text type="secondary">AI 正在思考...</Text>
                </Space>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* 输入区域 */}
          <div
            style={{
              padding: '16px 24px',
              borderTop: '1px solid #f0f0f0',
              background: '#fafafa',
            }}
          >
            <TextArea
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="输入消息... (按 Enter 发送，Shift+Enter 换行)"
              rows={3}
              style={{ resize: 'none', marginBottom: 8 }}
              disabled={isLoading || !selectedModelId}
            />
            <div style={{ textAlign: 'right' }}>
              <Button
                type="primary"
                icon={<SendOutlined />}
                onClick={sendMessage}
                disabled={
                  !inputValue.trim() || isLoading || !selectedModelId
                }
              >
                发送
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <AdminPageLayout selectedMenu="chat" hideSidebar={false}>
      {renderContent()}
    </AdminPageLayout>
  );
};

export default ModelChat;
