"""
FastAPI routes for Content, Media & Attachments (Infinite Library Mode)
Handles PDF extraction, video embedding, external links, folders, portfolio enhancements
"""
from fastapi import APIRouter, HTTPException, Depends, Query, UploadFile, File
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
import sys
from pathlib import Path
import io
import json

# Add parent directory to path
backend_dir = Path(__file__).parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from auth import get_current_user, rate_limiter
from helpers import get_family_id_for_user, child_belongs_to_family
from logger import log_event
from supabase_client import get_admin_client
from routers.util import get_file_text_from_storage

router = APIRouter(prefix="/api/content", tags=["content"])


# ============================================================
# PDF Extraction & Copy/Paste
# ============================================================

class ExtractPDFTextInput(BaseModel):
    upload_id: str
    bucket: str = "evidence"


class ExtractPDFTextOut(BaseModel):
    success: bool
    text: Optional[str] = None
    pages: int = 0
    error: Optional[str] = None


@router.post("/extract-pdf-text", response_model=ExtractPDFTextOut)
async def extract_pdf_text(
    input: ExtractPDFTextInput,
    user: dict = Depends(get_current_user),
    rate_limit: None = Depends(rate_limiter)
):
    """Extract text from PDF for copy/paste functionality"""
    try:
        supabase = get_admin_client()
        
        # Get upload record
        upload_result = supabase.table("uploads").select("storage_path, family_id").eq("id", input.upload_id).single().execute()
        if not upload_result.data:
            raise HTTPException(status_code=404, detail="Upload not found")
        
        upload = upload_result.data
        family_id = upload["family_id"]
        
        # Verify access
        if not get_family_id_for_user(user["id"]) == family_id:
            raise HTTPException(status_code=403, detail="Access denied")
        
        # Extract text from PDF
        try:
            text = await get_file_text_from_storage(input.bucket, upload["storage_path"])
            
            # Count pages (rough estimate: count page breaks)
            pages = text.count("\f") + 1 if text else 0
            
            # Index for search
            try:
                supabase.table("pdf_search_index").upsert({
                    "upload_id": input.upload_id,
                    "family_id": family_id,
                    "extracted_text": text,
                    "page_numbers": list(range(1, pages + 1))
                }, on_conflict="upload_id").execute()
            except Exception as e:
                print(f"Warning: Failed to index PDF: {e}")
            
            return ExtractPDFTextOut(success=True, text=text, pages=pages)
        except Exception as e:
            return ExtractPDFTextOut(success=False, error=str(e))
    
    except HTTPException:
        raise
    except Exception as e:
        log_event("error", error=str(e), endpoint="extract_pdf_text")
        raise HTTPException(status_code=500, detail=f"Error extracting PDF text: {str(e)}")


class SearchPDFsInput(BaseModel):
    search_query: str
    child_id: Optional[str] = None
    limit: int = 50


class PDFSearchResult(BaseModel):
    upload_id: str
    title: str
    storage_path: str
    child_id: Optional[str]
    snippet: str
    relevance: float


class SearchPDFsOut(BaseModel):
    results: List[PDFSearchResult]


@router.post("/search-pdfs", response_model=SearchPDFsOut)
async def search_pdfs(
    input: SearchPDFsInput,
    user: dict = Depends(get_current_user),
    rate_limit: None = Depends(rate_limiter)
):
    """Full-text search inside PDFs"""
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(status_code=404, detail="Family not found")
        
        supabase = get_admin_client()
        
        # Call database function
        result = supabase.rpc("search_pdfs", {
            "_family_id": family_id,
            "_search_query": input.search_query,
            "_child_id": input.child_id,
            "_limit": input.limit
        }).execute()
        
        if not result.data:
            return SearchPDFsOut(results=[])
        
        return SearchPDFsOut(results=[PDFSearchResult(**r) for r in result.data])
    
    except HTTPException:
        raise
    except Exception as e:
        log_event("error", error=str(e), endpoint="search_pdfs")
        raise HTTPException(status_code=500, detail=f"Error searching PDFs: {str(e)}")


# ============================================================
# Auto-Captioning and Tagging
# ============================================================

class AutoCaptionInput(BaseModel):
    upload_id: str
    image_url: Optional[str] = None  # For images
    text_content: Optional[str] = None  # For PDFs/text


class AutoCaptionOut(BaseModel):
    success: bool
    caption: Optional[str] = None
    tags: List[str] = []
    metadata: Dict[str, Any] = {}
    error: Optional[str] = None


@router.post("/auto-caption", response_model=AutoCaptionOut)
async def auto_caption(
    input: AutoCaptionInput,
    user: dict = Depends(get_current_user),
    rate_limit: None = Depends(rate_limiter)
):
    """Generate auto-caption and tags for uploaded content using AI"""
    try:
        supabase = get_admin_client()
        
        # Get upload record
        upload_result = supabase.table("uploads").select("family_id, mime, title").eq("id", input.upload_id).single().execute()
        if not upload_result.data:
            raise HTTPException(status_code=404, detail="Upload not found")
        
        upload = upload_result.data
        family_id = upload["family_id"]
        
        # Verify access
        if not get_family_id_for_user(user["id"]) == family_id:
            raise HTTPException(status_code=403, detail="Access denied")
        
        # Use LLM to generate caption and tags
        try:
            from llm import llm_generate_caption_and_tags
            
            caption, tags, metadata = await llm_generate_caption_and_tags(
                mime_type=upload["mime"],
                title=upload["title"],
                image_url=input.image_url,
                text_content=input.text_content
            )
            
            # Update upload record
            supabase.table("uploads").update({
                "auto_caption": caption,
                "auto_tags": tags,
                "ai_metadata": metadata,
                "extracted_at": "now()"
            }).eq("id", input.upload_id).execute()
            
            return AutoCaptionOut(success=True, caption=caption, tags=tags, metadata=metadata)
        except ImportError:
            # Fallback: simple caption from title
            caption = upload["title"]
            tags = []
            return AutoCaptionOut(success=True, caption=caption, tags=tags, metadata={})
        except Exception as e:
            return AutoCaptionOut(success=False, error=str(e))
    
    except HTTPException:
        raise
    except Exception as e:
        log_event("error", error=str(e), endpoint="auto_caption")
        raise HTTPException(status_code=500, detail=f"Error generating caption: {str(e)}")


# ============================================================
# Magic Extract: AI PDF Parsing
# ============================================================

class MagicExtractInput(BaseModel):
    upload_id: str
    extract_type: str = Field(..., description="Type: 'assignments', 'lessons', 'both'")
    bucket: str = "evidence"


class MagicExtractOut(BaseModel):
    success: bool
    assignments: List[Dict[str, Any]] = []
    lessons: List[Dict[str, Any]] = []
    error: Optional[str] = None


@router.post("/magic-extract", response_model=MagicExtractOut)
async def magic_extract(
    input: MagicExtractInput,
    user: dict = Depends(get_current_user),
    rate_limit: None = Depends(rate_limiter)
):
    """AI parses PDFs into assignments/lessons"""
    try:
        supabase = get_admin_client()
        
        # Get upload record
        upload_result = supabase.table("uploads").select("storage_path, family_id, child_id, subject_id").eq("id", input.upload_id).single().execute()
        if not upload_result.data:
            raise HTTPException(status_code=404, detail="Upload not found")
        
        upload = upload_result.data
        family_id = upload["family_id"]
        
        # Verify access
        if not get_family_id_for_user(user["id"]) == family_id:
            raise HTTPException(status_code=403, detail="Access denied")
        
        # Extract text from PDF
        try:
            text = await get_file_text_from_storage(input.bucket, upload["storage_path"])
            
            # Use LLM to extract assignments/lessons
            from llm import llm_extract_assignments_and_lessons
            
            assignments, lessons = await llm_extract_assignments_and_lessons(
                pdf_text=text,
                extract_type=input.extract_type
            )
            
            return MagicExtractOut(success=True, assignments=assignments, lessons=lessons)
        except Exception as e:
            return MagicExtractOut(success=False, error=str(e))
    
    except HTTPException:
        raise
    except Exception as e:
        log_event("error", error=str(e), endpoint="magic_extract")
        raise HTTPException(status_code=500, detail=f"Error extracting from PDF: {str(e)}")


# ============================================================
# External Links (Google Drive, Dropbox, etc.)
# ============================================================

class AddExternalLinkInput(BaseModel):
    child_id: Optional[str] = None
    subject_id: Optional[str] = None
    provider: str = Field(..., description="google_drive, google_docs, dropbox, onedrive, other")
    link_type: str = Field(..., description="file, folder, document")
    title: str
    url: str
    thumbnail_url: Optional[str] = None
    mime_type: Optional[str] = None
    file_size_bytes: Optional[int] = None
    metadata: Dict[str, Any] = {}


class ExternalLinkOut(BaseModel):
    id: str
    family_id: str
    child_id: Optional[str]
    provider: str
    title: str
    url: str
    created_at: str


@router.post("/external-links", response_model=ExternalLinkOut)
async def add_external_link(
    input: AddExternalLinkInput,
    user: dict = Depends(get_current_user),
    rate_limit: None = Depends(rate_limiter)
):
    """Add external link (Google Drive, Dropbox, etc.)"""
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(status_code=404, detail="Family not found")
        
        supabase = get_admin_client()
        
        # Verify child belongs to family if provided
        if input.child_id:
            if not child_belongs_to_family(input.child_id, family_id):
                raise HTTPException(status_code=404, detail="Child not found")
        
        # Insert external link
        link_data = {
            "family_id": family_id,
            "child_id": input.child_id,
            "subject_id": input.subject_id,
            "provider": input.provider,
            "link_type": input.link_type,
            "title": input.title,
            "url": input.url,
            "thumbnail_url": input.thumbnail_url,
            "mime_type": input.mime_type,
            "file_size_bytes": input.file_size_bytes,
            "metadata": input.metadata
        }
        
        result = supabase.table("external_links").insert(link_data).execute()
        
        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to create external link")
        
        log_event("external_link_added", {
            "link_id": result.data[0]["id"],
            "provider": input.provider,
            "family_id": family_id
        })
        
        return ExternalLinkOut(**result.data[0])
    
    except HTTPException:
        raise
    except Exception as e:
        log_event("error", error=str(e), endpoint="add_external_link")
        raise HTTPException(status_code=500, detail=f"Error adding external link: {str(e)}")


@router.get("/external-links", response_model=List[ExternalLinkOut])
async def list_external_links(
    child_id: Optional[str] = Query(None),
    provider: Optional[str] = Query(None),
    user: dict = Depends(get_current_user),
    rate_limit: None = Depends(rate_limiter)
):
    """List external links"""
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(status_code=404, detail="Family not found")
        
        supabase = get_admin_client()
        
        query = supabase.table("external_links").select("*").eq("family_id", family_id)
        
        if child_id:
            query = query.eq("child_id", child_id)
        if provider:
            query = query.eq("provider", provider)
        
        result = query.order("created_at", desc=True).execute()
        
        return [ExternalLinkOut(**r) for r in (result.data or [])]
    
    except HTTPException:
        raise
    except Exception as e:
        log_event("error", error=str(e), endpoint="list_external_links")
        raise HTTPException(status_code=500, detail=f"Error listing external links: {str(e)}")


# ============================================================
# Folders
# ============================================================

class CreateFolderInput(BaseModel):
    child_id: Optional[str] = None
    name: str
    folder_type: str = Field(..., description="syllabus, assignments, portfolio, medical, id, activities, certificates, custom")
    parent_folder_id: Optional[str] = None


class FolderOut(BaseModel):
    id: str
    family_id: str
    child_id: Optional[str]
    name: str
    folder_type: str
    parent_folder_id: Optional[str]
    display_order: int
    created_at: str


@router.post("/folders", response_model=FolderOut)
async def create_folder(
    input: CreateFolderInput,
    user: dict = Depends(get_current_user),
    rate_limit: None = Depends(rate_limiter)
):
    """Create a folder"""
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(status_code=404, detail="Family not found")
        
        supabase = get_admin_client()
        
        # Verify child belongs to family if provided
        if input.child_id:
            if not child_belongs_to_family(input.child_id, family_id):
                raise HTTPException(status_code=404, detail="Child not found")
        
        # Insert folder
        folder_data = {
            "family_id": family_id,
            "child_id": input.child_id,
            "name": input.name,
            "folder_type": input.folder_type,
            "parent_folder_id": input.parent_folder_id
        }
        
        result = supabase.table("document_folders").insert(folder_data).execute()
        
        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to create folder")
        
        return FolderOut(**result.data[0])
    
    except HTTPException:
        raise
    except Exception as e:
        log_event("error", error=str(e), endpoint="create_folder")
        raise HTTPException(status_code=500, detail=f"Error creating folder: {str(e)}")


@router.get("/folders", response_model=List[FolderOut])
async def list_folders(
    child_id: Optional[str] = Query(None),
    folder_type: Optional[str] = Query(None),
    user: dict = Depends(get_current_user),
    rate_limit: None = Depends(rate_limiter)
):
    """List folders"""
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(status_code=404, detail="Family not found")
        
        supabase = get_admin_client()
        
        query = supabase.table("document_folders").select("*").eq("family_id", family_id)
        
        if child_id:
            query = query.eq("child_id", child_id)
        if folder_type:
            query = query.eq("folder_type", folder_type)
        
        result = query.order("display_order").order("name").execute()
        
        return [FolderOut(**r) for r in (result.data or [])]
    
    except HTTPException:
        raise
    except Exception as e:
        log_event("error", error=str(e), endpoint="list_folders")
        raise HTTPException(status_code=500, detail=f"Error listing folders: {str(e)}")


# ============================================================
# Digital Binder
# ============================================================

class AddToBinderInput(BaseModel):
    child_id: str
    upload_id: Optional[str] = None
    external_link_id: Optional[str] = None
    binder_section: str = Field(..., description="syllabus, assignments, portfolio, medical, id, activities, certificates")
    notes: Optional[str] = None


class BinderItemOut(BaseModel):
    id: str
    binder_section: str
    upload_id: Optional[str]
    external_link_id: Optional[str]
    title: str
    url: Optional[str]
    mime: Optional[str]
    display_order: int
    created_at: str


@router.post("/binder", response_model=BinderItemOut)
async def add_to_binder(
    input: AddToBinderInput,
    user: dict = Depends(get_current_user),
    rate_limit: None = Depends(rate_limiter)
):
    """Add item to digital binder"""
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(status_code=404, detail="Family not found")
        
        supabase = get_admin_client()
        
        # Verify child belongs to family
        if not child_belongs_to_family(input.child_id, family_id):
            raise HTTPException(status_code=404, detail="Child not found")
        
        # Get title from upload or external link
        title = "Untitled"
        url = None
        mime = None
        
        if input.upload_id:
            upload_result = supabase.table("uploads").select("title, url, mime").eq("id", input.upload_id).single().execute()
            if upload_result.data:
                title = upload_result.data.get("title", title)
                url = upload_result.data.get("url")
                mime = upload_result.data.get("mime")
        
        if input.external_link_id:
            link_result = supabase.table("external_links").select("title, url, mime_type").eq("id", input.external_link_id).single().execute()
            if link_result.data:
                title = link_result.data.get("title", title)
                url = link_result.data.get("url")
                mime = link_result.data.get("mime_type")
        
        # Insert binder item
        binder_data = {
            "child_id": input.child_id,
            "family_id": family_id,
            "upload_id": input.upload_id,
            "external_link_id": input.external_link_id,
            "binder_section": input.binder_section,
            "notes": input.notes
        }
        
        result = supabase.table("document_binder").insert(binder_data).execute()
        
        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to add to binder")
        
        return BinderItemOut(
            id=result.data[0]["id"],
            binder_section=input.binder_section,
            upload_id=input.upload_id,
            external_link_id=input.external_link_id,
            title=title,
            url=url,
            mime=mime,
            display_order=result.data[0].get("display_order", 0),
            created_at=result.data[0]["created_at"]
        )
    
    except HTTPException:
        raise
    except Exception as e:
        log_event("error", error=str(e), endpoint="add_to_binder")
        raise HTTPException(status_code=500, detail=f"Error adding to binder: {str(e)}")


@router.get("/binder/{child_id}", response_model=List[BinderItemOut])
async def get_digital_binder(
    child_id: str,
    section: Optional[str] = Query(None),
    user: dict = Depends(get_current_user),
    rate_limit: None = Depends(rate_limiter)
):
    """Get digital binder for a child"""
    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(status_code=404, detail="Family not found")
        
        supabase = get_admin_client()
        
        # Verify child belongs to family
        if not child_belongs_to_family(child_id, family_id):
            raise HTTPException(status_code=404, detail="Child not found")
        
        # Call database function
        result = supabase.rpc("get_digital_binder", {
            "_child_id": child_id,
            "_section": section
        }).execute()
        
        if not result.data:
            return []
        
        return [BinderItemOut(**r) for r in result.data]
    
    except HTTPException:
        raise
    except Exception as e:
        log_event("error", error=str(e), endpoint="get_digital_binder")
        raise HTTPException(status_code=500, detail=f"Error getting binder: {str(e)}")

