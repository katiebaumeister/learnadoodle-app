"""
Email service using Postmark for sending transactional emails
"""
import os
from typing import Optional
from postmarker.core import PostmarkClient
from logger import log_event

# Initialize Postmark client
POSTMARK_API_TOKEN = os.environ.get("POSTMARK_API_TOKEN")
POSTMARK_SENDER_EMAIL = os.environ.get("POSTMARK_SENDER_EMAIL", "contact@learnadoodle.com")
POSTMARK_SENDER_NAME = os.environ.get("POSTMARK_SENDER_NAME", "Learnadoodle")

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
        # Determine role-specific content
        role_labels = {
            "parent": "Parent",
            "tutor": "Tutor",
            "child": "Child",
        }
        role_label = role_labels.get(role, role.capitalize())
        
        # Build subject
        if role == "child" and child_name:
            subject = f"You're invited to join {child_name}'s learning journey on Learnadoodle"
        else:
            subject = f"You're invited to join Learnadoodle as a {role_label}"
        
        # Build email body
        greeting = f"Hi there,"
        if role == "child" and child_name:
            greeting = f"Hi {child_name},"
        
        intro = ""
        if inviter_name:
            intro = f"{inviter_name} has invited you to join their family on Learnadoodle."
        else:
            intro = "You've been invited to join a family on Learnadoodle."
        
        if role == "child":
            intro += " This will give you your own account to track your learning and see your schedule."
        elif role == "tutor":
            intro += " As a tutor, you'll be able to help track progress and support the children's learning."
        elif role == "parent":
            intro += " As a parent, you'll have full access to manage your family's learning journey."
        
        html_body = f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
        }}
        .container {{
            background-color: #ffffff;
            border-radius: 8px;
            padding: 30px;
        }}
        .button {{
            display: inline-block;
            padding: 12px 24px;
            background-color: #887DEE;
            color: #ffffff;
            text-decoration: none;
            border-radius: 6px;
            font-weight: 600;
            margin: 20px 0;
        }}
        .button:hover {{
            background-color: #6B5FCF;
        }}
        .footer {{
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #e5e7eb;
            font-size: 12px;
            color: #6b7280;
        }}
    </style>
</head>
<body>
    <div class="container">
        <h1>Welcome to Learnadoodle!</h1>
        <p>{greeting}</p>
        <p>{intro}</p>
        <p>Click the button below to accept your invitation and get started:</p>
        <a href="{accept_url or invite_url}" class="button">Accept Invitation</a>
        <p>Or copy and paste this link into your browser:</p>
        <p style="word-break: break-all; color: #6b7280; font-size: 14px;">{invite_url}</p>
        <p>This invitation will expire in 30 days.</p>
        <div class="footer">
            <p>If you didn't expect this invitation, you can safely ignore this email.</p>
            <p>© Learnadoodle - Helping families track their learning journey</p>
        </div>
    </div>
</body>
</html>
        """
        
        text_body = f"""
Welcome to Learnadoodle!

{greeting}

{intro}

Click the link below to accept your invitation and get started:

{accept_url or invite_url}

This invitation will expire in 30 days.

If you didn't expect this invitation, you can safely ignore this email.

© Learnadoodle - Helping families track their learning journey
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
