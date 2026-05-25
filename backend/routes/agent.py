"""Agent execution API — single agent call, tool-calling agents, and multi-agent orchestration."""

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

logger = logging.getLogger("flowith.agent")

router = APIRouter(tags=["agent"])


# ─── Request / Response models ──────────────────────────────────────

class AgentConfig(BaseModel):
    """Configuration for a single agent."""
    agent_id: str
    name: str
    provider: str = "local_ollama"  # local_ollama | cloud_openai | cloud_anthropic | cloud_gemini
    model_name: str
    system_prompt: str
    temperature: float = 0.4
    tools_allowed: list[str] = Field(default_factory=list)  # tool names the agent can use


class ExecuteRequest(BaseModel):
    """Request to execute a single agent call."""
    agent: AgentConfig
    prompt: str
    stream: bool = False


class ToolAgentRequest(BaseModel):
    """Request for tool-calling agent execution."""
    agent: AgentConfig
    prompt: str
    max_iterations: int = 10


class ToolAgentResult(BaseModel):
    """Result from a tool-calling agent execution."""
    output: str
    tool_calls: int = 0
    intermediate_steps: list[dict] = Field(default_factory=list)
    success: bool = True
    error: Optional[str] = None


class Collaborator(BaseModel):
    """An agent participating in multi-agent execution."""
    agent: AgentConfig
    role: str = "worker"  # worker | reviewer | summarizer
    instruction: str = ""


class CollaborationMode(str):
    SEQUENTIAL = "sequential"
    PARALLEL = "parallel"
    DEBATE = "debate"
    CRITIQUE = "critique"


class MultiAgentRequest(BaseModel):
    """Request for multi-agent collaboration."""
    collaborators: list[Collaborator]
    task: str  # the shared task description
    mode: str = "parallel"  # sequential | parallel | debate | critique


class AgentResult(BaseModel):
    """Result from a single agent execution."""
    agent_id: str
    agent_name: str
    output: str
    success: bool
    error: Optional[str] = None
    duration_ms: float = 0


class MultiAgentResult(BaseModel):
    """Result from multi-agent execution."""
    mode: str
    results: list[AgentResult]
    final_output: str
    success: bool
    total_duration_ms: float = 0


# ─── Single-agent execution ─────────────────────────────────────────

@router.post("/execute")
async def execute_agent(req: ExecuteRequest):
    """Execute a single agent call via the specified provider."""
    try:
        # Prefer LangChain for richer error handling and observability
        if req.agent.tools_allowed and len(req.agent.tools_allowed) > 0:
            result = await _call_agent_with_tools(req)
            return {**result, "via": "langchain_agent"}
        else:
            result = await _call_provider(req.agent, req.prompt)
            return {"output": result, "success": True, "via": "langchain"}
    except Exception as e:
        logger.error(f"Agent execution failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/execute/agent", response_model=ToolAgentResult)
async def execute_tool_agent(req: ToolAgentRequest):
    """Execute an agent with tool-calling capability via LangChain.

    The agent can autonomously decide which tools (web_search, code_execution,
    file_read, file_write) to use, in what order, and how to incorporate
    their results into the final answer.
    """
    try:
        result = await _call_agent_with_tools(req)
        return ToolAgentResult(
            output=result["output"],
            tool_calls=result["tool_calls"],
            intermediate_steps=result["intermediate_steps"],
            success=True,
        )
    except Exception as e:
        logger.error(f"Tool agent execution failed: {e}")
        return ToolAgentResult(
            output="",
            tool_calls=0,
            success=False,
            error=str(e),
        )


@router.post("/execute/langchain")
async def execute_via_langchain(req: ExecuteRequest):
    """Execute a single agent call through LangChain's ChatModel interface.

    Provides unified error handling, retry logic, and consistent output
    format across all providers.
    """
    try:
        output = await _call_via_langchain(req.agent, req.prompt)
        return {"output": output, "success": True, "via": "langchain"}
    except Exception as e:
        logger.error(f"LangChain execution failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ─── Provider dispatch ──────────────────────────────────────────────

async def _call_via_langchain(agent: AgentConfig, prompt: str) -> str:
    """Execute via LangChain unified interface."""
    from services.langchain_service import call_with_langchain
    return await call_with_langchain(
        provider=agent.provider,
        model_name=agent.model_name,
        system_prompt=agent.system_prompt,
        prompt=prompt,
        temperature=agent.temperature,
    )


async def _call_agent_with_tools(req: ToolAgentRequest | ExecuteRequest) -> dict:
    """Execute via LangChain tool-calling agent."""
    from services.langchain_service import call_agent_with_tools
    max_iter = getattr(req, "max_iterations", 10)
    return await call_agent_with_tools(
        provider=req.agent.provider,
        model_name=req.agent.model_name,
        system_prompt=req.agent.system_prompt,
        prompt=req.prompt,
        temperature=req.agent.temperature,
        tools_allowed=req.agent.tools_allowed or [],
        max_iterations=max_iter,
    )

async def _call_provider(agent: AgentConfig, prompt: str) -> str:
    """Route the call to the appropriate LLM provider."""
    from services.llm import call_ollama, call_cloud_openai, call_cloud_anthropic, call_cloud_gemini

    provider_map = {
        "local_ollama": call_ollama,
        "cloud_openai": call_cloud_openai,
        "cloud_anthropic": call_cloud_anthropic,
        "cloud_gemini": call_cloud_gemini,
    }

    handler = provider_map.get(agent.provider)
    if handler is None:
        raise ValueError(f"Unknown provider: {agent.provider}")

    return await handler(agent, prompt)


# ─── Multi-agent orchestration ──────────────────────────────────────

@router.post("/execute/multi")
async def execute_multi_agent(req: MultiAgentRequest):
    """Execute a multi-agent collaboration workflow."""
    import time
    start = time.time()

    try:
        if req.mode == "parallel":
            result = await _orchestrate_parallel(req)
        elif req.mode == "sequential":
            result = await _orchestrate_sequential(req)
        elif req.mode == "debate":
            result = await _orchestrate_debate(req)
        elif req.mode == "critique":
            result = await _orchestrate_critique(req)
        else:
            raise HTTPException(status_code=400, detail=f"Unknown mode: {req.mode}")

        result.total_duration_ms = (time.time() - start) * 1000
        return result

    except Exception as e:
        logger.error(f"Multi-agent execution failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


async def _execute_one(collaborator: Collaborator, prompt: str) -> AgentResult:
    """Execute one agent and return a structured result."""
    import time
    start = time.time()
    try:
        output = await _call_provider(collaborator.agent, prompt)
        return AgentResult(
            agent_id=collaborator.agent.agent_id,
            agent_name=collaborator.agent.name,
            output=output,
            success=True,
            duration_ms=(time.time() - start) * 1000,
        )
    except Exception as e:
        return AgentResult(
            agent_id=collaborator.agent.agent_id,
            agent_name=collaborator.agent.name,
            output="",
            success=False,
            error=str(e),
            duration_ms=(time.time() - start) * 1000,
        )


async def _orchestrate_parallel(req: MultiAgentRequest) -> MultiAgentResult:
    """All agents process the same input independently, results are merged."""
    import asyncio

    tasks = [_execute_one(c, req.task) for c in req.collaborators]
    results = await asyncio.gather(*tasks)

    # Merge outputs into a combined result
    parts = []
    for r in results:
        if r.success:
            parts.append(f"## {r.agent_name}\n{r.output}")
        else:
            parts.append(f"## {r.agent_name}\n[Error: {r.error}]")

    final = "\n\n".join(parts)
    success = all(r.success for r in results)

    return MultiAgentResult(
        mode="parallel",
        results=list(results),
        final_output=final,
        success=success,
    )


async def _orchestrate_sequential(req: MultiAgentRequest) -> MultiAgentResult:
    """Agents execute in order, each building on the previous output."""
    results: list[AgentResult] = []
    context = req.task

    for c in req.collaborators:
        prompt = f"{context}\n\n{c.instruction}" if c.instruction else context
        result = await _execute_one(c, prompt)
        results.append(result)
        if result.success:
            context = result.output  # next agent sees previous output
        else:
            break  # stop on failure

    final = results[-1].output if results and results[-1].success else ""
    success = all(r.success for r in results)

    return MultiAgentResult(
        mode="sequential",
        results=results,
        final_output=final,
        success=success,
    )


async def _orchestrate_debate(req: MultiAgentRequest) -> MultiAgentResult:
    """Agent A generates → Agent B critiques → Agent A revises → final output."""
    if len(req.collaborators) < 2:
        raise ValueError("Debate mode requires at least 2 collaborators")

    worker = req.collaborators[0]
    critic = req.collaborators[1]
    results: list[AgentResult] = []

    # Round 1: worker generates
    r1_prompt = f"{req.task}\n\n{worker.instruction}" if worker.instruction else req.task
    r1 = await _execute_one(worker, r1_prompt)
    results.append(r1)
    if not r1.success:
        return MultiAgentResult(mode="debate", results=results, final_output="", success=False)

    # Round 2: critic reviews
    critique_prompt = (
        f"Critically review the following output. Point out flaws, missing aspects, and areas for improvement.\n\n"
        f"Task: {req.task}\n\n"
        f"Output to review:\n{r1.output}"
    )
    if critic.instruction:
        critique_prompt = f"{critic.instruction}\n\n{critique_prompt}"
    r2 = await _execute_one(critic, critique_prompt)
    results.append(r2)

    # Round 3: worker revises based on critique
    revision_prompt = (
        f"Revise your original output based on the following critique. Address all valid points.\n\n"
        f"Original task: {req.task}\n\n"
        f"Your original output:\n{r1.output}\n\n"
        f"Critique:\n{r2.output if r2.success else 'Review unavailable'}\n\n"
        f"Please provide the revised, improved version."
    )
    r3 = await _execute_one(worker, revision_prompt)
    results.append(r3)

    final = r3.output if r3.success else r1.output
    return MultiAgentResult(
        mode="debate",
        results=results,
        final_output=final,
        success=r3.success or r1.success,
    )


async def _orchestrate_critique(req: MultiAgentRequest) -> MultiAgentResult:
    """Agent A generates → Agent B scores/reviews → retry if quality too low."""
    if len(req.collaborators) < 2:
        raise ValueError("Critique mode requires at least 2 collaborators")

    worker = req.collaborators[0]
    reviewer = req.collaborators[1]
    results: list[AgentResult] = []
    max_retries = 2

    for attempt in range(max_retries + 1):
        # Worker generates / revises
        if attempt == 0:
            prompt = f"{req.task}\n\n{worker.instruction}" if worker.instruction else req.task
        else:
            prompt = (
                f"Your previous output was rated as insufficient. "
                f"Please improve it based on this feedback:\n\n"
                f"{results[-1].output}\n\n"
                f"Original task: {req.task}"
            )
        r_gen = await _execute_one(worker, prompt)
        results.append(r_gen)
        if not r_gen.success:
            break

        # Reviewer evaluates
        review_prompt = (
            f"Evaluate the following output on a scale of 1-10. "
            f"If the score is below 7, provide specific, actionable feedback for improvement.\n\n"
            f"Task: {req.task}\n\n"
            f"Output to evaluate:\n{r_gen.output}\n\n"
            f"Respond with: SCORE: <number>\nFEEDBACK: <your feedback>"
        )
        if reviewer.instruction:
            review_prompt = f"{reviewer.instruction}\n\n{review_prompt}"
        r_rev = await _execute_one(reviewer, review_prompt)
        results.append(r_rev)

        if not r_rev.success:
            break

        # Parse score — look for "SCORE: N" pattern
        review_text = r_rev.output
        try:
            score_line = [l for l in review_text.split("\n") if "SCORE:" in l.upper()][0]
            score = float("".join(c for c in score_line.split(":")[1] if c.isdigit() or c == "."))
            if score >= 7:
                break  # quality is sufficient
        except (IndexError, ValueError):
            break  # can't parse score, assume done

    final = ""
    # Find the last worker output that succeeded
    for r in reversed(results):
        if r.agent_id == worker.agent.agent_id and r.success:
            final = r.output
            break

    return MultiAgentResult(
        mode="critique",
        results=results,
        final_output=final,
        success=any(r.success and r.agent_id == worker.agent.agent_id for r in results),
    )
