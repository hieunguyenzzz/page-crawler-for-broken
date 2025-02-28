## Docker Support

The application includes Docker support for easy deployment.

### Using Docker

Build the Docker image:

```bash
docker build -t service-monitoring .
```

Run the container:

```bash
docker run -p 3000:3000 -v service-monitoring-data:/app/data service-monitoring
```

### Using Docker Compose

For a simpler setup with persistent storage:

```bash
docker-compose up -d
```

This will start the service on port 3000 and store the SQLite database in a named volume.

### Environment Variables

When running with Docker, you can configure the application using these environment variables:

- `PORT`: The port the application listens on (default: 3000)
- `DATA_DIR`: Directory for the SQLite database (default: /app/data)

Example:

```bash
docker run -p 8080:8080 -e PORT=8080 -v service-monitoring-data:/app/data service-monitoring
``` 