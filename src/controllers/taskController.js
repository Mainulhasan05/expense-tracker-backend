const taskService = require("../services/taskService");

exports.addTask = async (req, res) => {
  try {
    const task = await taskService.createTask(
      req.user.id,
      req.body.title,
      req.body.dueDate
    );
    res.status(201).json(task);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.getTasks = async (req, res) => {
  try {
    const tasks = await taskService.getUserTasks(req.user.id);
    res.status(200).json(tasks);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.updateTask = async (req, res) => {
  try {
    const task = await taskService.updateTaskStatus(
      req.params.id,
      req.body.completed
    );
    res.status(200).json(task);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.deleteTask = async (req, res) => {
  try {
    await taskService.deleteTask(req.user.id, req.params.id);
    res.status(204).send();
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};
