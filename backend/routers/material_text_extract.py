"""
Extract plain text from uploaded materials for curriculum import.

Supports: PDF, DOCX, plain text (txt/md/csv/html), and common images (JPEG/PNG/GIF/WEBP)
via OpenAI vision OCR. Legacy .doc is best-effort only.
"""
from __future__ import annotations

import base64
import io
import os
import re
from typing import Optional, Tuple

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".tif", ".tiff"}
IMAGE_MIMES = {
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/bmp",
    "image/tiff",
}
TEXT_EXTENSIONS = {".txt", ".md", ".markdown", ".csv", ".tsv", ".json", ".html", ".htm", ".rtf"}
DOCX_EXTENSIONS = {".docx"}
DOC_EXTENSIONS = {".doc"}
PDF_EXTENSIONS = {".pdf"}

_VISION_PROMPT = (
    "Extract all readable text from this syllabus, worksheet, or curriculum document image. "
    "Preserve structure: titles, unit/lesson headings, numbered and bulleted lists, and tables as plain text. "
    "Return plain text only — no markdown fences or commentary."
)


def _log(msg: str, **kwargs):
    context = " ".join([f"{k}={v!r}" for k, v in kwargs.items()])
    print(f"[MATERIAL-EXTRACT] {msg}{(' ' + context) if context else ''}")


def _ext(name: str) -> str:
    name = (name or "").lower().strip()
    if "." not in name:
        return ""
    return "." + name.rsplit(".", 1)[-1]


def classify_file(filename: str = "", mime: str = "") -> str:
    """Return one of: pdf, docx, doc, image, text, unknown."""
    mime = (mime or "").lower().strip()
    ext = _ext(filename)
    if mime == "application/pdf" or ext in PDF_EXTENSIONS:
        return "pdf"
    if (
        mime
        in {
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/docx",
        }
        or ext in DOCX_EXTENSIONS
    ):
        return "docx"
    if mime in {"application/msword", "application/doc"} or ext in DOC_EXTENSIONS:
        return "doc"
    if mime.startswith("image/") or mime in IMAGE_MIMES or ext in IMAGE_EXTENSIONS:
        return "image"
    if (
        mime.startswith("text/")
        or mime in {"application/json", "application/xml", "text/html", "text/csv"}
        or ext in TEXT_EXTENSIONS
    ):
        return "text"
    return "unknown"


def _extract_pdf(data: bytes) -> str:
    from pypdf import PdfReader

    reader = PdfReader(io.BytesIO(data))
    parts = []
    for page in reader.pages:
        parts.append(page.extract_text() or "")
    return "\n".join(parts).strip()


def _extract_docx(data: bytes) -> str:
    from docx import Document

    doc = Document(io.BytesIO(data))
    parts = []
    for para in doc.paragraphs:
        text = (para.text or "").strip()
        if text:
            parts.append(text)
    for table in doc.tables:
        for row in table.rows:
            cells = [(c.text or "").strip() for c in row.cells]
            line = " | ".join([c for c in cells if c])
            if line:
                parts.append(line)
    return "\n".join(parts).strip()


def _extract_plain_text(data: bytes) -> str:
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError:
        text = data.decode("latin-1", errors="ignore")
    # Strip HTML tags lightly when content looks like HTML
    stripped = text.strip()
    if stripped.lower().startswith("<!doctype") or "<html" in stripped[:300].lower():
        try:
            from bs4 import BeautifulSoup

            return BeautifulSoup(stripped, "html.parser").get_text("\n").strip()
        except Exception:
            pass
    return stripped


def _maybe_downscale_image(data: bytes, mime: str) -> Tuple[bytes, str]:
    """Downscale huge images so vision APIs accept them."""
    try:
        from PIL import Image

        img = Image.open(io.BytesIO(data))
        img = img.convert("RGB") if img.mode not in ("RGB", "L") else img
        max_side = 2048
        w, h = img.size
        if max(w, h) > max_side:
            scale = max_side / float(max(w, h))
            img = img.resize((int(w * scale), int(h * scale)), Image.Resampling.LANCZOS)
        out = io.BytesIO()
        fmt = "JPEG" if mime in {"image/jpeg", "image/jpg"} else "PNG"
        if fmt == "JPEG":
            img = img.convert("RGB")
            img.save(out, format="JPEG", quality=85, optimize=True)
            return out.getvalue(), "image/jpeg"
        img.save(out, format="PNG", optimize=True)
        return out.getvalue(), "image/png"
    except Exception as e:
        _log("image.downscale.skip", error=str(e))
        return data, mime or "image/jpeg"


async def _extract_image_via_vision(data: bytes, mime: str) -> str:
    api_key = (os.environ.get("OPENAI_API_KEY") or "").strip()
    if not api_key:
        raise ValueError("OPENAI_API_KEY required to read text from images")

    from openai import AsyncOpenAI

    payload, out_mime = _maybe_downscale_image(data, mime or "image/jpeg")
    # Cap payload ~8MB base64-ish
    if len(payload) > 6_000_000:
        payload, out_mime = _maybe_downscale_image(payload, out_mime)

    data_url = f"data:{out_mime};base64,{base64.b64encode(payload).decode('ascii')}"
    client = AsyncOpenAI(api_key=api_key)
    model = (os.environ.get("CURRICULUM_VISION_MODEL") or "gpt-4o-mini").strip()
    response = await client.chat.completions.create(
        model=model,
        messages=[
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": _VISION_PROMPT},
                    {"type": "image_url", "image_url": {"url": data_url}},
                ],
            }
        ],
        max_tokens=4000,
        temperature=0,
    )
    content = (response.choices[0].message.content or "").strip()
    # Drop accidental fences
    content = re.sub(r"^```(?:text|plain)?\s*", "", content)
    content = re.sub(r"\s*```$", "", content)
    return content.strip()


async def extract_bytes_to_text(
    data: bytes,
    *,
    filename: str = "",
    mime: str = "",
) -> str:
    """
    Extract readable text from file bytes.
    Raises ValueError when the type is unsupported or extraction yields nothing useful.
    """
    if not data:
        raise ValueError("Empty file")

    kind = classify_file(filename, mime)
    # Magic-byte overrides when mime/filename missing
    if kind == "unknown":
        if data[:4] == b"%PDF":
            kind = "pdf"
        elif data[:2] == b"PK" and (filename.lower().endswith(".docx") or not filename):
            # zip container — likely docx/xlsx; try docx
            kind = "docx"
        elif data[:3] in (b"\xff\xd8\xff",) or data[:8] == b"\x89PNG\r\n\x1a\n":
            kind = "image"

    _log("extract.start", kind=kind, mime=mime, filename=filename, bytes=len(data))

    if kind == "pdf":
        text = _extract_pdf(data)
    elif kind == "docx":
        text = _extract_docx(data)
    elif kind == "doc":
        # Legacy Word binary — no reliable lightweight parser in stack.
        raise ValueError(
            "Legacy .doc files aren't supported yet. Please re-save as .docx or PDF, or paste the text."
        )
    elif kind == "image":
        text = await _extract_image_via_vision(data, mime or "image/jpeg")
    elif kind == "text":
        text = _extract_plain_text(data)
    else:
        # Last resort: try UTF-8 text
        try:
            text = _extract_plain_text(data)
            if len(text.strip()) < 20 or sum(1 for c in text[:200] if ord(c) < 9) > 10:
                raise ValueError("binary")
        except Exception:
            raise ValueError(
                f"Unsupported file type for curriculum extract ({mime or filename or 'unknown'}). "
                "Use PDF, DOCX, TXT, or an image (JPEG/PNG/GIF/WEBP)."
            )

    text = (text or "").strip()
    if not text:
        raise ValueError("No readable text found in this file")
    _log("extract.success", kind=kind, text_length=len(text))
    return text


async def download_storage_bytes(bucket: str, path: str) -> bytes:
    try:
        from supabase_client import get_admin_client
    except ImportError:
        from backend.supabase_client import get_admin_client  # type: ignore

    supa = get_admin_client()
    _log("storage.download.start", bucket=bucket, path=path)
    data = supa.storage.from_(bucket).download(path)
    if not isinstance(data, (bytes, bytearray)):
        data = bytes(data)
    _log("storage.download.success", byte_length=len(data))
    return data


async def extract_text_from_storage(
    bucket: str,
    path: str,
    *,
    filename: str = "",
    mime: str = "",
) -> str:
    data = await download_storage_bytes(bucket, path)
    name = filename or path.rsplit("/", 1)[-1]
    return await extract_bytes_to_text(data, filename=name, mime=mime)
