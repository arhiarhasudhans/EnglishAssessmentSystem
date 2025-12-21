#!/usr/bin/env python3
import sys
import json
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime

def send_profile_update_email(recipient_email, student_name, password_changed):
    try:
        # Email configuration (update with your SMTP settings)
        smtp_server = "smtp.gmail.com"
        smtp_port = 587
        sender_email = "your-email@gmail.com"  # Update with your email
        sender_password = "your-app-password"  # Update with your app password
        
        # Create message
        message = MIMEMultipart("alternative")
        message["Subject"] = "Profile Updated - English Assessment Portal"
        message["From"] = sender_email
        message["To"] = recipient_email
        
        # Email content
        password_notice = ""
        if password_changed == 'true':
            password_notice = """
            <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; margin: 20px 0; border-radius: 5px;">
                <h3 style="color: #856404; margin: 0 0 10px 0;">🔒 Password Updated</h3>
                <p style="color: #856404; margin: 0;">Your password has been successfully updated. Please use your new password for future logins.</p>
            </div>
            """
        
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Profile Updated</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; margin: 0; padding: 20px; background-color: #f5f7fa;">
            <div style="max-width: 600px; margin: 0 auto; background-color: white; border-radius: 10px; overflow: hidden; box-shadow: 0 0 20px rgba(0,0,0,0.1);">
                
                <!-- Header -->
                <div style="background: linear-gradient(135deg, #3a55a3 0%, #2a4293 100%); color: white; padding: 30px; text-align: center;">
                    <h1 style="margin: 0; font-size: 28px;">English Assessment Portal</h1>
                    <p style="margin: 10px 0 0 0; opacity: 0.9;">Profile Update Notification</p>
                </div>
                
                <!-- Content -->
                <div style="padding: 30px;">
                    <h2 style="color: #3a55a3; margin: 0 0 20px 0;">Hello {student_name}!</h2>
                    
                    <div style="background-color: #d4edda; border: 1px solid #c3e6cb; padding: 15px; margin: 20px 0; border-radius: 5px;">
                        <h3 style="color: #155724; margin: 0 0 10px 0;">✅ Profile Updated Successfully</h3>
                        <p style="color: #155724; margin: 0;">Your profile information has been updated successfully on {datetime.now().strftime('%B %d, %Y at %I:%M %p')}.</p>
                    </div>
                    
                    {password_notice}
                    
                    <div style="margin: 30px 0;">
                        <h3 style="color: #333; margin: 0 0 15px 0;">What's Updated:</h3>
                        <ul style="color: #666; padding-left: 20px;">
                            <li>Personal information (name, email)</li>
                            <li>Account status</li>
                            {'<li>Login password</li>' if password_changed == 'true' else ''}
                        </ul>
                    </div>
                    
                    <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0;">
                        <h3 style="color: #3a55a3; margin: 0 0 10px 0;">Security Notice</h3>
                        <p style="color: #666; margin: 0; font-size: 14px;">
                            If you did not request this profile update, please contact your administrator immediately.
                        </p>
                    </div>
                    
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="#" style="display: inline-block; background-color: #3a55a3; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold;">
                            Access Portal
                        </a>
                    </div>
                    
                    <hr style="border: none; height: 1px; background-color: #eee; margin: 30px 0;">
                    
                    <p style="color: #666; font-size: 14px; margin: 0;">
                        Best regards,<br>
                        <strong>English Assessment Portal Team</strong>
                    </p>
                </div>
                
                <!-- Footer -->
                <div style="background-color: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #eee;">
                    <p style="color: #999; font-size: 12px; margin: 0;">
                        This is an automated notification from the English Assessment Portal.<br>
                        Please do not reply to this email.
                    </p>
                    <p style="color: #999; font-size: 12px; margin: 10px 0 0 0;">
                        © 2025 English Assessment Portal. All rights reserved.
                    </p>
                </div>
            </div>
        </body>
        </html>
        """
        
        # Create plain text version
        text_content = f"""
        English Assessment Portal - Profile Updated
        
        Hello {student_name}!
        
        Your profile information has been updated successfully on {datetime.now().strftime('%B %d, %Y at %I:%M %p')}.
        
        {'Your password has also been updated. Please use your new password for future logins.' if password_changed == 'true' else ''}
        
        If you did not request this profile update, please contact your administrator immediately.
        
        Best regards,
        English Assessment Portal Team
        
        ---
        This is an automated notification. Please do not reply to this email.
        """
        
        # Attach parts
        part1 = MIMEText(text_content, "plain")
        part2 = MIMEText(html_content, "html")
        
        message.attach(part1)
        message.attach(part2)
        
        # Send email
        with smtplib.SMTP(smtp_server, smtp_port) as server:
            server.starttls()
            server.login(sender_email, sender_password)
            server.sendmail(sender_email, recipient_email, message.as_string())
        
        return {"success": True, "message": "Profile update email sent successfully"}
        
    except Exception as e:
        return {"success": False, "message": f"Failed to send profile update email: {str(e)}"}

if __name__ == "__main__":
    if len(sys.argv) != 4:
        print(json.dumps({"success": False, "message": "Invalid arguments"}))
        sys.exit(1)
    
    recipient_email = sys.argv[1]
    student_name = sys.argv[2]
    password_changed = sys.argv[3]
    
    result = send_profile_update_email(recipient_email, student_name, password_changed)
    print(json.dumps(result))