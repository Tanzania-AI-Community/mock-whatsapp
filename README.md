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
- **Twiga pipeline**: Displays actual text, media, read/typing actions, buttons, lists, and settings Flows
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

## 🔁 Twiga WhatsApp integration

Configure Twiga to send its outgoing WhatsApp requests to this app:

```dotenv
ENVIRONMENT=local
MOCK_WHATSAPP=True
MOCK_WHATSAPP_API_URL=http://127.0.0.1:3000/api/whatsapp
MOCK_WHATSAPP_TOKEN=change-me-local-token
```

If Twiga runs in Docker, use `http://host.docker.internal:3000/api/whatsapp` and check that the container can reach the host.

- `POST /api/inbound` forwards concurrent text, attachment, and interactive-reply webhooks to Twiga.
- `POST /api/whatsapp/messages` accepts text, images, PDFs, buttons, lists, Flows, and read/typing requests with the local bearer token.
- `GET /api/events?after=0&recipientId=255712345678` supplies the chat's polling history.
- Split responses and progress notifications are separate bubbles, in the order the mock accepted them.
- Read indicators come from Twiga's receipt action. Typing stops after an accepted outgoing message or 25 seconds.
- Rejected sends appear as errors, never as delivered assistant messages.

### Media and attachments

Twiga uploads files using multipart `POST /api/whatsapp/media`, then sends their
numeric IDs through `/api/whatsapp/messages`. Bearer-protected
`GET /api/whatsapp/{mediaId}` returns metadata and a local download URL;
`DELETE` makes the ID unavailable for future API downloads and sends.
Delivered messages retain a browser copy at `/api/media/{mediaId}`.

Images render in the conversation and open at full size. Each generated page is
a separate message, preserving delivery order. PDF cards open the browser PDF
viewer or download with the filename supplied by Twiga. Both survive refresh
and restart. Media bytes and metadata live under
`MOCK_WHATSAPP_DATA_DIR/media` (default `.mock-whatsapp/media`). Deleted IDs are
tombstoned; retained local files are removed when you reset the data directory.

The composer paperclip opens a file picker. Typed text becomes an image or PDF
caption; audio has no caption. Uploads validate MIME types and file signatures.
Limits are 5 MB for JPEG/PNG, 100 MB for PDF, and 16 MB for AAC, AMR, MP3, MP4,
or OGG audio. Outgoing images also require 8-bit RGB/RGBA and a maximum edge of
4096 pixels. These checks do not replace a complete PDF/image/codec decoder.
Remote media links and arbitrary filesystem paths are rejected.

When the message box is empty, the send button becomes a microphone. It records
a voice note and sends it as `audio/ogg; codecs=opus` with `voice: true`, as
WhatsApp does. Firefox records that format directly; Chrome's WebM recording is
rewrapped in the browser without re-encoding. Browsers that record neither
format show an error instead.

Twiga currently answers incoming attachments with "Sorry, I only understand
textual messages." Its media download code should use
`whatsapp_client.media_url(media_id)`; hard-coded Graph or attachment URLs are
blocked in mock mode.

### Buttons and lists

Click the actual settings buttons to update Profile or open Classes and
Subjects. Lists expand to their supplied rows. Replies carry the original
message context and selected ID/title; unknown IDs, mismatched reply types,
and options from another recipient are rejected. Twiga's optional null list
row descriptions are accepted. The mock does not add a product menu.

### Local WhatsApp Flows

The supported settings Flow uses Twiga's JSON definitions and its real `/flows`
endpoint. Set these in the mock environment before starting it:

```dotenv
MOCK_WHATSAPP_FLOW_DIR=/absolute/path/to/twiga/app/assets/flows
MOCK_WHATSAPP_FLOW_PUBLIC_KEY_FILE=/absolute/path/to/local-flow-public.pem
```

Create a development-only encrypted RSA key pair outside the repositories:

```sh
umask 077
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 \
  -aes-256-cbc -out local-flow-private.pem
openssl pkey -in local-flow-private.pem -pubout -out local-flow-public.pem
```

Configure Twiga's `WHATSAPP_BUSINESS_PRIVATE_KEY` with the encrypted PEM text
(dotenv supports a quoted multiline value),
`WHATSAPP_BUSINESS_PRIVATE_KEY_PASSWORD` with its local passphrase, and
`FLOW_TOKEN_ENCRYPTION_KEY` with a separately generated Fernet key. Generate and
store the latter privately, for example from Twiga's virtual environment:

```sh
uv run python -c 'from cryptography.fernet import Fernet; from pathlib import Path; Path("local-flow-token.key").write_bytes(Fernet.generate_key())'
```

Keep all key files and environment values out of Git. Use a numeric
`SUBJECTS_CLASSES_FLOW_ID` in Twiga, such as the non-production fixture ID
`1000000000000001`. Local mode does not register a Flow with Meta.

Send `settings`, choose Classes and Subjects, select a subject, continue, select
classes, and complete. Screen actions are encrypted with RSA-OAEP/SHA-256 and
AES-128-GCM, as WhatsApp does. When Twiga returns `SUCCESS`, the mock forwards
an `nfm_reply` webhook; Twiga's own handlers save the selection. Subjects and
active classes must already exist in Twiga's database.

The renderer supports the shipped subject and class screens, their bindings,
validation and Back navigation. Other Flow components, including the
onboarding form, are not implemented. Request a new Flow message after
changing keys or the Flow ID.

### Local-only safeguards

Bind services to loopback. Mock routes validate the local host, reject
cross-site requests, and require same-origin browser writes or the local
bearer token for WhatsApp API operations. Callback and Flow requests reject
redirects. Twiga mock requests are restricted to the configured mock origin
and ignore environment proxies; production Meta routing is unchanged.
Observer mode blocks media, interactive, Flow, and fault mutations as well as
text sends. This remains a trusted-local-machine development tool.

In chat mode the conversation comes from the local event log, not the `messages` table. Events are stored in `.mock-whatsapp/events.jsonl`; set `MOCK_WHATSAPP_DATA_DIR` to use another directory. Restarting keeps the history. Clear chat only hides events in the current view. To reset events and media, stop only this mock instance and remove its configured
data directory, then restart it. Check the path first, especially when using
multiple worktrees. This does not reset Twiga's database.

### Simulating Failed Sends

The token-protected `PUT /api/whatsapp/faults` endpoint configures one matching failure. For example, accept the next text request and reject the following one:

```sh
curl -X PUT http://127.0.0.1:3000/api/whatsapp/faults \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer change-me-local-token' \
  -d '{"rule":{"target":"text","skip":1,"status":429}}'
```

Targets are `text`, `action`, `image`, `document`, `interactive`, `upload`,
`delete`, and `download`. Supported statuses are 400, 404, 413, 429, and 500.
An optional `recipientId` limits message/delete rules; upload and download
operations have no recipient, so leave it unset for those targets. Set `delayMs` (up to 30000) to delay a request; Twiga may time out while the mock still accepts it later. Rules are used once, and `{"rule":null}` clears the active rule.
Upload errors are returned to the caller and retained as unassigned events in
`events.jsonl`; they are not shown in every recipient's chat. Recipient-specific
send failures appear in that chat. Fault rules are in memory and reset on restart.

### Verification

```sh
pnpm test
pnpm typecheck
pnpm lint
pnpm format:check
pnpm build
```

For Twiga's transport tests, run a mock with a temporary data directory and
`CHATBOT_CALLBACK_URL=http://127.0.0.1:1/devhooks`, then set
`MOCK_WHATSAPP_TEST_URL` to that mock's origin in Twiga. Mock mode only
redirects WhatsApp traffic; model and embedding requests still go to the
configured providers.

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
