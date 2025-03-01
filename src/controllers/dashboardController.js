const dashboardService = require("../services/dashboardService");

exports.getDashboard = async (req, res) => {
  try {
    const data = await dashboardService.getDashboardData(req.user.id);
    res.status(200).json(data);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};
