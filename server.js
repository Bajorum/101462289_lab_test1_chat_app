const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.json());
app.use(cors());
app.use(express.static('public'));

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
.then(() => console.log('MongoDB Connected'))
.catch(err => console.error('MongoDB connection error:', err));

// User Schema
const UserSchema = new mongoose.Schema({
    username: { type: String, unique: true, required: true },
    password: { type: String, required: true },
}, { timestamps: true });

const User = mongoose.model('User', UserSchema);

// Message Schema
const MessageSchema = new mongoose.Schema({
    username: String,
    room: String,
    message: String,
    date_sent: { type: Date, default: Date.now }
});

const Message = mongoose.model('Message', MessageSchema);

// Signup Route
app.post('/signup', async (req, res) => {
    const { username, password } = req.body;
    try {
        const existingUser = await User.findOne({ username });
        if (existingUser) return res.status(409).json({ error: 'Username already exists' });

        const newUser = new User({ username, password });
        await newUser.save();
        res.status(201).json({ message: 'Signup successful' });
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Login Route
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const user = await User.findOne({ username, password });
        if (!user) return res.status(401).json({ error: 'Invalid username or password' });

        res.status(200).json({ message: 'Login successful' });
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Socket.io Chat Handling
io.on('connection', (socket) => {
    console.log('New user connected');

    socket.on('joinRoom', async ({ username, room }) => {
        socket.join(room);
        
        const messages = await Message.find({ room }).sort({ date_sent: 1 });
        socket.emit('messageHistory', messages);

        socket.broadcast.to(room).emit('message', { username: 'System', message: `${username} joined ${room}` });
    });

    socket.on('chatMessage', async ({ username, room, message }) => {
        const newMessage = new Message({ username, room, message });
        await newMessage.save();

        io.to(room).emit('message', newMessage);
    });

    socket.on('leaveRoom', (room) => {
        socket.leave(room);
    });

    socket.on('typing', ({ username, room }) => {
        socket.broadcast.to(room).emit('typing', { username });
    });

    socket.on('disconnect', () => {
        console.log('User disconnected');
    });
});

// Start the Server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
