const nodemailer = require('nodemailer');

// Configure transporter
// Ideally credentials should be in .env, defaulting to dummy for dev if missing
const transporter = nodemailer.createTransport({
    service: 'gmail', // or any other service
    auth: {
        user: process.env.EMAIL_USER || 'your-email@gmail.com',
        pass: process.env.EMAIL_PASS || 'your-password'
    }
});

exports.sendEmail = async (to, subject, htmlContent) => {
    try {
        const mailOptions = {
            from: process.env.EMAIL_USER || 'English Assessment System <noreply@eas.com>',
            to: to,
            subject: subject,
            html: htmlContent
        };

        const info = await transporter.sendMail(mailOptions);
        console.log(`Email sent to ${to}: ${info.response}`);
        return { success: true, message: 'Email sent successfully' };
    } catch (error) {
        console.error('Error sending email:', error);
        return { success: false, message: 'Failed to send email', error: error.message };
    }
};

exports.sendWelcomeEmail = async (email, fullName, role = 'Student') => {
    const subject = `Welcome to English Assessment System`;
    const html = `
        <div style="font-family: Arial, sans-serif; color: #333;">
            <h2>Welcome, ${fullName}!</h2>
            <p>You have successfully registered as a <strong>${role}</strong> in the English Assessment System.</p>
            <p>You can now login to your dashboard and verify your details.</p>
            <br>
            <p>Best Regards,<br>EAS Team</p>
        </div>
    `;
    return await exports.sendEmail(email, subject, html);
};

exports.sendResultsEmail = async (email, fullName, assessmentTitle, score, passed) => {
    const subject = `Assessment Results: ${assessmentTitle}`;
    const status = passed ? '<span style="color:green; font-weight:bold;">PASSED</span>' : '<span style="color:red; font-weight:bold;">FAILED</span>';
    const html = `
        <div style="font-family: Arial, sans-serif; color: #333;">
            <h2>Assessment Completed</h2>
            <p>Hello ${fullName},</p>
            <p>You have completed the assessment <strong>${assessmentTitle}</strong>.</p>
            <p>Your Score: <strong>${score}%</strong></p>
            <p>Result: ${status}</p>
            <br>
            <p>Best Regards,<br>EAS Team</p>
        </div>
    `;
    return await exports.sendEmail(email, subject, html);
};

exports.sendProfileUpdateEmail = async (email, fullName, passwordChanged) => {
    const subject = `Profile Updated - English Assessment Portal`;
    const passwordMsg = passwordChanged ? '<p><strong>Your password has been updated.</strong> Please use your new password for future logins.</p>' : '';
    const html = `
        <div style="font-family: Arial, sans-serif; color: #333;">
            <h2>Profile Updated Successfully</h2>
            <p>Hello ${fullName},</p>
            <p>Your profile information has been updated successfully on ${new Date().toLocaleString()}.</p>
            ${passwordMsg}
            <div style="margin-top: 20px; padding: 15px; background-color: #f8f9fa; border-radius: 5px;">
                <p style="font-size: 14px; color: #666;">If you did not request this change, please contact your administrator immediately.</p>
            </div>
            <br>
            <p>Best Regards,<br>EAS Team</p>
        </div>
    `;
    return await exports.sendEmail(email, subject, html);
};
