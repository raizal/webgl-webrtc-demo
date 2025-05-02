# WebRTC Video Conference Application

This application provides a WebRTC-based video conferencing platform with support for camera streaming and local file streaming.

## Docker Setup

The application can be easily deployed using Docker. The setup includes:
- Building the React frontend
- Building the NestJS backend
- Serving the application through the backend server

### Using Docker Compose (Recommended)

The easiest way to run the application is with Docker Compose:

```bash
# Build and start the application
docker-compose up -d

# To stop the application
docker-compose down
```

### Using Docker Directly

You can also build and run using Docker commands:

```bash
# Build the Docker image
docker build -t webrtc-video-app .

# Run the container
docker run -p 3000:3000 webrtc-video-app
```

## Development Setup

To work on the application locally:

### Frontend (React)

```bash
cd react-video-player
pnpm install
pnpm dev
```

### Backend (NestJS)

```bash
cd backend
pnpm install
pnpm start:dev
```

## Features

- WebRTC-based video conferencing
- Camera streaming
- Local file streaming with audio and video
- Room-based conferencing
- Multiple participant support 