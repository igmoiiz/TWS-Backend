const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const { body, validationResult } = require("express-validator");
const dotenv = require("dotenv");

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

// MongoDB Connection
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("MongoDB connection error:", err));

// Schemas
const User = require('./models/user.model.js');
const Signal = require('./models/signal.model.js');
const Feed = require('./models/feed.model.js');

// Middleware for Authentication
const authMiddleware = async (req, res, next) => {
  try {
    const token = req.header("Authorization")?.replace("Bearer ", "");
    if (!token)
      return res.status(401).json({ error: "Authentication required" });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);

    if (!user) return res.status(401).json({ error: "User not found" });

    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ error: "Invalid token" });
  }
};

const adminMiddleware = (req, res, next) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
};

// Validation Middleware
const validateSignup = [
  body("email").isEmail().withMessage("Invalid email"),
  body("password")
    .isLength({ min: 6 })
    .withMessage("Password must be at least 6 characters"),
];

const validateLogin = [
  body("email").isEmail().withMessage("Invalid email"),
  body("password").notEmpty().withMessage("Password is required"),
];

// Authentication Routes
// User Signup
app.post("/api/auth/user/signup", validateSignup, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password, isPremium } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: "Email already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({
      email,
      password: hashedPassword,
      isPremium: isPremium || false,
      role: "user",
    });

    await user.save();

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: "1d",
    });

    res.status(201).json({ token, user: { id: user._id, email, isPremium } });
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
});

// Admin Signup
app.post("/api/auth/admin/signup", validateSignup, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: "Email already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({
      email,
      password: hashedPassword,
      role: "admin",
    });

    await user.save();

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: "1d",
    });

    res
      .status(201)
      .json({ token, user: { id: user._id, email, role: "admin" } });
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
});

// User Login
app.post("/api/auth/user/login", validateLogin, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;
    const user = await User.findOne({ email, role: "user" });

    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: "1d",
    });

    res.json({
      token,
      user: { id: user._id, email, isPremium: user.isPremium },
    });
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
});

// Admin Login
app.post("/api/auth/admin/login", validateLogin, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;
    const user = await User.findOne({ email, role: "admin" });

    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: "1d",
    });

    res.json({ token, user: { id: user._id, email, role: "admin" } });
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
});

// Logout (Client-side token removal)
app.post("/api/auth/logout", (req, res) => {
  res.json({
    message: "Logout successful. Please remove the token from client storage.",
  });
});

// Signal Routes
// Create Signal (Admin only)
app.post("/api/signals", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { title, description, type } = req.body;

    if (!["free", "premium"].includes(type)) {
      return res.status(400).json({ error: "Invalid signal type" });
    }

    const signal = new Signal({
      title,
      description,
      type,
      createdBy: req.user._id,
    });

    await signal.save();
    res.status(201).json(signal);
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
});

// Get Signals (Filtered by user tier, with optional 'since' query)
app.get("/api/signals", authMiddleware, async (req, res) => {
  try {
    const { since } = req.query;
    const query = req.user.isPremium ? {} : { type: "free" };

    if (since) {
      query.createdAt = { $gt: new Date(since) };
    }

    const signals = await Signal.find(query)
      .populate("createdBy", "email")
      .sort({ createdAt: -1 });
    res.json(signals);
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
});

// Feed Routes
// Create Feed Post (Admin only)
app.post("/api/feed", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { imageUrl, caption } = req.body;

    if (!imageUrl || !caption) {
      return res
        .status(400)
        .json({ error: "Image URL and caption are required" });
    }

    const feedPost = new Feed({
      imageUrl,
      caption,
      createdBy: req.user._id,
    });

    await feedPost.save();
    res.status(201).json(feedPost);
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
});

// Get Feed Posts (with optional 'since' query)
app.get("/api/feed", authMiddleware, async (req, res) => {
  try {
    const { since } = req.query;
    const query = since ? { createdAt: { $gt: new Date(since) } } : {};

    const feedPosts = await Feed.find(query)
      .populate("createdBy", "email")
      .populate("comments.user", "email")
      .sort({ createdAt: -1 });
    res.json(feedPosts);
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
});

// Like Feed Post
app.post("/api/feed/:id/like", authMiddleware, async (req, res) => {
  try {
    const feedPost = await Feed.findById(req.params.id);
    if (!feedPost) {
      return res.status(404).json({ error: "Feed post not found" });
    }

    const userIndex = feedPost.likes.indexOf(req.user._id);
    if (userIndex === -1) {
      feedPost.likes.push(req.user._id);
    } else {
      feedPost.likes.splice(userIndex, 1);
    }

    await feedPost.save();
    res.json(feedPost);
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
});

// Comment on Feed Post
app.post("/api/feed/:id/comment", authMiddleware, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) {
      return res.status(400).json({ error: "Comment text is required" });
    }

    const feedPost = await Feed.findById(req.params.id);
    if (!feedPost) {
      return res.status(404).json({ error: "Feed post not found" });
    }

    feedPost.comments.push({
      user: req.user._id,
      text,
    });

    await feedPost.save();
    res.json(feedPost);
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
});

// Error Handling Middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: "Something went wrong!" });
});

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
