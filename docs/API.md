# Codex Resets API

Base URL: `https://codex-resets-api.nicholashan.workers.dev`

All endpoints are public, read-only, and CORS-enabled.

---

## Endpoints

### `GET /api/prediction`

Current prediction state for the next Codex reset.

**Response:**
```json
{
  "probability24h": 0.32,
  "probability48h": 0.48,
  "daysSinceLastReset": 3.8,
  "lastResetDate": "2025-08-15T17:00:00Z",
  "generatedAt": "2025-08-19T12:00:00Z"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `probability24h` | number | Probability of reset within 24 hours (0-1) |
| `probability48h` | number | Probability of reset within 48 hours (0-1) |
| `daysSinceLastReset` | number | Days since last confirmed reset |
| `lastResetDate` | string | ISO 8601 timestamp of last reset |
| `generatedAt` | string | ISO 8601 timestamp of this response |

---

### `GET /api/history`

Reset history (last 20 records).

**Response:**
```json
{
  "records": [
    {
      "date": "2025-08-15T17:00:00Z",
      "timestamp": 1755176400000,
      "reason": "goodwill",
      "source": "twitter"
    }
  ],
  "count": 20
}
```

| Field | Type | Description |
|-------|------|-------------|
| `records` | array | Array of reset records |
| `count` | number | Number of records returned |

---

### `GET /api/signals`

Current signal states from monitoring sources.

**Response:**
```json
{
  "signals": [
    {
      "name": "timeSince",
      "label": "Time Since Last Reset",
      "level": 0.75,
      "weight": 0.3,
      "description": "Days since last reset"
    }
  ],
  "source": "live",
  "updatedAt": "2025-08-19T12:00:00Z"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `signals` | array | Array of signal objects |
| `source` | string | Data source: `live`, `cached`, or `fallback` |
| `updatedAt` | string | ISO 8601 timestamp |

---

### `GET /api/health`

Health check endpoint.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-08-19T12:00:00Z",
  "version": "1.0.0",
  "uptime": 1692288000000
}
```

---

## Rate Limits

- 100 requests per minute per IP
- Responses are cached for 60 seconds

## Error Handling

All endpoints return consistent error responses:

```json
{
  "error": "Error message description"
}
```

| Status Code | Description |
|-------------|-------------|
| 200 | Success |
| 500 | Internal server error |
