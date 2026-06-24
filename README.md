# Lifelore Backend

This repository contains the Express.js backend API for the Lifelore application. It provides endpoints to manage lessons, users, comments, reports and admin-only overview data. The API connects to MongoDB and expects a Next.js/React frontend to provide authentication JWKS at a configured URL.

## Quick facts

- Language: JavaScript (ES modules)
- Framework: Express.js
- Database: MongoDB (official driver)
- Entry point: `index.js`
- Package manager: pnpm / npm (package.json included)

## Requirements

- Node.js 18+ (or a modern LTS that supports ES modules)
- A running MongoDB instance (connection URI required)
- Environment variables (see below)

## Environment variables

Create a `.env` file in the `lifelore-backend` folder (or provide env vars in your environment) with the following keys:

- `MONGODB_URL` - MongoDB connection string (for example mongodb+srv://...)
- `PORT` - Port the server listens on (for example `4000`)
- `FRONTEND_URL` - Public URL of the frontend (used to locate `/api/auth/jwks` for verifying JWTs)

Example `.env`:

```
MONGODB_URL="mongodb+srv://user:pass@cluster0.mongodb.net/?retryWrites=true&w=majority"
PORT=4000
FRONTEND_URL=https://your-frontend.example.com
```

Note: The server uses `createRemoteJWKSet(new URL(`${FRONTEND_URL}/api/auth/jwks`))` to verify JWTs. Ensure your frontend exposes the JWKS endpoint at that path.

## Install

Install dependencies with your preferred package manager (pnpm, npm, or yarn). Example using pnpm:

```bash
pnpm install
```

Or with npm:

```bash
npm install
```

## Scripts

The following scripts are available from `package.json`:

- `pnpm dev` or `npm run dev` — start the server with `nodemon` for development (auto-restarts on changes)
- `pnpm start` or `npm start` — start the server with Node.js (production)

Example:

```bash
pnpm run dev
# or
npm run dev
```

## API Overview

The backend exposes a REST API under several routes. This is a high level summary of the implemented endpoints (see `index.js` for full implementation details and exact request/response shapes):

- GET `/` — basic health/info endpoint

- Lessons
  - GET `/api/lessons` — get all lessons
  - GET `/api/lessons/public` — get public lessons with query options: `search`, `category`, `tone`, `sort`, `page`, `limit`
  - GET `/api/lessons/featured` — get featured lessons
  - GET `/api/lessons/favourite` — get top favourite lessons (query `sort=asc|desc`)
  - GET `/api/lessons/favourite/:userId` — get a user's favourite lessons
  - GET `/api/lessons/:id` — get lesson by id
  - POST `/api/lessons` — create a lesson (requires Authorization header)
  - PATCH `/api/lessons/:id` — update lesson (requires Authorization; owner or admin)
  - DELETE `/api/lessons/:id` — delete lesson (requires Authorization; owner or admin)
  - PATCH `/api/lessons/favourite` — toggle favourite for a lesson (requires Authorization)
  - POST `/api/lessons/favourite` — add/remove favourite (requires Authorization)
  - POST `/api/lessons/like` — like/unlike a lesson (requires Authorization)
  - PATCH `/api/lessons/visibility/:id` — update visibility (requires Authorization; owner or admin)
  - PATCH `/api/lessons/accessLevel/:id` — update access level (requires Authorization; owner or admin)

- Comments
  - POST `/api/lessons/comments` — add a comment (requires Authorization)
  - GET `/api/lessons/comments/:lessonId` — get comments for a lesson
  - DELETE `/api/lessons/comments/:commentId` — delete comment (requires Authorization)

- Reports
  - POST `/api/lessons/report` — report a lesson (requires Authorization)
  - GET `/api/lessons/report` — admin: get aggregated reports (requires admin)
  - GET `/api/lessons/report/:lessonId` — admin: get reports for a specific lesson (requires admin)
  - DELETE `/api/lessons/report/:lessonId` — admin: delete reports for a lesson (requires admin)

- Admin
  - GET `/api/admin/overview` — admin only: dashboard metrics (requires admin)
  - GET `/api/admin/lessons` — admin only: lesson summary (requires admin)
  - GET `/api/users` — admin only: list users (requires admin)
  - GET `/api/users/count` — admin only: user count (requires admin)
  - DELETE `/api/users/:id` — admin only: delete a user (requires admin)
  - PATCH `/api/users/:id` — admin only: update user (requires admin)

Authentication and authorization

- The API expects a bearer token in the `Authorization` header for protected endpoints: `Authorization: Bearer <token>`.
- JWTs are verified against a JWKS published by the frontend at `${FRONTEND_URL}/api/auth/jwks` using `jose-cjs`.
- Some endpoints require the authenticated user to be an admin (checked via user role stored in the `user` collection).

## Database

- Collections used (observed in the code): `lessons`, `user`, `lessonReports`, `comments`, `session`, `account`.
- Ensure the MongoDB user provided in `MONGODB_URL` has the right permissions to read and write these collections.

## Development notes

- The server uses ES module syntax (package.json contains "type": "module").
- Error handling is mainly via status codes and JSON messages; you can enhance validation and input sanitization as needed.
- Nodemon is included as a dev-time dependency and is used by the `dev` script.

## Deploying

- For production, provide environment variables via your hosting platform (e.g., Vercel functions, Heroku config vars, Docker secrets, or systemd env files).
- Use `npm start` (or `pnpm start`) to run the server in production mode. Consider using a process manager like PM2 or running inside a Docker container.

## Contributing

- If you change the API shape, update this README and any frontend code that calls the endpoints.
- Add tests for new features and keep error messages consistent.

## Where to look next in the code

- Entrypoint: `index.js` — contains route handlers and middleware
- Dependencies: `package.json`

## License

This project currently has `ISC` specified in `package.json`.

---

If you'd like, I can also:

- add a brief Postman/Insomnia collection
- add a Dockerfile and docker-compose for local development
- create a minimal API contract (OpenAPI/Swagger) from the code

Feel free to tell me which of these you'd like next.
