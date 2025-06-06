import { MySQLPromisePool } from "@fastify/mysql";

declare module "fastify" {
  interface FastifyInstance {
    mysql: MySQLPromisePool;
  }
}
