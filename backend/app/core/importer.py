"""
通用导入辅助模块
解决模块导入路径兼容性问题
"""
import sys
from pathlib import Path

# 添加可能的根目录到路径
_root_paths = [
    Path(__file__).parent.parent.parent,  # backend/
    Path(__file__).parent.parent,         # backend/app/
    Path.cwd(),
]

for _path in _root_paths:
    if str(_path) not in sys.path:
        sys.path.insert(0, str(_path))


def import_with_fallback(module_path: str, fallback_path: str):
    """
    尝试导入模块，如果失败则尝试备用路径
    
    Args:
        module_path: 主要的模块路径 (如 backend.app.core.config)
        fallback_path: 备用模块路径 (如 app.core.config)
    
    Returns:
        导入的模块
    """
    try:
        return __import__(module_path, fromlist=[''])
    except ImportError:
        return __import__(fallback_path, fromlist=[''])
