import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    email: { type: String, required: true },
    messages: [
      {
        text: {
          type: String,
          required: true,
        },
        time: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  { timestamps: true }
);

const Message = mongoose.model("Message", messageSchema);
export default Message;
