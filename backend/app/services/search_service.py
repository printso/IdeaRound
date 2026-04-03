import httpx
from typing import List, Dict, Any, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

try:
    from backend.app.models.search_engine import SearchEngineConfig
    from backend.app.core.logger import app_logger
except ImportError:
    from app.models.search_engine import SearchEngineConfig
    from app.core.logger import app_logger

class SearchService:
    @staticmethod
    async def get_active_search_engine(db: AsyncSession) -> Optional[SearchEngineConfig]:
        """获取默认或第一个启用的搜索引擎"""
        # 先找默认且启用的
        result = await db.execute(
            select(SearchEngineConfig).where(
                SearchEngineConfig.is_enabled == True,
                SearchEngineConfig.is_default == True
            )
        )
        engine = result.scalars().first()
        
        if not engine:
            # 如果没有默认的，找第一个启用的
            result = await db.execute(
                select(SearchEngineConfig).where(SearchEngineConfig.is_enabled == True)
            )
            engine = result.scalars().first()
            
        return engine

    @staticmethod
    async def search(query: str, db: AsyncSession, limit: int = 5) -> List[Dict[str, Any]]:
        """执行搜索"""
        engine = await SearchService.get_active_search_engine(db)
        
        if not engine:
            app_logger.warning("未找到可用的搜索引擎配置")
            return []
            
        if engine.provider == "searxng":
            return await SearchService._search_searxng(query, engine, limit)
        else:
            app_logger.warning(f"不支持的搜索引擎类型: {engine.provider}")
            return []

    @staticmethod
    async def _search_searxng(query: str, config: SearchEngineConfig, limit: int) -> List[Dict[str, Any]]:
        """使用 SearXNG 搜索"""
        url = f"{config.base_url.rstrip('/')}/search"

        params = {
            "q": query,
            "format": "json",
            "engines": "bing,baidu,duckduckgo,360search (ZH),baidu (ZH),quark (ZH),sogou (ZH)",
            "language": "zh-CN"
        }

        # SearXNG 使用 token 查询参数进行认证，而非 Bearer 头
        if config.api_key:
            params["token"] = config.api_key

        headers = {
            "User-Agent": "IdeaRound-Bot/1.0"
        }

        try:
            async with httpx.AsyncClient(timeout=150.0, follow_redirects=True) as client:
                app_logger.info(f"SearXNG 请求: {url}, params: {params}")
                response = await client.get(url, params=params, headers=headers)
                response.raise_for_status()
                data = response.json()

                results = []
                for item in data.get("results", [])[:limit]:
                    results.append({
                        "title": item.get("title", ""),
                        "link": item.get("url", ""),
                        "snippet": item.get("content", ""),
                        "source": item.get("engine", "")
                    })
                return results
        except httpx.HTTPStatusError as e:
            app_logger.error(
                f"SearXNG 搜索失败: {e.response.status_code} {e.response.reason_phrase}, "
                f"URL: {e.request.url}, 响应内容: {e.response.text[:500]}"
            )
            return []
        except httpx.RequestError as e:
            app_logger.error(f"SearXNG 请求异常: {type(e).__name__}: {str(e)}")
            return []
        except Exception as e:
            app_logger.error(f"SearXNG 搜索失败: {str(e)}")
            return []
