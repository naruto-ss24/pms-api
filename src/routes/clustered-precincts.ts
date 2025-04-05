import { FastifyInstance } from "fastify";
import { RowDataPacket } from "@fastify/mysql";
import { ClusteredPrecinct } from "../types/clustered-precinct";
import { authenticateUser } from "../firebase-auth";

export async function clusteredPrecinctRoutes(fastify: FastifyInstance) {
  fastify.get<{
    Querystring: {
      barangayCode: string;
      participantType?: "leaders" | "members";
    };
  }>(
    "/clustered-precincts",
    { preHandler: authenticateUser },
    async (req, reply) => {
      const { barangayCode, participantType } = req.query;

      if (!barangayCode) {
        reply.status(400).send({ error: "Missing barangayCode parameter" });
        return;
      }

      try {
        // 1. Get the clustered precincts for the given barangay.
        const [clusteredRows] = await fastify.mysql.query<
          (ClusteredPrecinct & RowDataPacket)[]
        >(
          `SELECT id, cluster_id AS cluster, precinct 
           FROM brgy_clustered_precincts_prec 
           WHERE brgy_code = ?`,
          [barangayCode]
        );

        // 2. Build and run the query to get expected participants per precinct.
        let expectedQuery = `
          SELECT precinct, COUNT(*) as expected
          FROM voters
          WHERE brgy_code = ?
            AND group_id != 0
            AND type IN (0, 1, 2)
        `;
        if (participantType === "leaders") {
          expectedQuery += ` AND is_grpleader = 1`;
        } else if (participantType === "members") {
          expectedQuery += ` AND is_grpleader = 0`;
        }
        expectedQuery += ` GROUP BY precinct`;

        const [expectedRows] = await fastify.mysql.query<
          (RowDataPacket & { precinct: string; expected: number })[]
        >(expectedQuery, [barangayCode]);

        // Create a lookup map from precinct to its expected participants count.
        const expectedMap: Record<string, number> = {};
        expectedRows.forEach((row) => {
          expectedMap[row.precinct] = row.expected;
        });

        // 3. Merge the clustered precincts with the expected counts.
        const precinctData = clusteredRows.map((row) => ({
          cluster: row.cluster,
          precinct: row.precinct,
          expected: expectedMap[row.precinct] || 0,
        }));

        // 4. Group the precincts by cluster and calculate total expected.
        const grouped = precinctData.reduce((acc, cur) => {
          if (!acc[cur.cluster]) {
            acc[cur.cluster] = [];
          }
          acc[cur.cluster].push({
            precinct: cur.precinct,
            expected: cur.expected,
          });
          return acc;
        }, {} as Record<number, { precinct: string; expected: number }[]>);

        // Transform the grouped object into an array with totalExpected at the cluster level.
        const result = Object.entries(grouped).map(([cluster, precincts]) => {
          const totalExpected = precincts.reduce(
            (sum, p) => sum + p.expected,
            0
          );
          return {
            cluster: Number(cluster),
            totalExpected,
            precincts,
          };
        });

        reply.send(result);
      } catch (err) {
        fastify.log.error(err);
        reply.status(500).send({
          error:
            "Failed to fetch clustered precincts with expected participants",
        });
      }
    }
  );
}
