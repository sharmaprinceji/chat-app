// server.js
import http from "http";
import express from "express";
import { Server } from "socket.io";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import mongoose from "mongoose";
import User from "./model/User.js";
import Conversation from "./model/Conversation.js";
import jwt from "jsonwebtoken";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.resolve("./public")));

const server = http.createServer(app);

mongoose
  .connect(process.env.MONGO)
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.error("Mongo connect err", err));

const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

// Keep map userName -> socketId
const onlineMap = new Map();

// Ensure a public conversation exists at startup
async function ensurePublicConversation() {
  const pub = await Conversation.findOne({ type: "public" });
  if (!pub) {
    await Conversation.create({
      type: "public",
      participants: [],
      messages: [],
    });
    console.log("Created public conversation");
  }
}
ensurePublicConversation().catch(console.error);

/* ---------- REST API ---------- */

// create or get user
app.post("/users", async (req, res) => {
  try {
    const { name, email, userName, exist = false } = req.body;

    if (!userName) {
      return res.status(400).json({ message: "userName is required" });
    }

    let user = await User.findOne({ userName });

    // ---------- LOGIN FLOW ----------
    if (exist) {
      if (!user) {
        return res
          .status(404)
          .json({ message: "User not found. Please sign up." });
      }
      // generate token
      const token = jwt.sign(
        { id: user._id, userName: user.userName },
         process.env.JWT_SECRET,
        { expiresIn: "1h" }
      );
      return res.json({ message: "Login successful", token, user });
    }

    // ---------- SIGNUP FLOW ----------
    if (user) {
      return res
        .status(400)
        .json({ message: "Account already exists. Please login." });
    }

    // create new user
    user = await User.create({ name, email, userName });
    const token = jwt.sign(
      { id: user._id, userName: user.userName },
       process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    res
      .status(201)
      .json({ message: "Account created successfully", token, user });
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ message: "Error handling user", error: err.message });
  }
});

// list users (basic info)
app.get("/users", async (req, res) => {
  try {
    const users = await User.find(
      {},
      { name: 1, userName: 1, avatar: 1, status: 1 }
    ).sort({ name: 1 });
    res.json(users);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching users" });
  }
});

// get public messages (oldest -> newest)
app.get("/messages/public", async (req, res) => {
  try {
    const conv = await Conversation.findOne(
      { type: "public" },
      { messages: 1 }
    );
    const msgs = conv
      ? conv.messages.sort((a, b) => new Date(a.time) - new Date(b.time))
      : [];
    res.json(msgs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching public messages" });
  }
});

// get private conversation messages between a & b (oldest -> newest)
app.get("/messages/private/:a/:b", async (req, res) => {
  try {
    const { a, b } = req.params;
    // participants stored as [a,b] or [b,a] - we use $all
    const conv = await Conversation.findOne({
      type: "private",
      participants: { $all: [a, b], $size: 2 },
    });
    const msgs = conv
      ? conv.messages
          .filter((m) => m.chatType === "private")
          .sort((x, y) => new Date(x.time) - new Date(y.time))
      : [];
    res.json(msgs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching private messages" });
  }
});

// get conversation list for user (recent activity) - useful for left list
app.get("/conversations/:userName", async (req, res) => {
  try {
    const { userName } = req.params;
    // find private convs containing this user
    const convs = await Conversation.aggregate([
      { $match: { type: "private", participants: userName } },
      {
        $project: {
          participants: 1,
          lastMessage: { $arrayElemAt: ["$messages", -1] },
        },
      },
      { $sort: { "lastMessage.time": -1 } },
    ]);
    // transform to a simple list of the other participant and lastMessage
    const list = convs.map((c) => {
      const other = c.participants.find((p) => p !== userName);
      return { userName: other, lastMessage: c.lastMessage || null };
    });
    res.json(list);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching conversations" });
  }
});

/* ---------- Socket handlers ---------- */

io.on("connection", (socket) => {
  console.log("Socket connected:", socket.id);

  // client tells server who they are after connecting
  socket.on("identify", (payload) => {
    const { userName } = payload;
    if (userName) {
      onlineMap.set(userName, socket.id);
      console.log("Identify:", userName, "->", socket.id);
    }
  });

  /*
    chat msg payload:
    {
      name, email, userName,
      chatType: 'public'|'private'|'group',
      to? (userName),
      message
    }
  */
  socket.on("chat msg", async (data) => {
    try {
      const {
        name,
        email,
        userName,
        chatType = "public",
        to = null,
        message,
      } = data;
      if (!userName || !message) return;

      // ensure user exists
      await User.findOneAndUpdate(
        { userName },
        { $set: { name, email } },
        { upsert: true }
      );

      // build message object
      const msgObj = {
        text: message,
        by: userName,
        to: to,
        chatType,
        time: new Date(),
      };

      if (chatType === "public") {
        // append to public conversation
        await Conversation.findOneAndUpdate(
          { type: "public" },
          { $push: { messages: msgObj } },
          { upsert: true, new: true }
        );
        // broadcast
        socket.broadcast.emit("receive_msg", { ...data, time: msgObj.time });
      } else if (chatType === "private") {
        // find or create conversation with participants [userName, to] (size 2)
        const participants = [userName, to].sort();
        const conv = await Conversation.findOneAndUpdate(
          { type: "private", participants: participants },
          {
            $push: { messages: msgObj },
            $setOnInsert: { type: "private", participants: participants },
          },
          { upsert: true, new: true }
        );

        // emit to sender and recipient sockets if online
        const senderSocket = onlineMap.get(userName);
        const recipientSocket = onlineMap.get(to);

        if (senderSocket)
          io.to(senderSocket).emit("receive_msg", {
            ...data,
            time: msgObj.time,
          });
        if (recipientSocket)
          io.to(recipientSocket).emit("receive_msg", {
            ...data,
            time: msgObj.time,
          });
      } else if (chatType === "group") {
        // store group message in a group conv (here basic placeholder)
        const conv = await Conversation.findOneAndUpdate(
          { type: "group", groupName: "default" }, // placeholder
          { $push: { messages: msgObj } },
          { upsert: true, new: true }
        );
        io.emit("receive_msg", { ...data, time: msgObj.time });
      }
    } catch (err) {
      console.error("chat msg err", err);
    }
  });

  socket.on("disconnect", () => {
    // remove from onlineMap
    for (const [uname, sid] of onlineMap.entries()) {
      if (sid === socket.id) onlineMap.delete(uname);
    }
    console.log("Socket disconnected", socket.id);
  });
});

const PORT = process.env.PORT || 9000;
server.listen(PORT, () => console.log("Server running on", PORT));
