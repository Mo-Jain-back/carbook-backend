import express from "express";
import { router } from "./routes/v1";
import cors from "cors";
const app = express();
import dotenv from "dotenv";
const PORT = Number(process.env.PORT) || 8080;

// Load environment variables
dotenv.config();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Server is running!");
});

app.use("/api/v1", router);

// Start server
app.listen(PORT,  () => {
    console.log(`Server is running on port ${PORT}`);
  });
