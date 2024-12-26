import { FastifyInstance } from "fastify";
import { Barangay } from "../types/barangay";
import { RowDataPacket } from "@fastify/mysql";
import { authenticateUser } from "../firebase-auth";

export async function barangayRoutes(fastify: FastifyInstance) {
  fastify.get(
    "/barangays",
    { preHandler: authenticateUser },
    async (req, reply) => {
      try {
        const [rows] = await fastify.mysql.query<(Barangay & RowDataPacket)[]>(
          `
        SELECT 
          b.name,
          c.name AS citymun, 
          d.name AS district,
          b.code,
          b.muncode,
          b.areacode
        FROM 
          voter_barangay b
        JOIN 
          voter_city c ON b.muncode = c.code
        JOIN 
          voter_district d ON b.areacode = d.code;
        `
        );
        await reply.send(rows);
      } catch (err) {
        fastify.log.error(err);
        await reply.status(500).send({ error: "Failed to fetch barangays" });
      }
    }
  );
}
