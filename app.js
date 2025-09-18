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
import { on } from "events";

import multer from "multer";
import cloudinary from "cloudinary";
import streamifier from "streamifier";

dotenv.config();

// Configure Cloudinary
cloudinary.v2.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Multer setup for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit (adjust as needed)
});

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

// Auth middleware
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(403).json({ message: "No token provided" });
  }

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ message: "Invalid token" });
  }
}


// create or login user
app.post("/login", async (req, res) => {
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
      const token = jwt.sign(
        { id: user._id, userName: user.userName, role: user.role },
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

    if (!name || !email) {
      return res
        .status(400)
        .json({ message: "Name and Email required for signup." });
    }

    user = await User.create({ name, email, userName });
    const token = jwt.sign(
      { id: user._id, userName: user.userName, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );
    return res
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

//upload file with multer and cloudinary as well as send message
app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No file provided" });

    // req.file.buffer is available (multer memoryStorage)
    const { buffer, originalname, mimetype } = req.file;
    console.log("Received file:", originalname, mimetype, buffer.length);

    // upload buffer to Cloudinary using upload_stream
    const uploadResult = await new Promise((resolve, reject) => {
      const stream = cloudinary.v2.uploader.upload_stream(
        { folder: "talksphere", resource_type: "auto" }, // resource_type auto allows images/pdf, etc.
        (error, result) => (error ? reject(error) : resolve(result))
      );
      streamifier.createReadStream(buffer).pipe(stream);
    });

    // return useful metadata to client
    res.json({
      success: true,
      file: {
        url: uploadResult.secure_url,
        public_id: uploadResult.public_id,
        originalname,
        mimetype,
      },
    });
  } catch (err) {
    console.error("upload err", err);
    res
      .status(500)
      .json({ success: false, message: "Upload failed", error: err.message });
  }
});

// get public messages (oldest -> newest)
// app.get("/messages/public", async (req, res) => {
//   try {
//     const conv = await Conversation.findOne(
//       { type: "public" },
//       { messages: 1 }
//     );
//     const msgs = conv
//       ? conv.messages.sort((a, b) => new Date(a.time) - new Date(b.time))
//       : [];
//     res.json(msgs);
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ message: "Error fetching public messages" });
//   }
// });

app.get("/messages/public", async (req, res) => {
  try {
    const conv = await Conversation.findOne(
      { type: "public" },
      { messages: 1 }
    );
    const msgs = conv
      ? conv.messages
          .sort((a, b) => new Date(a.time) - new Date(b.time))
          .map((m) => ({
            _id: m._id, // 🔑 send _id
            by: m.by,
            text: m.text,
            file: m.file,
            time: m.time,
            chatType: m.chatType,
          }))
      : [];
    res.json(msgs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching public messages" });
  }
});

// get private conversation messages between a & b (oldest -> newest)
// app.get("/messages/private/:a/:b", async (req, res) => {
//   try {
//     const { a, b } = req.params;
//     // participants stored as [a,b] or [b,a] - we use $all
//     const conv = await Conversation.findOne({
//       type: "private",
//       participants: { $all: [a, b], $size: 2 },
//     });
//     const msgs = conv
//       ? conv.messages
//           .filter((m) => m.chatType === "private")
//           .sort((x, y) => new Date(x.time) - new Date(y.time))
//       : [];
//     res.json(msgs);
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ message: "Error fetching private messages" });
//   }
// });

app.get("/messages/private/:a/:b", async (req, res) => {
  try {
    const { a, b } = req.params;
    const conv = await Conversation.findOne({
      type: "private",
      participants: { $all: [a, b], $size: 2 },
    });
    const msgs = conv
      ? conv.messages
          .filter((m) => m.chatType === "private")
          .sort((x, y) => new Date(x.time) - new Date(y.time))
          .map((m) => ({
            _id: m._id, // 🔑 send _id
            by: m.by,
            text: m.text,
            file: m.file,
            time: m.time,
            chatType: m.chatType,
          }))
      : [];
    res.json(msgs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching private messages" });
  }
});

// get conversation list for user (recent activity) - useful for left list
// DELETE /messages/:id
app.delete("/messages/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { userName, role } = req.user;
    console.log("Delete request for msg id:", id, "by", userName);

    const query =
      role === "admin"
        ? { "messages._id": id }
        : { "messages._id": id, "messages.by": userName };

    const conversation = await Conversation.findOneAndUpdate(
      query,
      { $pull: { messages: { _id: id } } },
      { new: true }
    );

    if (!conversation) {
      return res
        .status(404)
        .json({ message: "Message not found or not allowed to delete" });
    }

    io.emit("messageDeleted", { id });
    res.json({ success: true });
  } catch (err) {
    res
      .status(500)
      .json({ message: "Error deleting message", err: err.message });
  }
});

//HARD DELETE private message
app.delete("/messages/private/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { userName, role } = req.user;

    // private conversation jisme message ho
    const conv = await Conversation.findOne({
      type: "private",
      "messages._id": id,
    });
    if (!conv) return res.status(404).json({ message: "Message not found" });

    const msg = conv.messages.id(id);

    // only author or admin can delete
    if (msg.by !== userName && role !== "admin") {
      return res
        .status(403)
        .json({ message: "Not allowed to delete this message" });
    }

    // 🗑️ Hard delete: remove from array
    msg.deleteOne();

    await conv.save();

    // notify only participants
    io.to(conv.participants).emit("messageDeleted", { id });

    res.json({ success: true });
  } catch (err) {
    console.error("delete private error:", err);
    res.status(500).json({ message: "Delete failed", error: err.message });
  }
});

/* ---------- Socket handlers ---------- */

io.on("connection", (socket) => {
  console.log(
    "New socket connected",
    socket.id,
    "Total users online:",
    onlineMap.size
  );

  // client tells server who they are after connecting
  socket.on("identify", (payload) => {
    const { userName } = payload;
    if (userName) {
      onlineMap.set(userName, socket.id);
      console.log("Identify:", userName, "->", socket.id);
    }
  });

  socket.on("chat msg", async (data) => {
    try {
      const {
        name,
        email,
        userName,
        chatType = "public",
        to = null,
        message = "",
        file = null, // 👈 allow file
      } = data;

      if (!userName || (!message && !file)) return; // must have text or file

      // ensure user exists
      await User.findOneAndUpdate(
        { userName },
        { $set: { name, email } },
        { upsert: true }
      );

      // build message object
      const msgObj = {
        text: message,
        file: file ? { ...file } : null,
        by: userName,
        to,
        chatType,
        time: new Date(),
      };

      if (chatType === "public") {
        await Conversation.findOneAndUpdate(
          { type: "public" },
          { $push: { messages: msgObj } },
          { upsert: true, new: true }
        );
        socket.broadcast.emit("receive_msg", { ...data, time: msgObj.time });
      } else if (chatType === "private") {
        const participants = [userName, to].sort();
        await Conversation.findOneAndUpdate(
          { type: "private", participants },
          {
            $push: { messages: msgObj },
            $setOnInsert: { type: "private", participants },
          },
          { upsert: true, new: true }
        );

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
        await Conversation.findOneAndUpdate(
          { type: "group", groupName: "default" },
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
