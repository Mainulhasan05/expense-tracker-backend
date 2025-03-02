const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    googleId: { type: String, required: true, unique: true },
    name: String,
    email: { type: String, unique: true },
    role: { type: String, enum: ["user", "admin"], default: "user" },
    picture: {
      type: String,
      default:
        "https://img.freepik.com/free-vector/illustration-businessman_53876-5856.jpg",
    },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
