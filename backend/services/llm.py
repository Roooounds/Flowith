"""
LLM provider implementations — Ollama (local) and cloud APIs.
All calls are async via httpx, with timeout and error handling.
"""

import asyncio
import json
import logging
import os
from typing import Any

import httpx

logger = logging.getLogger("flowith.llm")

OLLAMA_BASE = os.environ.get("OLLAMA_HOST", "http://localhost:11434")
REQUEST_TIMEOUT = 120  # seconds


# ─── Ollama (local) ─────────────────────────────────────────────────

async def call_ollama(agent: Any, prompt: str) -> str:
    """Call Ollama chat API (compatible with /api/chat)."""
    url = f"{OLLAMA_BASE}/api/chat"
    payload = {
        "model": agent.model_name,
        "messages": [
            {"role": "system", "content": agent.system_prompt},
            {"role": "user", "content": prompt},
        ],
        "stream": False,
        "options": {
            "temperature": agent.temperature,
        },
    }

    async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
        resp = await client.post(url, json=payload)
        resp.raise_for_status()
        data = resp.json()
        return data.get("message", {}).get("content", "")


# ─── OpenAI-compatible (cloud) ──────────────────────────────────────

async def call_cloud_openai(agent: Any, prompt: str) -> str:
    """Call OpenAI or any OpenAI-compatible API (DeepSeek, etc.)."""
    from routes.agent import AgentConfig
    agent_cfg: AgentConfig = agent

    # Model config is stored in the app settings — passed via environment
    # or constructor. For now, use environment variables.
    api_key = os.environ.get("OPENAI_API_KEY", "")
    base_url = os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1")

    url = f"{base_url}/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": agent_cfg.model_name,
        "messages": [
            {"role": "system", "content": agent_cfg.system_prompt},
            {"role": "user", "content": prompt},
        ],
        "temperature": agent_cfg.temperature,
        "stream": False,
    }

    async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
        resp = await client.post(url, json=payload, headers=headers)
        resp.raise_for_status()
        data = resp.json()
        return data["choices"][0]["message"]["content"]


# ─── Anthropic (cloud) ─────────────────────────────────────────────

async def call_cloud_anthropic(agent: Any, prompt: str) -> str:
    """Call Anthropic Messages API."""
    from routes.agent import AgentConfig
    agent_cfg: AgentConfig = agent

    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    base_url = os.environ.get("ANTHROPIC_BASE_URL", "https://api.anthropic.com/v1")

    url = f"{base_url}/messages"
    headers = {
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
    }
    payload = {
        "model": agent_cfg.model_name,
        "max_tokens": 4096,
        "system": agent_cfg.system_prompt,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": agent_cfg.temperature,
    }

    async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
        resp = await client.post(url, json=payload, headers=headers)
        resp.raise_for_status()
        data = resp.json()
        return data["content"][0]["text"]


# ─── Gemini (cloud) ────────────────────────────────────────────────

async def call_cloud_gemini(agent: Any, prompt: str) -> str:
    """Call Google Gemini API."""
    from routes.agent import AgentConfig
    agent_cfg: AgentConfig = agent

    api_key = os.environ.get("GEMINI_API_KEY", "")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{agent_cfg.model_name}:generateContent?key={api_key}"

    payload = {
        "system_instruction": {"parts": [{"text": agent_cfg.system_prompt}]},
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": agent_cfg.temperature},
    }

    async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
        resp = await client.post(url, json=payload)
        resp.raise_for_status()
        data = resp.json()
        return data["candidates"][0]["content"]["parts"][0]["text"]
