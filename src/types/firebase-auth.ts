import admin from "firebase-admin";

declare module "fastify" {
  interface FastifyRequest {
    user?: admin.auth.DecodedIdToken; // Add the user property to FastifyRequest
  }
}
