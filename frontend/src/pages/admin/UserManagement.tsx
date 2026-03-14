import React, { useState, useEffect } from 'react';
import {
  Table,
  Button,
  Modal,
  Form,
  Input,
  message,
  Space,
  Tag,
  Popconfirm,
  Pagination,
  Card,
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, KeyOutlined } from '@ant-design/icons';
import { getUsers, createUser, updateUser, deleteUser, resetUserPassword } from '../../api/users';
import type { User, UserCreate, UserUpdate } from '../../api/users';

const UserManagement: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [keyword, setKeyword] = useState('');

  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isPasswordModalVisible, setIsPasswordModalVisible] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [passwordTargetUser, setPasswordTargetUser] = useState<User | null>(null);
  const [form] = Form.useForm();
  const [passwordForm] = Form.useForm();

  useEffect(() => {
    fetchUsers();
  }, [page, pageSize, keyword]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const skip = (page - 1) * pageSize;
      const data = await getUsers(skip, pageSize, keyword);
      setUsers(data.users);
      setTotal(data.total);
    } catch (error) {
      message.error('获取用户列表失败');
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () => {
    setEditingUser(null);
    form.resetFields();
    setIsModalVisible(true);
  };

  const handleEdit = (record: User) => {
    setEditingUser(record);
    form.setFieldsValue({
      username: record.username,
      email: record.email,
      nickname: record.nickname,
      is_active: record.is_active,
      is_superuser: record.is_superuser,
    });
    setIsModalVisible(true);
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteUser(id);
      message.success('用户删除成功');
      fetchUsers();
    } catch (error: any) {
      message.error(error.response?.data?.detail || '删除失败');
    }
  };

  const handleResetPassword = (record: User) => {
    setPasswordTargetUser(record);
    passwordForm.resetFields();
    setIsPasswordModalVisible(true);
  };

  const handleModalOk = async () => {
    try {
      const values = await form.validateFields();
      if (editingUser) {
        const data: UserUpdate = {
          email: values.email,
          nickname: values.nickname,
          is_active: values.is_active,
          is_superuser: values.is_superuser,
        };
        await updateUser(editingUser.id, data);
        message.success('用户更新成功');
      } else {
        const data: UserCreate = {
          username: values.username,
          email: values.email,
          nickname: values.nickname,
          password: values.password,
        };
        await createUser(data);
        message.success('用户创建成功');
      }
      setIsModalVisible(false);
      fetchUsers();
    } catch (error: any) {
      message.error(error.response?.data?.detail || '操作失败');
    }
  };

  const handlePasswordModalOk = async () => {
    try {
      const values = await passwordForm.validateFields();
      if (passwordTargetUser) {
        await resetUserPassword(passwordTargetUser.id, values.new_password);
        message.success('密码重置成功');
      }
      setIsPasswordModalVisible(false);
    } catch (error: any) {
      message.error(error.response?.data?.detail || '密码重置失败');
    }
  };

  const handleSearch = (value: string) => {
    setKeyword(value);
    setPage(1);
  };

  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 60,
    },
    {
      title: '用户名',
      dataIndex: 'username',
      key: 'username',
    },
    {
      title: '邮箱',
      dataIndex: 'email',
      key: 'email',
    },
    {
      title: '昵称',
      dataIndex: 'nickname',
      key: 'nickname',
    },
    {
      title: '状态',
      dataIndex: 'is_active',
      key: 'is_active',
      render: (isActive: boolean) => (
        <Tag color={isActive ? 'green' : 'red'}>
          {isActive ? '正常' : '禁用'}
        </Tag>
      ),
    },
    {
      title: '管理员',
      dataIndex: 'is_superuser',
      key: 'is_superuser',
      render: (isSuperuser: boolean) => (
        <Tag color={isSuperuser ? 'gold' : 'default'}>
          {isSuperuser ? '是' : '否'}
        </Tag>
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (text: string) => new Date(text).toLocaleString('zh-CN'),
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: User) => (
        <Space>
          <Button
            type="link"
            icon={<KeyOutlined />}
            onClick={() => handleResetPassword(record)}
          >
            重置密码
          </Button>
          <Button
            type="link"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          >
            编辑
          </Button>
          <Popconfirm
            title="确定删除此用户吗？"
            onConfirm={() => handleDelete(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button type="link" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Card title="用户管理" extra={
      <Space>
        <Input.Search
          placeholder="搜索用户名/邮箱/昵称"
          onSearch={handleSearch}
          style={{ width: 250 }}
          allowClear
        />
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
          添加用户
        </Button>
      </Space>
    }>
      <Table
        columns={columns}
        dataSource={users}
        rowKey="id"
        loading={loading}
        pagination={false}
      />
      <div style={{ marginTop: 16, textAlign: 'right' }}>
        <Pagination
          current={page}
          pageSize={pageSize}
          total={total}
          onChange={(p, ps) => {
            setPage(p);
            setPageSize(ps);
          }}
          showSizeChanger
          showTotal={(t) => `共 ${t} 条`}
        />
      </div>

      <Modal
        title={editingUser ? '编辑用户' : '添加用户'}
        open={isModalVisible}
        onOk={handleModalOk}
        onCancel={() => setIsModalVisible(false)}
        width={500}
      >
        <Form
          form={form}
          layout="vertical"
        >
          <Form.Item
            name="username"
            label="用户名"
            rules={[
              { required: true, message: '请输入用户名' },
              { min: 3, message: '用户名至少3个字符' },
              { pattern: /^[a-zA-Z0-9]+$/, message: '只能包含字母和数字' },
            ]}
          >
            <Input disabled={!!editingUser} />
          </Form.Item>
          {!editingUser && (
            <Form.Item
              name="password"
              label="密码"
              rules={[
                { required: true, message: '请输入密码' },
                { min: 6, message: '密码至少6个字符' },
              ]}
            >
              <Input.Password />
            </Form.Item>
          )}
          <Form.Item
            name="email"
            label="邮箱"
            rules={[
              { required: true, message: '请输入邮箱' },
              { type: 'email', message: '请输入有效的邮箱地址' },
            ]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="nickname"
            label="昵称"
          >
            <Input />
          </Form.Item>
          {editingUser && (
            <>
              <Form.Item
                name="is_active"
                label="状态"
                valuePropName="checked"
              >
                <Input.Checkbox>启用</Input.Checkbox>
              </Form.Item>
              <Form.Item
                name="is_superuser"
                label="管理员"
                valuePropName="checked"
              >
                <Input.Checkbox>超级管理员</Input.Checkbox>
              </Form.Item>
            </>
          )}
        </Form>
      </Modal>

      <Modal
        title={`重置密码 - ${passwordTargetUser?.username}`}
        open={isPasswordModalVisible}
        onOk={handlePasswordModalOk}
        onCancel={() => setIsPasswordModalVisible(false)}
      >
        <Form form={passwordForm} layout="vertical">
          <Form.Item
            name="new_password"
            label="新密码"
            rules={[
              { required: true, message: '请输入新密码' },
              { min: 6, message: '密码至少6个字符' },
            ]}
          >
            <Input.Password />
          </Form.Item>
          <Form.Item
            name="confirm_password"
            label="确认密码"
            dependencies={['new_password']}
            rules={[
              { required: true, message: '请确认密码' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('new_password') === value) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error('两次输入的密码不一致'));
                },
              }),
            ]}
          >
            <Input.Password />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

export default UserManagement;
