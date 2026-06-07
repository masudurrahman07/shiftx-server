const express = require('express');
const cors = require('cors');
const { MongoClient, ObjectId } = require('mongodb');
const dotenv = require('dotenv');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const DB_URI = process.env.DB_URI;
const JWT_SECRET = process.env.JWT_SECRET;

if (!DB_URI) {
  console.error('Missing DB_URI in environment variables');
  process.exit(1);
}

if (!JWT_SECRET) {
  console.error('Missing JWT_SECRET in environment variables');
  process.exit(1);
}

app.use(cors());
app.use(express.json());

const client = new MongoClient(DB_URI);
let usersCollection;
let tasksCollection;

async function startServer() {
  await client.connect();
  const db = client.db();
  usersCollection = db.collection('users');
  tasksCollection = db.collection('tasks');

  app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.split(' ')[1]
    : null;

  if (!token) {
    return res.status(401).json({ error: 'Authentication token missing' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

app.post('/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const existingUser = await usersCollection.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await usersCollection.insertOne({ email, password: hashedPassword, name: name || '' });

    return res.status(201).json({ userId: result.insertedId.toString(), email });
  } catch (error) {
    console.error('Register error:', error);
    return res.status(500).json({ error: 'Failed to register user' });
  }
});

app.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await usersCollection.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ userId: user._id.toString(), email: user.email }, JWT_SECRET, { expiresIn: '8h' });
    return res.json({ token });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Failed to login' });
  }
});

app.get('/tasks', verifyToken, async (req, res) => {
  try {
    const tasks = await tasksCollection.find({ userId: req.user.userId }).toArray();
    return res.json(tasks);
  } catch (error) {
    console.error('Get tasks error:', error);
    return res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

app.post('/tasks', verifyToken, async (req, res) => {
  try {
    const { title, description, completed } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'Task title is required' });
    }

    const task = {
      userId: req.user.userId,
      title,
      description: description || '',
      completed: completed === true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await tasksCollection.insertOne(task);
    return res.status(201).json({ ...task, _id: result.insertedId });
  } catch (error) {
    console.error('Create task error:', error);
    return res.status(500).json({ error: 'Failed to create task' });
  }
});

app.patch('/tasks/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = {};
    const { title, description, completed } = req.body;

    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (completed !== undefined) updates.completed = completed;
    updates.updatedAt = new Date();

    const result = await tasksCollection.findOneAndUpdate(
      { _id: new ObjectId(id), userId: req.user.userId },
      { $set: updates },
      { returnDocument: 'after' }
    );

    if (!result.value) {
      return res.status(404).json({ error: 'Task not found' });
    }

    return res.json(result.value);
  } catch (error) {
    console.error('Update task error:', error);
    return res.status(500).json({ error: 'Failed to update task' });
  }
});

app.delete('/tasks/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await tasksCollection.deleteOne({ _id: new ObjectId(id), userId: req.user.userId });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    return res.json({ success: true });
  } catch (error) {
    console.error('Delete task error:', error);
    return res.status(500).json({ error: 'Failed to delete task' });
  }
});

app.get('/', (req, res) => {
  res.send('ShiftX backend is running');
});

startServer().catch(error => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
