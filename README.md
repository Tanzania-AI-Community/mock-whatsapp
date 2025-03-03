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
- **Message status indicators**: "Sending", "Sent", and "Error" states
- **Temporary message handling**: Optimistic updates with server reconciliation
- **Auto-scrolling**: Smart scroll behavior that respects user interactions
- **Database integration**: PostgreSQL backend for message persistence
- **API webhook integration**: Connect to your own chatbot backend services
- **Connection status handling**: Graceful handling of connectivity issues

## 🛠️ Technical Implementation

- **Frontend**: Next.js, React, TypeScript, Tailwind CSS
- **Backend**: Next.js Server Actions, PostgreSQL with Drizzle ORM

## 🏃‍♂️ Getting Started

### Prerequisites

- Node.js 18+ and npm/pnpm
- PostgreSQL database

### Environment Setup

Create a `.env` file in the root directory with:

```
DATABASE_URL="postgresql://username:password@localhost:5432/dbname"
CHATBOT_CALLBACK_URL="http://localhost:3001/api/webhook"
```

### Installation

```bash
# Install dependencies
pnpm install

# Start the development server
pnpm run dev
```

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
