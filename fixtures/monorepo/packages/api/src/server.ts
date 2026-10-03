import { createServer } from "node:http";
import pkg from "../package.json" with { type: "json" };
import { createRouter } from "./routes";

const port = Number(process.env.PORT ?? 4000);
const handle = createRouter({ version: pkg.version });

createServer((request, response) => {
  handle(request, response).catch((error: unknown) => {
    console.error(error);
    response.statusCode = 500;
    response.end();
  });
}).listen(port, () => {
  console.log(`@acme/api ${pkg.version} listening on http://localhost:${port}`);
});
