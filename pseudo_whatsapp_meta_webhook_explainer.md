# How Meta (WhatsApp Cloud API) Sends Chat Messages (Including Images) to Your Backend
*Practical notes for building a “pseudo‑WhatsApp” sandbox so you can test your bot without calling Meta.*

---

## 0) The mental model (what happens, end‑to‑end)

Meta’s WhatsApp Business Platform (Cloud API) behaves like this:

1. **You host an HTTPS webhook** endpoint (your server).
2. **Meta sends events to your webhook** when something happens (a user sends a message, delivery status changes, etc.).
3. For **image messages**, Meta sends you **metadata + a `media_id`**, not the image bytes.
4. If you want the bytes, you call Meta’s **media** endpoint to get a **download URL**, then you download the bytes from that URL.

To build a pseudo‑WhatsApp, you basically replicate:
- **Webhook delivery** (Meta → you)
- **Media indirection** (message contains `media_id`, then “download” step)
- **Retry + dedupe** behavior (webhooks are at‑least‑once)

---

## 1) Webhook “setup” and verification handshake

### 1.1 Your webhook URL
You configure a webhook URL in Meta’s developer settings. Conceptually:
- You provide: `https://YOUR_DOMAIN/webhooks/whatsapp`
- Meta will later **POST** events to that URL.

### 1.2 Verification request (GET)
When you set up the webhook, Meta performs a **GET** to confirm you control the endpoint.

**Incoming request (to your backend):**
`GET /webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...`

**Your backend must:**
- Verify `hub.verify_token` matches your expected secret token
- Respond `200 OK` with the **raw** `hub.challenge` as the body

**Pseudo-code:**
- If verify_token matches → return hub.challenge
- Else → return 403

✅ **For your pseudo‑WhatsApp:** implement the same GET handshake so your bot code can be tested with the “real” contract style (challenge echo).

---

## 2) What Meta POSTs to you (inbound webhook events)

### 2.1 Envelope shape (high-level)
Meta wraps events in this general structure:

- `object`: the type of account object (WhatsApp business account)
- `entry[]`: one or more account entries
- `changes[]`: a list of change events
- `value`: the payload that contains `messages`, `statuses`, etc.

### 2.2 Typical inbound message payload (image)
Below is a representative JSON payload **Meta would POST** when a user sends an image.

```json
{
  "object": "whatsapp_business_account",
  "entry": [
    {
      "id": "WABA_ID",
      "changes": [
        {
          "field": "messages",
          "value": {
            "messaging_product": "whatsapp",
            "metadata": {
              "display_phone_number": "15551234567",
              "phone_number_id": "PHONE_NUMBER_ID"
            },
            "contacts": [
              {
                "profile": { "name": "Alice" },
                "wa_id": "46701234567"
              }
            ],
            "messages": [
              {
                "from": "46701234567",
                "id": "wamid.ID",
                "timestamp": "1710000000",
                "type": "image",
                "image": {
                  "id": "MEDIA_ID",
                  "mime_type": "image/jpeg",
                  "sha256": "…",
                  "caption": "hello",
                  "filename": "photo.jpg"
                }
              }
            ]
          }
        }
      ]
    }
  ]
}
```

### 2.3 What matters for your chatbot
When your backend receives this POST, you usually extract:

- Sender: `messages[0].from`
- Message id: `messages[0].id` (for dedupe!)
- Message type: `messages[0].type`
- For images:
  - `messages[0].image.id` = **MEDIA_ID**
  - optional `caption`, `mime_type`, etc.

### 2.4 At-least-once delivery (retries happen)
Meta’s webhooks are generally **at‑least‑once**:
- If your server times out or returns non‑2xx, Meta may retry.
- Network errors can also cause duplicates.

✅ **Therefore your backend should dedupe using `messages[].id`.**

✅ **For your pseudo‑WhatsApp:** implement retries (or simulate them) and make sure your bot code dedupes.

---

## 3) Images: why you don’t get the bytes in the webhook

Meta sends only metadata + `media_id` in the webhook because:
- Webhooks need to be fast and lightweight
- Media download can be controlled/secured separately
- Media may be large

So the workflow is:

### Step A — Receive webhook with `MEDIA_ID`
Your webhook handler sees:
- `type: "image"`
- `image.id: "MEDIA_ID"`

### Step B — Get media metadata (including a download URL)
Your app calls Meta’s Graph endpoint (conceptually):
- `GET /{MEDIA_ID}`

Response includes:
- `url` (download URL)
- `mime_type`, `file_size`, etc.

### Step C — Download the bytes from the provided `url`
- `GET {url}` → returns binary bytes (image)

✅ **For your pseudo‑WhatsApp:** replicate this indirection:
- Webhook includes `media_id`
- Bot calls `/media/{media_id}` to get a `url`
- Bot downloads bytes from that `url` (or from `/media/download/{media_id}`)

---

## 4) Status events (optional but common)

Meta can also POST status updates (delivered/read/failed). Example skeleton:

```json
{
  "object": "whatsapp_business_account",
  "entry": [
    {
      "changes": [
        {
          "field": "messages",
          "value": {
            "statuses": [
              {
                "id": "wamid.ID",
                "status": "delivered",
                "timestamp": "1710000005",
                "recipient_id": "46701234567"
              }
            ]
          }
        }
      ]
    }
  ]
}
```

✅ For testing, you can generate these from your pseudo‑WhatsApp after your bot “sends” messages.

---

## 5) Practical requirements for your backend webhook

### 5.1 Respond fast
- Return **2xx quickly** (often within a few seconds).
- Do heavy processing async (queue/job), if possible.

### 5.2 Verify requests (signature)
In production, you should validate the request signature so random people can’t spam your webhook.

✅ For a local sandbox, you can skip signature verification, but keep the hook in your code so you can turn it on later.

### 5.3 Idempotency / dedupe
- Store message IDs you’ve processed (with TTL).
- If a duplicate arrives, ignore it.

---

## 6) “Pseudo‑WhatsApp” contract you can implement (recommended)

You want something that behaves like Meta, but is easy to run locally.

### 6.1 Webhook event POST (PseudoMeta → Your bot)
`POST /bot/webhook`

```json
{
  "object": "whatsapp_business_account",
  "entry": [
    {
      "id": "WABA_SANDBOX",
      "changes": [
        {
          "field": "messages",
          "value": {
            "messaging_product": "whatsapp",
            "metadata": {
              "display_phone_number": "sandbox",
              "phone_number_id": "sandbox_phone_number_id"
            },
            "contacts": [
              { "profile": { "name": "Test User" }, "wa_id": "user_abc" }
            ],
            "messages": [
              {
                "from": "user_abc",
                "id": "wamid.sandbox_001",
                "timestamp": "1710000000",
                "type": "image",
                "image": {
                  "id": "media_001",
                  "mime_type": "image/jpeg",
                  "caption": "test caption"
                }
              }
            ]
          }
        }
      ]
    }
  ]
}
```

### 6.2 Media metadata (Bot → PseudoMeta)
`GET /media/media_001`

```json
{
  "id": "media_001",
  "url": "http://localhost:8080/media/download/media_001",
  "mime_type": "image/jpeg",
  "file_size": 123456,
  "sha256": "optional"
}
```

### 6.3 Media download (Bot → PseudoMeta)
`GET /media/download/media_001` → returns raw bytes

### 6.4 Send message (Bot → PseudoMeta)
`POST /messages`

```json
{
  "messaging_product": "whatsapp",
  "to": "user_abc",
  "type": "text",
  "text": { "body": "Got it." }
}
```

Your pseudo‑WhatsApp can then:
- Log the outgoing message
- Forward it to a UI
- Optionally generate a `statuses` webhook to the bot

---

## 7) Implementation checklist (so it feels like the real thing)

- [ ] `GET /webhooks/whatsapp` verification: echo challenge
- [ ] `POST /webhooks/whatsapp` events: messages + statuses
- [ ] For images, webhook includes only `media_id`
- [ ] Media API: metadata endpoint returns download URL
- [ ] Download endpoint serves raw bytes
- [ ] Retry simulation (duplicates) + bot-side dedupe
- [ ] Timestamp fields as strings (to match common payloads)
- [ ] Support multiple messages per webhook POST (array)

---

## 8) Quick tips for testing image flows

When you test images, validate your bot does:

1. Parse webhook payload
2. Detect `type === "image"`
3. Extract `image.id` (media id)
4. Call media metadata endpoint
5. Download bytes from the returned URL
6. Process/store the image
7. Reply via send endpoint

If you want parity with Meta behavior:
- Make the download URL short-lived (signed + expires)
- Occasionally return transient errors to test retries

---

### If you want, I can also generate:
- A runnable **Node/Express** pseudo‑WhatsApp server (webhook emitter + media store)
- A **FastAPI** version
- A tiny web UI to simulate a chat sending images into the webhook
