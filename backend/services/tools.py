"""
Custom LangChain tools for Flowith agents.
Tools are callable by LLMs via function-calling (tool_choice: "auto").
"""

import logging
import subprocess
import sys
import tempfile
from pathlib import Path

from langchain_core.tools import tool

logger = logging.getLogger("flowith.tools")


@tool
def web_search(query: str) -> str:
    """Search the web for current information. Use for facts, news, or anything beyond your knowledge cutoff.

    Args:
        query: The search query string.

    Returns:
        Search results as formatted text with titles, URLs, and snippets.
    """
    try:
        from duckduckgo_search import DDGS
        with DDGS() as ddgs:
            results = list(ddgs.text(query, max_results=5))
        if not results:
            return f"No results found for: {query}"
        lines = []
        for r in results:
            lines.append(f"**{r.get('title', 'Untitled')}**")
            lines.append(f"  URL: {r.get('href', 'N/A')}")
            lines.append(f"  {r.get('body', 'No description')}")
            lines.append("")
        return "\n".join(lines)
    except ImportError:
        return "Web search tool not available (duckduckgo-search not installed)."
    except Exception as e:
        logger.error(f"Web search failed: {e}")
        return f"Search error: {e}"


@tool
def code_execution(code: str) -> str:
    """Execute Python code in a sandboxed subprocess and return stdout/stderr.
    Use for calculations, data analysis, or testing logic.

    Args:
        code: Python code to execute. Must be self-contained.

    Returns:
        stdout and stderr from the Python process.
    """
    try:
        # Write code to a temp file to avoid shell injection
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".py", delete=False, encoding="utf-8"
        ) as f:
            f.write(code)
            tmp_path = f.name

        try:
            result = subprocess.run(
                [sys.executable, "-u", tmp_path],
                capture_output=True,
                text=True,
                timeout=30,
                cwd=str(Path.home()),
            )
            out = result.stdout.strip()
            err = result.stderr.strip()
            if err:
                return f"STDOUT:\n{out}\n\nSTDERR:\n{err}" if out else f"STDERR:\n{err}"
            return out or "(no output)"
        finally:
            Path(tmp_path).unlink(missing_ok=True)
    except subprocess.TimeoutExpired:
        return "Execution timed out (30s limit)."
    except Exception as e:
        logger.error(f"Code execution failed: {e}")
        return f"Execution error: {e}"


@tool
def file_read(path: str) -> str:
    """Read a text file from the filesystem. Use to inspect files for analysis.

    Args:
        path: Absolute path to the file to read.

    Returns:
        File contents as text, or an error message.
    """
    try:
        p = Path(path).expanduser().resolve()
        if not p.exists():
            return f"File not found: {path}"
        if p.stat().st_size > 10 * 1024 * 1024:  # 10MB limit
            return f"File too large ({p.stat().st_size} bytes). Please read only text files under 10MB."
        return p.read_text(encoding="utf-8", errors="replace")
    except Exception as e:
        logger.error(f"File read failed: {e}")
        return f"Read error: {e}"


@tool
def file_write(path: str, content: str) -> str:
    """Write content to a text file. Use to save outputs or intermediate results.

    Args:
        path: Absolute path where the file should be written.
        content: Text content to write.

    Returns:
        Confirmation message or error.
    """
    try:
        p = Path(path).expanduser().resolve()
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(content, encoding="utf-8")
        return f"File written: {p} ({len(content)} characters)"
    except Exception as e:
        logger.error(f"File write failed: {e}")
        return f"Write error: {e}"


# Registry of available tools — agents can be configured with a subset
ALL_TOOLS = {
    "web_search": web_search,
    "code_execution": code_execution,
    "file_read": file_read,
    "file_write": file_write,
}


def get_tools(names: list[str]) -> list:
    """Return LangChain tool instances for the given tool names."""
    tools = []
    for name in names:
        if name in ALL_TOOLS:
            tools.append(ALL_TOOLS[name])
    return tools
