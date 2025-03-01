const User = require("../models/User");
const jwt = require("jsonwebtoken");
const validateGoogleAccessToken = require("../utils/validateGoogleAccessToken");

exports.findOrCreateUser = async (idToken) => {
  const googleData = await validateGoogleAccessToken(idToken);
  console.log(googleData);
  const { googleId, name, email } = googleData.user;
  let user = await User.findOne({ googleId });

  if (!user) {
    user = await User.create({ googleId, name, email });
  }

  return user;
};

exports.generateToken = (user) => {
  return jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });
};
