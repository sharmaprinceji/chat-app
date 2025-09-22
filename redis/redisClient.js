import Redis from "ioredis";

const redisClient = new Redis({
  host: "redis-server",
  port: 6379,
});

redisClient.on("connect", () => console.log("✅ Connected to Redis"));
redisClient.on("error", (err) => console.error("❌ Redis error:", err));

export { redisClient };
