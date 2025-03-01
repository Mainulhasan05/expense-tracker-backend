const User = require("../models/User");
const jwt = require("jsonwebtoken");
const validateGoogleAccessToken = require("../utils/validateGoogleAccessToken");

exports.findOrCreateUser = async (idToken) => {
  const googleData = await validateGoogleAccessToken(idToken);

  const { googleId, name, email, picture } = googleData.user;
  let user = await User.findOne({ googleId });

  if (!user) {
    user = await User.create({ googleId, name, email, picture });
  }

  return user;
};

exports.generateToken = (user) => {
  return jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: "7d",
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
