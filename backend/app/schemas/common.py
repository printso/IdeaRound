"""
通用响应 Schema
包含分页等通用响应模型
"""
from typing import Generic, TypeVar, List, Optional
from pydantic import BaseModel, Field

T = TypeVar("T")


class PageInfo(BaseModel):
    """分页信息"""
    total: int = Field(..., description="总记录数")
    page: int = Field(..., description="当前页码")
    page_size: int = Field(..., description="每页记录数")
    total_pages: int = Field(..., description="总页数")


class PaginatedResponse(BaseModel, Generic[T]):
    """通用分页响应"""
    items: List[T] = Field(..., description="数据列表")
    page_info: PageInfo = Field(..., description="分页信息")


class SuccessResponse(BaseModel):
    """通用成功响应"""
    success: bool = True
    message: Optional[str] = None


class ErrorResponse(BaseModel):
    """通用错误响应"""
    success: bool = False
    error: str
    message: Optional[str] = None
    request_id: Optional[str] = Field(None, description="请求 ID，用于问题追踪")
