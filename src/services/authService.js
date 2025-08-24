const User = require("../models/User");
const sendEmail = require("../utils/sendEmail");
const Category = require("../models/Category");
const jwt = require("jsonwebtoken");
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
    user = await User.create({ googleId, name, email, picture });
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

  user = await User.create({ name, email, password, isVerified: true }); // skip email verification for now
  const categories = DEFAULT_CATEGORIES.map((c) => ({ ...c, user: user._id }));
  await Category.insertMany(categories);
  return user;
};

// Email Login
exports.login = async (email, password, fcmToken) => {
  const user = await User.findOne({ email });
  if (!user) throw new Error("Invalid email or password");


  const isMatch = await user.comparePassword(password);
  if (!isMatch) throw new Error("Invalid email or password");
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

exports.setDummyPasswordForGoogleUsers = async () => {
  const bcrypt = require("bcrypt");
  const hashedPassword = await bcrypt.hash("123456", 10);

  const result = await User.updateMany(
    { googleId: { $exists: true }, password: { $exists: false } },
    { $set: { password: hashedPassword } }
  );

  return result;
};
