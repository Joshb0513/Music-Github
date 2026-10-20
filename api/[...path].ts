import app from '../artifacts/api-server/src/app';

// Vercel's Node.js runtime invokes this Express app for /api/* requests.
// Keep the app stateless between invocations; durable sessions live in PostgreSQL.
export default app;
