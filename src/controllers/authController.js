const authService = require("../services/authService");

exports.googleAuth = async (req, res) => {
  try {
    const { idToken } = req.body;

    const user = await authService.findOrCreateUser(idToken);
    const token = authService.generateToken(user);

    // Remove sensitive data from response
    const userResponse = user.toObject();
    delete userResponse.password;
    delete userResponse.emailVerificationToken;
    delete userResponse.resetPasswordToken;

    res.status(200).json({ user: userResponse, token });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getProfile = async (req, res) => {
  try {
    const user = await authService.getUser(req.user.id);
    res.status(200).json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.register = async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const ip = req.clientIp;
    const geoInfo = req.geoInfo;

    const user = await authService.register(name, email, password, ip, geoInfo);
    res.status(201).json({ message: "User registered successfully", user });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password, fcmToken } = req.body;
    const ip = req.clientIp;
    const geoInfo = req.geoInfo;
    const userAgent = req.get("user-agent");

    const { user, token } = await authService.login(
      email,
      password,
      fcmToken,
      ip,
      geoInfo,
      userAgent
    );

    // Remove sensitive data from response
    const userResponse = user.toObject();
    delete userResponse.password;
    delete userResponse.emailVerificationToken;
    delete userResponse.resetPasswordToken;

    res.status(200).json({ user: userResponse, token });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    await authService.forgotPassword(email);
    res.status(200).json({ message: "Password reset link sent to your email" });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;
    await authService.resetPassword(token, password);
    res.status(200).json({ message: "Password reset successful" });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};


exports.verifyEmail = async (req, res) => {
  try {
    const { token } = req.params;
    const user = await authService.verifyEmail(token);
    res.status(200).json({
      message: "Email verified successfully! You can now log in.",
      user
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.resendVerificationEmail = async (req, res) => {
  try {
    const { email } = req.body;
    await authService.resendVerificationEmail(email);
    res.status(200).json({ message: "Verification email sent. Please check your inbox." });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.setPasswordsForGoogleUsers = async (req, res) => {
  try {
    const result = await authService.setPasswordsForGoogleUsers();
    res.status(200).json({
      message: "Passwords generated and emailed to all Google users",
      result,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id; // From auth middleware

    const result = await authService.changePassword(userId, currentPassword, newPassword);
    res.status(200).json(result);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};
