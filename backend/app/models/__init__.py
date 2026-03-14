try:
    from backend.app.models.prompt import SysPrompt
    from backend.app.models.bot import Bot
    from backend.app.models.chat import ChatRoom, Message
    from backend.app.models.canvas import ConsensusCanvas
    from backend.app.models.llm import LLMConfig
    from backend.app.models.style import StyleConfig
    from backend.app.models.role_template import RoleTemplate
    from backend.app.models.roundtable_config import RoundtableConfig
    from backend.app.models.user import User, Role, UserConfig
except ImportError:
    from app.models.prompt import SysPrompt
    from app.models.bot import Bot
    from app.models.chat import ChatRoom, Message
    from app.models.canvas import ConsensusCanvas
    from app.models.llm import LLMConfig
    from app.models.style import StyleConfig
    from app.models.role_template import RoleTemplate
    from app.models.roundtable_config import RoundtableConfig
    from app.models.user import User, Role, UserConfig
