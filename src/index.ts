import "./types/mysql";
import Fastify from "fastify";
import mysql from "@fastify/mysql";
import dotenv from "dotenv";
import { districtRoutes } from "./routes/districts";
import { citymunRoutes } from "./routes/citymuns";
import { barangayRoutes } from "./routes/barangays";
import { voterRoutes } from "./routes/voters";

dotenv.config();

const fastify = Fastify({ logger: true });

// Register MySQL plugin
fastify.register(mysql, {
  promise: true,
  connectionString: process.env.DATABASE_URL,
});

fastify.get("/", function (req, reply) {
  reply.send("API server is running...");
});

// Register routes
fastify.register(districtRoutes);
fastify.register(citymunRoutes);
fastify.register(barangayRoutes);
fastify.register(voterRoutes);

// Start the server
const start = async () => {
  try {
    await fastify.listen({ port: 3000 });
    console.log("Server is running on http://localhost:3000");
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
