# Service Monitoring Tool

A web application built with Remix that allows you to scan websites for broken links and pages.

## Features

- Crawls a given URL to find all internal links
- Checks each link for 404, 500, or other errors
- Returns detailed reports on any broken pages found
- Provides both a web interface and API for scanning

## API Usage

The application exposes a REST API that can be used to scan websites programmatically.

### Scan for Broken Pages

**Endpoint:** `POST /api/broken-page-scanner`

**Request:**
```bash
curl -X POST -H "Content-Type: application/json" -d '{"url": "https://example.com"}' http://localhost:3000/api/broken-page-scanner
```

**Successful Response (No broken pages):**
```json
{
  "error": false,
  "message": "No broken pages found"
}
```

**Successful Response (With broken pages):**
```json
{
  "error": true,
  "message": "There are 2 broken pages",
  "pages": [
    { "url": "https://example.com/broken-page" },
    { "url": "https://example.com/another-broken-page" }
  ]
}
```

**Error Response:**
```json
{
  "error": true,
  "message": "Failed to fetch URL"
}
```

---

# Remix App Information

- 📖 [Remix docs](https://remix.run/docs)

## Development

Run the dev server:

```shellscript
npm run dev
```

## Deployment

First, build your app for production:

```sh
npm run build
```

Then run the app in production mode:

```sh
npm start
```

Now you'll need to pick a host to deploy it to.

### DIY

If you're familiar with deploying Node applications, the built-in Remix app server is production-ready.

Make sure to deploy the output of `npm run build`

- `build/server`
- `build/client`

## Styling

This template comes with [Tailwind CSS](https://tailwindcss.com/) already configured for a simple default starting experience. You can use whatever css framework you prefer. See the [Vite docs on css](https://vitejs.dev/guide/features.html#css) for more information.
