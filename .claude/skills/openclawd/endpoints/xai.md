# xAI Grok API Documentation

## Overview

Access xAI's Grok models through the Corbits-hosted proxy. The API supports both the new Responses API and the legacy Chat Completions API.

## Base URL

```
https://xai.alez-848f79.api.corbits.dev
```

## Authentication

All requests require an `Authorization` header with your OpenClawd API key:

```
Authorization: Bearer oc_your_api_key_here
```

---

## Endpoints

### POST /v1/responses (Recommended)

The new Responses API - preferred for all new integrations.

#### Request

```bash
curl -X POST "https://xai.alez-848f79.api.corbits.dev/v1/responses" \
  -H "Authorization: Bearer oc_your_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "grok-4",
    "input": "Explain quantum computing in simple terms",
    "temperature": 0.7,
    "max_output_tokens": 1024
  }'
```

#### Request Body Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `model` | string | Yes | - | Model ID to use (see Available Models) |
| `input` | string or array | Yes | - | The input prompt or array of message objects |
| `temperature` | number | No | 1.0 | Sampling temperature (0.0 to 2.0) |
| `max_output_tokens` | integer | No | 4096 | Maximum tokens to generate |
| `top_p` | number | No | 1.0 | Nucleus sampling parameter |
| `stream` | boolean | No | false | Enable streaming responses |
| `stop` | string or array | No | null | Stop sequences |

#### Response

```json
{
  "id": "resp_abc123",
  "object": "response",
  "created": 1706745600,
  "model": "grok-4",
  "output": [
    {
      "type": "message",
      "role": "assistant",
      "content": [
        {
          "type": "output_text",
          "text": "Quantum computing uses quantum mechanics principles..."
        }
      ]
    }
  ],
  "usage": {
    "input_tokens": 12,
    "output_tokens": 256,
    "total_tokens": 268
  }
}
```

---

### POST /v1/chat/completions (Legacy - Deprecated)

OpenAI-compatible Chat Completions endpoint. Use for backward compatibility only.

#### Request

```bash
curl -X POST "https://xai.alez-848f79.api.corbits.dev/v1/chat/completions" \
  -H "Authorization: Bearer oc_your_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "grok-4",
    "messages": [
      {"role": "user", "content": "What is the meaning of life?"}
    ],
    "temperature": 0.7,
    "max_tokens": 1024
  }'
```

#### Request Body Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `model` | string | Yes | - | Model ID to use |
| `messages` | array | Yes | - | Array of message objects |
| `temperature` | number | No | 1.0 | Sampling temperature (0.0 to 2.0) |
| `max_tokens` | integer | No | 4096 | Maximum tokens to generate |
| `top_p` | number | No | 1.0 | Nucleus sampling parameter |
| `stream` | boolean | No | false | Enable streaming responses |
| `stop` | string or array | No | null | Stop sequences |
| `presence_penalty` | number | No | 0 | Presence penalty (-2.0 to 2.0) |
| `frequency_penalty` | number | No | 0 | Frequency penalty (-2.0 to 2.0) |

#### Message Object Format

```json
{
  "role": "system" | "user" | "assistant",
  "content": "Message text here"
}
```

#### Response

```json
{
  "id": "chatcmpl-abc123",
  "object": "chat.completion",
  "created": 1706745600,
  "model": "grok-4",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "The meaning of life is a profound philosophical question..."
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 14,
    "completion_tokens": 89,
    "total_tokens": 103
  }
}
```

---

## Available Models

| Model ID | Description | Context Window | Best For |
|----------|-------------|----------------|----------|
| `grok-4` | Latest and most capable Grok model | 128K tokens | Complex reasoning, coding, analysis |
| `grok-3` | Previous generation flagship | 128K tokens | General purpose, balanced performance |
| `grok-2` | Efficient mid-tier model | 32K tokens | Faster responses, cost-effective |
| `grok-beta` | Experimental features | Varies | Testing new capabilities |

---

## Streaming

Enable streaming by setting `stream: true`. Responses are sent as Server-Sent Events (SSE).

### Streaming Request

```bash
curl -X POST "https://xai.alez-848f79.api.corbits.dev/v1/chat/completions" \
  -H "Authorization: Bearer oc_your_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "grok-4",
    "messages": [{"role": "user", "content": "Write a haiku about coding"}],
    "stream": true
  }'
```

### Streaming Response Format

```
data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","created":1706745600,"model":"grok-4","choices":[{"index":0,"delta":{"role":"assistant"},"finish_reason":null}]}

data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","created":1706745600,"model":"grok-4","choices":[{"index":0,"delta":{"content":"Silent"},"finish_reason":null}]}

data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","created":1706745600,"model":"grok-4","choices":[{"index":0,"delta":{"content":" keys"},"finish_reason":null}]}

data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","created":1706745600,"model":"grok-4","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}

data: [DONE]
```

---

## Error Responses

### 400 Bad Request

```json
{
  "error": {
    "message": "Invalid request: 'model' is required",
    "type": "invalid_request_error",
    "code": "missing_required_parameter"
  }
}
```

### 401 Unauthorized

```json
{
  "error": {
    "message": "Invalid API key provided",
    "type": "authentication_error",
    "code": "invalid_api_key"
  }
}
```

### 402 Payment Required

```json
{
  "error": {
    "message": "Insufficient credit balance. Current balance: $0.42",
    "type": "billing_error",
    "code": "insufficient_balance"
  }
}
```

### 429 Rate Limited

```json
{
  "error": {
    "message": "Rate limit exceeded. Please retry after 60 seconds",
    "type": "rate_limit_error",
    "code": "rate_limit_exceeded",
    "retry_after": 60
  }
}
```

### 500 Internal Server Error

```json
{
  "error": {
    "message": "An internal error occurred",
    "type": "api_error",
    "code": "internal_error"
  }
}
```

---

## Usage Examples

### Simple Question

```bash
curl -X POST "https://xai.alez-848f79.api.corbits.dev/v1/chat/completions" \
  -H "Authorization: Bearer oc_your_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "grok-4",
    "messages": [
      {"role": "user", "content": "What are the three laws of robotics?"}
    ]
  }'
```

### With System Prompt

```bash
curl -X POST "https://xai.alez-848f79.api.corbits.dev/v1/chat/completions" \
  -H "Authorization: Bearer oc_your_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "grok-4",
    "messages": [
      {"role": "system", "content": "You are a helpful coding assistant. Be concise."},
      {"role": "user", "content": "How do I reverse a string in Python?"}
    ],
    "temperature": 0.3,
    "max_tokens": 500
  }'
```

### Multi-turn Conversation

```bash
curl -X POST "https://xai.alez-848f79.api.corbits.dev/v1/chat/completions" \
  -H "Authorization: Bearer oc_your_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "grok-4",
    "messages": [
      {"role": "user", "content": "What is the capital of France?"},
      {"role": "assistant", "content": "The capital of France is Paris."},
      {"role": "user", "content": "What is its population?"}
    ]
  }'
```

### Low Temperature for Deterministic Output

```bash
curl -X POST "https://xai.alez-848f79.api.corbits.dev/v1/chat/completions" \
  -H "Authorization: Bearer oc_your_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "grok-4",
    "messages": [
      {"role": "user", "content": "Convert this JSON to YAML: {\"name\": \"test\", \"value\": 123}"}
    ],
    "temperature": 0
  }'
```

---

## Best Practices

1. **Use grok-4 for complex tasks** - It provides the best reasoning and accuracy
2. **Use grok-2 for simple queries** - More cost-effective for straightforward questions
3. **Set appropriate max_tokens** - Avoid unnecessary costs by limiting response length
4. **Use low temperature for factual queries** - Temperature 0-0.3 for deterministic outputs
5. **Use system prompts** - Guide model behavior and response format
6. **Prefer /v1/responses** - The new API is more flexible and feature-rich
