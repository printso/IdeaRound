// Generated with Engineering Prompt v2026.04 - Quality & Efficiency Enforced
import { Button, Dropdown, Input, List, Space } from 'antd';
import type { RoundtableRoom } from '../../hooks/useWorkspace';

export interface WorkspaceSiderProps {
  rooms: RoundtableRoom[];
  currentRoomId: string;
  editingRoomId: string | null;
  onSelectRoom: (room: RoundtableRoom) => void;
  onCreateRoom: () => void;
  onStartEditingName: (roomId: string, e: React.MouseEvent) => void;
  onSaveRoomName: (roomId: string, name: string) => void;
  onDeleteRoom: (roomId: string, e: React.MouseEvent) => void;
  formatRoomDisplayName: (room: RoundtableRoom, index: number) => string;
}

export function WorkspaceSider({
  rooms,
  currentRoomId,
  editingRoomId,
  onSelectRoom,
  onCreateRoom,
  onStartEditingName,
  onSaveRoomName,
  onDeleteRoom,
  formatRoomDisplayName,
}: WorkspaceSiderProps) {
  return (
    <>
      <div style={{ padding: '16px', borderBottom: '1px solid #f0f0f0' }}>
        <Space direction="vertical" size="small" style={{ width: '100%' }}>
          <Button type="primary" icon={<span>+</span>} onClick={onCreateRoom} block>
            新建圆桌空间
          </Button>
        </Space>
      </div>
      <div style={{ maxHeight: 'calc(100dvh - 64px - 80px)', overflowY: 'auto' }}>
        <List
          dataSource={rooms}
          renderItem={(room) => {
            const isSelected = currentRoomId === room.id;
            const roomIndex = rooms.findIndex((item) => item.id === room.id) + 1;

            return (
              <List.Item
                key={room.id}
                onClick={() => onSelectRoom(room)}
                className={`roundtable-list-item ${isSelected ? 'selected' : ''}`}
                style={{
                  padding: '12px 16px',
                  cursor: 'pointer',
                  background: isSelected ? 'linear-gradient(135deg, #f0f7ff 0%, #e6f7ff 100%)' : '#fff',
                  borderLeft: isSelected ? '4px solid #1677ff' : '4px solid transparent',
                  marginBottom: 8,
                  borderRadius: 12,
                  border: isSelected ? '1px solid #bae0ff' : '1px solid #f0f0f0',
                  boxShadow: isSelected
                    ? '0 2px 8px rgba(22, 119, 255, 0.12)'
                    : '0 1px 3px rgba(0, 0, 0, 0.04)',
                  transition: 'all 0.2s ease-in-out',
                }}
                actions={[
                  <Dropdown
                    key="settings"
                    menu={{
                      items: [
                        {
                          key: 'edit',
                          label: '编辑空间名称',
                          icon: <span style={{ fontSize: 12, color: '#1677ff' }}>✏️</span>,
                          onClick: (e) => {
                            e.domEvent.stopPropagation();
                            onStartEditingName(room.id, e.domEvent as React.MouseEvent);
                          },
                        },
                        {
                          key: 'delete',
                          label: '删除空间',
                          icon: <span style={{ fontSize: 12, color: '#ff4d4f' }}>🗑️</span>,
                          danger: true,
                          onClick: (e) => {
                            e.domEvent.stopPropagation();
                            onDeleteRoom(room.id, e.domEvent as React.MouseEvent);
                          },
                        },
                      ],
                    }}
                    trigger={['click']}
                    placement="bottomRight"
                  >
                    <Button
                      type="text"
                      size="small"
                      style={{
                        padding: '0',
                        fontSize: 16,
                        height: 24,
                        width: 24,
                        minWidth: 24,
                        color: isSelected ? '#1677ff' : '#8c8c8c',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: 4,
                        transition: 'all 0.2s ease-in-out',
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="roundtable-settings-button"
                    >
                      <span
                        style={{
                          fontSize: 20,
                          lineHeight: 1,
                          transform: 'translateY(-2px)',
                          fontWeight: 500,
                        }}
                      >
                        ⋯
                      </span>
                    </Button>
                  </Dropdown>,
                ]}
              >
                <List.Item.Meta
                  title={
                    editingRoomId === room.id ? (
                      <Input
                        defaultValue={room.name}
                        size="small"
                        onBlur={(e) => onSaveRoomName(room.id, e.target.value)}
                        onPressEnter={(e) => onSaveRoomName(room.id, e.currentTarget.value)}
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                        style={{ width: '100%' }}
                      />
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                        <div
                          style={{
                            width: 24,
                            height: 24,
                            borderRadius: 6,
                            background: isSelected ? '#1677ff' : '#f0f0f0',
                            color: isSelected ? '#fff' : '#8c8c8c',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 12,
                            fontWeight: 600,
                            flexShrink: 0,
                          }}
                        >
                          #{roomIndex}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden',
                              fontSize: 14,
                              fontWeight: 600,
                              lineHeight: 1.4,
                              color: isSelected ? '#1677ff' : '#262626',
                            }}
                          >
                            {formatRoomDisplayName(room, roomIndex - 1)}
                          </div>
                        </div>
                      </div>
                    )
                  }
                  description={<div style={{ marginTop: 4 }}></div>}
                />
              </List.Item>
            );
          }}
        />
      </div>
    </>
  );
}
