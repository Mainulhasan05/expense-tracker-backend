const categoryService = require("../services/categoryService");

exports.addCategory = async (req, res) => {
  try {
    const category = await categoryService.createCategory(
      req.user.id,
      req.body.name,
      req.body.type
    );
    res.status(201).json(category);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.getCategories = async (req, res) => {
  try {
    const categories = await categoryService.getUserCategories(req.user.id);
    res.status(200).json(categories);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};
