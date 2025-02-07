import { RowDataPacket } from "@fastify/mysql";
import { FastifyInstance } from "fastify";

export const fetchVoterLocations = async (
  fastify: FastifyInstance,
  brgy_code: string,
  type: number
): Promise<{ lat: number; lng: number }[]> => {
  // Start building the query
  let query = `
      SELECT 
        v.location
      FROM 
        voters v
      WHERE 
        v.location IS NOT NULL
        AND v.brgy_code like "${brgy_code}%"
        AND v.type = ${type}
    `;

  // Execute the query and retrieve the rows
  const [rows] = await fastify.mysql.query<
    ({ location: string } & RowDataPacket)[]
  >(query);

  // Map through the rows and format the location data
  return rows.map((row) => {
    const locationData = JSON.parse(row.location);
    return {
      lat: locationData.coords.latitude,
      lng: locationData.coords.longitude,
    };
  });
};
