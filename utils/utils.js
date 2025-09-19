import jwt from "jsonwebtoken";
import User from "../model/User.js";


export default async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(403).json({ message: "No token provided" });
  }

  const token = authHeader.split(" ")[1];

  try {
    // decode token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // find user from DB
    const user = await User.findOne({
      $or: [{ _id: decoded.id }, { userName: decoded.userName }],
    }).select("-password -__v");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // attach user info to req.user
    req.user = {
      id: user._id,
      name: user.name,
      username: user.userName,
      email: user.email,
      role: user.role,
      status: user.status,
      avatar: user.avatar,
    };

    next();
  } catch (err) {
    console.error("Auth error:", err);
    return res.status(403).json({ message: "Invalid token" });
  }
}
