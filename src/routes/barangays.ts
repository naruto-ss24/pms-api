import { FastifyInstance } from "fastify";
import { Barangay } from "../types/barangay";
import { RowDataPacket } from "@fastify/mysql";
import { authenticateUser } from "../firebase-auth";
import { dipologBarangays } from "../lib/geojson";
import { fetchVoterLocations } from "../lib/utils";

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

  fastify.get<{
    Querystring: { brgy_code?: string };
  }>("/geojson", async (req, reply) => {
    try {
      const { brgy_code } = req.query;

      // If brgy_code is provided, filter by it
      if (brgy_code) {
        const filteredFeatures = dipologBarangays.features.filter(
          (feature) => feature.properties.id === brgy_code
        );

        // If no matching barangay is found, return a 404 error
        if (filteredFeatures.length === 0) {
          return reply.status(404).send({ error: "Barangay not found" });
        }

        // Send the filtered GeoJSON
        const filteredGeoJSON = {
          ...dipologBarangays,
          features: filteredFeatures,
        };

        await reply.send(filteredGeoJSON);
      } else {
        // If no brgy_code is provided, send all barangays
        await reply.send(dipologBarangays);
      }
    } catch (err) {
      fastify.log.error(err);
      await reply.status(500).send({ error: "Failed to fetch barangays" });
    }
  });

  fastify.get<{
    Querystring: { brgy_code?: string };
  }>("/area-data", async (req, reply) => {
    try {
      const { brgy_code } = req.query;

      // Base query for fetching total voters and candidates' votes
      let query = `
          SELECT 
            v.brgy_code, 
            SUM(CASE WHEN v.type = 1 THEN 1 ELSE 0 END) AS A_votes, 
            SUM(CASE WHEN v.type = 0 THEN 1 ELSE 0 END) AS B_votes,
            SUM(CASE WHEN v.type = 2 THEN 1 ELSE 0 END) AS C_votes
          FROM 
            voters v
          WHERE 
            v.brgy_code like ?
          GROUP BY v.brgy_code
        `;

      // Execute the query to get votes for each candidate (A, B, C)
      const [rows] = await fastify.mysql.query<
        {
          brgy_code: string;
          A_votes: number;
          B_votes: number;
          C_votes: number;
        }[] &
          RowDataPacket[]
      >(query, [brgy_code ? brgy_code : "AR1002-MUN100001%"]);

      // If no matching barangay is found, return a 404 error
      if (rows.length === 0) {
        return reply.status(404).send({ error: "Barangay not found" });
      }

      // Process the results to create the structure as required
      const areaData = rows.map((row) => ({
        id: row.brgy_code,
        properties: [], // Empty properties array as per the example structure
        totalVoters: +row.A_votes + +row.B_votes + +row.C_votes, // Total voters = sum of all votes
        candidates: [
          { name: "A", votes: row.A_votes },
          { name: "B", votes: row.B_votes },
          { name: "C", votes: row.C_votes },
        ],
      }));

      await reply.send(areaData);
    } catch (err) {
      fastify.log.error(err);
      await reply.status(500).send({ error: "Failed to fetch area data" });
    }
  });

  fastify.get<{
    Querystring: { brgy_code: string; type: string };
  }>("/heatmap-data", async (req, reply) => {
    try {
      const { brgy_code, type } = req.query;

      let query = `
          SELECT 
            v.location
          FROM 
            voters v
          WHERE 
            v.location IS NOT NULL
      `;

      // Add conditions to the query based on the provided parameters
      if (brgy_code !== undefined) {
        query += ` AND v.brgy_code = ?`;
      }

      if (type !== undefined) {
        query += ` AND v.type = ?`;
      }

      // Define the parameters for the query, ensuring correct order
      const params: (string | number)[] = [];
      if (type !== undefined) {
        params.push(type);
      }
      if (brgy_code !== undefined) {
        params.push(brgy_code);
      }

      // Execute the query with the parameters
      const [rows] = await fastify.mysql.query<
        ({ location: string } & RowDataPacket)[]
      >(query, params);

      // Format the location data
      const formattedRows = rows.map((row) => {
        const locationData = JSON.parse(row.location);
        return {
          lat: locationData.coords.latitude,
          lng: locationData.coords.longitude,
        };
      });

      await reply.send(formattedRows);
    } catch (err) {
      fastify.log.error(err);
      await reply.status(500).send({ error: "Failed to fetch location data" });
    }
  });

  fastify.get<{
    Querystring: { brgy_code: string };
  }>("/cluster-data", async (req, reply) => {
    try {
      const { brgy_code } = req.query;

      // Fetch locations for all types (1, 0, 2) using the helper function
      const a = await fetchVoterLocations(fastify, 1, brgy_code);
      const b = await fetchVoterLocations(fastify, 0, brgy_code);
      const c = await fetchVoterLocations(fastify, 2, brgy_code);

      await reply.send([a, b, c]);
    } catch (err) {
      fastify.log.error(err);
      await reply.status(500).send({ error: "Failed to fetch location data" });
    }
  });
}
