import { FastifyInstance } from "fastify";
import { Voter } from "../types/voter";
import { RowDataPacket } from "@fastify/mysql";
import { authenticateUser } from "../firebase-auth";

export async function voterRoutes(fastify: FastifyInstance) {
  fastify.get<{
    Querystring: { brgy_code: string; page?: number; limit?: number };
  }>("/voters", { preHandler: authenticateUser }, async (req, reply) => {
    const { brgy_code, page = 1, limit = 100 } = req.query;
    const pageNumber = Number(page);
    const limitNumber = Number(limit);
    const offset = (pageNumber - 1) * limitNumber;

    try {
      const [totalCountResult] = await fastify.mysql.query<
        ({ total: number } & RowDataPacket)[]
      >("SELECT COUNT(*) AS total FROM voters WHERE brgy_code = ?", [
        brgy_code,
      ]);
      const totalCount = totalCountResult[0].total;

      const [rows] = await fastify.mysql.query<(Voter & RowDataPacket)[]>(
        "SELECT * FROM voters WHERE brgy_code = ? LIMIT ? OFFSET ?",
        [brgy_code, limitNumber, offset]
      );

      const totalPages = Math.ceil(totalCount / limitNumber);

      const nextPage = pageNumber < totalPages ? pageNumber + 1 : null;
      const prevPage = pageNumber > 1 ? pageNumber - 1 : null;

      reply.send({
        total: totalCount,
        page: pageNumber,
        limit: limitNumber,
        totalPages,
        hasNextPage: nextPage !== null,
        hasPrevPage: prevPage !== null,
        nextPage,
        prevPage,
        numberOfRows: rows.length,
        data: rows,
      });
    } catch (err) {
      fastify.log.error(err);
      reply.status(500).send({ error: "Failed to fetch voters" });
    }
  });

  fastify.post<{ Body: { voters: Partial<Voter>[] } }>(
    "/voters/upload-chunk",
    { preHandler: authenticateUser },
    async (req, reply) => {
      const { voters } = req.body;

      if (voters.length > 50) {
        return reply
          .status(400)
          .send({ error: "Cannot update more than 50 voters at a time." });
      }

      let connection;
      try {
        connection = await fastify.mysql.getConnection();
        await connection.beginTransaction();

        for (const voter of voters) {
          const { id, img, location, images } = voter;

          if (!id) {
            throw new Error(`Voter ID is missing for one of the voters.`);
          }

          await connection.query(
            "UPDATE voters SET img = ?, location = ?, images = ? WHERE id = ?",
            [
              img,
              location ? JSON.stringify(location) : null, // Serialize location to JSON
              images ? JSON.stringify(images) : null, // Serialize images to JSON
              id,
            ]
          );
        }

        await connection.commit();

        reply.send({
          success: true,
          message: `${voters.length} voters updated successfully.`,
        });
      } catch (err) {
        if (connection) {
          await connection.rollback();
        }
        fastify.log.error("Error updating voters:", err);
        reply.status(500).send({ error: "Failed to update voters" });
      } finally {
        if (connection) {
          connection.release();
        }
      }
    }
  );
}
