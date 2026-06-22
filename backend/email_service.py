"""
Email service using Postmark for sending transactional emails
"""
import html
import os
from datetime import datetime, timezone
from typing import Optional
from postmarker.core import PostmarkClient
from logger import log_event

# Initialize Postmark client
POSTMARK_API_TOKEN = os.environ.get("POSTMARK_API_TOKEN")
POSTMARK_SENDER_EMAIL = os.environ.get("POSTMARK_SENDER_EMAIL", "contact@learnadoodle.com")
POSTMARK_SENDER_NAME = os.environ.get("POSTMARK_SENDER_NAME", "Learnadoodle")
CONTACT_EMAIL = os.environ.get("LEARNADOODLE_CONTACT_EMAIL", "contact@learnadoodle.com")

postmark_client = None
if POSTMARK_API_TOKEN:
    try:
        postmark_client = PostmarkClient(server_token=POSTMARK_API_TOKEN)
        log_event("email_service.init", status="success", sender_email=POSTMARK_SENDER_EMAIL)
    except Exception as e:
        log_event("email_service.init.error", error=str(e))
        postmark_client = None


def send_invite_email(
    to_email: str,
    invite_url: str,
    role: str,
    inviter_name: Optional[str] = None,
    child_name: Optional[str] = None,
    accept_url: Optional[str] = None,
    self_managed_parent_request: bool = False,
) -> bool:
    """
    Send an invite email via Postmark.

    When accept_url is provided, the "Accept Invitation" button links to accept_url
    (e.g. create-password page); the "copy and paste this link" text uses invite_url
    (landing page). When accept_url is None, invite_url is used for both.

    Args:
        to_email: Recipient email address
        invite_url: Full URL for the copy-paste link (landing page)
        role: Role being invited ('parent', 'tutor', or 'child')
        inviter_name: Name of the person sending the invite (optional)
        child_name: Name of the child (for child invites, optional)
        accept_url: Optional URL for the email button (e.g. create-password page)

    Returns:
        True if email was sent successfully, False otherwise
    """
    if not postmark_client:
        error_msg = "Postmark client not initialized"
        if not POSTMARK_API_TOKEN:
            error_msg = "POSTMARK_API_TOKEN not set in environment"
        log_event("email_service.send_invite_email.skipped", reason=error_msg, to_email=to_email, has_token=bool(POSTMARK_API_TOKEN))
        print(f"[EMAIL ERROR] {error_msg}. Check that POSTMARK_API_TOKEN is set in backend/.env")
        return False
    
    # Check if account is pending approval (can only send to same domain)
    # This is a Postmark limitation during account approval
    sender_domain = POSTMARK_SENDER_EMAIL.split('@')[1] if '@' in POSTMARK_SENDER_EMAIL else ''
    recipient_domain = to_email.split('@')[1] if '@' in to_email else ''
    
    if sender_domain and recipient_domain and sender_domain != recipient_domain:
        # Log warning but still try to send (will fail with 412 if account pending)
        log_event("email_service.send_invite_email.domain_mismatch_warning", 
                 sender_domain=sender_domain, 
                 recipient_domain=recipient_domain,
                 note="Postmark may reject if account is pending approval")
    
    try:
        # Subject is the same for parent, tutor, and child invites (family-focused).
        subject = "You're invited to join a family on Learnadoodle"

        safe_inviter = html.escape(inviter_name) if inviter_name else None
        safe_child = html.escape(child_name) if child_name else None

        # Headline (h2) — aligned with signup “Welcome to Learnadoodle!” placement
        if role == "child" and safe_child:
            headline = f"You're invited to join {safe_child} on Learnadoodle!"
        else:
            headline = "You're invited to Learnadoodle!"

        # Greeting + body (plain sentences; escape user-provided bits only)
        if role == "child" and safe_child:
            greeting = f"Hello {safe_child},"
        else:
            greeting = "Hello,"

        if self_managed_parent_request and role == "parent" and safe_inviter:
            body_p1 = f"{safe_inviter} wants to link their child account to you on Learnadoodle."
        elif self_managed_parent_request and role == "parent":
            body_p1 = "A child wants to link their child account to you on Learnadoodle."
        elif safe_inviter and role == "child" and safe_child:
            body_p1 = f"{safe_inviter} has invited you to join Learnadoodle to help manage {safe_child}'s learning journey."
        elif safe_inviter:
            body_p1 = f"{safe_inviter} has invited you to join their family on Learnadoodle."
        else:
            body_p1 = "You've been invited to join a family on Learnadoodle."

        if role == "child":
            body_p2 = "You'll get your own account to see your schedule and track your learning. Use the button below to accept your invite and get started."
        elif role == "tutor":
            body_p2 = "As a tutor, you can help track progress and support the children's learning. Use the button below to accept your invitation."
        elif role == "parent" and self_managed_parent_request:
            body_p2 = "Accept this request to link as their parent account and take full control of family settings and planning."
        elif role == "parent":
            body_p2 = "As a parent, you'll have full access to manage your family's learning journey. Use the button below to accept your invitation."
        else:
            body_p2 = "Use the button below to accept your invitation and get started."

        accept_btn_url = accept_url or invite_url
        btn_href_attr = html.escape(accept_btn_url, quote=True)
        invite_href_attr = html.escape(invite_url, quote=True)
        invite_url_visible = html.escape(invite_url, quote=False)

        if role == "child" and child_name:
            headline_plain = f"You're invited to join {child_name} on Learnadoodle!"
        else:
            headline_plain = "You're invited to Learnadoodle!"
        greeting_plain = f"Hello {child_name}," if role == "child" and child_name else "Hello,"
        if self_managed_parent_request and role == "parent" and inviter_name:
            body_p1_plain = f"{inviter_name} wants to link their child account to you on Learnadoodle."
        elif self_managed_parent_request and role == "parent":
            body_p1_plain = "A child wants to link their child account to you on Learnadoodle."
        elif inviter_name and role == "child" and child_name:
            body_p1_plain = (
                f"{inviter_name} has invited you to join Learnadoodle to help manage "
                f"{child_name}'s learning journey."
            )
        elif inviter_name:
            body_p1_plain = f"{inviter_name} has invited you to join their family on Learnadoodle."
        else:
            body_p1_plain = "You've been invited to join a family on Learnadoodle."
        if role == "child":
            body_p2_plain = (
                "You'll get your own account to see your schedule and track your learning. "
                "Use the link below to accept your invite and get started."
            )
        elif role == "tutor":
            body_p2_plain = (
                "As a tutor, you can help track progress and support the children's learning. "
                "Use the link below to accept your invitation."
            )
        elif role == "parent" and self_managed_parent_request:
            body_p2_plain = (
                "Accept this request to link as their parent account and take full control "
                "of family settings and planning."
            )
        elif role == "parent":
            body_p2_plain = (
                "As a parent, you'll have full access to manage your family's learning journey. "
                "Use the link below to accept your invitation."
            )
        else:
            body_p2_plain = "Use the link below to accept your invitation and get started."

        # Same visual system as docs/SUPABASE_CONFIRM_SIGNUP_EMAIL_TEMPLATE.html (Postmark invite)
        html_body = f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="color-scheme" content="light">
    <meta name="supported-color-schemes" content="light">
    <style>
        html {{
            background-color: #ffffff !important;
        }}
        body {{
            font-family: 'DM Sans', Arial, Helvetica, sans-serif;
            line-height: 1.6;
            color: #111827 !important;
            background-color: #ffffff !important;
            margin: 0;
            padding: 0;
        }}
        .wrap {{
            max-width: 600px;
            margin: 0 auto;
            padding: 40px 20px;
            background-color: #ffffff !important;
        }}
        .container {{
            background-color: #ffffff !important;
            border-radius: 12px;
            box-shadow: 0 1px 4px rgba(15, 23, 42, 0.08);
            border: 1px solid #e5e7eb;
            padding: 40px 32px;
        }}
        .logo {{
            text-align: center;
            margin-bottom: 28px;
        }}
        .logo h1 {{
            font-size: 28px;
            font-weight: 700;
            color: #000;
            margin: 0;
            letter-spacing: -0.02em;
        }}
        h2 {{
            font-size: 22px;
            font-weight: 700;
            color: #000;
            margin: 0 0 20px 0;
            text-align: left;
        }}
        .body-text {{
            font-size: 16px;
            color: #333;
            margin: 0 0 16px 0;
            text-align: left;
        }}
        .cta-wrap {{
            text-align: center;
            margin: 28px 0 24px 0;
        }}
        .button {{
            background-color: #2563eb !important;
            color: #ffffff !important;
            padding: 15px 32px;
            text-decoration: none;
            border-radius: 999px;
            display: inline-block;
            font-weight: 600;
            font-size: 16px;
            font-family: 'DM Sans', Arial, Helvetica, sans-serif;
            border: 1px solid #1d4ed8;
        }}
        .secondary {{
            font-size: 13px;
            color: #666;
            text-align: left;
            margin: 0 0 8px 0;
        }}
        .link-fallback {{
            word-break: break-all;
            font-size: 13px;
            color: #2563eb;
            margin: 0 0 16px 0;
        }}
        .expiry {{
            font-size: 14px;
            color: #666;
            margin: 0 0 0 0;
            text-align: left;
        }}
        .footer {{
            margin-top: 36px;
            font-size: 14px;
            color: #666;
            text-align: center;
        }}
        .footer-muted {{
            margin-top: 16px;
            font-size: 13px;
            color: #888;
            text-align: center;
        }}
    </style>
</head>
<body style="background-color: #ffffff !important; color: #111827 !important;">
    <div class="wrap">
        <div class="container">
            <div class="logo">
                <h1>Learnadoodle</h1>
            </div>
            <h2>{headline}</h2>
            <p class="body-text">{greeting}</p>
            <p class="body-text">{body_p1}</p>
            <p class="body-text">{body_p2}</p>
            <div class="cta-wrap">
                <a href="{btn_href_attr}" class="button">Accept Invite</a>
            </div>
            <p class="secondary">Or copy and paste this link into your browser:</p>
            <p class="link-fallback"><a href="{invite_href_attr}" style="color: #2563eb;">{invite_url_visible}</a></p>
            <p class="expiry">This invitation will expire in 30 days.</p>
            <div class="footer">
                <p>Best regards,<br>The Learnadoodle Team</p>
                <p>Need help? Contact us at contact@learnadoodle.com</p>
            </div>
            <div class="footer-muted">
                <p>If you didn't expect this invitation, you can safely ignore this email.</p>
            </div>
        </div>
    </div>
</body>
</html>
"""

        text_body = f"""Learnadoodle

{headline_plain}

{greeting_plain}

{body_p1_plain}

{body_p2_plain}

Accept your invite:
{accept_btn_url}

Or copy this link:
{invite_url}

This invitation will expire in 30 days.

Best regards,
The Learnadoodle Team

Need help? Contact us at contact@learnadoodle.com

If you didn't expect this invitation, you can safely ignore this email.
"""
        
        # Send email via Postmark
        # Note: Postmark requires the From email to match a verified sender signature
        # If contact@learnadoodle.com isn't verified, use the verified one (likely kate@learnadoodle.com)
        # We'll set ReplyTo to contact@learnadoodle.com so replies go there
        response = postmark_client.emails.send(
            From=f"{POSTMARK_SENDER_NAME} <{POSTMARK_SENDER_EMAIL}>",
            ReplyTo="contact@learnadoodle.com",  # Replies will go to contact@learnadoodle.com
            To=to_email,
            Subject=subject,
            HtmlBody=html_body,
            TextBody=text_body,
            MessageStream="outbound",  # Use transactional stream
        )
        
        log_event(
            "email_service.send_invite_email.success",
            to_email=to_email,
            role=role,
            message_id=response.get("MessageID"),
        )
        return True
        
    except Exception as e:
        error_msg = str(e)
        log_event(
            "email_service.send_invite_email.error",
            to_email=to_email,
            role=role,
            error=error_msg,
        )
        print(f"[EMAIL ERROR] Failed to send invite email to {to_email}: {error_msg}")
        # Re-raise to see full error in backend logs
        import traceback
        traceback.print_exc()
        return False


def _postmark_send(*, to_email: str, subject: str, html_body: str, text_body: str) -> bool:
    if not postmark_client:
        log_event(
            "email_service.send.skipped",
            reason="Postmark client not initialized",
            to_email=to_email,
            has_token=bool(POSTMARK_API_TOKEN),
        )
        return False
    try:
        response = postmark_client.emails.send(
            From=f"{POSTMARK_SENDER_NAME} <{POSTMARK_SENDER_EMAIL}>",
            ReplyTo=CONTACT_EMAIL,
            To=to_email,
            Subject=subject,
            HtmlBody=html_body,
            TextBody=text_body,
            MessageStream="outbound",
        )
        log_event(
            "email_service.send.success",
            to_email=to_email,
            subject=subject,
            message_id=response.get("MessageID"),
        )
        return True
    except Exception as e:
        log_event(
            "email_service.send.error",
            to_email=to_email,
            subject=subject,
            error=str(e),
        )
        print(f"[EMAIL ERROR] Failed to send to {to_email}: {e}")
        return False


def send_personal_data_request_emails(
    *,
    account_email: str,
    user_id: str,
    display_name: Optional[str] = None,
    role: Optional[str] = None,
    family_id: Optional[str] = None,
    family_name: Optional[str] = None,
    learner_names: Optional[list[str]] = None,
) -> tuple[bool, bool]:
    """
    Notify support and confirm with the requester when a personal data export is requested.

    Returns:
        (internal_sent, user_confirmation_sent)
    """
    requested_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    safe_email = html.escape(account_email or "")
    safe_user_id = html.escape(user_id or "")
    safe_name = html.escape(display_name or "—")
    safe_role = html.escape(role or "—")
    safe_family_id = html.escape(family_id or "—")
    safe_family_name = html.escape(family_name or "—")
    learners = learner_names or []
    learners_text = ", ".join(learners) if learners else "—"
    safe_learners = html.escape(learners_text)

    internal_subject = "Personal Data Request"
    internal_text = f"""A Learnadoodle user requested a copy of their personal data.

Account details:
- User ID: {user_id}
- Email: {account_email}
- Name: {display_name or '—'}
- Role: {role or '—'}
- Family ID: {family_id or '—'}
- Family name: {family_name or '—'}
- Learners: {learners_text}
- Requested at: {requested_at}

Please prepare their export within 7 days and follow up with download instructions.
"""
    internal_html = f"""<html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #111827; line-height: 1.5;">
<p>A Learnadoodle user requested a copy of their personal data.</p>
<h3 style="margin-bottom: 8px;">Account details</h3>
<ul>
  <li><strong>User ID:</strong> {safe_user_id}</li>
  <li><strong>Email:</strong> {safe_email}</li>
  <li><strong>Name:</strong> {safe_name}</li>
  <li><strong>Role:</strong> {safe_role}</li>
  <li><strong>Family ID:</strong> {safe_family_id}</li>
  <li><strong>Family name:</strong> {safe_family_name}</li>
  <li><strong>Learners:</strong> {safe_learners}</li>
  <li><strong>Requested at:</strong> {requested_at}</li>
</ul>
<p>Please prepare their export within 7 days and follow up with download instructions.</p>
</body></html>"""

    user_subject = "Your Learnadoodle personal data request"
    user_text = f"""Hi{(' ' + display_name) if display_name else ''},

We received your request to access the personal data stored in your Learnadoodle account ({account_email}).

We're gathering your family information, children profiles, subjects, schedules, materials, and learning records into a zip file. This can take up to 7 days. When we're finished, we'll email you with download instructions.

If you didn't make this request, please contact us at {CONTACT_EMAIL}.

Best regards,
The Learnadoodle Team
"""
    user_html = f"""<html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #111827; line-height: 1.5;">
<p>Hi{(' ' + safe_name) if display_name else ''},</p>
<p>We received your request to access the personal data stored in your Learnadoodle account (<strong>{safe_email}</strong>).</p>
<p>We're gathering your family information, children profiles, subjects, schedules, materials, and learning records into a zip file. This can take up to 7 days. When we're finished, we'll email you with download instructions.</p>
<p>If you didn't make this request, please contact us at <a href="mailto:{CONTACT_EMAIL}">{CONTACT_EMAIL}</a>.</p>
<p>Best regards,<br>The Learnadoodle Team</p>
</body></html>"""

    internal_sent = _postmark_send(
        to_email=CONTACT_EMAIL,
        subject=internal_subject,
        html_body=internal_html,
        text_body=internal_text,
    )
    user_confirmation_sent = _postmark_send(
        to_email=account_email,
        subject=user_subject,
        html_body=user_html,
        text_body=user_text,
    )
    return internal_sent, user_confirmation_sent
