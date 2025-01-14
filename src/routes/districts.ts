import { FastifyInstance } from "fastify";
import { District } from "../types/district";
import { RowDataPacket } from "@fastify/mysql";
import { authenticateUser } from "../firebase-auth";

export async function districtRoutes(fastify: FastifyInstance) {
  fastify.get(
    "/districts",
    { preHandler: authenticateUser },
    async (req, reply) => {
      try {
        const [rows] = await fastify.mysql.query<(District & RowDataPacket)[]>(
          "SELECT * FROM voter_district;"
        );
        await reply.send(rows);
      } catch (err) {
        fastify.log.error(err);
        await reply.status(500).send({ error: "Failed to fetch districts" });
      }
    }
  );
}
