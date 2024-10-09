// src/types/firebase-auth.d.ts

import "fastify";
import admin from "firebase-admin";

declare module "fastify" {
  interface FastifyRequest {
    user?: admin.auth.DecodedIdToken; // Add the user property to FastifyRequest
  }
}
