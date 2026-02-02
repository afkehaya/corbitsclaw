import { handle } from "@hono/node-server/vercel";
import app from "../apps/api/src/index.js";

export default handle(app);
