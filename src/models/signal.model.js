const mongoose = require('mongoose');

const SignalSchema = new mongoose.Schema({
  title: String,
  description: String,
  type: { type: String, enum: ["free", "premium"], required: true },
  createdAt: { type: Date, default: Date.now, index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
});

module.exports = mongoose.model("Signal", SignalSchema);