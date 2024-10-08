import { FastifyInstance } from "fastify";
import { Voter } from "../types/voter";
import { RowDataPacket } from "@fastify/mysql";

export async function voterRoutes(fastify: FastifyInstance) {
  // GET voters with pagination
  fastify.get<{
    Querystring: { brgy_code: string; page?: number; limit?: number };
  }>("/voters", async (req, reply) => {
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

  // POST voters to update
  fastify.post<{ Body: Voter[] }>("/voters/update", async (req, reply) => {
    const voters = req.body;

    if (voters.length > 100) {
      return reply
        .status(400)
        .send({ error: "Cannot update more than 100 voters at a time." });
    }

    try {
      const connection = await fastify.mysql.getConnection();
      await connection.beginTransaction();

      for (const voter of voters) {
        const {
          id,
          fullname,
          address,
          contactnumber,
          sex,
          bdate,
          status,
          is_houseleader,
          is_grpleader,
          is_clusterleader,
          is_coordinator,
          is_tagged,
          is_enemy,
          deceased,
          group_id,
          family_id,
          img,
          img_thumb,
          is_deleted,
          is_xls,
          not_voter,
        } = voter;

        await connection.query(
          "UPDATE voters SET fullname = ?, address = ?, contactnumber = ?, sex = ?, bdate = ?, status = ?, is_houseleader = ?, is_grpleader = ?, is_clusterleader = ?, is_coordinator = ?, is_tagged = ?, is_enemy = ?, deceased = ?, group_id = ?, family_id = ?, img = ?, img_thumb = ?, is_deleted = ?, is_xls = ?, not_voter = ? WHERE id = ?",
          [
            fullname,
            address,
            contactnumber,
            sex,
            bdate,
            status,
            is_houseleader,
            is_grpleader,
            is_clusterleader,
            is_coordinator,
            is_tagged,
            is_enemy,
            deceased,
            group_id,
            family_id,
            img,
            img_thumb,
            is_deleted,
            is_xls,
            not_voter,
            id,
          ]
        );
      }

      await connection.commit();
      connection.release();

      reply.send({
        success: true,
        message: `${voters.length} voters updated successfully.`,
      });
    } catch (err) {
      const connection = await fastify.mysql.getConnection();
      await connection.rollback();
      connection.release();

      fastify.log.error(err);
      reply.status(500).send({ error: "Failed to update voters" });
    }
  });
}
