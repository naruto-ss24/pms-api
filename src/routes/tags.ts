import { FastifyInstance } from "fastify";
import { Tag } from "../types/tag";
import { RowDataPacket } from "@fastify/mysql";
import { authenticateUser } from "../firebase-auth";

export async function tagRoutes(fastify: FastifyInstance) {
  fastify.get<{
    Querystring: {
      brgy?: string;
      is_global?: number;
    };
  }>("/tags", { preHandler: authenticateUser }, async (req, reply) => {
    // Build base query and parameters.
    let query = "SELECT * FROM tags";
    const params: any[] = [];
    const conditions: string[] = [];

    // Filter by barangay if provided.
    if (req.query.brgy) {
      conditions.push("brgy = ?");
      params.push(req.query.brgy);
    }

    // Filter by is_global if provided.
    if (req.query.is_global !== undefined) {
      conditions.push("is_global = ?");
      params.push(req.query.is_global);
    }

    // Append WHERE clause if there are any conditions.
    if (conditions.length > 0) {
      query += " WHERE " + conditions.join(" AND ");
    }

    // Sort alphabetically by tag name.
    query += " ORDER BY name ASC";

    try {
      const [rows] = await fastify.mysql.query<(Tag & RowDataPacket)[]>(
        query,
        params
      );
      return reply.send({ success: true, data: rows });
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({ error: "Failed to fetch tags" });
    }
  });

  fastify.post<{
    Body: {
      tag: string;
      voterId: number;
    };
  }>("/tag-voter", { preHandler: authenticateUser }, async (req, reply) => {
    const { voterId, tag } = req.body;

    if (!tag || !voterId) {
      return reply
        .status(400)
        .send({ error: "Both tag and voterId are required" });
    }

    try {
      // Check if a voter_tag record already exists for this voterId and tag.
      const selectQuery =
        "SELECT id FROM voter_tags WHERE voter_id = ? AND tag = ?";
      const [rows] = await fastify.mysql.query(selectQuery, [voterId, tag]);

      if (Array.isArray(rows) && rows.length > 0) {
        // Record already exists; don't update.
        return reply.send({
          success: true,
          message: "Voter tag already exists",
        });
      } else {
        // Record does not exist – insert a new row.
        const insertQuery =
          "INSERT INTO voter_tags (voter_id, tag) VALUES (?, ?)";
        await fastify.mysql.query(insertQuery, [voterId, tag]);
        return reply.send({
          success: true,
          message: "Voter tag created successfully",
        });
      }
    } catch (err) {
      fastify.log.error(err);
      return reply
        .status(500)
        .send({ error: "Failed to create voter tag", details: err });
    }
  });
}
