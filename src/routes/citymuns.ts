import { FastifyInstance } from "fastify";
import { Citymun } from "../types/citymun";
import { RowDataPacket } from "@fastify/mysql";

export async function citymunRoutes(fastify: FastifyInstance) {
  fastify.get("/citymuns", async (req, reply) => {
    try {
      const [rows] = await fastify.mysql.query<(Citymun & RowDataPacket)[]>(
        "SELECT * FROM voter_city;"
      );
      reply.send(rows);
    } catch (err) {
      fastify.log.error(err);
      reply.status(500).send({ error: "Failed to fetch citymuns" });
    }
  });
}
