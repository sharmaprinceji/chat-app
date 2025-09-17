// model/Conversation.js
import mongoose from "mongoose";

const fileSubSchema = new mongoose.Schema({
  url: { type: String, required: true },       
  public_id: { type: String, required: true }, 
  originalname: { type: String },              
  mimetype: { type: String },                 
}, { _id: false });

const messageSubSchema = new mongoose.Schema({
  text: { type: String, default: "" }, 
  file: { type: fileSubSchema, default: null }, 
  by: { type: String, required: true },         
  to: { type: String, default: null },          
  time: { type: Date, default: Date.now },
  chatType: { type: String, enum: ["public", "private", "group"], default: "public" },
});

const conversationSchema = new mongoose.Schema({
  type: { type: String, enum: ["public", "private", "group"], required: true },
  participants: { type: [String], default: [] }, 
  groupName: { type: String, default: null },   
  messages: [messageSubSchema],
}, { timestamps: true });

// Indexes for faster queries
conversationSchema.index({ type: 1 });
conversationSchema.index({ participants: 1 });
conversationSchema.index({ "messages.time": 1 });

const Conversation = mongoose.model("Conversation", conversationSchema);
export default Conversation;
