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

  fastify.post<{
    Body: {
      hash_ids: string[];
      barangayCodes?: string[];
      participantType?: "leaders" | "members";
      imgIsNull?: boolean;
      page?: number;
      limit?: number;
      search?: string;
    };
  }>(
    "/voters/event-participants",
    { preHandler: authenticateUser },
    async (req, reply) => {
      const {
        hash_ids,
        barangayCodes,
        participantType,
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

      // Build dynamic WHERE conditions and parameter array
      const conditions: string[] = [];
      const params: any[] = [];

      // 1. Filter by hash_ids
      const hashPlaceholders = hash_ids.map(() => "?").join(",");
      conditions.push(`v.hash_id IN (${hashPlaceholders})`);
      params.push(...hash_ids);

      // 2. Ensure only event participants (group_id != 0)
      conditions.push(`v.group_id != 0`);

      // 3. Add condition based on participantType if provided
      if (participantType === "leaders") {
        conditions.push(`v.is_grpleader = 1`);
      } else if (participantType === "members") {
        conditions.push(`v.is_grpleader = 0`);
      }
      // If participantType is not provided, no extra is_grpleader filter is applied.

      // 4. Only query voters with type 0 or 1
      conditions.push(`v.type IN (0, 1)`);

      // 5. Optional search filter on fullname
      if (search && search.trim() !== "") {
        conditions.push(`v.fullname LIKE ?`);
        params.push(`%${search}%`);
      }

      // 6. Optional filter for img being NULL
      if (imgIsNull) {
        conditions.push(`v.img IS NULL`);
      }

      // 7. Optional filter for barangayCodes
      if (Array.isArray(barangayCodes) && barangayCodes.length > 0) {
        const barangayPlaceholders = barangayCodes.map(() => "?").join(",");
        conditions.push(`v.brgy_code IN (${barangayPlaceholders})`);
        params.push(...barangayCodes);
      }

      // Combine all conditions into a WHERE clause
      const whereClause =
        conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";

      try {
        // Count total voters matching the conditions
        const countQuery = `
          SELECT COUNT(*) AS total 
          FROM voters v 
          ${whereClause}
        `;
        const [totalCountResult] = await fastify.mysql.query<
          ({ total: number } & RowDataPacket)[]
        >(countQuery, params);
        const totalCount = totalCountResult[0].total;

        // Query to fetch paginated voter data, joining tables to retrieve barangay, city, and district names
        const dataQuery = `
          SELECT v.id, v.hash_id, v.img, v.fullname, 
                 vb.code AS barangayCode, vb.name AS barangay, 
                 vc.name AS citymun, vd.name AS district
          FROM voters v
          LEFT JOIN voter_barangay vb ON v.brgy_code = vb.code
          LEFT JOIN voter_city vc ON v.city_code = vc.code
          LEFT JOIN voter_district vd ON v.district_code = vd.code
          ${whereClause}
          ORDER BY v.fullname, vb.name
          LIMIT ? OFFSET ?
        `;
        // Append LIMIT and OFFSET values to the parameters for the data query.
        const dataParams = [...params, limitNumber, offset];
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
    }
  );

  fastify.post<{
    Body: {
      hash_ids: string[];
      barangayCodes: string[]; // now mandatory
      participantType?: "leaders" | "members";
      imgIsNull?: boolean;
      page?: number;
      limit?: number;
      search?: string;
    };
  }>(
    "/voters/event-absentees",
    { preHandler: authenticateUser },
    async (req, reply) => {
      const {
        hash_ids,
        barangayCodes,
        participantType,
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

      // Check that barangayCodes is provided and is a non-empty array.
      if (!Array.isArray(barangayCodes) || barangayCodes.length === 0) {
        return reply
          .status(400)
          .send({ error: "barangayCodes must be a non-empty array." });
      }

      // Build dynamic WHERE conditions and parameters.
      const conditions: string[] = [];
      const params: any[] = [];

      // 1. Exclude voters whose hash_id is in the provided list.
      const hashPlaceholders = hash_ids.map(() => "?").join(",");
      conditions.push(`v.hash_id NOT IN (${hashPlaceholders})`);
      params.push(...hash_ids);

      // 2. Only consider expected participants.
      conditions.push(`v.group_id != 0`);

      // 3. Participant type filtering if provided.
      if (participantType === "leaders") {
        conditions.push(`v.is_grpleader = 1`);
      } else if (participantType === "members") {
        conditions.push(`v.is_grpleader = 0`);
      }

      // 4. Only query voters with type 0 or 1.
      conditions.push(`v.type IN (0, 1)`);

      // 5. Optional search filter on fullname.
      if (search && search.trim() !== "") {
        conditions.push(`v.fullname LIKE ?`);
        params.push(`%${search}%`);
      }

      // 6. Optional filter for img being NULL.
      if (imgIsNull) {
        conditions.push(`v.img IS NULL`);
      }

      // 7. Mandatory filter for barangayCodes.
      const barangayPlaceholders = barangayCodes.map(() => "?").join(",");
      conditions.push(`v.brgy_code IN (${barangayPlaceholders})`);
      params.push(...barangayCodes);

      // Combine conditions into the final WHERE clause.
      const whereClause =
        conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";

      try {
        // Count total absentees matching the conditions.
        const countQuery = `
          SELECT COUNT(*) AS total 
          FROM voters v 
          ${whereClause}
        `;
        const [totalCountResult] = await fastify.mysql.query<
          ({ total: number } & RowDataPacket)[]
        >(countQuery, params);
        const totalCount = totalCountResult[0].total;

        // Query to fetch paginated absentee data.
        const dataQuery = `
          SELECT v.id, v.hash_id, v.img, v.fullname, 
                 vb.code AS barangayCode, vb.name AS barangay, 
                 vc.name AS citymun, vd.name AS district
          FROM voters v
          LEFT JOIN voter_barangay vb ON v.brgy_code = vb.code
          LEFT JOIN voter_city vc ON v.city_code = vc.code
          LEFT JOIN voter_district vd ON v.district_code = vd.code
          ${whereClause}
          ORDER BY v.fullname, vb.name
          LIMIT ? OFFSET ?
        `;
        const dataParams = [...params, limitNumber, offset];
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
        return reply.status(500).send({ error: "Failed to fetch absentees" });
      }
    }
  );

  fastify.post<{
    Body: {
      hash_ids: string[];
      barangayCodes: string[];
    };
  }>(
    "/voters/event-reports",
    { preHandler: authenticateUser },
    async (req, reply) => {
      const { hash_ids, barangayCodes } = req.body;

      // Validate inputs.
      if (!Array.isArray(hash_ids) || hash_ids.length === 0) {
        return reply
          .status(400)
          .send({ error: "hash_ids must be a non-empty array." });
      }
      if (!Array.isArray(barangayCodes) || barangayCodes.length === 0) {
        return reply
          .status(400)
          .send({ error: "barangayCodes must be a non-empty array." });
      }

      // Define common conditions: Only expected participants.
      const commonConditions = ["v.group_id != 0", "v.type IN (0, 1)"];
      const commonParams: any[] = [];

      // --- Expected Participants Query ---
      const expectedConditions = [
        `v.brgy_code IN (${barangayCodes.map(() => "?").join(",")})`,
        ...commonConditions,
      ];
      const expectedParams = [...barangayCodes, ...commonParams];
      const expectedQuery = `
        SELECT v.brgy_code, vb.name AS barangay, COUNT(*) AS expected
        FROM voters v
        LEFT JOIN voter_barangay vb ON v.brgy_code = vb.code
        WHERE ${expectedConditions.join(" AND ")}
        GROUP BY v.brgy_code, vb.name
      `;

      // --- Actual Participants Query ---
      const hashPlaceholders = hash_ids.map(() => "?").join(",");
      const actualConditions = [
        `v.hash_id IN (${hashPlaceholders})`,
        `v.brgy_code IN (${barangayCodes.map(() => "?").join(",")})`,
        ...commonConditions,
      ];
      const actualParams = [...hash_ids, ...barangayCodes, ...commonParams];
      const actualQuery = `
        SELECT v.brgy_code, vb.name AS barangay, COUNT(*) AS actual
        FROM voters v
        LEFT JOIN voter_barangay vb ON v.brgy_code = vb.code
        WHERE ${actualConditions.join(" AND ")}
        GROUP BY v.brgy_code, vb.name
      `;

      try {
        // Run expected count query.
        const [expectedResults] = await fastify.mysql.query<
          ({
            brgy_code: string;
            barangay: string;
            expected: number;
          } & RowDataPacket)[]
        >(expectedQuery, expectedParams);

        // Run actual count query.
        const [actualResults] = await fastify.mysql.query<
          ({
            brgy_code: string;
            barangay: string;
            actual: number;
          } & RowDataPacket)[]
        >(actualQuery, actualParams);

        // Build maps keyed by barangay code.
        const expectedMap: Record<
          string,
          { expected: number; barangay: string }
        > = {};
        expectedResults.forEach((row) => {
          expectedMap[row.brgy_code] = {
            expected: row.expected,
            barangay: row.barangay || row.brgy_code,
          };
        });
        const actualMap: Record<string, { actual: number; barangay: string }> =
          {};
        actualResults.forEach((row) => {
          actualMap[row.brgy_code] = {
            actual: row.actual,
            barangay: row.barangay || row.brgy_code,
          };
        });

        // Build the report array.
        const report = barangayCodes.map((code) => {
          const expObj = expectedMap[code] || { expected: 0, barangay: code };
          const actObj = actualMap[code] || { actual: 0, barangay: code };
          const expected = expObj.expected;
          const actual = actObj.actual;
          const absentees = expected > actual ? expected - actual : 0;
          // Return the desired shape.
          return {
            barangayCode: code,
            barangay: expObj.barangay || actObj.barangay || code,
            expected,
            actual,
            absentees,
          };
        });

        return reply.send({ report });
      } catch (err) {
        fastify.log.error(err);
        return reply.status(500).send({ error: "Failed to generate report" });
      }
    }
  );
}
