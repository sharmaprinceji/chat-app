// model/User.js
import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  userName: { type: String, required: true, unique: true },
  role: { type: String, enum: ["user", "admin"], default: "user" },
  email: { type: String, required: true },
  avatar: { type: String, default: "default.png" },
  status: { type: String, enum: ["online", "offline"], default: "offline" },
}, { timestamps: true });

userSchema.index({ userName: 1 });
const User = mongoose.model("User", userSchema);
export default User;
