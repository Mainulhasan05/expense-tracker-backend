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
