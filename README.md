# Vault

A private password vault with a React frontend, Express API, and MongoDB Atlas storage. Vault entries are encrypted in the browser before they are sent to the API.

## Local setup

1. Copy `.env.example` to `.env` and set `MONGODB_URI` and a strong `JWT_SECRET`.
2. Install dependencies with `npm install` and `npm --prefix client install`.
3. Start the API with `npm run dev:api`.
4. In another terminal, start the frontend with `npm run dev:client`.

The local app runs at `http://localhost:5173` and the API at `http://localhost:5000`.

## Deployment

The project includes a Vercel configuration for the frontend build and `/api` routes. Set `MONGODB_URI` and `JWT_SECRET` in the Vercel project environment settings; never commit `.env`.
