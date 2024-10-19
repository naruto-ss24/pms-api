import "./types/mysql";
import "./types/firebase-auth";
import Fastify from "fastify";
// import fs from "fs";
import mysql from "@fastify/mysql";
import cors from "@fastify/cors";
import dotenv from "dotenv";
import { districtRoutes } from "./routes/districts";
import { citymunRoutes } from "./routes/citymuns";
import { barangayRoutes } from "./routes/barangays";
import { voterRoutes } from "./routes/voters";

dotenv.config();

const fastify = Fastify({
  logger: true,
  // https: {
  //   key: fs.readFileSync("./server.key"),
  //   cert: fs.readFileSync("./server.cert"),
  // },
});

// Register MySQL plugin
fastify.register(mysql, {
  promise: true,
  connectionString: process.env.DATABASE_URL,
});

fastify.register(cors, {
  origin: "*", // Allow requests from all origins, or specify your web app domain
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
});

fastify.get("/", function (req, reply) {
  reply.send({ message: "API server is running..." });
});

fastify.register(districtRoutes);
fastify.register(citymunRoutes);
fastify.register(barangayRoutes);
fastify.register(voterRoutes);

// Start the server
const start = async () => {
  try {
    await fastify.listen({
      host: process.env.HOST as string | undefined,
      port: (process.env.PORT as number | undefined) || 3000,
    });
    console.log("Server is running...");
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
