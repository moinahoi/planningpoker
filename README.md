# Planning Poker

A real-time agile planning poker application for estimating user stories with your team.

## Features

- Create a new game and invite others via a dedicated URL
- Join existing games with a username
- Select from Fibonacci numbers (0, 1, 2, 3, 5, 8, 13, 20) for estimation
- Real-time updates when players join or select cards
- Reveal all cards simultaneously
- View the average estimate
- Start new rounds

## Tech Stack

### Frontend

- React with TypeScript
- Vite for fast development and building
- Tailwind CSS for styling
- Socket.io client for real-time communication
- React Router for navigation

### Backend

- Node.js with Express
- Socket.io for real-time communication
- nanoid for generating unique game IDs

## Real-time Implementation

This application uses WebSockets via Socket.io for real-time communication. Here are some alternative approaches that could be used:

1. **WebSockets (Socket.io)**: The current implementation uses a direct, persistent connection between client and server, allowing for real-time bidirectional communication. This is ideal for applications like planning poker where immediate updates are important.

2. **Server-Sent Events (SSE)**: A one-way channel from server to client that could be used if updates primarily flow from server to clients. This would be less resource-intensive than WebSockets but wouldn't allow for as efficient client-to-server communication.

3. **Long Polling**: Clients repeatedly poll the server for updates. This approach is more compatible with older browsers but creates more HTTP overhead and doesn't provide the same real-time experience.

4. **GraphQL Subscriptions**: Real-time data with GraphQL, which would be useful if the application needed to scale with more complex data requirements.

## Setup and Installation

### Docker-Compose

```
docker compose up
```

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn

### Installation

1. Clone the repository

```
git clone <repository-url>
cd planning-poker
```

2. Install dependencies for the root project, server, and client

```
npm run install-all
```

### Development

Run both the client and server in development mode:

```
npm run dev
```

Or run them separately:

```
npm run server
npm run client
```

The client will be available at http://localhost:3000 and the server at http://localhost:5000.

### Production

1. Build the client

```
npm run build
```

2. Start the production server

```
npm start
```

## Deployment

The application is designed to be easy to deploy. Here are some options:

1. **Heroku**: Deploy the entire application to Heroku, which will automatically serve the built client files.

2. **Vercel/Netlify + Separate Backend**: Deploy the client to Vercel or Netlify and the server to a service like Heroku, Railway, or Render.

3. **Docker**: Containerize the application for deployment to any container orchestration platform.

## License

MIT
