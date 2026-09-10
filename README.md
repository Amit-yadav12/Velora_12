# 🚀 Velora – AI-Powered Smart Appointment & Booking Platform

<div align="center">



# 🚀 Velora AI

### **Book Anything. Instantly.**

*India's AI-Powered Smart Appointment & Booking Platform*

<p align="center">
<a href="https://velora-ai-in.netlify.app/">🌐 Live Demo</a> •
</p>

![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript)
![Firebase](https://img.shields.io/badge/Firebase-Authentication-FFCA28?style=for-the-badge&logo=firebase)
![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?style=for-the-badge&logo=supabase)
![Google Maps](https://img.shields.io/badge/Google-Maps-4285F4?style=for-the-badge&logo=googlemaps)

</div>

---

# 📖 About

Velora is an **AI-powered appointment and business booking platform** designed for India. It helps customers discover nearby businesses, book appointments in seconds, and receive automated confirmations while enabling businesses to manage services, staff, schedules, and bookings through a modern real-time dashboard.

---

# 🚨 Problem

Millions of appointments are still managed manually, leading to:

- Double bookings
- Long waiting times
- Missed appointments
- Poor customer experience
- No real-time availability
- Inefficient business management

---

# 💡 Solution

Velora connects **Customers** and **Businesses** on one intelligent platform.

- 📍 Find nearby businesses using Google Maps
- 🤖 AI-powered appointment recommendations
- 📅 Google Calendar synchronization
- 📧 Automated email confirmations
- ⚡ Real-time booking updates
- 🏢 Self-service business onboarding

---

# ✨ Features

## 👤 Customer

- Google / Email / Phone OTP Login
- Nearby Business Discovery
- AI Smart Search
- AI Slot Recommendation
- Google Maps Navigation
- Booking History
- QR Ticket
- PDF Confirmation
- Google Calendar Sync
- Email Confirmation
- AI Assistant

---

## 🏢 Business

- Register Business
- Business Profile
- Staff Management
- Service Management
- Availability & Slots
- Appointment Dashboard
- Calendar
- Customer Management
- Reports & Analytics
- Real-Time Notifications

---

## 🤖 AI

- AI Smart Search
- AI Booking Assistant
- AI Slot Recommendation
- AI Travel Planner
- Natural Language Booking
- Voice-ready Architecture

---

# 🇮🇳 India First

Velora is optimized for India with:

- ₹ INR
- IST Time Zone
- +91 Phone Numbers
- Google Maps
- Major Indian Cities
- Healthcare
- Salons
- Education
- Hotels
- Sports
- Car Rentals
- Professional Services

---

# ⚙️ Tech Stack

| Frontend | Backend | Services |
|----------|----------|----------|
| React 19 | Supabase | Google Maps |
| TypeScript | PostgreSQL | Google Calendar |
| Vite | Firebase Auth | Resend |
| Tailwind CSS | Realtime | QR Code |
| Framer Motion | APIs | jsPDF |

---

# 🔄 Booking Workflow

```text
Login
   ↓
Location Detection
   ↓
Nearby Businesses
   ↓
Choose Service
   ↓
AI Recommended Slot
   ↓
Confirm Booking
   ↓
Booking Saved
   ↓
Email + Calendar
   ↓
Admin Dashboard Updated
```

---

# 📂 Project Structure

```text
src/
├── components/
├── pages/
├── contexts/
├── hooks/
├── services/
├── lib/
├── utils/
├── assets/
└── types/
```

---

# 🔒 Authentication

- Google Login
- Email Login
- Phone OTP
- Firebase Authentication
- Protected Routes
- Role-Based Access

---

# 📧 Automation

Every booking automatically:

- Saves to Supabase
- Updates Customer Dashboard
- Updates Business Dashboard
- Sends HTML Email
- Creates Google Calendar Event
- Generates Booking ID
- Generates QR Code
- Generates PDF
- Schedules Reminder Emails

---

# 🗺 Google Maps

- Current Location
- Nearby Businesses
- Directions
- ETA
- Distance
- Navigation
- Places Autocomplete

---

# 🚀 Quick Start

```bash
git clone <repository-url>

npm install

npm run dev
```

### Environment Variables

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=

VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=

VITE_GOOGLE_MAPS_API_KEY=

VITE_RESEND_API_KEY=
```

---



# 🎯 Why Velora?

Velora is more than a booking website—it is a scalable AI-powered appointment ecosystem that combines intelligent scheduling, real-time synchronization, Google integrations, automation, and premium user experience into one platform for customers and businesses.

---

<div align="center">

## 🌐 Live Demo

### **https://velora-ai-in.netlify.app/**

### ⭐ If you like Velora, please give this repository a Star!

### **Built for Hackathons • Built for Startups • Built for the Future**

**© 2026 Velora AI | Book Anything. Instantly.**

</div>

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
