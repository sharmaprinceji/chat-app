import User from "../model/User.js";
import jwt from "jsonwebtoken";
import cloudinary from "cloudinary";
import Conversation from "../model/Conversation.js";
import { io } from "../app.js";
import streamifier from "streamifier";

export const login = async (req, res) => {
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
};

export const listUsers =async (req, res) => {
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
};

export const getPublicMessages =async (req, res) => {
     try {
    const conv = await Conversation.findOne(
      { type: "public" },
      { messages: 1 }
    );
    const msgs = conv
      ? conv.messages
          .sort((a, b) => new Date(a.time) - new Date(b.time))
          .map((m) => ({
            _id: m._id, 
            by: m.by,
            text: m.text,
            file: m.file,
            time: m.time,
            chatType: m.chatType,
          }))
      : [];// send _id
    res.json(msgs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching public messages" });
  }
};

export const getPrivateMessages =async (req, res) => {
     try {
    console.log("Fetching private msgs between:", req.params.a, req.params.b);
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
            _id: m._id, 
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
};

export const deleteMessage = async (req, res) => {
      try {
    const { id } = req.params;
    const { userName, role } = req.user;
    //console.log("Delete request for msg id:", id, "by", userName);

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
};

export const deletePrivateMessage = async (req, res) => {
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
};

export const uploadImage = async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ message: "No file provided" });
    
        // req.file.buffer is available (multer memoryStorage)
        const { buffer, originalname, mimetype } = req.file;
        //console.log("Received file:", originalname, mimetype, buffer.length);
    
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
};