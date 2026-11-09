# Library Management System frontend

React single-page app built with Vite. It includes the public catalog, member account and circulation views, AI assistant, and staff dashboard.

## Development

```sh
npm ci
npm run dev
```

By default, API requests target `http://localhost:4000/v1`. Set `VITE_API_BASE_URL` to a different API base URL before starting Vite or building for production.

## Checks and production build

```sh
npm run lint
npm run build
npm run preview
```

For a complete local stack, follow the Docker Compose instructions in the repository [README](../README.md).
