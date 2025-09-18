// server.js
import http from "http";
import express from "express";
import { Server } from "socket.io";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";

import cloudinary from "cloudinary";
import router from "./routes/route.js";
import { eventHandler } from "./events/event.js";
import { db } from "./db/db.js";

dotenv.config();

// Configure Cloudinary
cloudinary.v2.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.resolve("./public")));

const server = http.createServer(app);
db();


export const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});


//global routes...
app.use('/api/v1', router);
eventHandler(io);

const PORT = process.env.PORT || 9000;
server.listen(PORT, () => console.log("Server running on", PORT));
