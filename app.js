import http from "http";
import express from "express";
import { Server } from "socket.io";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import mongoose from "mongoose";
import Message from "./model/messageSchema.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.resolve("./public")));

const server = http.createServer(app);

// Database connection
mongoose
  .connect(process.env.DATABASE)
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.error("Error connecting to MongoDB:", err));

const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

// Routes
app.get("/", (req, res) => {
  res.sendFile("/public/index.html");
});

// fetch messages (flattened & sorted by time ASC)
app.get("/messages", async (req, res) => {
  try {
    const allMessages = await Message.aggregate([
      { $unwind: "$messages" },
      {
        $project: {
          _id: 0,
          name: 1,
          email: 1,
          text: "$messages.text",
          time: "$messages.time",
        },
      },
      { $sort: { time: 1 } },
    ]);

    res.status(200).json(allMessages);
  } catch (error) {
    console.error("Error fetching messages:", error);
    res.status(500).json({ message: "Error fetching messages", error });
  }
});

let users = 0;

// Socket.io chat
io.on("connection", (socket) => {
  users++;
  console.log(`New User connected: ${socket.id} and total users: ${users}`);

  socket.on("chat msg", async (data) => {
    try {
      io.emit("receive_msg", data);

      const { name, email, message } = data;

      // check if user exists by (name + email)
      let user = await Message.findOne({ name, email });

      if (user) {
        user.messages.push({ text: message });
        await user.save();
        console.log("Message saved for existing user");
      } else {
        const newUser = new Message({
          name,
          email,
          messages: [{ text: message }],
        });
        await newUser.save();
        console.log("New user created & message saved");
      }
    } catch (err) {
      console.error("Error saving message:", err);
    }
  });

  socket.on("disconnect", () => {
    users--;
    console.log(`User disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 9000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
