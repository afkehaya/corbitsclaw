# OpenAI Chat Completions API Documentation

## Overview

Access OpenAI's GPT and O1 models through the Corbits-hosted proxy. Fully compatible with the official OpenAI API specification.

## Base URL

```
https://open-ai.alez-848f79.api.corbits.dev
```

## Authentication

All requests require an `Authorization` header with your OpenClawd API key:

```
Authorization: Bearer oc_your_api_key_here
```

---

## Endpoints

### POST /v1/chat/completions

Create a chat completion with the specified model.

#### Request

```bash
curl -X POST "https://open-ai.alez-848f79.api.corbits.dev/v1/chat/completions" \
  -H "Authorization: Bearer oc_your_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o",
    "messages": [
      {"role": "system", "content": "You are a helpful assistant."},
      {"role": "user", "content": "Hello!"}
    ],
    "temperature": 0.7,
    "max_tokens": 4096
  }'
```

#### Request Body Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `model` | string | Yes | - | Model ID to use (see Available Models) |
| `messages` | array | Yes | - | Array of message objects |
| `temperature` | number | No | 1.0 | Sampling temperature (0.0 to 2.0) |
| `max_tokens` | integer | No | 4096 | Maximum tokens to generate |
| `top_p` | number | No | 1.0 | Nucleus sampling parameter |
| `stream` | boolean | No | false | Enable streaming responses |
| `stop` | string or array | No | null | Up to 4 stop sequences |
| `presence_penalty` | number | No | 0 | Presence penalty (-2.0 to 2.0) |
| `frequency_penalty` | number | No | 0 | Frequency penalty (-2.0 to 2.0) |
| `response_format` | object | No | null | Output format specification |
| `tools` | array | No | null | List of tools/functions available |
| `tool_choice` | string or object | No | "auto" | Control tool usage |
| `seed` | integer | No | null | For deterministic sampling |
| `logprobs` | boolean | No | false | Return log probabilities |
| `top_logprobs` | integer | No | null | Number of top logprobs (0-20) |
| `n` | integer | No | 1 | Number of completions to generate |

#### Message Object Format

```json
{
  "role": "system" | "user" | "assistant" | "tool",
  "content": "Message text here",
  "name": "optional_name",
  "tool_calls": [],  // For assistant messages with tool calls
  "tool_call_id": "" // For tool response messages
}
```

#### Response

```json
{
  "id": "chatcmpl-abc123xyz",
  "object": "chat.completion",
  "created": 1706745600,
  "model": "gpt-4o-2024-08-06",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Hello! How can I help you today?"
      },
      "logprobs": null,
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 25,
    "completion_tokens": 9,
    "total_tokens": 34
  },
  "system_fingerprint": "fp_abc123"
}
```

---

## Available Models

| Model ID | Description | Context Window | Best For |
|----------|-------------|----------------|----------|
| `gpt-4o` | Latest GPT-4 Omni model | 128K tokens | Multimodal, complex reasoning |
| `gpt-4o-mini` | Smaller, faster GPT-4o | 128K tokens | Cost-effective, faster responses |
| `gpt-4-turbo` | GPT-4 Turbo with vision | 128K tokens | Long context, vision tasks |
| `gpt-3.5-turbo` | Fast and affordable | 16K tokens | Simple tasks, high volume |
| `o1-preview` | Reasoning model (preview) | 128K tokens | Complex reasoning, math, code |
| `o1-mini` | Smaller reasoning model | 128K tokens | Efficient reasoning tasks |

**Note:** O1 models do not support `temperature`, `top_p`, or system messages. They use internal chain-of-thought reasoning.

---

## JSON Mode

Force the model to output valid JSON by using `response_format`.

### Request

```bash
curl -X POST "https://open-ai.alez-848f79.api.corbits.dev/v1/chat/completions" \
  -H "Authorization: Bearer oc_your_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o",
    "messages": [
      {"role": "system", "content": "You are a helpful assistant that outputs JSON."},
      {"role": "user", "content": "List 3 programming languages with their year of creation"}
    ],
    "response_format": {"type": "json_object"}
  }'
```

### Response

```json
{
  "id": "chatcmpl-abc123",
  "object": "chat.completion",
  "created": 1706745600,
  "model": "gpt-4o",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "{\"languages\": [{\"name\": \"Python\", \"year\": 1991}, {\"name\": \"JavaScript\", \"year\": 1995}, {\"name\": \"Go\", \"year\": 2009}]}"
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 32,
    "completion_tokens": 45,
    "total_tokens": 77
  }
}
```

**Important:** When using JSON mode, you MUST include the word "JSON" in your system or user message.

---

## Function Calling / Tools

Enable the model to call external functions by defining tools.

### Request with Tools

```bash
curl -X POST "https://open-ai.alez-848f79.api.corbits.dev/v1/chat/completions" \
  -H "Authorization: Bearer oc_your_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o",
    "messages": [
      {"role": "user", "content": "What is the weather like in Boston?"}
    ],
    "tools": [
      {
        "type": "function",
        "function": {
          "name": "get_weather",
          "description": "Get the current weather in a location",
          "parameters": {
            "type": "object",
            "properties": {
              "location": {
                "type": "string",
                "description": "The city and state, e.g. San Francisco, CA"
              },
              "unit": {
                "type": "string",
                "enum": ["celsius", "fahrenheit"]
              }
            },
            "required": ["location"]
          }
        }
      }
    ],
    "tool_choice": "auto"
  }'
```

### Response with Tool Call

```json
{
  "id": "chatcmpl-abc123",
  "object": "chat.completion",
  "created": 1706745600,
  "model": "gpt-4o",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": null,
        "tool_calls": [
          {
            "id": "call_abc123",
            "type": "function",
            "function": {
              "name": "get_weather",
              "arguments": "{\"location\": \"Boston, MA\", \"unit\": \"fahrenheit\"}"
            }
          }
        ]
      },
      "finish_reason": "tool_calls"
    }
  ],
  "usage": {
    "prompt_tokens": 82,
    "completion_tokens": 25,
    "total_tokens": 107
  }
}
```

### Providing Tool Results

```bash
curl -X POST "https://open-ai.alez-848f79.api.corbits.dev/v1/chat/completions" \
  -H "Authorization: Bearer oc_your_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o",
    "messages": [
      {"role": "user", "content": "What is the weather like in Boston?"},
      {
        "role": "assistant",
        "content": null,
        "tool_calls": [
          {
            "id": "call_abc123",
            "type": "function",
            "function": {
              "name": "get_weather",
              "arguments": "{\"location\": \"Boston, MA\", \"unit\": \"fahrenheit\"}"
            }
          }
        ]
      },
      {
        "role": "tool",
        "tool_call_id": "call_abc123",
        "content": "{\"temperature\": 72, \"condition\": \"sunny\", \"humidity\": 45}"
      }
    ]
  }'
```

### Tool Choice Options

| Value | Behavior |
|-------|----------|
| `"auto"` | Model decides whether to call tools |
| `"none"` | Model will not call any tools |
| `"required"` | Model must call at least one tool |
| `{"type": "function", "function": {"name": "..."}}` | Force specific function |

---

## Streaming

Enable streaming by setting `stream: true`. Responses are sent as Server-Sent Events (SSE).

### Streaming Request

```bash
curl -X POST "https://open-ai.alez-848f79.api.corbits.dev/v1/chat/completions" \
  -H "Authorization: Bearer oc_your_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o",
    "messages": [{"role": "user", "content": "Tell me a short story"}],
    "stream": true
  }'
```

### Streaming Response Format

```
data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","created":1706745600,"model":"gpt-4o","choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}]}

data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","created":1706745600,"model":"gpt-4o","choices":[{"index":0,"delta":{"content":"Once"},"finish_reason":null}]}

data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","created":1706745600,"model":"gpt-4o","choices":[{"index":0,"delta":{"content":" upon"},"finish_reason":null}]}

data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","created":1706745600,"model":"gpt-4o","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}

data: [DONE]
```

---

## Error Responses

### 400 Bad Request

```json
{
  "error": {
    "message": "Invalid value for 'temperature': expected a number between 0 and 2",
    "type": "invalid_request_error",
    "param": "temperature",
    "code": "invalid_parameter_value"
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

### 404 Model Not Found

```json
{
  "error": {
    "message": "The model 'gpt-5' does not exist",
    "type": "invalid_request_error",
    "param": "model",
    "code": "model_not_found"
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

### 503 Model Overloaded

```json
{
  "error": {
    "message": "The model is currently overloaded. Please retry later.",
    "type": "server_error",
    "code": "model_overloaded"
  }
}
```

---

## Usage Examples

### Simple Chat

```bash
curl -X POST "https://open-ai.alez-848f79.api.corbits.dev/v1/chat/completions" \
  -H "Authorization: Bearer oc_your_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o",
    "messages": [
      {"role": "user", "content": "Explain photosynthesis in one sentence."}
    ]
  }'
```

### Code Generation

```bash
curl -X POST "https://open-ai.alez-848f79.api.corbits.dev/v1/chat/completions" \
  -H "Authorization: Bearer oc_your_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o",
    "messages": [
      {"role": "system", "content": "You are an expert Python programmer. Write clean, well-documented code."},
      {"role": "user", "content": "Write a function to find the nth Fibonacci number using memoization."}
    ],
    "temperature": 0.2
  }'
```

### Using O1 for Complex Reasoning

```bash
curl -X POST "https://open-ai.alez-848f79.api.corbits.dev/v1/chat/completions" \
  -H "Authorization: Bearer oc_your_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "o1-preview",
    "messages": [
      {"role": "user", "content": "Prove that there are infinitely many prime numbers."}
    ]
  }'
```

**Note:** O1 models do not support temperature, top_p, or system messages.

### Structured Output with JSON Mode

```bash
curl -X POST "https://open-ai.alez-848f79.api.corbits.dev/v1/chat/completions" \
  -H "Authorization: Bearer oc_your_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o",
    "messages": [
      {"role": "system", "content": "Extract information and return as JSON."},
      {"role": "user", "content": "John Smith is 32 years old and works as a software engineer at Google in Mountain View."}
    ],
    "response_format": {"type": "json_object"}
  }'
```

### Multi-turn Conversation

```bash
curl -X POST "https://open-ai.alez-848f79.api.corbits.dev/v1/chat/completions" \
  -H "Authorization: Bearer oc_your_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o",
    "messages": [
      {"role": "system", "content": "You are a helpful math tutor."},
      {"role": "user", "content": "What is calculus?"},
      {"role": "assistant", "content": "Calculus is a branch of mathematics focused on rates of change (differential calculus) and accumulation of quantities (integral calculus)."},
      {"role": "user", "content": "Give me a simple example of a derivative."}
    ]
  }'
```

---

## Best Practices

1. **Choose the right model:**
   - `gpt-4o` for complex tasks requiring reasoning
   - `gpt-4o-mini` for cost-effective everyday tasks
   - `gpt-3.5-turbo` for simple, high-volume requests
   - `o1-preview` / `o1-mini` for complex reasoning and math

2. **Use system prompts effectively:**
   - Set behavior, tone, and format expectations
   - Keep system prompts concise but specific

3. **Optimize token usage:**
   - Set appropriate `max_tokens` limits
   - Use concise prompts without unnecessary context

4. **Temperature guidelines:**
   - 0.0-0.3: Factual, deterministic outputs
   - 0.5-0.7: Balanced creativity and accuracy
   - 0.8-1.2: More creative, varied outputs

5. **Error handling:**
   - Implement exponential backoff for rate limits
   - Check balance before large batch operations
   - Validate JSON mode output before parsing
