const User = require("../models/User");
const Category = require("../models/Category");
const jwt = require("jsonwebtoken");
const validateGoogleAccessToken = require("../utils/validateGoogleAccessToken");
const DEFAULT_CATEGORIES = [
  { name: "Salary", type: "income" },
  { name: "Freelancing", type: "income" },
  { name: "Investment", type: "income" },
  { name: "Groceries", type: "expense" },
  { name: "Transport", type: "expense" },
  { name: "Entertainment", type: "expense" },
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
