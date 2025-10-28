const User = require("../models/User");
const sendEmail = require("../utils/sendEmail");
const Category = require("../models/Category");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const validateGoogleAccessToken = require("../utils/validateGoogleAccessToken");
const DEFAULT_CATEGORIES = [
  { name: "Salary", type: "income" },
  { name: "Gift", type: "income" },
  { name: "Groceries", type: "expense" },
  { name: "Transport", type: "expense" },
  { name: "Entertainment", type: "expense" },
  { name: "Family", type: "expense" },
  { name: "Medicine", type: "expense" },
];

exports.findOrCreateUser = async (idToken) => {
  const googleData = await validateGoogleAccessToken(idToken);

  const { googleId, name, email, picture } = googleData.user;
  let user = await User.findOne({ googleId });

  if (!user) {
    // Google users are automatically verified
    user = await User.create({ googleId, name, email, picture, isVerified: true });
    // Create default categories for the new user
    const categories = DEFAULT_CATEGORIES.map((category) => ({
      ...category,
      user: user._id,
    }));

    await Category.insertMany(categories);
  }

  return user;
};

exports.generateToken = (user) => {
  return jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: "100d",
  });
};

exports.getUser = async (userId) => {
  try {
    const user = await User.findById(userId);
    return user;
  } catch (error) {
    throw new Error(error.message);
  }
};

// Generate JWT
exports.generateToken = (user) => {
  return jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "100d" });
};

// Email Register
exports.register = async (name, email, password) => {
  let user = await User.findOne({ email });
  if (user) throw new Error("Email already exists");

  // Create user with unverified status
  user = await User.create({ name, email, password, isVerified: false });

  // Generate verification token
  const verificationToken = crypto.randomBytes(32).toString("hex");
  const verificationTokenHashed = crypto.createHash("sha256").update(verificationToken).digest("hex");

  user.emailVerificationToken = verificationTokenHashed;
  user.emailVerificationExpire = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
  await user.save();

  // Send verification email
  const verificationUrl = `${process.env.APP_URL}/verify-email/${verificationToken}`;
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f4f4f4; }
        .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; }
        .content { padding: 30px; }
        .button { display: inline-block; padding: 12px 30px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        .footer { background: #333; color: white; padding: 20px; text-align: center; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Welcome to Expense Tracker!</h1>
        </div>
        <div class="content">
          <h2>Hi ${name},</h2>
          <p>Thank you for registering with Expense Tracker! To complete your registration and start tracking your expenses, please verify your email address.</p>
          <div style="text-align: center;">
            <a href="${verificationUrl}" class="button">Verify Email Address</a>
          </div>
          <p>Or copy and paste this link into your browser:</p>
          <p style="word-break: break-all; color: #667eea;">${verificationUrl}</p>
          <p><strong>This link will expire in 24 hours.</strong></p>
          <p>If you didn't create an account with us, please ignore this email.</p>
        </div>
        <div class="footer">
          <p>This is an automated email from Expense Tracker App</p>
          <p>&copy; ${new Date().getFullYear()} Expense Tracker. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  // Send email asynchronously without blocking response
  sendEmail(email, "Verify Your Email - Expense Tracker", html).catch((error) => {
    console.error("Failed to send verification email:", error);
  });

  return user;
};

// Email Login
exports.login = async (email, password, fcmToken) => {
  const user = await User.findOne({ email });
  if (!user) throw new Error("Invalid email or password");

  const isMatch = await user.comparePassword(password);
  if (!isMatch) throw new Error("Invalid email or password");

  // Check if email is verified
  if (!user.isVerified) {
    throw new Error("Please verify your email before logging in. Check your inbox for the verification link.");
  }

  // update the user's fcmToken
  user.fcmToken = fcmToken;
  await user.save();

  const token = this.generateToken(user);
  return { user, token };
};

exports.forgotPassword = async (email) => {
  const user = await User.findOne({ email });
  if (!user) throw new Error("User not found");

  const resetToken = crypto.randomBytes(32).toString("hex");
  const resetTokenHashed = crypto.createHash("sha256").update(resetToken).digest("hex");

  user.resetPasswordToken = resetTokenHashed;
  user.resetPasswordExpire = Date.now() + 15 * 60 * 1000; // 15 min
  await user.save();

  const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;
  const html = `<p>You requested a password reset</p><a href="${resetUrl}">Reset Password</a>`;

  await sendEmail(user.email, "Password Reset", html);
};


// Reset Password
exports.resetPassword = async (token, password) => {
  const hashedToken = crypto.createHash("sha256").update(token).digest("hex");
  const user = await User.findOne({
    resetPasswordToken: hashedToken,
    resetPasswordExpire: { $gt: Date.now() },
  });

  if (!user) throw new Error("Invalid or expired token");

  user.password = password;
  user.resetPasswordToken = undefined;
  user.resetPasswordExpire = undefined;
  await user.save();
};

// Verify Email
exports.verifyEmail = async (token) => {
  const hashedToken = crypto.createHash("sha256").update(token).digest("hex");
  const user = await User.findOne({
    emailVerificationToken: hashedToken,
    emailVerificationExpire: { $gt: Date.now() },
  });

  if (!user) throw new Error("Invalid or expired verification token");

  user.isVerified = true;
  user.emailVerificationToken = undefined;
  user.emailVerificationExpire = undefined;
  await user.save();

  // Create default categories for newly verified user
  const existingCategories = await Category.find({ user: user._id });
  if (existingCategories.length === 0) {
    const categories = DEFAULT_CATEGORIES.map((c) => ({ ...c, user: user._id }));
    await Category.insertMany(categories);
  }

  return user;
};

// Resend Verification Email
exports.resendVerificationEmail = async (email) => {
  const user = await User.findOne({ email });
  if (!user) throw new Error("User not found");
  if (user.isVerified) throw new Error("Email is already verified");

  // Generate new verification token
  const verificationToken = crypto.randomBytes(32).toString("hex");
  const verificationTokenHashed = crypto.createHash("sha256").update(verificationToken).digest("hex");

  user.emailVerificationToken = verificationTokenHashed;
  user.emailVerificationExpire = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
  await user.save();

  // Send verification email
  const verificationUrl = `${process.env.APP_URL}/verify-email/${verificationToken}`;
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f4f4f4; }
        .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; }
        .content { padding: 30px; }
        .button { display: inline-block; padding: 12px 30px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        .footer { background: #333; color: white; padding: 20px; text-align: center; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Verify Your Email</h1>
        </div>
        <div class="content">
          <h2>Hi ${user.name},</h2>
          <p>Please verify your email address to access your Expense Tracker account.</p>
          <div style="text-align: center;">
            <a href="${verificationUrl}" class="button">Verify Email Address</a>
          </div>
          <p>Or copy and paste this link into your browser:</p>
          <p style="word-break: break-all; color: #667eea;">${verificationUrl}</p>
          <p><strong>This link will expire in 24 hours.</strong></p>
        </div>
        <div class="footer">
          <p>This is an automated email from Expense Tracker App</p>
          <p>&copy; ${new Date().getFullYear()} Expense Tracker. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  // Send email asynchronously without blocking response
  sendEmail(email, "Verify Your Email - Expense Tracker", html).catch((error) => {
    console.error("Failed to resend verification email:", error);
  });
};

// Generate random password
function generateRandomPassword(length = 12) {
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
  let password = "";
  for (let i = 0; i < length; i++) {
    password += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return password;
}

// Set passwords for existing Google users and email them
exports.setPasswordsForGoogleUsers = async () => {
  const bcrypt = require("bcrypt");

  // Find all Google users without passwords or with unverified status
  const googleUsers = await User.find({
    googleId: { $exists: true }
  });

  const results = [];

  for (const user of googleUsers) {
    try {
      // Generate random password
      const randomPassword = generateRandomPassword();
      const hashedPassword = await bcrypt.hash(randomPassword, 10);

      // Update user
      user.password = hashedPassword;
      user.isVerified = true; // Mark Google users as verified
      await user.save();

      // Send email with password
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f4f4f4; }
            .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; }
            .content { padding: 30px; }
            .password-box { background: #f8f9fa; border-radius: 8px; padding: 20px; margin: 20px 0; border-left: 4px solid #667eea; text-align: center; }
            .password { font-family: monospace; font-size: 20px; font-weight: bold; color: #667eea; letter-spacing: 2px; }
            .warning { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; }
            .footer { background: #333; color: white; padding: 20px; text-align: center; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Your Expense Tracker Password</h1>
            </div>
            <div class="content">
              <h2>Hi ${user.name},</h2>
              <p>We've enabled password-based login for your Expense Tracker account. You can now log in using either Google or your email and password.</p>

              <div class="password-box">
                <p><strong>Your Temporary Password:</strong></p>
                <div class="password">${randomPassword}</div>
              </div>

              <div class="warning">
                <strong>⚠️ Important Security Notice:</strong>
                <ul style="text-align: left; margin: 10px 0;">
                  <li>This is a temporary password generated for your account</li>
                  <li>Please change this password after your first login</li>
                  <li>You can change your password in Settings > Change Password</li>
                  <li>Keep this password secure and don't share it with anyone</li>
                </ul>
              </div>

              <p><strong>Login Information:</strong></p>
              <ul style="text-align: left;">
                <li>Email: ${user.email}</li>
                <li>Password: (shown above)</li>
              </ul>

              <p>You can login at: <a href="${process.env.APP_URL}/login">${process.env.APP_URL}/login</a></p>

              <p>If you didn't request this, please contact support immediately.</p>
            </div>
            <div class="footer">
              <p>This is an automated email from Expense Tracker App</p>
              <p>&copy; ${new Date().getFullYear()} Expense Tracker. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `;

      await sendEmail(user.email, "Your Expense Tracker Password", html);

      results.push({
        userId: user._id,
        email: user.email,
        success: true,
      });

      // Add delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch (error) {
      results.push({
        userId: user._id,
        email: user.email,
        success: false,
        error: error.message,
      });
    }
  }

  return results;
};

// Change Password
exports.changePassword = async (userId, currentPassword, newPassword) => {
  const user = await User.findById(userId);
  if (!user) throw new Error("User not found");

  // Check if user has a password (Google users might not have set one yet)
  if (!user.password) {
    throw new Error("Please set a password first. You logged in with Google.");
  }

  // Verify current password
  const isMatch = await user.comparePassword(currentPassword);
  if (!isMatch) throw new Error("Current password is incorrect");

  // Validate new password
  if (newPassword.length < 6) {
    throw new Error("New password must be at least 6 characters long");
  }

  // Update password
  user.password = newPassword;
  await user.save();

  return { message: "Password changed successfully" };
};
