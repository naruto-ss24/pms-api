import { FastifyInstance } from "fastify";
import { Barangay } from "../types/barangay";
import { RowDataPacket } from "@fastify/mysql";
import { authenticateUser } from "../firebase-auth";
import { dipologBarangays } from "../lib/geojson";
import { dipologAreaData } from "../lib/areaData";

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

  fastify.get(
    "/geojson",
    { preHandler: authenticateUser },
    async (req, reply) => {
      try {
        await reply.send(dipologBarangays);
      } catch (err) {
        fastify.log.error(err);
        await reply.status(500).send({ error: "Failed to fetch barangays" });
      }
    }
  );

  fastify.get(
    "/area-data",
    { preHandler: authenticateUser },
    async (req, reply) => {
      try {
        await reply.send(dipologAreaData);
      } catch (err) {
        fastify.log.error(err);
        await reply.status(500).send({ error: "Failed to fetch barangays" });
      }
    }
  );

  fastify.get(
    "/heatmap-data",
    { preHandler: authenticateUser },
    async (req, reply) => {
      try {
        const [rows] = await fastify.mysql.query<
          ({ location: string } & RowDataPacket)[]
        >(
          `
          SELECT 
            v.location
          FROM 
            voters v
          WHERE 
            v.location IS NOT NULL
          `
        );

        // Extract latitude and longitude from the location JSON field and format it as required
        const formattedRows = rows.map((row) => {
          const locationData = JSON.parse(row.location); // Assuming location is stored as a JSON string
          return {
            lat: locationData.coords.latitude,
            lng: locationData.coords.longitude,
          };
        });

        await reply.send(formattedRows);
      } catch (err) {
        fastify.log.error(err);
        await reply
          .status(500)
          .send({ error: "Failed to fetch location data" });
      }
    }
  );

  fastify.get(
    "/clustered-data",
    { preHandler: authenticateUser },
    async (req, reply) => {
      try {
        const [rows] = await fastify.mysql.query<
          ({ location: string } & RowDataPacket)[]
        >(
          `
          SELECT 
            v.location
          FROM 
            voters v
          WHERE 
            v.location IS NOT NULL
          `
        );

        // Extract latitude and longitude from the location JSON field and format it as required
        const formattedRows = rows.map((row) => {
          const locationData = JSON.parse(row.location); // Assuming location is stored as a JSON string
          return {
            lat: locationData.coords.latitude,
            lng: locationData.coords.longitude,
          };
        });

        await reply.send([formattedRows]);
      } catch (err) {
        fastify.log.error(err);
        await reply
          .status(500)
          .send({ error: "Failed to fetch location data" });
      }
    }
  );
}
