// model/Conversation.js
import mongoose from "mongoose";

const messageSubSchema = new mongoose.Schema({
  text: { type: String, required: true },
  by: { type: String, required: true }, // userName of sender
  to: { type: String, default: null }, // userName of recipient for private
  time: { type: Date, default: Date.now },
  chatType: { type: String, enum: ["public", "private", "group"], default: "public" },
});

const conversationSchema = new mongoose.Schema({
  type: { type: String, enum: ["public", "private", "group"], required: true },
  participants: { type: [String], default: [] }, // userName list for private/group
  groupName: { type: String, default: null }, // for future groups
  messages: [messageSubSchema],
}, { timestamps: true });

// Indexes for faster queries
conversationSchema.index({ type: 1 });
conversationSchema.index({ "participants": 1 });
conversationSchema.index({ "messages.time": 1 });

const Conversation = mongoose.model("Conversation", conversationSchema);
export default Conversation;
