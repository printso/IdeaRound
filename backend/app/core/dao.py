"""
数据库工具模块
提供分页等通用数据库操作
"""
from typing import TypeVar, Generic, Type, List, Optional
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.database import Base

ModelType = TypeVar("ModelType", bound=Base)


class BaseDAO(Generic[ModelType]):
    """
    基础数据访问对象
    提供通用的数据库操作
    """
    
    def __init__(self, model: Type[ModelType], db: AsyncSession):
        self.model = model
        self.db = db
    
    async def get(self, id: int) -> Optional[ModelType]:
        """根据 ID 获取单条记录"""
        result = await self.db.execute(
            select(self.model).where(self.model.id == id)
        )
        return result.scalars().first()
    
    async def get_all(
        self,
        skip: int = 0,
        limit: int = 100,
        filters: Optional[List] = None
    ) -> List[ModelType]:
        """获取多条记录"""
        query = select(self.model)
        
        if filters:
            query = query.where(*filters)
        
        query = query.offset(skip).limit(limit)
        
        result = await self.db.execute(query)
        return list(result.scalars().all())
    
    async def count(self, filters: Optional[List] = None) -> int:
        """统计记录数"""
        query = select(func.count(self.model.id))
        
        if filters:
            query = query.where(*filters)
        
        result = await self.db.execute(query)
        return result.scalar() or 0
    
    async def get_paginated(
        self,
        page: int = 1,
        page_size: int = 20,
        filters: Optional[List] = None
    ) -> tuple[List[ModelType], int]:
        """
        分页获取记录
        
        Returns:
            (items, total): 数据列表和总记录数
        """
        # 计算总数
        total = await self.count(filters)
        
        # 计算偏移量
        skip = (page - 1) * page_size
        
        # 获取数据
        items = await self.get_all(skip=skip, limit=page_size, filters=filters)
        
        return items, total
    
    async def create(self, **kwargs) -> ModelType:
        """创建记录"""
        db_obj = self.model(**kwargs)
        self.db.add(db_obj)
        await self.db.commit()
        await self.db.refresh(db_obj)
        return db_obj
    
    async def update(
        self,
        id: int,
        **kwargs
    ) -> Optional[ModelType]:
        """更新记录"""
        db_obj = await self.get(id)
        if not db_obj:
            return None
        
        for key, value in kwargs.items():
            if hasattr(db_obj, key):
                setattr(db_obj, key, value)
        
        await self.db.commit()
        await self.db.refresh(db_obj)
        return db_obj
    
    async def delete(self, id: int) -> bool:
        """删除记录"""
        db_obj = await self.get(id)
        if not db_obj:
            return False
        
        await self.db.delete(db_obj)
        await self.db.commit()
        return True
