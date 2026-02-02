# Crossmint Headless Checkout API Documentation

## Overview

Purchase Amazon products programmatically using Crossmint's Headless Checkout API through the Corbits-hosted proxy. This enables automated Amazon purchases with a simple three-step flow: create order, check status, confirm payment.

## Base URL

```
https://amazon.alez-848f79.api.corbits.dev
```

## Authentication

All requests require an `Authorization` header with your OpenClawd API key:

```
Authorization: Bearer oc_your_api_key_here
```

---

## Purchase Flow

The complete purchase flow consists of three steps:

```
1. Create Order (POST /api/v1/orders)
       |
       v
2. Check Status (GET /api/v1/orders/{orderId})
       |
       v
3. Confirm Purchase (POST /api/v1/orders/{orderId}/pay)
```

---

## Endpoints

### POST /api/v1/orders

Create a new order for an Amazon product.

#### Request

```bash
curl -X POST "https://amazon.alez-848f79.api.corbits.dev/api/v1/orders" \
  -H "Authorization: Bearer oc_your_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "productLocator": "amazon:B01DFKC2SO",
    "quantity": 1,
    "shippingAddress": {
      "firstName": "John",
      "lastName": "Doe",
      "address1": "123 Main St",
      "address2": "Apt 4B",
      "city": "New York",
      "state": "NY",
      "postalCode": "10001",
      "country": "US",
      "phoneNumber": "+12125551234"
    }
  }'
```

#### Request Body Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `productLocator` | string | Yes | Amazon product identifier (see format below) |
| `quantity` | integer | No | Number of items (default: 1) |
| `shippingAddress` | object | Yes | Delivery address details |

#### Product Locator Formats

The `productLocator` field accepts two formats:

1. **ASIN format** (recommended):
   ```
   amazon:B01DFKC2SO
   ```

2. **Full Amazon URL**:
   ```
   https://www.amazon.com/dp/B01DFKC2SO
   ```
   or
   ```
   https://www.amazon.com/Some-Product-Name/dp/B01DFKC2SO/ref=sr_1_1
   ```

The ASIN (Amazon Standard Identification Number) is a 10-character alphanumeric identifier found in the product URL after `/dp/`.

#### Shipping Address Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `firstName` | string | Yes | Recipient's first name |
| `lastName` | string | Yes | Recipient's last name |
| `address1` | string | Yes | Primary street address |
| `address2` | string | No | Apartment, suite, unit, etc. |
| `city` | string | Yes | City name |
| `state` | string | Yes | State/province code (e.g., "NY", "CA") |
| `postalCode` | string | Yes | ZIP or postal code |
| `country` | string | Yes | Country code (e.g., "US", "CA", "GB") |
| `phoneNumber` | string | Yes | Phone number with country code |

#### Response

```json
{
  "orderId": "ord_abc123xyz789",
  "status": "pending",
  "product": {
    "asin": "B01DFKC2SO",
    "title": "Echo Dot (3rd Gen) - Smart speaker with Alexa",
    "price": 49.99,
    "currency": "USD",
    "imageUrl": "https://images-na.ssl-images-amazon.com/images/I/..."
  },
  "quantity": 1,
  "subtotal": 49.99,
  "shipping": 0.00,
  "tax": 4.44,
  "total": 54.43,
  "shippingAddress": {
    "firstName": "John",
    "lastName": "Doe",
    "address1": "123 Main St",
    "address2": "Apt 4B",
    "city": "New York",
    "state": "NY",
    "postalCode": "10001",
    "country": "US",
    "phoneNumber": "+12125551234"
  },
  "estimatedDelivery": "2026-02-05",
  "createdAt": "2026-02-01T15:30:00Z",
  "expiresAt": "2026-02-01T16:00:00Z"
}
```

**Note:** Orders expire after 30 minutes if not confirmed. The `expiresAt` field indicates the deadline.

---

### GET /api/v1/orders/{orderId}

Check the status of an existing order.

#### Request

```bash
curl -X GET "https://amazon.alez-848f79.api.corbits.dev/api/v1/orders/ord_abc123xyz789" \
  -H "Authorization: Bearer oc_your_api_key"
```

#### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `orderId` | string | Yes | The order ID returned from create order |

#### Response

```json
{
  "orderId": "ord_abc123xyz789",
  "status": "pending",
  "product": {
    "asin": "B01DFKC2SO",
    "title": "Echo Dot (3rd Gen) - Smart speaker with Alexa",
    "price": 49.99,
    "currency": "USD",
    "imageUrl": "https://images-na.ssl-images-amazon.com/images/I/..."
  },
  "quantity": 1,
  "subtotal": 49.99,
  "shipping": 0.00,
  "tax": 4.44,
  "total": 54.43,
  "shippingAddress": {
    "firstName": "John",
    "lastName": "Doe",
    "address1": "123 Main St",
    "address2": "Apt 4B",
    "city": "New York",
    "state": "NY",
    "postalCode": "10001",
    "country": "US",
    "phoneNumber": "+12125551234"
  },
  "estimatedDelivery": "2026-02-05",
  "createdAt": "2026-02-01T15:30:00Z",
  "expiresAt": "2026-02-01T16:00:00Z"
}
```

---

### POST /api/v1/orders/{orderId}/pay

Confirm and pay for an order. This charges your OpenClawd balance.

#### Request

```bash
curl -X POST "https://amazon.alez-848f79.api.corbits.dev/api/v1/orders/ord_abc123xyz789/pay" \
  -H "Authorization: Bearer oc_your_api_key" \
  -H "Content-Type: application/json"
```

#### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `orderId` | string | Yes | The order ID to confirm |

#### Response (Success)

```json
{
  "orderId": "ord_abc123xyz789",
  "status": "processing",
  "product": {
    "asin": "B01DFKC2SO",
    "title": "Echo Dot (3rd Gen) - Smart speaker with Alexa",
    "price": 49.99,
    "currency": "USD"
  },
  "quantity": 1,
  "total": 54.43,
  "chargedAmount": 54.43,
  "shippingAddress": {
    "firstName": "John",
    "lastName": "Doe",
    "address1": "123 Main St",
    "address2": "Apt 4B",
    "city": "New York",
    "state": "NY",
    "postalCode": "10001",
    "country": "US"
  },
  "amazonOrderId": "113-1234567-8901234",
  "trackingNumber": null,
  "estimatedDelivery": "2026-02-05",
  "confirmedAt": "2026-02-01T15:35:00Z"
}
```

---

## Order Status Lifecycle

Orders progress through the following states:

| Status | Description |
|--------|-------------|
| `pending` | Order created, awaiting payment confirmation |
| `processing` | Payment confirmed, order submitted to Amazon |
| `shipped` | Order shipped, tracking number available |
| `completed` | Order delivered successfully |
| `failed` | Order failed (payment issue, out of stock, etc.) |
| `cancelled` | Order cancelled before shipping |
| `expired` | Order expired (not confirmed within 30 minutes) |

### Status Flow

```
pending ─────┬─────> processing ────> shipped ────> completed
             │              │
             │              └────────> failed
             │
             ├─────> expired (30 min timeout)
             │
             └─────> cancelled
```

---

## Error Responses

### 400 Bad Request - Invalid Product Locator

```json
{
  "error": {
    "message": "Invalid product locator format. Use 'amazon:ASIN' or a valid Amazon URL",
    "type": "invalid_request_error",
    "code": "invalid_product_locator"
  }
}
```

### 400 Bad Request - Invalid Address

```json
{
  "error": {
    "message": "Invalid shipping address: 'postalCode' is required",
    "type": "invalid_request_error",
    "code": "invalid_address",
    "param": "shippingAddress.postalCode"
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
    "message": "Insufficient credit balance. Current balance: $12.50. Order total: $54.43",
    "type": "billing_error",
    "code": "insufficient_balance",
    "requiredAmount": 54.43,
    "currentBalance": 12.50
  }
}
```

### 404 Order Not Found

```json
{
  "error": {
    "message": "Order 'ord_abc123xyz789' not found",
    "type": "not_found_error",
    "code": "order_not_found"
  }
}
```

### 404 Product Not Found

```json
{
  "error": {
    "message": "Product 'B01DFKC2SO' not found or unavailable",
    "type": "not_found_error",
    "code": "product_not_found"
  }
}
```

### 409 Order Already Confirmed

```json
{
  "error": {
    "message": "Order has already been confirmed and cannot be modified",
    "type": "conflict_error",
    "code": "order_already_confirmed"
  }
}
```

### 410 Order Expired

```json
{
  "error": {
    "message": "Order has expired. Please create a new order.",
    "type": "gone_error",
    "code": "order_expired",
    "expiredAt": "2026-02-01T16:00:00Z"
  }
}
```

### 422 Product Unavailable

```json
{
  "error": {
    "message": "Product is currently out of stock or unavailable for shipping to this address",
    "type": "unprocessable_entity_error",
    "code": "product_unavailable"
  }
}
```

### 500 Internal Server Error

```json
{
  "error": {
    "message": "An internal error occurred while processing your order",
    "type": "api_error",
    "code": "internal_error"
  }
}
```

---

## Complete Purchase Flow Example

### Step 1: Create Order

```bash
curl -X POST "https://amazon.alez-848f79.api.corbits.dev/api/v1/orders" \
  -H "Authorization: Bearer oc_your_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "productLocator": "amazon:B09B8V1LZ3",
    "quantity": 1,
    "shippingAddress": {
      "firstName": "Jane",
      "lastName": "Smith",
      "address1": "456 Oak Avenue",
      "city": "San Francisco",
      "state": "CA",
      "postalCode": "94102",
      "country": "US",
      "phoneNumber": "+14155551234"
    }
  }'
```

Response:
```json
{
  "orderId": "ord_def456uvw012",
  "status": "pending",
  "product": {
    "asin": "B09B8V1LZ3",
    "title": "Fire TV Stick 4K Max",
    "price": 54.99,
    "currency": "USD"
  },
  "total": 60.36,
  "expiresAt": "2026-02-01T16:00:00Z"
}
```

### Step 2: Verify Order Details

```bash
curl -X GET "https://amazon.alez-848f79.api.corbits.dev/api/v1/orders/ord_def456uvw012" \
  -H "Authorization: Bearer oc_your_api_key"
```

### Step 3: Confirm and Pay

```bash
curl -X POST "https://amazon.alez-848f79.api.corbits.dev/api/v1/orders/ord_def456uvw012/pay" \
  -H "Authorization: Bearer oc_your_api_key"
```

Response:
```json
{
  "orderId": "ord_def456uvw012",
  "status": "processing",
  "amazonOrderId": "114-9876543-2109876",
  "chargedAmount": 60.36,
  "estimatedDelivery": "2026-02-04"
}
```

### Step 4: Track Order Status (Optional)

Poll the order status to track delivery:

```bash
curl -X GET "https://amazon.alez-848f79.api.corbits.dev/api/v1/orders/ord_def456uvw012" \
  -H "Authorization: Bearer oc_your_api_key"
```

Once shipped:
```json
{
  "orderId": "ord_def456uvw012",
  "status": "shipped",
  "amazonOrderId": "114-9876543-2109876",
  "trackingNumber": "1Z999AA10123456784",
  "carrier": "UPS",
  "estimatedDelivery": "2026-02-04"
}
```

---

## Best Practices

1. **Verify product availability first:**
   - Create order to see current pricing and availability
   - Check for out-of-stock errors before confirming

2. **Handle order expiration:**
   - Orders expire after 30 minutes
   - Always confirm orders promptly or create new ones

3. **Validate addresses:**
   - Use valid state/province codes
   - Include country codes for phone numbers
   - Verify postal codes match city/state

4. **Check balance before ordering:**
   - Use the OpenClawd balance API to verify sufficient funds
   - Order total includes tax and shipping

5. **Implement proper error handling:**
   - Handle insufficient balance errors gracefully
   - Retry on temporary failures (5xx errors)
   - Create new orders if existing ones expire

6. **Store order IDs:**
   - Save order IDs for tracking and support
   - Amazon order IDs are provided after confirmation

---

## Supported Countries

Currently supported shipping destinations:

| Country | Code | Notes |
|---------|------|-------|
| United States | US | Full support, all states |
| Canada | CA | Most provinces |
| United Kingdom | GB | Mainland UK |
| Germany | DE | Full support |
| France | FR | Full support |
| Italy | IT | Full support |
| Spain | ES | Full support |
| Japan | JP | Full support |
| Australia | AU | Full support |

**Note:** Some products may have shipping restrictions to certain countries. Check product availability during order creation.
