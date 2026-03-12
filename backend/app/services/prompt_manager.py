import os
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from backend.app.models.prompt import SysPrompt
from backend.app.core.config import settings

class PromptManager:
    @staticmethod
    async def get_prompt(p_key: str, db: AsyncSession) -> str:
        """
        Retrieves a prompt by key.
        If the content starts with 'file:', loads from the file system.
        Otherwise returns the content directly.
        """
        result = await db.execute(select(SysPrompt).where(SysPrompt.p_key == p_key))
        prompt_entry = result.scalars().first()
        
        if not prompt_entry:
            return ""

        content = prompt_entry.content.strip()
        if content.startswith("file:"):
            filename = content.split("file:")[1].strip()
            file_path = os.path.join(settings.PROMPT_BASE_PATH, filename)
            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    return f.read()
            except FileNotFoundError:
                return f"Error: Prompt file {filename} not found."
        
        return content

prompt_manager = PromptManager()
