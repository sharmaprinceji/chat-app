// kafkaClient.js
import { Kafka } from "kafkajs";

const kafka = new Kafka({
  clientId: "chat-app",
  brokers: [process.env.KAFKA_BROKER || "localhost:9092"], // docker-compose sets kafka:9092
});

export const producer = kafka.producer();
export const consumer = kafka.consumer({ groupId: "chat-group" });

export const initKafka = async () => {
  await producer.connect();
  await consumer.connect();

  await consumer.subscribe({ topic: "chat-messages", fromBeginning: false });
  console.log("✅ Kafka connected and consumer subscribed");
};

export async function safeSendMessage(message) {
  try {
    await producer.send({
      topic: "chat-messages",
      messages: [{ value: JSON.stringify(message) }],
    });
  } catch (err) {
    console.error("❌ Kafka send failed:", err.message);

    if (err.retriable || err.type === "KafkaJSNonRetriableError") {
      console.log("🔄 Reconnecting producer...");
      await producer.connect();
      await producer.send({
        topic: "chat-messages",
        messages: [{ value: JSON.stringify(message) }],
      });
    } else {
      throw err; // log and bubble up if totally unrecoverable
    }
  }
}
