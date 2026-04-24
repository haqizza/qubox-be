import { createServer_ } from "./api/app";

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

const server = createServer_();
server.listen(PORT, () => {
  console.log(`Question Pool Live Q&A server listening on port ${PORT}`);
});
