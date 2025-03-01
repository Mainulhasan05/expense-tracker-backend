const Category = require("../models/Category");

exports.createCategory = async (userId, name, type) => {
  const category = new Category({ user: userId, name, type });
  return await category.save();
};

exports.getUserCategories = async (userId) => {
  return await Category.find({ $or: [{ user: userId }, { user: null }] });
};
