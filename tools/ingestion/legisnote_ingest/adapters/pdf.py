"""PDF fallback adapter (D1). Born-digital Czech PDFs have a clean text layer,
so OCR is rarely needed (docs/research-czech-legislation-data.md §6).

Pipeline: extract text (PyMuPDF) -> [optional] Claude structure pass (D10, user's
key) -> shared parser. The Claude pass only *structures* messy extracted text; it
does not rewrite the law. Requires the optional 'pdf' extra:  pip install -e '.[pdf]'
"""

from __future__ import annotations

from pathlib import Path

from ..config import settings
from ..ir import SourceKind
from .base import AcquiredDoc, LawRef

DEFAULT_MODEL = "claude-sonnet-4-6"  # cost-effective for structure extraction (D10)


class PdfAdapter:
    source_kind: SourceKind = "pdf"

    def __init__(self, pdf_path: Path, use_llm: bool = False, model: str = DEFAULT_MODEL) -> None:
        self.pdf_path = Path(pdf_path)
        self.use_llm = use_llm
        self.model = model

    def acquire(self, ref: LawRef) -> AcquiredDoc:
        raw = self.pdf_path.read_bytes()
        text = _extract_text(self.pdf_path)
        if self.use_llm:
            text = _claude_structure_pass(text, self.model)
        return AcquiredDoc(
            text=text,
            source_kind=self.source_kind,
            url=str(self.pdf_path),
            raw_bytes=raw,
            meta={"model": self.model if self.use_llm else ""},
        )


def _extract_text(pdf_path: Path) -> str:
    try:
        import fitz  # PyMuPDF
    except ImportError as exc:  # pragma: no cover - optional dep
        raise RuntimeError("PyMuPDF not installed. Install the 'pdf' extra.") from exc
    doc = fitz.open(pdf_path)
    return "\n".join(page.get_text("text") for page in doc)


def _claude_structure_pass(text: str, model: str) -> str:
    """Use Claude to normalize extracted text into clean, line-structured statute
    text the deterministic parser can consume. Kept minimal and offline-skippable."""
    if not settings.anthropic_api_key:
        raise RuntimeError("ANTHROPIC_API_KEY not set (D10); cannot run the Claude pass.")
    try:
        import anthropic  # type: ignore
    except ImportError as exc:  # pragma: no cover - optional dep
        raise RuntimeError("anthropic SDK not installed. Install the 'pdf' extra.") from exc

    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
    prompt = (
        "You are normalizing the text of a Czech statute extracted from a PDF. "
        "Re-emit the SAME text (do not paraphrase, summarize, or alter wording) with "
        "clean line structure so a parser can detect boundaries: each '§ N' on its own "
        "line, each odstavec '(n)' starting a line, each písmeno 'a)' starting a line, "
        "and headings (ČÁST/HLAVA/Oddíl) on their own lines. Output only the text.\n\n"
        f"{text}"
    )
    msg = client.messages.create(
        model=model,
        max_tokens=8192,
        messages=[{"role": "user", "content": prompt}],
    )
    return "".join(block.text for block in msg.content if block.type == "text")
