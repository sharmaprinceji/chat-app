import express from "express";
import authMiddleware from "../utils/utils.js";
import multer from "multer";

import {
  deleteMessage,
  deletePrivateMessage,
  getPrivateMessages,
  getPublicMessages,
  getUserDetail,
  listUsers,
  login,
  updateProfilePic,
  uploadImage,
} from "../controller/controller.js";

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit (adjust as needed)
});

router.post("/login", login);

router.get("/users", listUsers);

router.post("/upload", upload.single("file"), uploadImage);

router.get("/messages/public", getPublicMessages);

router.get("/messages/private/:a/:b", getPrivateMessages);

router.delete("/messages/:id", authMiddleware, deleteMessage);

router.delete("/messages/private/:id", authMiddleware, deletePrivateMessage);

router.get("/getUser", authMiddleware, getUserDetail);

router.post("/uploadAvatar/:username",upload.single("file"),updateProfilePic);

export default router;
