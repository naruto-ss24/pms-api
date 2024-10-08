import { FastifyInstance } from "fastify";
import { Barangay } from "../types/barangay";
import { RowDataPacket } from "@fastify/mysql";

export async function barangayRoutes(fastify: FastifyInstance) {
  fastify.get("/barangays", async (req, reply) => {
    try {
      const [rows] = await fastify.mysql.query<(Barangay & RowDataPacket)[]>(
        "SELECT * FROM voter_barangay;"
      );
      reply.send(rows);
    } catch (err) {
      fastify.log.error(err);
      reply.status(500).send({ error: "Failed to fetch barangays" });
    }
  });
}
