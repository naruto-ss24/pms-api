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

      await reply.send({
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
      await reply.status(500).send({ error: "Failed to fetch voters" });
    }
  });

  fastify.post<{ Body: { voters: Partial<Voter>[] } }>(
    "/voters/upload-chunk",
    { preHandler: authenticateUser },
    async (req, reply) => {
      const { voters } = req.body;
      let affectedVotersCount = 0;

      // Updated Error Handling for Large Payload
      if (voters.length > 50) {
        await reply
          .status(400)
          .send({ error: "Cannot update more than 50 voters at a time." });
        return;
      }

      let connection;
      try {
        connection = await fastify.mysql.getConnection();
        await connection.query("START TRANSACTION");

        for (const voter of voters) {
          const { id, contactnumber, img, location, images } = voter;

          if (!id) {
            throw new Error(`Voter ID is missing for one of the voters.`);
          }

          const [result] = await connection.query(
            "UPDATE voters SET contactnumber = ?, img = ?, location = ?, images = ?, has_been_data_gathered = 1 WHERE id = ?",
            [
              contactnumber,
              img,
              location ? JSON.stringify(location) : null,
              images ? JSON.stringify(images) : null,
              id,
            ]
          );

          // Increment only if a row was affected
          if ((result as RowDataPacket).affectedRows > 0) {
            affectedVotersCount += 1;
          }
        }

        await connection.query("COMMIT");

        await reply.send({
          success: true,
          message: `${affectedVotersCount} voters updated successfully.`,
          affectedVotersCount,
        });
      } catch (err) {
        if (connection) {
          await connection.query("ROLLBACK");
        }

        fastify.log.error("Error updating voters:", err);
        await reply.status(500).send({ error: "Failed to update voters" });
      } finally {
        if (connection) {
          connection.release();
        }
      }
    }
  );
}
