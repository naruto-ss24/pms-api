import "./types/mysql";
import "./types/firebase-auth";
import Fastify from "fastify";
import dotenv from "dotenv";
import mysql from "@fastify/mysql";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import path from "path";
import fs from "fs";
import { pipeline } from "stream/promises";
import { districtRoutes } from "./routes/districts";
import { citymunRoutes } from "./routes/citymuns";
import { barangayRoutes } from "./routes/barangays";
import { voterRoutes } from "./routes/voters";
import { authenticateUser } from "./firebase-auth";

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

fastify.register(multipart);

fastify.get("/", function (req, reply) {
  reply.send({ message: "API server is running..." });
});

fastify.get("/check-updates", function (req, reply) {
  reply.send({
    version: "1.1.9",
    forceUpdate: true,
    updateUrl: "https://expo.dev/artifacts/eas/6Ghcfr7RxWQn58z9X1t8o1.apk",
  });
});

fastify.post<{ Querystring: { folder: string } }>(
  "/upload-image",
  { preHandler: authenticateUser },
  async (req, reply) => {
    const folder = req.query.folder;

    if (!folder || typeof folder !== "string") {
      return reply
        .status(400)
        .send({ error: "Invalid or missing folder name" });
    }

    // Parse file and form data from the request
    const data = await req.file();

    if (!data) {
      return reply.status(400).send({ error: "No file uploaded" });
    }

    try {
      // Ensure the target upload folder exists
      const uploadDir = path.join(__dirname, "../uploads", folder);
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }

      const fileName = data.filename;
      const filePath = path.join(uploadDir, fileName);

      // Save the file to disk
      await pipeline(data.file, fs.createWriteStream(filePath));

      // Generate the URL for accessing the image
      const fileUrl = `/uploads/${folder}/${fileName}`;

      reply.send({
        success: true,
        message: "Image uploaded successfully",
        data: fileUrl,
      });
    } catch (err) {
      fastify.log.error(err);
      reply.status(500).send({ error: "Failed to upload image" });
    }
  }
);

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
