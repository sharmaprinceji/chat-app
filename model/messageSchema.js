// model/messageSchema.js
import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    userName: {
      type: String,
      unique: true,
      default: function () {
        return (
          this.name.toLowerCase().replace(/\s+/g, "") +
          Math.floor(1000 + Math.random() * 9000)
        );
      },
    },
    email: { type: String, required: true },
    phone: { type: String, default: "" },
    avatar: { type: String, default: "default.png" },
    status: { type: String, enum: ["online", "offline"], default: "offline" },
    messages: [
      {
        text: { type: String, required: true },
        time: { type: Date, default: Date.now },
        by: { type: String, required: true }, // userName of sender
        to: { type: String, default: null }, // userName of recipient (for private)
        chatType: {
          type: String,
          enum: ["public", "private", "group"],
          default: "public",
        },
      },
    ],
  },
  { timestamps: true }
);

const Message = mongoose.model("Message", messageSchema);
export default Message;
