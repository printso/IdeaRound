import React, { useState, useRef, useEffect } from 'react';
import {
  Layout,
  Menu,
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
} from 'antd';
import {
  SendOutlined,
  PlusOutlined,
  MessageOutlined,
  SettingOutlined,
  RobotOutlined,
  DashboardOutlined,
  ExperimentOutlined,
} from '@ant-design/icons';
import { useLocation } from 'react-router-dom';
import AppHeader from '../../components/AppHeader';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { LLMConfig } from '../../api/llm';
import { getLLMConfigs, streamChatByLLMConfig } from '../../api/llm';

const { Sider, Content } = Layout;
const { TextArea } = Input;
const { Text } = Typography;

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: Date;
}

type MenuKey = 'chat' | 'models' | 'prompts' | 'styles' | 'roles' | 'roundtable';

const ModelChat: React.FC = () => {
  const location = useLocation();
  const [selectedMenu, setSelectedMenu] = useState<MenuKey>('chat');
  const [models, setModels] = useState<LLMConfig[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<number | undefined>(undefined);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
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
  const createNewSession = () => {
    const newSession: ChatSession = {
      id: `session_${Date.now()}`,
      title: '新对话',
      messages: [],
      createdAt: new Date(),
    };
    setSessions((prev) => [newSession, ...prev]);
    setCurrentSessionId(newSession.id);
  };

  // 获取当前会话
  const currentSession = sessions.find((s) => s.id === currentSessionId);

  // 发送消息
  const sendMessage = async () => {
    if (!inputValue.trim() || !selectedModelId || isLoading) {
      return;
    }

    const userMessage: ChatMessage = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content: inputValue.trim(),
      timestamp: new Date(),
    };

    // 更新会话
    setSessions((prev) =>
      prev.map((session) => {
        if (session.id === currentSessionId) {
          return {
            ...session,
            messages: [...session.messages, userMessage],
            title: session.messages.length === 0 ? inputValue.trim().slice(0, 30) : session.title,
          };
        }
        return session;
      })
    );

    setInputValue('');
    setIsLoading(true);

    // 添加助手消息占位
    const assistantMessageId = `msg_${Date.now() + 1}`;
    setSessions((prev) =>
      prev.map((session) => {
        if (session.id === currentSessionId) {
          return {
            ...session,
            messages: [
              ...session.messages,
              {
                id: assistantMessageId,
                role: 'assistant',
                content: '',
                timestamp: new Date(),
              },
            ],
          };
        }
        return session;
      })
    );

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
        { message: lastUserMessage.content },
        {
          onDelta: (delta) => {
            // 更新助手消息
            setSessions((prev) => {
              const newSessions = [...prev];
              const sessionIndex = newSessions.findIndex((s) => s.id === currentSessionId);
              if (sessionIndex === -1) return prev;
              const session = newSessions[sessionIndex];
              const messages = [...session.messages];
              const lastMsg = messages[messages.length - 1];
              if (lastMsg && lastMsg.role === 'assistant') {
                messages[messages.length - 1] = { ...lastMsg, content: lastMsg.content + delta };
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
          if (session.id === currentSessionId) {
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

  // 菜单项
  const menuItems = [
    {
      key: 'chat',
      icon: <MessageOutlined />,
      label: '模型聊天',
    },
    {
      key: 'models',
      icon: <DashboardOutlined />,
      label: '模型配置管理',
    },
    {
      key: 'prompts',
      icon: <MessageOutlined />,
      label: '系统提示词管理',
    },
    {
      key: 'styles',
      icon: <ExperimentOutlined />,
      label: '风格配置管理',
    },
    {
      key: 'roles',
      icon: <RobotOutlined />,
      label: '角色模板管理',
    },
    {
      key: 'roundtable',
      icon: <SettingOutlined />,
      label: '圆桌配置管理',
    },
  ];

  const renderContent = () => {
    if (selectedMenu !== 'chat') {
      // 其他菜单项的渲染（简化处理，实际应该路由到对应页面）
      return (
        <div style={{ padding: 24 }}>
          <Card>
            <p>此功能正在开发中...</p>
            <Button onClick={() => setSelectedMenu('chat')}>返回聊天</Button>
          </Card>
        </div>
      );
    }

    return (
      <div style={{ display: 'flex', height: 'calc(100vh - 64px)' }}>
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
    <Layout style={{ minHeight: '100vh' }}>
      <AppHeader />
      <Layout>
        <Sider
          width={250}
          theme="light"
          style={{ borderRight: '1px solid #f0f0f0' }}
        >
          <div style={{ padding: '16px', borderBottom: '1px solid #f0f0f0' }}>
            <Text strong style={{ fontSize: 16 }}>
              配置管理
            </Text>
          </div>
          <Menu
            mode="inline"
            selectedKeys={[selectedMenu]}
            items={menuItems}
            onClick={({ key }) => setSelectedMenu(key as MenuKey)}
            style={{ borderRight: 0 }}
          />
        </Sider>
        <Content style={{ padding: 0, overflow: 'hidden' }}>
          {renderContent()}
        </Content>
      </Layout>
    </Layout>
  );
};

export default ModelChat;
