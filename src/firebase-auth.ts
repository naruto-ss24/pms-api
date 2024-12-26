import admin from "firebase-admin";
import { FastifyRequest, FastifyReply } from "fastify";
import path from "path";

const serviceAccount = require(path.resolve(
  __dirname,
  "../firebase-admin.json"
));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: serviceAccount.project_id,
});

export const authenticateUser = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const authorizationHeader = request.headers.authorization;

    if (!authorizationHeader) {
      await reply.status(401).send({ message: "No token provided" });
      return; // Stop further execution
    }

    const token = authorizationHeader.split(" ")[1]; // assuming 'Bearer <token>'
    const decodedToken = await admin.auth().verifyIdToken(token);

    // Attach decoded token to request for further use
    request.user = decodedToken;
  } catch (error) {
    console.error("Authentication error:", error);
    await reply.status(401).send({ message: "Invalid token" });
    return; // Stop further execution
  }
};
