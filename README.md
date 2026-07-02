# 🚀 Velora – AI-Powered Smart Appointment & Booking Platform

<div align="center">

![Velora Banner]([https://img.shields.io/badge/Velora-AI%20Booking%20Platform-blue?style=for-the-badge](https://velora-ai-os-h5vj.arcada.app/))

**India's Next Generation AI Appointment & Business Booking Platform**

Built with ❤️ using **React, TypeScript, Vite, Firebase, Supabase & Google Maps**

</div>

---

# 📌 Problem Statement

Millions of appointments are still managed manually across hospitals, salons, education centers, professional services, car rentals, hotels, sports facilities, and many other industries.

Common problems include:

- Manual booking systems
- Double bookings
- Missed appointments
- Long waiting times
- No automated reminders
- Poor customer experience
- Lack of real-time availability
- Inefficient business management

Velora solves these problems with an intelligent AI-powered appointment platform.

---

# 💡 Solution

Velora is an AI-powered appointment marketplace where:

- Customers discover nearby businesses.
- Businesses register and manage appointments.
- AI recommends the best appointment slots.
- Google Maps helps users find nearby businesses.
- Google Calendar synchronizes appointments.
- Automated email confirmations keep everyone informed.
- Real-time synchronization keeps dashboards updated instantly.

---

# ✨ Features

## Customer

- Google Login
- Email Login
- Phone OTP Login
- AI Smart Search
- Nearby Businesses
- Google Maps
- AI Slot Recommendation
- Interactive Booking Timeline
- QR Ticket
- Booking History
- Google Calendar Sync
- Email Confirmation
- PDF Confirmation
- Notifications
- AI Assistant

---

## Business (Admin)

- Business Registration
- Business Profile
- Staff Management
- Service Management
- Working Hours
- Availability
- Appointment Slots
- Booking Management
- Calendar
- Reports
- Customer Management
- Real-time Dashboard
- Analytics

---

## AI Features

- AI Appointment Recommendation
- AI Smart Search
- AI Travel Planner
- AI Booking Assistant
- Natural Language Booking
- Voice-ready Assistant Architecture
- Intelligent Suggestions

---

# 🇮🇳 India-First Experience

Velora is designed primarily for Indian users.

Supports:

- INR (₹)
- IST Time Zone
- Indian Mobile Numbers
- Indian Addresses
- Google Maps
- Major Indian Cities
- Demo Businesses
- Multi-category Marketplace

---

# 🏗 Tech Stack

### Frontend

- React 19
- TypeScript
- Vite
- Tailwind CSS
- shadcn/ui
- Framer Motion

### Backend

- Supabase
- PostgreSQL
- Supabase Realtime

### Authentication

- Firebase Authentication
- Google OAuth
- Email Authentication
- Phone OTP

### Maps

- Google Maps Platform
- Places API
- Directions API

### Calendar

- Google Calendar API

### Email

- Resend / SendGrid

### Database

- PostgreSQL

### Deployment

- Vercel

---

# ⚡ Core Workflow

Customer Login

↓

Location Detection

↓

Nearby Businesses

↓

Choose Category

↓

Choose Business

↓

Choose Service

↓

Choose Time Slot

↓

Confirm Booking

↓

Google Calendar

↓

Confirmation Email

↓

Business Dashboard Updated

↓

Realtime Sync

---

# 📂 Project Structure

```
src/
│
├── components/
├── pages/
├── layouts/
├── hooks/
├── contexts/
├── services/
├── lib/
├── utils/
├── types/
├── assets/
└── styles/
```

---

# 🔒 Authentication

- Google Login
- Email Login
- Phone OTP
- Secure Sessions
- Protected Routes
- Role Based Access
- Customer Dashboard
- Business Dashboard

---

# 📧 Automated Notifications

After every successful booking:

- Booking Confirmation Email
- Google Calendar Event
- QR Code
- Booking ID
- Reminder Emails
- Realtime Dashboard Update

---

# 🗺 Google Maps

- Current Location
- Nearby Businesses
- Directions
- ETA
- Distance
- Places Search
- Navigation

---

# 📊 Admin Dashboard

Businesses can manage:

- Services
- Staff
- Availability
- Bookings
- Customers
- Reports
- Notifications
- Calendar
- Business Profile

---

# 🚀 Getting Started

## Clone Repository

```bash
git clone <repository-url>
```

---

## Install Dependencies

```bash
npm install
```

---

## Environment Variables

Create a `.env` file.

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=

VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=

VITE_GOOGLE_MAPS_API_KEY=

VITE_RESEND_API_KEY=
```

---

## Run Development Server

```bash
npm run dev
```

---

## Build

```bash
npm run build
```

---

## Preview

```bash
npm run preview
```

---

# ESLint (Recommended Production Configuration)

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      tseslint.configs.recommendedTypeChecked,
      tseslint.configs.strictTypeChecked,
      tseslint.configs.stylisticTypeChecked,
      reactX.configs['recommended-typescript'],
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
])
```

---

# Future Roadmap

- AI Voice Receptionist
- AI Callback Assistant
- WhatsApp Notifications
- Push Notifications
- Progressive Web App (PWA)
- Multi-language Support
- Business Verification
- Ratings & Reviews
- Waitlist Management
- Demand Prediction

---

# Why Velora?

Velora is not just another booking website.

It is an intelligent AI-powered appointment ecosystem that combines business management, real-time scheduling, Google integrations, automation, and premium user experience into one scalable platform.

---

# 👨‍💻 Team

Built for innovation, scalability, and real-world impact.

---

# 📄 License

MIT License

---

<div align="center">

### ⭐ If you like Velora, please give this repository a star!

**Built for Hackathons • Built for Startups • Built for the Future**

</div>
