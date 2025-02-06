import { RowDataPacket } from "@fastify/mysql";
import { FastifyInstance } from "fastify";

export const fetchVoterLocations = async (
  fastify: FastifyInstance,
  type: number,
  brgy_code?: string
): Promise<{ lat: number; lng: number }[]> => {
  // Start building the query
  let query = `
      SELECT 
        v.location
      FROM 
        voters v
      WHERE 
        v.location IS NOT NULL
        AND v.type = ?
    `;

  // Add brgy_code filter if provided
  if (brgy_code) {
    query += ` AND v.brgy_code = ?`;
  }

  // Define the parameters for the query
  const params = brgy_code ? [type, brgy_code] : [type];

  // Execute the query and retrieve the rows
  const [rows] = await fastify.mysql.query<
    ({ location: string } & RowDataPacket)[]
  >(query, params);

  // Map through the rows and format the location data
  return rows.map((row) => {
    const locationData = JSON.parse(row.location);
    return {
      lat: locationData.coords.latitude,
      lng: locationData.coords.longitude,
    };
  });
};
