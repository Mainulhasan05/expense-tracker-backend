const Category = require("../models/Category");
const mongoose = require("mongoose");

exports.createCategory = async (userId, name, type) => {
  const category = new Category({ user: userId, name, type });
  return await category.save();
};

exports.getUserCategories = async (userId) => {
  return await Category.find({ $or: [{ user: userId }, { user: null }] });
};

// deleteCategory
exports.deleteCategory = async (userId, categoryId) => {
  try {
    // Convert userId to ObjectId if it's not already
    const userObjectId = new mongoose.Types.ObjectId(userId);

    const category = await Category.findOne({
      _id: categoryId,
      user: userObjectId,
    });
    if (!category) {
      throw new Error("Category not found");
    }

    await Category.deleteOne({ _id: categoryId, user: userObjectId });

    return { message: "Category deleted successfully", category };
  } catch (error) {
    throw new Error(
      error.message || "An error occurred while deleting the category"
    );
  }
};
