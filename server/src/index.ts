import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import dotenv from "dotenv";

import authRoutes from "./routes/authRoutes";
import listingRoutes from "./routes/listingRoutes";
import tradeRoutes from "./routes/tradeRoutes";

dotenv.config();

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

app.use("/api/auth", authRoutes);
app.use("/api/listings", listingRoutes);
app.use("/api/trades", tradeRoutes);

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`Server running on port ${port}`));
