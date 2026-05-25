"""
LangChain integration layer — unified LLM abstraction and tool-calling agents.

Replaces the raw HTTP calls in services/llm.py with LangChain's ChatModel
interface, adding:
- Unified interface for all providers (Ollama, OpenAI, Anthropic, Gemini)
- Tool-calling agents (ReAct / function-calling)
- Structured output parsing
- Retry and fallback logic
"""

import logging
import os
from typing import Any, Optional

from langchain_core.language_models import BaseChatModel
from langchain_core.messages import HumanMessage, SystemMessage, AIMessage

from services.tools import get_tools

logger = logging.getLogger("flowith.langchain")

OLLAMA_BASE = os.environ.get("OLLAMA_HOST", "http://localhost:11434")
REQUEST_TIMEOUT = 120


def _build_chat_model(
    provider: str,
    model_name: str,
    temperature: float = 0.4,
) -> BaseChatModel:
    """Build a LangChain ChatModel for the given provider.

    Returns a configured ChatModel instance ready for .invoke() calls.
    """
    if provider == "local_ollama":
        from langchain_ollama import ChatOllama
        return ChatOllama(
            model=model_name,
            temperature=temperature,
            base_url=OLLAMA_BASE,
            timeout=REQUEST_TIMEOUT,
        )

    elif provider == "cloud_openai":
        from langchain_openai import ChatOpenAI
        return ChatOpenAI(
            model=model_name,
            temperature=temperature,
            openai_api_key=os.environ.get("OPENAI_API_KEY", ""),
            openai_api_base=os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1"),
            timeout=REQUEST_TIMEOUT,
        )

    elif provider == "cloud_anthropic":
        from langchain_anthropic import ChatAnthropic
        return ChatAnthropic(
            model=model_name,
            temperature=temperature,
            anthropic_api_key=os.environ.get("ANTHROPIC_API_KEY", ""),
            timeout=REQUEST_TIMEOUT,
            max_tokens=4096,
        )

    elif provider == "cloud_gemini":
        from langchain_google_genai import ChatGoogleGenerativeAI
        return ChatGoogleGenerativeAI(
            model=model_name,
            temperature=temperature,
            google_api_key=os.environ.get("GEMINI_API_KEY", ""),
            timeout=REQUEST_TIMEOUT,
        )

    else:
        raise ValueError(f"Unknown provider: {provider}")


async def call_with_langchain(
    provider: str,
    model_name: str,
    system_prompt: str,
    prompt: str,
    temperature: float = 0.4,
) -> str:
    """Execute a single LLM call through LangChain's ChatModel interface.

    This is the LangChain equivalent of services/llm.py call_*() functions,
    providing a unified interface with better error handling.
    """
    model = _build_chat_model(provider, model_name, temperature)
    messages = [
        SystemMessage(content=system_prompt),
        HumanMessage(content=prompt),
    ]
    try:
        response = await model.ainvoke(messages)
        content = response.content
        if isinstance(content, list):
            # Some models return content as a list of blocks
            return "".join(
                block.get("text", "") if isinstance(block, dict) else str(block)
                for block in content
            )
        return str(content) if content else ""
    except Exception as e:
        logger.error(f"LangChain call failed for {provider}/{model_name}: {e}")
        raise


async def call_agent_with_tools(
    provider: str,
    model_name: str,
    system_prompt: str,
    prompt: str,
    temperature: float = 0.4,
    tools_allowed: Optional[list[str]] = None,
    max_iterations: int = 10,
) -> dict:
    """Execute a tool-calling agent through LangGraph's React agent.

    The agent can autonomously decide which tools to call, in what order,
    and how to use their outputs to answer the user's prompt.

    Uses langgraph.prebuilt.create_react_agent (LangChain 0.3+ API).
    Falls back gracefully if langgraph is not installed.
    """
    model = _build_chat_model(provider, model_name, temperature)

    if tools_allowed and len(tools_allowed) > 0:
        tools = get_tools(tools_allowed)
    else:
        tools = []

    if not tools:
        # No tools — fall back to simple chat via LangChain
        result = await call_with_langchain(provider, model_name, system_prompt, prompt, temperature)
        return {"output": result, "intermediate_steps": [], "tool_calls": 0}

    # Use langgraph's create_react_agent (LangChain 0.3+ API)
    try:
        from langgraph.prebuilt import create_react_agent
    except ImportError:
        logger.warning("langgraph not available, falling back to simple chat")
        result = await call_with_langchain(provider, model_name, system_prompt, prompt, temperature)
        return {"output": result, "intermediate_steps": [], "tool_calls": 0}

    try:
        agent = create_react_agent(
            model=model,
            tools=tools,
            prompt=system_prompt,
        )

        result = await agent.ainvoke({
            "messages": [HumanMessage(content=prompt)],
        })

        # Extract final output from the message chain
        messages = result.get("messages", [])
        tool_calls_count = sum(1 for m in messages if isinstance(m, AIMessage) and hasattr(m, "tool_calls") and m.tool_calls)

        # Build intermediate steps from tool messages
        intermediate_steps = []
        for m in messages:
            if hasattr(m, "tool_calls") and m.tool_calls:
                for tc in m.tool_calls:
                    intermediate_steps.append({
                        "tool": tc.get("name", "unknown"),
                        "tool_input": str(tc.get("args", {})),
                        "observation": "",
                    })

        # Find the final AI message (last one without tool calls)
        final_output = ""
        for m in reversed(messages):
            if isinstance(m, AIMessage) and m.content and (not hasattr(m, "tool_calls") or not m.tool_calls):
                final_output = str(m.content)
                break
        if not final_output:
            # Fallback: use the last message
            last = messages[-1]
            final_output = str(last.content) if hasattr(last, "content") else str(last)

        return {
            "output": final_output,
            "intermediate_steps": intermediate_steps,
            "tool_calls": tool_calls_count,
        }
    except Exception as e:
        logger.error(f"Agent execution failed for {provider}/{model_name}: {e}")
        raise
