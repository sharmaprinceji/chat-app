import Conversation from "../model/Conversation.js";
import User from "../model/User.js";
import Group from "../model/group.model.js";
import { redisClient } from "../redis/redisClient.js";
import { consumer, producer,initKafka } from "../events/kafka/kafkaClient.js";

export const onlineMap = new Map();
await initKafka(); // Initialize Kafka producer and consumer

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
  //await initKafka(); // Initialize Kafka producer and consumer

  // ✅ Kafka consumer will handle broadcasting messages
  await consumer.run({
    eachMessage: async ({ message }) => {
      try {
        const msgData = JSON.parse(message.value.toString());

        if (msgData.chatType === "public") {
          io.emit("receive_msg", msgData);
        } else if (msgData.chatType === "private") {
          const senderSocket = onlineMap.get(msgData.by);
          const recipientSocket = onlineMap.get(msgData.to);

          if (senderSocket) io.to(senderSocket).emit("receive_msg", msgData);
          if (recipientSocket)
            io.to(recipientSocket).emit("receive_msg", msgData);
        } else if (msgData.chatType === "group") {
          const group = await Group.findOne(
            { name: msgData.groupName },
            { members: 1 }
          );
          const sockets = group.members
            .map((u) => onlineMap.get(u))
            .filter(Boolean);
          sockets.forEach((sock) => io.to(sock).emit("receive_msg", msgData));
        }
      } catch (err) {
        console.error("Kafka consumer error", err);
      }
    },
  });

  io.on("connection", async (socket) => {
    // client tells server who they are after connecting
    socket.on("identify", async (payload) => {
      const { userName } = payload;
      if (userName) {
        onlineMap.set(userName, socket.id);
        // const redisKey = `user:${userName}`;
        // const socketId =  `user:${socket.id}`;
        //await redisClient.set(redisKey,socketId);
        console.log(
          "New socket connected",
          socket.id,
          "Total users online:",
          Array.from(onlineMap.entries()) // show map content
          //"Redis keys:",
          //await redisClient.keys("user:*")
        );
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

          // const keys = Array.isArray(participants)
          //   ? participants.map((u) => `user:${u}`)
          //   : [];

          // ioredis uses .mget (lowercase)
          // const socketIdsRaw = await redisClient.mget(...keys);
          // const socketIds = socketIdsRaw.filter(Boolean);
          // console.log("Group msg sockets by using redis:", socketIds);
          // console.log("Group msg participants:", participants);

          // //sockets.forEach((sock) => io.to(sock).emit("receive_msg", msgObj));
          io.to(recipientSocket).emit("receive_msg", {
            ...data,
            time: msgObj.time,
          });
        }

        // ✅ Send message via Kafka producer
        await producer.send({
          topic: "chat-messages",
          messages: [{ value: JSON.stringify({ ...data, time: msgObj.time }) }],
        });
        
      } catch (err) {
        console.error("chat msg err", err);
      }
    });

    socket.on("disconnect", async () => {
      // remove from onlineMap
      for (const [uname, sid] of onlineMap.entries()) {
        if (sid === socket.id) onlineMap.delete(uname);
      }

      //remove from redis
      // const keys = await redisClient.keys("*"); // fetch all keys
      // for (let key of keys) {
      //   const val = await redisClient.get(key); // get value of each key
      //   if (val === socket.id) {
      //     await redisClient.del(key); // delete if value matches socket.id
      //   }
      // }
      console.log("Socket disconnected", socket.id);
    });
  });
};
