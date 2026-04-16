import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button, Result, Space } from 'antd';

type ErrorBoundaryProps = {
  children: ReactNode;
};

type ErrorBoundaryState = {
  hasError: boolean;
};

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('UI 崩溃:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Result
            status="error"
            title="页面出现异常"
            subTitle="请刷新页面重试。若问题持续出现，请稍后再试。"
            extra={
              <Space wrap>
                <Button type="primary" onClick={() => window.location.reload()}>
                  刷新页面
                </Button>
                <Button onClick={() => (window.location.href = '/login')}>
                  重新登录
                </Button>
              </Space>
            }
          />
        </div>
      );
    }

    return this.props.children;
  }
}

