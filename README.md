# Agency Portal

A full-stack agency management portal built with React, Google Sheets as a backend, Gmail for email, and deployed on Vercel.

---

## Features

- 📊 **Dashboard** — Revenue stats, active projects, unread notifications, recent activity
- 📁 **Projects** — Stage pipeline with AI-powered invoice generation on stage completion
- 📄 **Proposals** — Send proposals via email, client-facing public URL, accept/decline flow
- 🧾 **Invoices** — Full invoice management, PDF generation, mark as paid
- ⏱ **Time Tracking** — Log billable/non-billable hours per project and stage
- 📒 **Books** — P&L overview, expense tracking with categories
- 👥 **Clients** — Client management with CSV import
- ⚙️ **Settings** — Company branding, payment details, invoice footer
- 🔔 **Notifications** — Auto-created on key events, dismissible from dashboard

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 (CRA), React Router, Recharts, Lucide |
| Backend | Google Sheets API v4 (data store) |
| Serverless API | Vercel API Routes (Node.js) |
| Email | Gmail API (OAuth2) |
| AI | Anthropic Claude (invoice descriptions) |
| Hosting | Vercel |
| Source | GitHub |

---

## Prerequisites

- Node.js 18+
- A Google account
- A Gmail account (for sending emails)
- A Vercel account
- A GitHub account
- An Anthropic API key

---

## Step 1 — Google Sheets Setup

### 1.1 Create the Spreadsheet

1. Go to [Google Sheets](https://sheets.google.com) and create a new blank spreadsheet
2. Name it **Agency Portal**
3. Copy the **Spreadsheet ID** from the URL:
   ```
   https://docs.google.com/spreadsheets/d/SPREADSHEET_ID_IS_HERE/edit
   ```

### 1.2 Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project (e.g. **Agency Portal**)
3. Enable these APIs:
   - **Google Sheets API**
   - **Google Drive API**
   - **Gmail API**

### 1.3 Create a Service Account (for Sheets write access)

1. Go to **IAM & Admin → Service Accounts**
2. Click **Create Service Account**
3. Name it `agency-portal-sheets`
4. Click **Create and Continue**, skip optional steps, click **Done**
5. Click the service account → **Keys** tab → **Add Key → Create new key → JSON**
6. Download the JSON file — this is your `GOOGLE_SERVICE_ACCOUNT` value

### 1.4 Share the Spreadsheet with the Service Account

1. Open the JSON file and copy the `client_email` value (looks like `xxx@project.iam.gserviceaccount.com`)
2. In your Google Sheet, click **Share**
3. Paste the service account email and give it **Editor** access

### 1.5 Enable Public Read Access (for the frontend)

1. In your Google Sheet, click **Share → Anyone with the link → Viewer**
2. Go to [Google Cloud Console](https://console.cloud.google.com) → **APIs & Services → Credentials**
3. Click **Create Credentials → API Key**
4. Copy the API key — this is your `REACT_APP_GOOGLE_API_KEY`
5. (Recommended) Restrict the key to **Google Sheets API** only

### 1.6 Run the Setup Script

```bash
npm install

GOOGLE_SERVICE_ACCOUNT='<paste full JSON as single line>' \
SPREADSHEET_ID='your-spreadsheet-id' \
node scripts/setup-sheets.js
```

This creates all required sheet tabs with the correct column headers and default settings.

---

## Step 2 — Gmail OAuth2 Setup

### 2.1 Create OAuth2 Credentials

1. In Google Cloud Console → **APIs & Services → Credentials**
2. Click **Create Credentials → OAuth client ID**
3. Application type: **Web application**
4. Name: `Agency Portal Gmail`
5. Add Authorized redirect URI: `https://developers.google.com/oauthplayground`
6. Copy the **Client ID** and **Client Secret**

### 2.2 Get a Refresh Token

1. Go to [Google OAuth Playground](https://developers.google.com/oauthplayground)
2. Click the gear icon → check **Use your own OAuth credentials**
3. Enter your Client ID and Client Secret
4. In Step 1, find and select: `https://mail.google.com/`
5. Click **Authorize APIs** and sign in with the Gmail account you want to send from
6. In Step 2, click **Exchange authorization code for tokens**
7. Copy the **Refresh Token**

---

## Step 3 — GitHub Setup

```bash
cd /path/to/agency-portal
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/agency-portal.git
git push -u origin main
```

---

## Step 4 — Vercel Deployment

### 4.1 Import the Project

1. Go to [vercel.com](https://vercel.com) → **Add New Project**
2. Import your GitHub repo
3. Framework Preset: **Create React App**
4. Click **Deploy**

### 4.2 Add Environment Variables

In Vercel → Project Settings → **Environment Variables**, add all of these:

#### Google Sheets (Frontend — public)
| Variable | Value |
|----------|-------|
| `REACT_APP_SPREADSHEET_ID` | Your Google Sheets ID |
| `REACT_APP_GOOGLE_API_KEY` | Your Google API key |

#### Google Sheets (Serverless — secret)
| Variable | Value |
|----------|-------|
| `SPREADSHEET_ID` | Your Google Sheets ID (same as above) |
| `GOOGLE_SERVICE_ACCOUNT` | Full contents of your service account JSON file |

#### Gmail
| Variable | Value |
|----------|-------|
| `GMAIL_CLIENT_ID` | Your OAuth2 Client ID |
| `GMAIL_CLIENT_SECRET` | Your OAuth2 Client Secret |
| `GMAIL_REFRESH_TOKEN` | Your refresh token |
| `GMAIL_FROM` | e.g. `My Agency <hello@myagency.com>` |

#### Admin Login
| Variable | Value |
|----------|-------|
| `ADMIN_EMAIL` | Your admin login email |
| `ADMIN_PASSWORD` | Your admin login password |
| `ADMIN_NAME` | Your display name |

#### AI (Anthropic)
| Variable | Value |
|----------|-------|
| `ANTHROPIC_API_KEY` | Your Anthropic API key |

### 4.3 Redeploy

After adding env vars, go to **Deployments** → click latest → **Redeploy**.

---

## Local Development

```bash
npm install
# Install Vercel CLI for full local API route testing
npm install -g vercel
vercel dev
```

Create a `.env.local` file:

```env
REACT_APP_SPREADSHEET_ID=your_spreadsheet_id
REACT_APP_GOOGLE_API_KEY=your_api_key
SPREADSHEET_ID=your_spreadsheet_id
GOOGLE_SERVICE_ACCOUNT={"type":"service_account","project_id":"..."}
GMAIL_CLIENT_ID=xxx.apps.googleusercontent.com
GMAIL_CLIENT_SECRET=GOCSPX-xxx
GMAIL_REFRESH_TOKEN=1//xxx
GMAIL_FROM=My Agency <hello@myagency.com>
ADMIN_EMAIL=admin@myagency.com
ADMIN_PASSWORD=your_secure_password
ADMIN_NAME=Your Name
ANTHROPIC_API_KEY=sk-ant-xxx
```

---

## Google Sheets Schema

| Sheet | Key Columns |
|-------|------------|
| `clients` | id, name, contact_name, email, phone, address |
| `projects` | id, title, client_id, type, status, current_stage, stage_completion, total_fee |
| `proposals` | id, title, client_id, client_email, status, total_amount, payment_schedule |
| `invoices` | id, invoice_number, project_id, stage, amount, status, due_date |
| `time_entries` | id, project_id, stage, hours, billable, team_member, date |
| `expenses` | id, description, category, amount, date, receipt_url |
| `notifications` | id, title, message, type, read, link |
| `settings` | key, value |
| `users` | id, name, email, role |

---

## API Routes

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/login` | POST | Validate admin credentials |
| `/api/sheets/append` | POST | Append a row to a sheet |
| `/api/sheets/update` | POST | Update a row by index |
| `/api/sheets/delete` | POST | Delete a row by index |
| `/api/email/send` | POST | Send proposal or invoice email via Gmail |
| `/api/ai/generate` | POST | Generate invoice description via Anthropic |

---

## Public Routes (No Login Required)

| Route | Description |
|-------|-------------|
| `/login` | Admin login page |
| `/proposal/:id` | Client-facing proposal view |
| `/thank-you` | Post-acceptance confirmation |

---

## Troubleshooting

**Sheets not loading** — Check `REACT_APP_SPREADSHEET_ID` and `REACT_APP_GOOGLE_API_KEY`. Make sure the sheet is publicly readable and the setup script has been run.

**Email not sending** — Verify all `GMAIL_*` env vars. Refresh tokens can expire — re-run the OAuth Playground flow to get a new one.

**AI descriptions failing** — Confirm `ANTHROPIC_API_KEY` is valid and check Vercel function logs.

**Login not working** — Confirm `ADMIN_EMAIL` and `ADMIN_PASSWORD` match exactly what you're entering.

---

## License

MIT
