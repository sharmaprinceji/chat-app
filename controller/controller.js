import User from "../model/User.js";
import jwt from "jsonwebtoken";
import cloudinary from "cloudinary";
import Conversation from "../model/Conversation.js";
import { io } from "../server.js";
import streamifier from "streamifier";
import Group from "../model/group.model.js";
import { onlineMap } from "../events/event.js";

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
        {
          id: user._id,
          userName: user.userName,
          role: user.role,
          status: user.status,
          email: user.email,
        },
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
      {
        id: user._id,
        userName: user.userName,
        role: user.role,
        status: user.status,
        email: user.email,
      },
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

export const listUsers = async (req, res) => {
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

export const getPublicMessages = async (req, res) => {
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
      : []; // send _id
    res.json(msgs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching public messages" });
  }
};

export const getPrivateMessages = async (req, res) => {
  try {
    // console.log("Fetching private msgs between:", req.params.a, req.params.b);
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

// Delete message by ID (only by the author)
export const deleteMessage = async (req, res) => {
  try {
    const { id } = req.params;
    const { userName } = req.user; // authenticated user

    // find conversation containing the message
    const conversation = await Conversation.findOne({
      "messages._id": id,
    });

    //console.log("Delete public message request for msg ID:", id);

    if (!conversation)
      return res.status(404).json({ message: "Message not found" });

    const msg = conversation.messages.id(id);
    if (!msg) return res.status(404).json({ message: "Message not found" });

    // check ownership
    if (msg.me !== userName) {
      return res
        .status(403)
        .json({ message: "Cannot delete messages of others" });
    }

    // delete message
    msg.deleteOne(); // or msg.deleteOne() if Mongoose >=6

    await conversation.save();

    // determine recipients for emitting
    let recipients = [];

    if (conversation.type === "private") {
      recipients = conversation.participants;
    } else if (conversation.type === "group") {
      recipients = conversation.members;
    } else if (conversation.type === "public") {
      recipients = []; // emit to all connected clients
    }

    // emit real-time deletion
    if (conversation.type === "public") {
      io.emit("messageDeleted", { id });
    } else {
      // emit only to participants
      const recipientSocket = Array.isArray(recipients)
        ? recipients.map((u) => onlineMap.get(u)).filter(Boolean)
        : [];
      //console.log("Msg deleted, notifying:", recipientSocket);
      io.to(recipientSocket).emit("messageDeleted", { id });
    }
    res.json({ success: true });
  } catch (err) {
    console.error("delete error:", err);
    res.status(500).json({ message: "Delete failed", error: err.message });
  }
};

export const deletePrivateMessage = async (req, res) => {
  try {
    const { id } = req.params;

    //console.log("Delete private msg ID:", id);
    // private conversation jisme message ho
    const conv = await Conversation.findOne({
      type: "private",
      "messages._id": id,
    });
    //console.log("Found conversation for deletion:", conv);
    if (!conv) return res.status(404).json({ message: "Message not found" });

    const msg = conv.messages.id(id);

    // only author or admin can delete
    // if (msg.by !== userName && role !== "admin") {
    //   return res
    //     .status(403)
    //     .json({ message: "Not allowed to delete this message" });
    // }

    // 🗑️ Hard delete: remove from array
    msg.deleteOne();

    await conv.save();

    const recipientSocket = Array.isArray(conv.participants)
      ? conv.participants.map((u) => onlineMap.get(u)).filter(Boolean)
      : [];

    // console.log("Private msg deleted:", recipientSocket, [
    //   ...conv.participants,
    //   ...recipientSocket,
    // ]);
    // notify only participants
    io.to(recipientSocket).emit("messageDeleted", { id });

    res.json({ success: true });
  } catch (err) {
    console.error("delete private error:", err);
    zzz;
    res.status(500).json({ message: "Delete failed", error: err.message });
  }
};

export const deleteGroupMessage = async (req, res) => {
  try {
    const { id } = req.params;

    //console.log("Delete group msg ID:", id);
    // private conversation jisme message ho
    const conv = await Conversation.findOne({
      type: "group",
      "messages._id": id,
    });
    //console.log("Found conversation for deletion:", conv);
    if (!conv) return res.status(404).json({ message: "Message not found" });

    const msg = conv.messages.id(id);

    // only author or admin can delete
    // if (msg.by !== userName && role !== "admin") {
    //   return res
    //     .status(403)
    //     .json({ message: "Not allowed to delete this message" });
    // }

    // 🗑️ Hard delete: remove from array
    msg.deleteOne();

    await conv.save();
    //console.log("participant from DB:", conv.participants);
    const recipientSocket = Array.isArray(conv.participants)
      ? conv.participants.map((u) => onlineMap.get(u)).filter(Boolean)
      : [];

    // console.log("Private msg deleted:", recipientSocket, [
    //   ...conv.participants,
    //   ...recipientSocket,
    // ]);
    // notify only participants
    io.to(recipientSocket).emit("messageDeleted", { id });

    res.json({ success: true });
  } catch (err) {
    console.error("delete private error:", err);
    zzz;
    res.status(500).json({ message: "Delete failed", error: err.message });
  }
};

export const uploadImage = async (req, res) => {
  try {
   // console.log("Upload request by:", "Guest");
    if (!req.file) return res.status(400).json({ message: "No file provided" });

    // req.file.buffer is available (multer memoryStorage)
    const { buffer, originalname, mimetype } = req.file;
    //console.log("Received file:", originalname, mimetype, buffer.length);
    //console.log("Uploading to Cloudinary...", originalname,mimetype);
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

export const getUserDetail = async (req, res) => {
  try {
    // token payload is already attached by authMiddleware
    const { id, username } = req.user;

    let user;
    if (id) {
      user = await User.findById(id).select("-__v -password");
    } else if (username) {
      user = await User.findOne({ username }).select("-__v -password");
    }

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({
      name: user.name,
      username: user.userName,
      email: user.email,
      role: user.role,
      status: user.status,
      avatar: user.avatar,
    });
  } catch (error) {
    console.error("Error fetching user:", error);
    res.status(500).json({ message: "Server error" });
  }
};

export const updateProfilePic = async (req, res) => {
  try {
    // verify user from authMiddleware
    const Username = req.params.username;
    const { buffer, originalname, mimetype } = req.file;

    if (!req.file) {
      return res.status(400).json({ message: "No file provided" });
    }

    console.log("Uploading profile pic for user:", Username);

    // upload buffer to Cloudinary
    const uploadResult = await new Promise((resolve, reject) => {
      const stream = cloudinary.v2.uploader.upload_stream(
        { folder: "talksphere/avatars", resource_type: "image" },
        (error, result) => (error ? reject(error) : resolve(result))
      );
      streamifier.createReadStream(buffer).pipe(stream);
    });

    // update user avatar in DB
    const user = await User.findOneAndUpdate(
      { userName: Username }, // username from token/middleware
      { avatar: uploadResult.secure_url },
      { new: true }
    ).select("-password -__v");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({
      success: true,
      status: 200,
      message: "Profile picture updated successfully",
      avatarUrl: user.avatar,
    });
  } catch (err) {
    console.error("Profile upload error:", err);
    res.status(500).json({
      success: false,
      message: "Profile picture upload failed",
      error: err.message,
    });
  }
};

export const createGroup = async (req, res) => {
  const { groupName, members, creator } = req.body; // members = array of usernames
  if (!groupName || !members || !creator)
    return res.status(400).json({ message: "Missing fields" });

  try {
    // Check if group name is unique
    const exists = await Conversation.findOne({ type: "group", groupName });
    if (exists)
      return res.status(400).json({ message: "Group name already exists" });

    // Create group conversation
    const group = new Conversation({
      type: "group",
      groupName,
      participants: members, // e.g., [a,b,c]
      messages: [],
    });

    await group.save();
    res.json({ success: true, group });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

export const getGroupMessage = async (req, res) => {
  try {
    const { groupName } = req.params;
    const group = await Conversation.findOne({ type: "group", groupName });
    const msgs = group
      ? group.messages
          .sort((a, b) => new Date(a.time) - new Date(b.time))
          .map((m) => ({
            _id: m._id,
            by: m.by,
            text: m.text,
            file: m.file,
            time: m.time,
            chatType: m.chatType,
          }))
      : []; // send _id
    return res.json(msgs);
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Server error", error: error.message });
  }
};

export const newGroup = async (req, res) => {
  const { name, members } = req.body;
  if (!name || !members || members.length < 2)
    return res.status(400).json({ message: "Invalid data" });

  try {
    const group = new Group({
      name,
      members,
      createdBy: req.user.userName,
    });
    // console.log("Creating group:", name, "by", group);
    await group.save();
    res.json({ success: true, group });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to create group" });
  }
};

export const getGroup = async (req, res) => {
  try {
    const username = req.params.username;
    //console.log("Fetching groups for user:", username);
    const groups = await Group.find({ members: username });
    res.json(groups);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch groups" });
  }
};

export const gemini = async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt) {
      return res.status(400).json({ message: "Prompt is required" });
    }
    
    const apiKey = process.env.GEMINI_API_KEY;
    const endpoint = process.env.GEMINI_ENDPOINT;
    if (!apiKey || !endpoint) {
      return res.status(500).json({ message: "Gemini API not configured" });
    }
    
    const response = await fetch(endpoint, {  
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        prompt: {
          text: prompt
        },
        maxOutputTokens: 1024,
        temperature: 0.7,
        topP: 0.8,
        topK: 40
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini API error:", errorText);
      return res.status(500).json({ message: "Gemini API error", error: errorText });
    }
    
    const data = await response.json();
    const generatedText = data.candidates && data.candidates.length > 0 ? data.candidates[0].output : "";
    
    return res.json({ response: generatedText });
    
  }
  catch (err) {
    console.error("Gemini error:", err);
    return res.status(500).json({ message: "Error generating text", error: err.message });
  }   
};
