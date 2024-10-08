import { FastifyInstance } from "fastify";
import { District } from "../types/district";
import { RowDataPacket } from "@fastify/mysql";

export async function districtRoutes(fastify: FastifyInstance) {
  fastify.get("/districts", async (req, reply) => {
    try {
      const [rows] = await fastify.mysql.query<(District & RowDataPacket)[]>(
        "SELECT * FROM voter_district;"
      );
      reply.send(rows);
    } catch (err) {
      fastify.log.error(err);
      reply.status(500).send({ error: "Failed to fetch districts" });
    }
  });
}
