# Bill-Scan-Bot

A Node.js/TypeScript backend for the UniBon receipt management application. Provides a REST API and a **Telegram Bot** as the primary user interface. Uses Google Gemini 2.5 Flash Lite for AI-powered receipt analysis and SQLite for data persistence.

## 🚀 Features

*   **Telegram Bot Frontend**: Users interact entirely through Telegram — send photos or text to analyze receipts, query history and stats via bot commands.
*   **AI-Powered Receipt Analysis**: Google **Gemini 2.5 Flash Lite** extracts structured data (merchant, date, items, totals, etc.) from receipt images and text descriptions.
*   **User Authentication**: JWT-based auth for the REST API; Telegram users are automatically registered via their `chat_id`.
*   **Data Persistence**: SQLite database (`unibon.db`) for users, receipts, items, and Telegram user settings.
*   **Per-User API Keys**: Each Telegram user provides their own Google API Key via `/setkey`.
*   **Docker Deployment**: Single-container deployment with `docker compose`.

## 🤖 Telegram Bot Commands

| Command | Description |
|---------|-------------|
| `/start` | Register and view usage instructions |
| `/setkey KEY` | Set or update your Google API Key |
| `/stats` | View spending statistics |
| `/history` | View the 10 most recent receipts |
| `/receipt_ID` | View receipt details (first 8 chars of ID) |
| `/delete ID` | Delete a receipt |
| `/help` | Show help message |
| *Send a photo* | Automatically analyze and save the receipt |
| *Send text* | Analyze text as an expense description |

## 🛠️ Tech Stack

*   **Runtime**: Node.js 22
*   **Language**: TypeScript
*   **AI SDK**: `@google/generative-ai` (Gemini)
*   **Database**: `better-sqlite3` (SQLite)
*   **Telegram**: Native `https` module (no bot framework dependency)
*   **Testing**: Jest + Supertest
*   **Deployment**: Docker

## 📂 Project Structure

```
backend/
├── lib/
│   ├── database.ts           # SQLite schema & connection
│   ├── auth.ts               # JWT & password utilities
│   ├── receipt.ts            # Gemini AI receipt analysis
│   ├── receipt-storage.ts    # Receipt CRUD operations
│   ├── telegram-bot.ts       # Telegram Bot API client (long polling)
│   ├── telegram-handlers.ts  # Bot command & message handlers
│   └── telegram-users.ts     # Telegram user management
├── routes/
│   ├── auth.ts               # REST auth endpoints
│   └── receipt.ts            # REST receipt endpoints
├── types/
│   ├── auth.ts               # Auth type definitions
│   └── receipt.ts            # Receipt type definitions
├── test/                     # Unit and E2E tests
├── server.ts                 # Entry point (HTTP server + Telegram bot)
├── Dockerfile                # Multi-stage Docker build
├── docker-compose.yml        # Container orchestration
└── .env                      # Environment variables (not committed)
```

## ⚙️ Setup

### Local Development

1.  **Install dependencies**:
    ```bash
    npm install
    ```

2.  **Create `.env`**:
    ```env
    TELEGRAM_BOT_TOKEN=your_bot_token
    JWT_SECRET=your_secret_key
    ```

3.  **Run in dev mode**:
    ```bash
    npm run dev
    ```

### Docker Deployment

1.  **Create `.env`** in the project directory:
    ```env
    TELEGRAM_BOT_TOKEN=your_bot_token
    ```

2.  **Build and start**:
    ```bash
    docker compose up -d --build
    ```

3.  **View logs**:
    ```bash
    docker compose logs -f
    ```

The server starts on port `3000` and the Telegram bot begins long-polling automatically.

## 🧪 Testing

```bash
npm test            # Unit tests
npm run test:e2e    # E2E tests (requires GOOGLE_API_KEY)
npm run test:all    # All tests
```

## 📡 REST API Endpoints

The REST API remains available alongside the Telegram bot.

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/auth/register` | Create a new user account |
| `POST` | `/api/auth/login` | Login and receive JWT |
| `GET` | `/api/auth/me` | Get current user (requires `Authorization: Bearer TOKEN`) |
| `POST` | `/api/auth/logout` | Logout (client clears token) |

### Receipts
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/analyze-receipt` | Analyze a base64 receipt image |
| `POST` | `/api/receipts` | Save a receipt (requires auth) |
| `GET` | `/api/receipts` | List user's receipts (requires auth) |
| `GET` | `/api/receipts/stats` | Get spending statistics (requires auth) |
| `GET` | `/api/receipts/:id` | Get receipt details (requires auth) |
| `DELETE` | `/api/receipts/:id` | Delete a receipt (requires auth) |
| `PUT` | `/api/receipts/:id/notes` | Update receipt notes (requires auth) |

## 📝 Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | Yes | Telegram Bot API token from [@BotFather](https://t.me/BotFather) |
| `JWT_SECRET` | No | Secret for JWT signing (has default, change in production) |
| `DB_PATH` | No | SQLite database path (default: `./data/unibon.db`) |
| `GOOGLE_API_KEY` | No | Global fallback API key (users provide their own via `/setkey`) |

## 🤝 Acknowledgements

Thank Kai Betim Gecaj [@temeritas](https://github.com/temeritas) for the original idea that inspired this project!
