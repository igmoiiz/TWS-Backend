const mongoose = require('mongoose');

const FeedSchema = new mongoose.Schema({
  imageUrl: { type: String, required: true },
  caption: { type: String, required: true },
  likes: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  comments: [
    {
      user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      text: String,
      createdAt: { type: Date, default: Date.now },
    },
  ],
  createdAt: { type: Date, default: Date.now, index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
});

module.exports = mongoose.model("Feed", FeedSchema);