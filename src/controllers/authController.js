const authService = require("../services/authService");

exports.googleAuth = async (req, res) => {
  try {
    const { idToken } = req.body;

    const user = await authService.findOrCreateUser(idToken);
    const token = authService.generateToken(user);

    res.status(200).json({ user, token });
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
    const user = await authService.register(name, email, password);
    res.status(201).json({ message: "User registered successfully", user });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password, fcmToken } = req.body;
    const { user, token } = await authService.login(email, password,fcmToken);
    res.status(200).json({ user, token });
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


exports.setDummyPasswordForGoogleUsers = async (req, res) => {
  try {
    const result = await authService.setDummyPasswordForGoogleUsers();
    res.status(200).json({
      message: "Dummy password set for all Google users",
      result,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
