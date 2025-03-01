const Task = require("../models/Task");

exports.createTask = async (userId, title, dueDate) => {
  return await Task.create({ user: userId, title, dueDate });
};

exports.getUserTasks = async (userId) => {
  return await Task.find({ user: userId });
};

exports.updateTaskStatus = async (taskId, completed) => {
  return await Task.findByIdAndUpdate(taskId, { completed }, { new: true });
};
