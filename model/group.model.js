import mongoose from "mongoose";

const groupSchema = new mongoose.Schema({
  name: { type: String, unique: true },
  members: [String], // array of userName
  createdBy: String,
  createdAt: { type: Date, default: Date.now }
});

const Group  = mongoose.model("Group", groupSchema);
export default Group;
