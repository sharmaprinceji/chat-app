import mongoose from "mongoose";
export const db=()=>{
    mongoose
      .connect(process.env.MONGO)
      .then(() => console.log("Connected to MongoDB"))
      .catch((err) => console.error("Mongo connect err", err));
}
