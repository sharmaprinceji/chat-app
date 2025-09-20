import { io } from "../server.js";
import Conversation from "../model/Conversation.js";
import User from "../model/User.js";
import Group from "../model/group.model.js";

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
    // console.log("Created public conversation");
  }
}

export const eventHandler = async (io) => {
  ensurePublicConversation().catch(console.error);

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
        console.log("Identify:", onlineMap);
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
        }
        // in your existing chat message route or socket listener
        else if (chatType === "group") {
          const allParticipants = await Group.findOne(
            { name: to },
            { members: 1, _id: 1 }
          );

          const msgObj = {
            by: userName,
            to: "",
            text: data.message,
            file: data.file || null,
            time: new Date(),
            chatType: "group",
            groupId: allParticipants._id.toString(),
            groupName: to,
          };

          //console.log("New message:===>", msgObj);

          const participants = allParticipants.members;
          const group = await Conversation.findOneAndUpdate(
            { type: "group", groupName: to }, // first check by groupName
            {
              $push: { messages: msgObj },
              $setOnInsert: {
                type: "group",
                participants,
                groupName: to,
              },
            },
            { upsert: true, new: true }
          );

          if (!group) return;
          const recipientSocket = Array.isArray(participants)
            ? participants.map((u) => onlineMap.get(u)).filter(Boolean)
            : [];

          //Emit to all group participants
          // const sockets = group.participants
          //   .map((u) => onlineMap.get(u))
          //   .filter(Boolean);

          //console.log("Group sockets 1:===>", senderSocket);
          console.log("Group sockets 2:===>", recipientSocket);

         // return;

          // //sockets.forEach((sock) => io.to(sock).emit("receive_msg", msgObj));
          io.to(recipientSocket).emit("receive_msg", { ...data, time: msgObj.time });
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
};
