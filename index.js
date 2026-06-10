const express = require("express");
const cors = require("cors");
const { MongoClient, ObjectId } = require("mongodb");
const dotenv = require("dotenv");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const DB_URI = process.env.DB_URI;
const JWT_SECRET = process.env.JWT_SECRET;

if (!DB_URI) {
  console.error("Missing DB_URI in environment variables");
  process.exit(1);
}

if (!JWT_SECRET) {
  console.error("Missing JWT_SECRET in environment variables");
  process.exit(1);
}

app.use(cors());
app.use(express.json());

const client = new MongoClient(DB_URI);

let usersCollection;
let tasksCollection;

async function startServer() {
  await client.connect();
  const db = client.db("shiftxDB");

  usersCollection = db.collection("users");
  tasksCollection = db.collection("tasks");

  app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

// Middleware to verify JWT token and attach user info to request
function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;

  const token =
    authHeader && authHeader.startsWith("Bearer ")
      ? authHeader.split(" ")[1]
      : null;

  if (!token) {
    return res
      .status(401)
      .json({ error: "Authentication token missing" });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (error) {
    return res
      .status(401)
      .json({ error: "Invalid or expired token" });
  }
}

function buildTaskUserFilter(userId) {
  const filters = [{ userId }];

  if (ObjectId.isValid(userId)) {
    filters.push({ userId: new ObjectId(userId) });
  }

  return { $or: filters };
}

// Register new user and create starter tasks
app.post("/register", async (req, res) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password) {
      return res
        .status(400)
        .json({ error: "Email and password are required" });
    }

    const existingUser = await usersCollection.findOne({ email });

    if (existingUser) {
      return res
        .status(409)
        .json({ error: "Email already registered" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await usersCollection.insertOne({
      email,
      password: hashedPassword,
      name: name || "",
    });

    const userId = result.insertedId.toString();

    // Starter tasks for demo / pagination
    const starterTasks = [
      {
        userId,
        title: "Complete React Assignment",
        description:
          "Finish the internship React dashboard UI before Friday.",
        completed: false,
        priority: "high",
        dueDate: "2026-09-10",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        userId,
        title: "Prepare MongoDB Notes",
        description:
          "Revise CRUD operations and aggregation pipeline.",
        completed: false,
        priority: "medium",
        dueDate: "2026-09-12",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        userId,
        title: "Practice DSA",
        description:
          "Solve at least 5 LeetCode problems today.",
        completed: false,
        priority: "medium",
        dueDate: "2026-09-15",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        userId,
        title: "Update Resume",
        description:
          "Add latest MERN projects and internship work.",
        completed: false,
        priority: "low",
        dueDate: "2026-09-18",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        userId,
        title: "Deploy Task Manager",
        description:
          "Deploy frontend and backend before project submission.",
        completed: false,
        priority: "high",
        dueDate: "2026-09-20",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        userId,
        title: "Change Name",
        description:
          "I have to change my name within 3 days in PUBG and Counter Strike",
        completed: false,
        priority: "high",
        dueDate: "2026-09-06",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    await tasksCollection.insertMany(starterTasks);

    return res.status(201).json({
      userId,
      email,
    });
  } catch (error) {
    console.error("Register error:", error);

    return res
      .status(500)
      .json({ error: "Failed to register user" });
  }
});

// Login user and return JWT token
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res
        .status(400)
        .json({ error: "Email and password are required" });
    }

    const user = await usersCollection.findOne({ email });

    if (!user) {
      return res
        .status(401)
        .json({ error: "Invalid credentials" });
    }

    const passwordMatch = await bcrypt.compare(
      password,
      user.password
    );

    if (!passwordMatch) {
      return res
        .status(401)
        .json({ error: "Invalid credentials" });
    }

    const token = jwt.sign(
      {
        userId: user._id.toString(),
        email: user.email,
      },
      JWT_SECRET,
      { expiresIn: "8h" }
    );

    return res.json({ token });
  } catch (error) {
    console.error("Login error:", error);
    return res
      .status(500)
      .json({ error: "Failed to login" });
  }
});

// Get tasks for authenticated user
app.get("/tasks", verifyToken, async (req, res) => {
  try {
    const tasks = await tasksCollection
      .find(buildTaskUserFilter(req.user.userId.toString()))
      .toArray();

    return res.json(tasks);
  } catch (error) {
    console.error("Get tasks error:", error);
    return res
      .status(500)
      .json({ error: "Failed to fetch tasks" });
  }
});

// Create new task for authenticated user
app.post("/tasks", verifyToken, async (req, res) => {
  try {
    const {
      title,
      description,
      completed,
      priority,
      dueDate,
    } = req.body;

    if (!title) {
      return res
        .status(400)
        .json({ error: "Task title is required" });
    }

    const task = {
      userId: req.user.userId.toString(), 
      title,
      description: description || "",
      completed: completed === true,
      priority: priority || "medium",
      dueDate: dueDate || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await tasksCollection.insertOne(task);

    return res.status(201).json({
      ...task,
      _id: result.insertedId,
    });
  } catch (error) {
    console.error("Create task error:", error);
    return res
      .status(500)
      .json({ error: "Failed to create task" });
  }
});

// Update task by id for authenticated user
app.patch("/tasks/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid task id" });
    }

    const updates = {};
    const allowedFields = ["title", "description", "completed", "priority", "dueDate"];

    for (const key of allowedFields) {
      if (req.body[key] !== undefined) {
        updates[key] = req.body[key];
      }
    }
    updates.updatedAt = new Date();

   
    const result = await tasksCollection.findOneAndUpdate(
      {
        _id: new ObjectId(id),
        userId: req.user.userId.toString(),  // consistent with how you store it
      },
      { $set: updates },
      { returnDocument: "after" }
    );

    if (!result) {
      return res.status(404).json({ error: "Task not found" });
    }

    return res.json(result);
  } catch (error) {
    console.error("PATCH ERROR:", error);
    return res.status(500).json({ error: "Failed to update task" });
  }
});

// Delete task by id for authenticated user
app.delete("/tasks/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ error: "Invalid task id" });
    }

    const result = await tasksCollection.deleteOne({
  _id: new ObjectId(id),
  userId: req.user.userId.toString(),
});

    if (result.deletedCount === 0) {
      return res
        .status(404)
        .json({ error: "Task not found" });
    }

    return res.json({ success: true });
  } catch (error) {
    console.error("Delete task error:", error);
    return res
      .status(500)
      .json({ error: "Failed to delete task" });
  }
});

// Health check endpoint
app.get("/", (req, res) => {
  res.send("ShiftX backend is running");
});

// Start the server
startServer().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});