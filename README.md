# Mock WhatsApp Interface

A minimalist WhatsApp clone built with Next.js for developing and testing WhatsApp chatbots in a controlled environment.

## ⚠️ Development Purposes Only

This application is designed exclusively for development and testing purposes. It is NOT intended for production use or as a replacement for the official WhatsApp application.

## 🚀 Purpose

This project provides a sandbox environment that allows developers to:

- Test WhatsApp chatbot responses without using actual WhatsApp infrastructure
- Simulate conversations between users and bots
- Develop and debug webhooks and API integrations
- Test the UI/UX of chatbot interactions in a WhatsApp-like interface

## ✨ Features

- **Real-time messaging**: Send and receive messages with persistent storage
- **WhatsApp-like UI**: Familiar interface mimicking WhatsApp Web
- **Message status indicators**: "Sending", "Sent", "Read", and "Error" states
- **Temporary message handling**: Optimistic updates with server reconciliation
- **Auto-scrolling**: Smart scroll behavior that respects user interactions
- **Twiga text pipeline**: Shows the text and read/typing actions Twiga actually sends
- **Database integration**: PostgreSQL conversation history for observe mode
- **API webhook integration**: Connect to your own chatbot backend services
- **Connection status handling**: Graceful handling of connectivity issues

## 🛠️ Technical Implementation

- **Frontend**: Next.js, React, TypeScript, Tailwind CSS
- **Backend**: Next.js Server Actions, PostgreSQL with Drizzle ORM

## 🏃‍♂️ Getting Started

### Prerequisites

- Node.js 22.13+ and pnpm 10.15.0 (the pinned package manager)
- PostgreSQL database

Tailwind CSS 4 requires Safari 16.4+, Chrome 111+, or Firefox 128+.

### Environment Setup

Create a `.env` file in the root directory with:

```
DATABASE_URL="postgresql://username:password@localhost:5432/dbname"
CHATBOT_CALLBACK_URL="http://127.0.0.1:8000/devhooks"
MOCK_WHATSAPP_TOKEN="change-me-local-token"
```

`CHATBOT_CALLBACK_URL` must be a local HTTP URL. Use the same `MOCK_WHATSAPP_TOKEN` in Twiga.

### Installation

```bash
# Install dependencies
pnpm install

# Start the development server
pnpm run dev

# Start the read-only observer mode
pnpm run observe
```

When running `pnpm run observe`, the app prompts for a numeric `userId` and
only loads messages from the `messages` table that:

- belong to that `user_id`
- have `is_present_in_conversation = true`
- have a `user` or `assistant` role

The observer polls the same selected user every two seconds. Use **Change observed
user** to return to the lookup form. The server rejects missing or invalid user
IDs in observe-mode message requests and blocks inbound sends with HTTP 403.

Both development commands bind to `127.0.0.1`. Observe mode is an internal
development tool without authentication; keep it on a trusted local machine.
The connected database must already contain the `messages.user_id` column.

## 🔁 Twiga Text Pipeline

Configure Twiga to send its outgoing WhatsApp requests to this app:

```dotenv
ENVIRONMENT=local
MOCK_WHATSAPP=True
MOCK_WHATSAPP_API_URL=http://127.0.0.1:3000/api/whatsapp
MOCK_WHATSAPP_TOKEN=change-me-local-token
```

If Twiga runs in Docker, use `http://host.docker.internal:3000/api/whatsapp` and check that the container can reach the host.

- `POST /api/inbound` forwards concurrent text webhooks to Twiga.
- `POST /api/whatsapp/messages` accepts Twiga's text and read/typing requests with the local bearer token.
- `GET /api/events?after=0&recipientId=255712345678` supplies the chat's polling history.
- Split responses and progress notifications are separate bubbles, in the order the mock accepted them.
- Read indicators come from Twiga's receipt action. Typing stops after an accepted text message or 25 seconds.
- Rejected sends appear as errors, never as delivered assistant messages.

Only text and read/typing actions are supported. The receiver rejects media, templates, buttons, lists, and Flows instead of flattening them to text.

In chat mode the conversation comes from the local event log, not the `messages` table. Events are stored in `.mock-whatsapp/events.jsonl`; set `MOCK_WHATSAPP_DATA_DIR` to use another directory. Restarting keeps the history. Clear chat only hides events in the current view. To reset it, stop the app and remove the data directory.

### Simulating Failed Sends

The token-protected `PUT /api/whatsapp/faults` endpoint configures one matching failure. For example, accept the next text request and reject the following one:

```sh
curl -X PUT http://127.0.0.1:3000/api/whatsapp/faults \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer change-me-local-token' \
  -d '{"rule":{"target":"text","skip":1,"status":429}}'
```

Targets are `text` and `action`; an optional `recipientId` limits the rule. Supported statuses are 429 and 500. Set `delayMs` (up to 30000) to delay a request; Twiga may time out while the mock still accepts it later. Rules are used once, and `{"rule":null}` clears the active rule.

## 📝 Configuration

### Chatbot Integration

To connect your chatbot:

1. Set `CHATBOT_CALLBACK_URL` in your `.env` to point to your chatbot's webhook endpoint
2. Ensure your chatbot responds with the expected format (see API documentation)
3. Use the interface to send messages and receive responses

## ⚖️ Disclaimer

This project is not affiliated with Meta, WhatsApp Inc., or any related entities. WhatsApp name and branding are properties of their respective owners. This clone is strictly for development and educational purposes.

## 📄 License

[MIT](LICENSE) - Feel free to use and modify for your development needs.
