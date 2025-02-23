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

  fastify.post<{
    Body: {
      hash_ids: string[];
      imgIsNull?: boolean;
      page?: number;
      limit?: number;
      search?: string;
    };
  }>("/voters/by-hashids", async (req, reply) => {
    const {
      hash_ids,
      page = 1,
      limit = 100,
      search = "",
      imgIsNull = false,
    } = req.body;
    const pageNumber = Number(page);
    const limitNumber = Number(limit);
    const offset = (pageNumber - 1) * limitNumber;

    if (!Array.isArray(hash_ids) || hash_ids.length === 0) {
      return reply
        .status(400)
        .send({ error: "hash_ids must be a non-empty array." });
    }

    // Build placeholders for the IN clause
    const placeholders = hash_ids.map(() => "?").join(",");

    // Build the search clause for fullname if search text is provided
    const hasSearch = search && search.trim() !== "";
    const searchClause = hasSearch ? " AND v.fullname LIKE ?" : "";
    const searchParam = hasSearch ? `%${search}%` : undefined;

    // Optional filter for img being NULL
    const imgClause = imgIsNull ? " AND v.img IS NULL" : "";

    try {
      // Count total voters matching the given hash_ids (and search, and img filter if applied)
      const countQuery = `
        SELECT COUNT(*) AS total 
        FROM voters v 
        WHERE v.hash_id IN (${placeholders})${searchClause}${imgClause}
      `;
      const countParams = hasSearch
        ? [...hash_ids, searchParam]
        : [...hash_ids];

      const [totalCountResult] = await fastify.mysql.query<
        ({ total: number } & RowDataPacket)[]
      >(countQuery, countParams);
      const totalCount = totalCountResult[0].total;

      // Query to fetch paginated voter data, joining voter_barangay to get the barangay name,
      // applying the optional search filter and img filter, and sorting by fullname and barangay.
      const dataQuery = `
        SELECT v.id, v.hash_id, v.img, v.fullname, vb.code AS barangayCode, vb.name AS barangay
        FROM voters v
        LEFT JOIN voter_barangay vb ON v.brgy_code = vb.code
        WHERE v.hash_id IN (${placeholders})${searchClause}${imgClause}
        ORDER BY v.fullname, vb.name
        LIMIT ? OFFSET ?
      `;
      const dataParams = hasSearch
        ? [...hash_ids, searchParam, limitNumber, offset]
        : [...hash_ids, limitNumber, offset];

      const [rows] = await fastify.mysql.query<(Voter & RowDataPacket)[]>(
        dataQuery,
        dataParams
      );

      const totalPages = Math.ceil(totalCount / limitNumber);
      const nextPage = pageNumber < totalPages ? pageNumber + 1 : null;
      const prevPage = pageNumber > 1 ? pageNumber - 1 : null;

      return reply.send({
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
      return reply.status(500).send({ error: "Failed to fetch voters" });
    }
  });

  fastify.get<{
    Params: { id: number };
  }>("/voter/:id", { preHandler: authenticateUser }, async (req, reply) => {
    const { id } = req.params;

    try {
      // Query the database for a single voter with the provided id
      const [rows] = await fastify.mysql.query<(Voter & RowDataPacket)[]>(
        "SELECT * FROM voters WHERE id = ?",
        [id]
      );

      if (rows.length === 0) {
        // If no voter is found, return a 404 error response
        return reply.status(404).send({ error: "Voter not found" });
      }

      // Return the voter data (assuming id is unique, so only one row will be returned)
      await reply.send({
        data: rows[0],
      });
    } catch (err) {
      fastify.log.error(err);
      await reply.status(500).send({ error: "Failed to fetch voter" });
    }
  });

  fastify.post<{ Body: { voters: Partial<Voter>[] } }>(
    "/voters/upload-chunk",
    { preHandler: authenticateUser },
    async (req, reply) => {
      const { voters } = req.body;
      let affectedVotersCount = 0;

      // Limit the payload to 50 voters at a time.
      if (voters.length > 50) {
        return reply
          .status(400)
          .send({ error: "Cannot update more than 50 voters at a time." });
      }

      let connection;
      try {
        connection = await fastify.mysql.getConnection();
        await connection.query("START TRANSACTION");

        for (const voter of voters) {
          const {
            id,
            contactnumber,
            img,
            address,
            sex,
            bdate,
            location,
            images,
          } = voter;

          if (!id) {
            throw new Error("Voter ID is missing for one of the voters.");
          }

          const [result] = await connection.query(
            "UPDATE voters SET contactnumber = ?, img = ?, address = ?, sex = ?, bdate = ?, location = ?, images = ?, has_been_data_gathered = 1 WHERE id = ?",
            [
              contactnumber,
              img,
              address,
              sex,
              bdate,
              location ? JSON.stringify(location) : null,
              images ? JSON.stringify(images) : null,
              id,
            ]
          );

          // Increment affectedVotersCount if a row was updated.
          if ((result as any).affectedRows > 0) {
            affectedVotersCount += 1;
          }
        }

        await connection.query("COMMIT");

        return reply.send({
          success: true,
          message: `${affectedVotersCount} voters updated successfully.`,
          affectedVotersCount,
        });
      } catch (err) {
        if (connection) {
          await connection.query("ROLLBACK");
        }
        fastify.log.error("Error updating voters:", err);
        return reply.status(500).send({ error: "Failed to update voters" });
      } finally {
        if (connection) {
          connection.release();
        }
      }
    }
  );
}
