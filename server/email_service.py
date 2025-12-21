#!/usr/bin/env python3
import sys
import json
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

def send_welcome_email(recipient_email, faculty_name):
    """
    Send a welcome email to the faculty member
    """
    try:
        # Email configuration - hardcoded for simplicity
        # You can modify these values directly in the script
        smtp_server = 'smtp.gmail.com'
        smtp_port = 587
        sender_email = 'arhi.24.2007@gmail.com'  # Replace with your email
        sender_password = 'hjbtbhmcygxqqrkk'   # Replace with your app password
        
        if sender_email == 'your-email@gmail.com' or sender_password == 'your-app-password':
            return {
                "success": False,
                "message": "Email configuration not set. Please update sender_email and sender_password in email_service.py"
            }
        
        # Create message
        message = MIMEMultipart("alternative")
        message["Subject"] = "Welcome to English Assessment System"
        message["From"] = sender_email
        message["To"] = recipient_email
        
        # Create the HTML content
        html_content = f"""
        <html>
          <body>
            <h2>Welcome to English Assessment System!</h2>
            <p>Dear {faculty_name},</p>
            <p>Your faculty account has been successfully created in the English Assessment System.</p>
            
            <h3>What you can do:</h3>
            <ul>
              <li>Create and manage assessments</li>
              <li>View student results</li>
              <li>Monitor assessment performance</li>
              <li>Generate reports</li>
            </ul>
            
            <p>You can now log in to the system using your credentials.</p>
            
            <p>If you have any questions or need assistance, please don't hesitate to contact the system administrator.</p>
            
            <p>Best regards,<br>
            English Assessment System Team</p>
          </body>
        </html>
        """
        
        # Create plain text version
        text_content = f"""
        Welcome to English Assessment System!
        
        Dear {faculty_name},
        
        Your faculty account has been successfully created in the English Assessment System.
        
        What you can do:
        - Create and manage assessments
        - View student results
        - Monitor assessment performance
        - Generate reports
        
        You can now log in to the system using your credentials.
        
        If you have any questions or need assistance, please don't hesitate to contact the system administrator.
        
        Best regards,
        English Assessment System Team
        """
        
        # Create MIMEText objects
        part1 = MIMEText(text_content, "plain")
        part2 = MIMEText(html_content, "html")
        
        # Add parts to message
        message.attach(part1)
        message.attach(part2)
        
        # Create SMTP session
        server = smtplib.SMTP(smtp_server, smtp_port)
        server.starttls()  # Enable security
        server.login(sender_email, sender_password)
        
        # Send email
        text = message.as_string()
        server.sendmail(sender_email, recipient_email, text)
        server.quit()
        
        return {
            "success": True,
            "message": "Welcome email sent successfully"
        }
        
    except smtplib.SMTPAuthenticationError:
        return {
            "success": False,
            "message": "Email authentication failed. Please check your email credentials."
        }
    except smtplib.SMTPException as e:
        return {
            "success": False,
            "message": f"SMTP error occurred: {str(e)}"
        }
    except Exception as e:
        return {
            "success": False,
            "message": f"Unexpected error: {str(e)}"
        }

def main():
    try:
        # Get command line arguments
        if len(sys.argv) != 3:
            result = {
                "success": False,
                "message": "Invalid arguments. Usage: python email_service.py <email> <name>"
            }
        else:
            recipient_email = sys.argv[1]
            faculty_name = sys.argv[2]
            result = send_welcome_email(recipient_email, faculty_name)
        
        # Output JSON result
        print(json.dumps(result))
        sys.stdout.flush()
        
    except Exception as e:
        error_result = {
            "success": False,
            "message": f"Script error: {str(e)}"
        }
        print(json.dumps(error_result))
        sys.stdout.flush()

if __name__ == "__main__":
    main()