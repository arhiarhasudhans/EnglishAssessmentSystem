#!/usr/bin/env python3
import sys
import json
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

def send_welcome_email(recipient_email, student_name):
    """
    Send a welcome email to the student
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
        message["Subject"] = "Welcome to English Assessment System - Student Account"
        message["From"] = sender_email
        message["To"] = recipient_email
        
        # Create the HTML content
        html_content = f"""
        <html>
          <body>
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #2c5aa0;">Welcome to English Assessment System!</h2>
              <p>Dear <strong>{student_name}</strong>,</p>
              <p>Congratulations! Your student account has been successfully created in the English Assessment System.</p>
              
              <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0;">
                <h3 style="color: #495057;">What's Next?</h3>
                <ul style="color: #6c757d;">
                  <li>You can now log in to the system using your student credentials</li>
                  <li>Access assessments using the assessment codes provided by your instructor</li>
                  <li>Complete your English proficiency evaluations</li>
                  <li>View your results and progress</li>
                </ul>
              </div>
              
              <p>If you have any questions or need assistance, please don't hesitate to contact the system administrator or your instructor.</p>
              
              <hr style="border: none; border-top: 1px solid #dee2e6; margin: 30px 0;">
              <p style="color: #6c757d; font-size: 14px;">
                Best regards,<br>
                <strong>English Assessment System Team</strong>
              </p>
            </div>
          </body>
        </html>
        """
        
        # Create plain text version
        text_content = f"""
        Welcome to English Assessment System!
        
        Dear {student_name},
        
        Congratulations! Your student account has been successfully created in the English Assessment System.
        
        What's Next?
        - You can now log in to the system using your student credentials
        - Access assessments using the assessment codes provided by your instructor
        - Complete your English proficiency evaluations
        - View your results and progress
        
        If you have any questions or need assistance, please don't hesitate to contact the system administrator or your instructor.
        
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
            "message": "Welcome email sent successfully to student"
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
                "message": "Invalid arguments. Usage: python email_service_student.py <email> <student_name>"
            }
        else:
            recipient_email = sys.argv[1]
            student_name = sys.argv[2]  # Fixed variable name
            result = send_welcome_email(recipient_email, student_name)
        
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