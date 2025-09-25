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
