#!/usr/bin/env python3
"""
Quick test script to verify Postmark email sending works
"""
import os
import sys
from pathlib import Path

# Add parent directory to path
backend_dir = Path(__file__).parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from dotenv import load_dotenv
load_dotenv()

from email_service import send_invite_email

# Test email sending
test_email = input("Enter test email address: ").strip()
if not test_email:
    print("No email provided, exiting")
    sys.exit(1)

print(f"\nTesting email send to: {test_email}")
print(f"POSTMARK_API_TOKEN: {'SET' if os.getenv('POSTMARK_API_TOKEN') else 'NOT SET'}")
print(f"POSTMARK_SENDER_EMAIL: {os.getenv('POSTMARK_SENDER_EMAIL', 'NOT SET')}")
print("\nSending test email...")

result = send_invite_email(
    to_email=test_email,
    invite_url="https://learnadoodle.com/invites/test123",
    role="parent",
    inviter_name="Test User",
)

if result:
    print(f"\n✅ Email sent successfully!")
    print("Check your inbox (and spam folder) for the test email.")
    print("Also check Postmark dashboard → Activity → Sent")
else:
    print(f"\n❌ Email failed to send")
    print("Check backend logs for error details")
    print("Common issues:")
    print("  - POSTMARK_API_TOKEN not set or invalid")
    print("  - Sender email not verified in Postmark")
    print("  - Network/API errors")
