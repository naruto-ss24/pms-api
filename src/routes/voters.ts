import { FastifyInstance } from "fastify";
import { Voter } from "../types/voter";
import { RowDataPacket } from "@fastify/mysql";
import { authenticateUser } from "../firebase-auth";

export async function voterRoutes(fastify: FastifyInstance) {
  fastify.get<{
    Querystring: {
      barangayCodes?: string | string[];
      page?: number;
      limit?: number;
    };
  }>("/voters", { preHandler: authenticateUser }, async (req, reply) => {
    // Normalize barangayCodes to an array.
    let codes = req.query.barangayCodes;
    if (!codes) {
      reply.status(400).send({ error: "Missing barangayCodes parameter" });
      return;
    }
    const barangayCodes = Array.isArray(codes) ? codes : [codes];

    const pageNumber = Number(req.query.page || 1);
    const limitNumber = Number(req.query.limit || 100);
    const offset = (pageNumber - 1) * limitNumber;

    // Create dynamic placeholders for the IN clause.
    const placeholders = barangayCodes.map(() => "?").join(",");

    try {
      // Count total matching voters.
      const [totalCountResult] = await fastify.mysql.query<
        ({ total: number } & RowDataPacket)[]
      >(
        `SELECT COUNT(*) AS total FROM voters WHERE brgy_code IN (${placeholders})`,
        barangayCodes
      );
      const totalCount = totalCountResult[0].total;

      // Retrieve voter rows with pagination.
      const [rows] = await fastify.mysql.query<(Voter & RowDataPacket)[]>(
        `SELECT * FROM voters WHERE brgy_code IN (${placeholders}) LIMIT ? OFFSET ?`,
        [...barangayCodes, limitNumber, offset]
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
  }>("/voters/:id", { preHandler: authenticateUser }, async (req, reply) => {
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

  fastify.get<{ Params: { id: number } }>(
    "/voters/:id/info",
    { preHandler: authenticateUser },
    async (req, reply) => {
      const { id } = req.params;

      try {
        const query = `
          SELECT 
            v.id,
            v.fullname,
            v.type,
            v.cluster,
            v.precinct,
            v.address,
            v.contactnumber,
            v.bdate,
            v.sex,
            v.district_code,
            v.city_code,
            v.brgy_code,
            v.is_houseleader,
            v.is_grpleader,
            v.group_id,
            v.family_id,
            v.img,
            v.location,
            v.images,
            b.name AS barangay,
            vc.name AS citymun,
            vd.name AS district,
            CASE 
              WHEN v.family_id = 0 THEN 'N/A' 
              ELSE h.fullname 
            END AS hhl,
            CASE 
              WHEN v.group_id = 0 THEN 'N/A' 
              ELSE g.fullname 
            END AS vgl
          FROM voters v
          LEFT JOIN voter_barangay b ON v.brgy_code = b.code
          LEFT JOIN voter_city vc ON v.city_code = vc.code
          LEFT JOIN voter_district vd ON v.district_code = vd.code
          LEFT JOIN voters h ON v.family_id = h.family_id AND h.is_houseleader = 1
          LEFT JOIN voters g ON v.group_id = g.group_id AND g.is_grpleader = 1
          WHERE v.id = ?
          LIMIT 1
        `;
        const [rows] = await fastify.mysql.query<(Voter & RowDataPacket)[]>(
          query,
          [id]
        );

        if (rows.length === 0) {
          return reply.status(404).send({ error: "Voter not found" });
        }

        return reply.send({ data: rows[0] });
      } catch (error: any) {
        fastify.log.error(
          "Error fetching voter info:",
          error.message,
          error.sql
        );
        return reply.status(500).send({ error: "Failed to fetch voter info." });
      }
    }
  );

  fastify.get<{ Params: { groupId: number } }>(
    "/voters/:groupId/group-info",
    async (req, reply) => {
      const { groupId } = req.params;

      try {
        const query = `
          SELECT 
            v.id,
            v.fullname,
            vb.name AS barangay,
            vc.name AS citymun,
            v.purok_code,
            v.precinct,
            v.cluster,
            v.address,
            v.contactnumber,
            v.group_id,
            v.is_grpleader
          FROM voters v
          LEFT JOIN voter_barangay vb ON v.brgy_code = vb.code
          LEFT JOIN voter_city vc ON v.city_code = vc.code
          WHERE v.group_id = ?
          ORDER BY v.fullname
        `;

        const [rows] = await fastify.mysql.query<(Voter & RowDataPacket)[]>(
          query,
          [groupId]
        );

        if (rows.length === 0) {
          return reply
            .status(404)
            .send({ error: "No voters found for this group." });
        }

        return reply.send({ data: rows });
      } catch (err) {
        fastify.log.error(err);
        return reply
          .status(500)
          .send({ error: "Failed to fetch voter group." });
      }
    }
  );

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
      hashIds: string[];
      barangayCodes?: string[];
      participantType?: "leaders" | "members";
      imgIsNull?: boolean;
      page?: number;
      limit?: number;
      search?: string;
    };
  }>(
    "/voters/by-hashids",
    { preHandler: authenticateUser },
    async (req, reply) => {
      const {
        hashIds,
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

      if (!Array.isArray(hashIds) || hashIds.length === 0) {
        return reply
          .status(400)
          .send({ error: "hashIds must be a non-empty array." });
      }

      // Build dynamic WHERE conditions and parameter array
      const conditions: string[] = [];
      const params: any[] = [];

      // 1. Filter by hashIds
      const hashIdPlaceholders = hashIds.map(() => "?").join(",");
      conditions.push(`v.hash_id IN (${hashIdPlaceholders})`);
      params.push(...hashIds);

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
      conditions.push(`v.type IN (0, 1, 2)`);

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

      // Combine conditions into a WHERE clause
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

        // Query to fetch paginated voter data.
        // Added computed column "vgl" using a LEFT JOIN.
        const dataQuery = `
          SELECT v.id, v.hash_id, v.img, v.type,
                v.fullname, v.group_id, v.family_id, v.is_grpleader, v.is_houseleader, v.cluster, v.precinct,
                vb.code AS barangayCode, vb.name AS barangay, 
                vc.name AS citymun, vd.name AS district,
                CASE WHEN v.group_id = 0 THEN 'N/A' ELSE vgl.fullname END AS vgl
          FROM voters v
          LEFT JOIN voter_barangay vb ON v.brgy_code = vb.code
          LEFT JOIN voter_city vc ON v.city_code = vc.code
          LEFT JOIN voter_district vd ON v.district_code = vd.code
          LEFT JOIN voters vgl ON v.group_id = vgl.group_id AND vgl.is_grpleader = 1
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
      hashIds: string[];
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
        hashIds,
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

      if (!Array.isArray(hashIds) || hashIds.length === 0) {
        return reply
          .status(400)
          .send({ error: "hashIds must be a non-empty array." });
      }

      // Build dynamic WHERE conditions and parameter array
      const conditions: string[] = [];
      const params: any[] = [];

      // 1. Filter by hashIds
      const hashIdPlaceholders = hashIds.map(() => "?").join(",");
      conditions.push(`v.hash_id IN (${hashIdPlaceholders})`);
      params.push(...hashIds);

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
      conditions.push(`v.type IN (0, 1, 2)`);

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

      // Combine conditions into a WHERE clause
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

        // Query to fetch paginated voter data.
        // Added computed column "vgl" using a LEFT JOIN.
        const dataQuery = `
          SELECT v.id, v.hash_id, v.img, v.fullname, v.type,
                 vb.code AS barangayCode, vb.name AS barangay, 
                 vc.name AS citymun, vd.name AS district,
                 CASE WHEN v.group_id = 0 THEN 'N/A' ELSE vgl.fullname END AS vgl
          FROM voters v
          LEFT JOIN voter_barangay vb ON v.brgy_code = vb.code
          LEFT JOIN voter_city vc ON v.city_code = vc.code
          LEFT JOIN voter_district vd ON v.district_code = vd.code
          LEFT JOIN voters vgl ON v.group_id = vgl.group_id AND vgl.is_grpleader = 1
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
      hashIds: string[];
      barangayCodes: string[];
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
        hashIds,
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

      if (!Array.isArray(hashIds) || hashIds.length === 0) {
        return reply
          .status(400)
          .send({ error: "hashIds must be a non-empty array." });
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

      // 1. Exclude voters whose id is in the provided list.
      const hashIdPlaceholders = hashIds.map(() => "?").join(",");
      conditions.push(`v.hash_id NOT IN (${hashIdPlaceholders})`);
      params.push(...hashIds);

      // 2. Only consider expected participants.
      conditions.push(`v.group_id != 0`);

      // 3. Participant type filtering if provided.
      if (participantType === "leaders") {
        conditions.push(`v.is_grpleader = 1`);
      } else if (participantType === "members") {
        conditions.push(`v.is_grpleader = 0`);
      }

      // 4. Only query voters with type 0 or 1.
      conditions.push(`v.type IN (0, 1, 2)`);

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
        // Added computed "vgl" field.
        const dataQuery = `
          SELECT v.id, v.hash_id, v.img, v.fullname, v.type,
                 vb.code AS barangayCode, vb.name AS barangay, 
                 vc.name AS citymun, vd.name AS district,
                 CASE WHEN v.group_id = 0 THEN 'N/A' ELSE vgl.fullname END AS vgl
          FROM voters v
          LEFT JOIN voter_barangay vb ON v.brgy_code = vb.code
          LEFT JOIN voter_city vc ON v.city_code = vc.code
          LEFT JOIN voter_district vd ON v.district_code = vd.code
          LEFT JOIN voters vgl ON v.group_id = vgl.group_id AND vgl.is_grpleader = 1
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

  fastify.get<{
    Querystring: {
      barangayCode: string;
      participantType?: "leaders" | "members";
    };
  }>(
    "/voters/expected-participants",
    { preHandler: authenticateUser },
    async (req, reply) => {
      const { barangayCode, participantType } = req.query;

      let query = `
        SELECT v.brgy_code, vb.name AS barangay, COUNT(*) AS expected
        FROM voters v
        LEFT JOIN voter_barangay vb ON v.brgy_code = vb.code
        WHERE v.brgy_code = ? 
          AND v.group_id != 0 
          AND v.type IN (0, 1, 2)
      `;

      // Apply participantType filter logic.
      if (participantType === "leaders") {
        query += ` AND v.is_grpleader = 1`;
      } else if (participantType === "members") {
        query += ` AND v.is_grpleader = 0`;
      }

      query += ` GROUP BY v.brgy_code, vb.name`;

      try {
        const [results] = await fastify.mysql.query<
          (RowDataPacket & {
            brgy_code: string;
            barangay: string;
            expected: number;
          })[]
        >(query, [barangayCode]);

        if (results.length === 0) {
          // No matching voters found; try to get barangay name from voter_barangay table.
          const [barResults] = await fastify.mysql.query<
            (RowDataPacket & { name: string })[]
          >(`SELECT name FROM voter_barangay WHERE code = ?`, [barangayCode]);
          const barangayName =
            barResults.length > 0 ? barResults[0].name : barangayCode;
          return reply.send({
            barangayCode,
            barangay: barangayName,
            expected: 0,
          });
        }

        return reply.send(results[0]);
      } catch (err) {
        fastify.log.error(err);
        return reply
          .status(500)
          .send({ error: "Failed to fetch expected participants" });
      }
    }
  );

  fastify.post<{
    Body: {
      voterIds: string[];
      barangayCodes?: string[];
      participantType?: "leaders" | "members";
      imgIsNull?: boolean;
    };
  }>(
    "/voters/download-participants",
    { preHandler: authenticateUser },
    async (req, reply) => {
      const { voterIds, barangayCodes, participantType, imgIsNull } = req.body;

      // Validate that voterIds is provided and non-empty
      if (!Array.isArray(voterIds) || voterIds.length === 0) {
        return reply
          .status(400)
          .send({ error: "voterIds must be a non-empty array." });
      }

      // Build dynamic WHERE conditions and parameters
      const conditions: string[] = [];
      const params: any[] = [];

      // 1. Filter by voterIds
      const voterIdPlaceholders = voterIds.map(() => "?").join(",");
      conditions.push(`v.id IN (${voterIdPlaceholders})`);
      params.push(...voterIds);

      // 2. Ensure only event participants (group_id != 0)
      conditions.push(`v.group_id != 0`);

      // 3. Filter based on participantType if provided
      if (participantType === "leaders") {
        conditions.push(`v.is_grpleader = 1`);
      } else if (participantType === "members") {
        conditions.push(`v.is_grpleader = 0`);
      }

      // 4. Only query voters with type 0, 1, or 2
      conditions.push(`v.type IN (0, 1, 2)`);

      // 5. Optional filter for img being NULL
      if (imgIsNull) {
        conditions.push(`v.img IS NULL`);
      }

      // 6. Optional filter for barangayCodes if provided
      if (Array.isArray(barangayCodes) && barangayCodes.length > 0) {
        const barangayPlaceholders = barangayCodes.map(() => "?").join(",");
        conditions.push(`v.brgy_code IN (${barangayPlaceholders})`);
        params.push(...barangayCodes);
      }

      // Combine conditions into a WHERE clause
      const whereClause =
        conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";

      try {
        // Updated query to include voter.img and voter.id
        const csvQuery = `
          SELECT v.fullname, v.type, v.img, v.id,
                 CASE WHEN v.group_id = 0 THEN 'N/A' ELSE vgl.fullname END AS vgl
          FROM voters v
          LEFT JOIN voters vgl ON v.group_id = vgl.group_id AND vgl.is_grpleader = 1
          ${whereClause}
          ORDER BY v.fullname
        `;

        // Execute the query
        const [rows] = await fastify.mysql.query<any[]>(csvQuery, params);

        // Helper function to escape CSV values
        const escapeCSV = (value: string): string => {
          if (
            value.includes(",") ||
            value.includes('"') ||
            value.includes("\n")
          ) {
            return `"${value.replace(/"/g, '""')}"`;
          }
          return value;
        };

        // Build CSV content with header row including new columns.
        const header = "Full Name,VGL,Type,Has Picture,Link";
        const csvRows = [header];
        for (const row of rows) {
          const fullname = escapeCSV(String(row.fullname));
          const vgl = escapeCSV(String(row.vgl));
          // Map voter.type values to string: 0 => "B", 1 => "A", 2 => "C"
          const type =
            row.type === 0
              ? "B"
              : row.type === 1
              ? "A"
              : row.type === 2
              ? "C"
              : "";
          const hasPicture = row.img ? "true" : "false";
          // Build the link column using the FRONTEND_URL environment variable.
          const link = `${process.env.FRONTEND_URL}/voters/${row.id}`;
          csvRows.push(
            `${fullname},${vgl},${escapeCSV(type)},${hasPicture},${escapeCSV(
              link
            )}`
          );
        }
        const csvData = csvRows.join("\n");

        // Set headers to trigger file download
        reply.header("Content-Type", "text/csv");
        reply.header(
          "Content-Disposition",
          "attachment; filename=participants.csv"
        );
        return reply.send(csvData);
      } catch (err) {
        fastify.log.error(err);
        return reply
          .status(500)
          .send({ error: "Failed to download participants" });
      }
    }
  );

  fastify.post<{
    Body: {
      voterIds: string[];
      barangayCodes?: string[];
      participantType?: "leaders" | "members";
      imgIsNull?: boolean;
    };
  }>(
    "/voters/download-absentees",
    { preHandler: authenticateUser },
    async (req, reply) => {
      const { voterIds, barangayCodes, participantType, imgIsNull } = req.body;

      // Validate that voterIds is provided and non-empty.
      if (!Array.isArray(voterIds) || voterIds.length === 0) {
        return reply
          .status(400)
          .send({ error: "voterIds must be a non-empty array." });
      }

      // Build dynamic WHERE conditions and parameter array.
      const conditions: string[] = [];
      const params: any[] = [];

      // 1. For absentees, exclude voters in the provided voterIds.
      const voterIdPlaceholders = voterIds.map(() => "?").join(",");
      conditions.push(`v.id NOT IN (${voterIdPlaceholders})`);
      params.push(...voterIds);

      // 2. Ensure only expected participants (group_id != 0).
      conditions.push(`v.group_id != 0`);

      // 3. Filter based on participantType if provided.
      if (participantType === "leaders") {
        conditions.push(`v.is_grpleader = 1`);
      } else if (participantType === "members") {
        conditions.push(`v.is_grpleader = 0`);
      }

      // 4. Only query voters with type 0, 1, or 2.
      conditions.push(`v.type IN (0, 1, 2)`);

      // 5. Optional filter for img being NULL.
      if (imgIsNull) {
        conditions.push(`v.img IS NULL`);
      }

      // 6. Optional filter for barangayCodes.
      if (Array.isArray(barangayCodes) && barangayCodes.length > 0) {
        const barangayPlaceholders = barangayCodes.map(() => "?").join(",");
        conditions.push(`v.brgy_code IN (${barangayPlaceholders})`);
        params.push(...barangayCodes);
      }

      const whereClause =
        conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";

      try {
        // Updated query to include voter.img and voter.id.
        const csvQuery = `
          SELECT v.fullname, v.type, v.img, v.id,
                 CASE WHEN v.group_id = 0 THEN 'N/A' ELSE vgl.fullname END AS vgl
          FROM voters v
          LEFT JOIN voters vgl ON v.group_id = vgl.group_id AND vgl.is_grpleader = 1
          ${whereClause}
          ORDER BY v.fullname
        `;

        // Execute the query
        const [rows] = await fastify.mysql.query<any[]>(csvQuery, params);

        // Helper function to escape CSV values.
        const escapeCSV = (value: string): string => {
          if (
            value.includes(",") ||
            value.includes('"') ||
            value.includes("\n")
          ) {
            return `"${value.replace(/"/g, '""')}"`;
          }
          return value;
        };

        // Build CSV content with a header row including new columns.
        const header = "Full Name,VGL,Type,Has Picture,Link";
        const csvRows = [header];
        for (const row of rows) {
          const fullname = escapeCSV(String(row.fullname));
          const vgl = escapeCSV(String(row.vgl));
          // Map voter.type values to string: 0 => "B", 1 => "A", 2 => "C"
          const type =
            row.type === 0
              ? "B"
              : row.type === 1
              ? "A"
              : row.type === 2
              ? "C"
              : "";
          const hasPicture = row.img ? "true" : "false";
          // Build the link column using the FRONTEND_URL environment variable.
          const link = `${process.env.FRONTEND_URL}/voters/${row.id}`;
          csvRows.push(
            `${fullname},${vgl},${escapeCSV(type)},${hasPicture},${escapeCSV(
              link
            )}`
          );
        }
        const csvData = csvRows.join("\n");

        // Set headers to trigger file download.
        reply.header("Content-Type", "text/csv");
        reply.header(
          "Content-Disposition",
          "attachment; filename=absentees.csv"
        );
        return reply.send(csvData);
      } catch (err) {
        fastify.log.error(err);
        return reply
          .status(500)
          .send({ error: "Failed to download absentees" });
      }
    }
  );
}
