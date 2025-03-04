const Task = require("../models/Task");
const mongoose = require("mongoose");

exports.createTask = async (userId, title, dueDate) => {
  return await Task.create({ user: userId, title, dueDate });
};

exports.getUserTasks = async (userId) => {
  return await Task.find({ user: userId });
};

exports.updateTaskStatus = async (taskId, completed) => {
  return await Task.findByIdAndUpdate(taskId, { completed }, { new: true });
};

exports.deleteTask = async (userId, taskId) => {
  const userIdObj = new mongoose.Types.ObjectId(userId);
  const task = await Task.findOneAndDelete({ _id: taskId, user: userId });
  return task;
};
