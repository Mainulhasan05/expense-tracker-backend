const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: "mail.mainulhasan99.xyz",
  port: 465, // SSL/TLS port
  secure: true, // use SSL/TLS
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

/**
 * Tests the email connection
 * @returns {Promise<boolean>} - Returns true if connection is successful
 */
const testEmailConnection = async () => {
  try {
    await transporter.verify();
    console.log("✅ Email server is ready to send emails");
    console.log(`📧 Email configured: ${process.env.EMAIL_USER}`);
    console.log(`🌐 SMTP Server: mail.mainulhasan99.xyz:465 (SSL/TLS)`);
    return true;
  } catch (error) {
    console.error("❌ Email server connection failed:", error.message);
    return false;
  }
};

/**
 * Sends an email
 * @param {string} to - Recipient email
 * @param {string} subject - Email subject
 * @param {string} html - Email HTML content
 */
const sendEmail = async (to, subject, html) => {
  try {
    await transporter.sendMail({
      from: `"Expense Tracker" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
      priority: 'high', // Set high priority for immediate delivery
      headers: {
        'X-Priority': '1', // Highest priority (1 = Highest, 3 = Normal, 5 = Lowest)
        'X-MSMail-Priority': 'High',
        'Importance': 'high'
      }
    });
  } catch (error) {
    console.error("Error sending email:", error);
    throw new Error("Failed to send email");
  }
};

/**
 * Sends a test email
 * @param {string} to - Recipient email
 */
const sendTestEmail = async (to) => {
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f4f4f4; }
        .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; }
        .content { padding: 30px; }
        .success-icon { font-size: 48px; text-align: center; margin: 20px 0; }
        .info-box { background: #f8f9fa; border-radius: 8px; padding: 20px; margin: 20px 0; border-left: 4px solid #667eea; }
        .footer { background: #333; color: white; padding: 20px; text-align: center; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>📧 Email Test Successful!</h1>
        </div>
        <div class="content">
          <div class="success-icon">✅</div>
          <h2 style="text-align: center; color: #333;">Email Configuration Verified</h2>
          <div class="info-box">
            <p><strong>Your Expense Tracker email system is now configured and working!</strong></p>
            <p>This test email confirms that:</p>
            <ul>
              <li>✅ SMTP connection is successful</li>
              <li>✅ Authentication is working</li>
              <li>✅ Email delivery is operational</li>
            </ul>
            <p><strong>Configuration Details:</strong></p>
            <ul>
              <li>📬 From: ${process.env.EMAIL_USER}</li>
              <li>🌐 SMTP Server: mail.mainulhasan99.xyz</li>
              <li>🔒 Port: 465 (SSL/TLS)</li>
              <li>📅 Tested: ${new Date().toLocaleString()}</li>
            </ul>
          </div>
          <p style="text-align: center; margin-top: 30px;">
            You can now receive password reset emails, monthly financial reports, and other notifications from the Expense Tracker app.
          </p>
        </div>
        <div class="footer">
          <p>This is an automated test email from Expense Tracker App</p>
          <p>Generated on ${new Date().toLocaleDateString()}</p>
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    const info = await transporter.sendMail({
      from: `"Expense Tracker" <${process.env.EMAIL_USER}>`,
      to,
      subject: "✅ Test Email - Expense Tracker Email Configuration",
      html: htmlContent,
      priority: 'high', // Set high priority for immediate delivery
      headers: {
        'X-Priority': '1', // Highest priority
        'X-MSMail-Priority': 'High',
        'Importance': 'high'
      }
    });
    console.log(`✅ Test email sent successfully to ${to}`);
    console.log(`📨 Message ID: ${info.messageId}`);
    console.log(`🚀 Priority: HIGH - Delivered immediately`);
    return info;
  } catch (error) {
    console.error("❌ Error sending test email:", error);
    throw new Error("Failed to send test email");
  }
};

module.exports = sendEmail;
module.exports.testEmailConnection = testEmailConnection;
module.exports.sendTestEmail = sendTestEmail;
