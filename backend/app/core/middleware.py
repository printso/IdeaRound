"""
中间件模块
包含请求追踪、异常处理等中间件
"""
import uuid
import time
import traceback
from contextvars import ContextVar
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse
from typing import Callable

try:
    from backend.app.core.logger import app_logger
except ImportError:
    from app.core.logger import app_logger

# 请求 ID 上下文变量
request_id_ctx: ContextVar[str] = ContextVar("request_id", default="")


def get_request_id() -> str:
    """获取当前请求的 ID"""
    return request_id_ctx.get()


class RequestIDMiddleware(BaseHTTPMiddleware):
    """请求 ID 追踪中间件"""
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # 生成唯一请求 ID
        request_id = str(uuid.uuid4())[:8]
        request_id_ctx.set(request_id)
        
        # 将请求 ID 添加到响应头
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        
        return response


class LoggingMiddleware(BaseHTTPMiddleware):
    """请求日志中间件"""
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        start_time = time.time()
        request_id = get_request_id()
        
        # 记录请求开始
        app_logger.info(
            f"[{request_id}] {request.method} {request.url.path} - "
            f"Client: {request.client.host if request.client else 'unknown'}"
        )
        
        # 处理请求
        response = await call_next(request)
        
        # 计算耗时
        process_time = time.time() - start_time
        
        # 记录请求完成
        app_logger.info(
            f"[{request_id}] {request.method} {request.url.path} - "
            f"Status: {response.status_code} - "
            f"Time: {process_time:.3f}s"
        )
        
        # 添加处理时间到响应头
        response.headers["X-Process-Time"] = str(process_time)
        
        return response


class ExceptionHandlerMiddleware(BaseHTTPMiddleware):
    """全局异常处理中间件"""
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        try:
            return await call_next(request)
        except Exception as exc:
            request_id = get_request_id()
            
            # 记录异常
            app_logger.error(
                f"[{request_id}] Unhandled exception: {exc}\n"
                f"Traceback: {traceback.format_exc()}"
            )
            
            # 返回统一的错误响应
            return JSONResponse(
                status_code=500,
                content={
                    "error": "Internal Server Error",
                    "message": str(exc),
                    "request_id": request_id
                }
            )
