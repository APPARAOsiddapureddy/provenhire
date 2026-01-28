# AssignmentAI - Complete Project Documentation

> AI-Powered Job Assignment Generator for Recruiters

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Technology Stack](#2-technology-stack)
3. [Architecture Overview](#3-architecture-overview)
4. [Design System](#4-design-system)
5. [Component Documentation](#5-component-documentation)
6. [Backend & API](#6-backend--api)
7. [Data Flow](#7-data-flow)
8. [Form Validation & State Management](#8-form-validation--state-management)
9. [AI Prompt Engineering](#9-ai-prompt-engineering)
10. [File Structure](#10-file-structure)
11. [Environment Variables](#11-environment-variables)
12. [Deployment Guide](#12-deployment-guide)
13. [Future Enhancements](#13-future-enhancements)

---

## 1. Project Overview

### What is AssignmentAI?

AssignmentAI is a web application that helps recruiters and hiring managers generate professional, role-specific job assignments in seconds using AI. Instead of spending hours crafting candidate assessments, users provide company and job details, and the AI generates comprehensive, tailored assignments.

### Key Features

| Feature | Description |
|---------|-------------|
| Instant Generation | Get complete assignments in under 30 seconds |
| Role-Specific | Tailored for technical, non-technical, and hybrid roles |
| Industry-Aligned | Assignments reflect real-world challenges |
| Experience-Calibrated | Adjusts complexity based on seniority level |
| Customizable | Add your own context and requirements |
| Export Options | Copy to clipboard or download as Markdown |

### Target Users

- HR Professionals
- Talent Acquisition Specialists
- Hiring Managers
- Tech Leads conducting interviews
- Startup founders building teams

---

## 2. Technology Stack

### Frontend

| Technology | Version | Purpose |
|------------|---------|---------|
| React | 18.3.1 | UI Component Library |
| TypeScript | Latest | Type Safety |
| Vite | Latest | Build Tool and Dev Server |
| Tailwind CSS | Latest | Utility-First Styling |
| Framer Motion | 12.27.2 | Animations |
| shadcn/ui | Latest | Pre-built UI Components |
| React Router | 6.30.1 | Client-Side Routing |
| TanStack Query | 5.83.0 | Server State Management |
| Sonner | 1.7.4 | Toast Notifications |

### Backend

| Technology | Purpose |
|------------|---------|
| Lovable Cloud | Backend Infrastructure |
| Supabase Edge Functions | Serverless API Endpoints |
| Lovable AI Gateway | AI Model Integration |
| Gemini 3 Flash Preview | AI Model for Generation |

### Development Tools

| Tool | Purpose |
|------|---------|
| ESLint | Code Linting |
| Vitest | Unit Testing |
| PostCSS | CSS Processing |

---

## 3. Architecture Overview

### High-Level Architecture

```
CLIENT (Browser)
  Header - Hero - Features - AssignmentForm - AssignmentOutput - Footer
        |
        | HTTP POST (FormData)
        v
LOVABLE CLOUD BACKEND
  Edge Function: generate-assignment
    Parse request -> Build prompts -> Call Lovable AI Gateway (Gemini 3)
        |
        v
  JSON Response: { assignment: "..." }
```

### Request/Response Flow

```
User Input -> Form Validation -> API Call -> AI Processing -> Render Output
FormData -> canProceed() -> supabase.functions.invoke() -> Gemini 3 -> AssignmentOutput
```

---

## 4. Design System

### Color Palette

Light Mode

| Token | HSL Value | Usage |
|-------|-----------|-------|
| --background | 220 20% 97% | Page background |
| --foreground | 220 40% 13% | Primary text |
| --primary | 220 65% 18% | Navy - buttons, headers |
| --secondary | 175 50% 40% | Teal - secondary elements |
| --accent | 175 55% 45% | Teal - highlights, CTAs |
| --muted | 220 15% 92% | Subtle backgrounds |
| --card | 0 0% 100% | Card backgrounds |
| --border | 220 20% 88% | Border colors |
| --destructive | 0 84% 60% | Error states |

Dark Mode

| Token | HSL Value | Usage |
|-------|-----------|-------|
| --background | 220 40% 8% | Deep navy background |
| --primary | 175 55% 50% | Teal primary |
| --accent | 175 50% 45% | Teal accent |

### Typography

| Type | Font Family | Usage |
|------|-------------|-------|
| Body | Inter | All body text, UI elements |
| Display | Space Grotesk | Headings (h1-h6) |

Font usage in Tailwind:
font-sans -> Inter
font-display -> Space Grotesk

### Shadows

| Token | CSS Variable | Usage |
|------|--------------|-------|
| shadow-soft | --shadow-soft | Cards, subtle elevation |
| shadow-medium | --shadow-medium | Focused elements |
| shadow-hero | --shadow-hero | Hero section buttons |

### Gradients

| Token | CSS Variable | Usage |
|------|--------------|-------|
| --gradient-hero | Navy -> Blue -> Teal | Hero background |
| --gradient-card | White -> Light gray | Card backgrounds |
| --gradient-accent | Teal -> Darker teal | Accent buttons |

### Border Radius

| Size | Value |
|------|-------|
| --radius | 0.75rem (12px) |
| rounded-lg | 12px |
| rounded-md | 10px |
| rounded-sm | 8px |

### Animations

| Animation | Duration | Usage |
|-----------|----------|-------|
| fade-in | 0.5s | Content appearing |
| slide-in | 0.4s | Horizontal slides |
| pulse-soft | 2s | Loading states |
| accordion-down/up | 0.2s | Collapsible content |

---

## 5. Component Documentation

### 5.1 Header (src/components/Header.tsx)

Purpose: Fixed navigation header with logo and navigation links.

Props: None

Features:
- Fixed positioning with z-50
- Glassmorphism design with backdrop-blur
- Responsive navigation (hidden on mobile)
- Smooth entrance animation

### 5.2 HeroSection (src/components/HeroSection.tsx)

Purpose: Main landing section with value proposition and CTA.

Props:
interface HeroSectionProps {
  onGetStarted: () => void;
}

Features:
- Full viewport height (85vh)
- Gradient background using --gradient-hero
- Animated badge, heading, and CTAs
- Trust indicators at bottom

### 5.3 Features (src/components/Features.tsx)

Purpose: Showcase key product features in a grid layout.

Features array:
- Instant Generation
- Role-Specific
- Industry Aligned
- Customizable
- Time-Boxed Tasks
- All Levels

Layout: Responsive grid (1 col -> 2 cols -> 3 cols)

### 5.4 AssignmentForm (src/components/AssignmentForm.tsx)

Purpose: Multi-step form for collecting assignment generation inputs.

Props:
interface AssignmentFormProps {
  onGenerate: (data: FormData) => void;
  isLoading: boolean;
}

Form data fields:
- companyName (required)
- companyWebsite (optional)
- companyLinkedIn (optional)
- companyDescription (optional)
- industry (required)
- jobRole (required)
- jobDescription (optional)
- roleType (required)
- experienceLevel (required)
- additionalContext (optional)

Validation:
- Step 1: companyName and industry required
- Step 2: jobRole, roleType, experienceLevel required

### 5.5 AssignmentOutput (src/components/AssignmentOutput.tsx)

Purpose: Display generated assignment with export options.

Props:
interface AssignmentOutputProps {
  assignment: string;
  companyName: string;
  jobRole: string;
  onRegenerate: () => void;
  isLoading: boolean;
}

Features:
- Copy to clipboard
- Download as .md
- Regenerate button

### 5.6 Footer (src/components/Footer.tsx)

Purpose: Simple footer with logo and copyright.

---

## 6. Backend and API

Edge Function: generate-assignment

Location: supabase/functions/generate-assignment/index.ts

Endpoint: POST /functions/v1/generate-assignment

Request body fields:
- companyName
- companyWebsite
- companyLinkedIn
- companyDescription
- industry
- jobRole
- jobDescription
- roleType
- experienceLevel
- additionalContext

Responses:
- 200: { assignment: string }
- 429: { error: "Rate limits exceeded, please try again later." }
- 402: { error: "Payment required. Please add funds to continue." }
- 500: { error: string }

CORS:
Access-Control-Allow-Origin: *
Access-Control-Allow-Headers: authorization, x-client-info, apikey, content-type

AI integration:
- Gateway URL: https://ai.gateway.lovable.dev/v1/chat/completions
- Model: google/gemini-3-flash-preview
- Auth: Bearer token using LOVABLE_API_KEY

---

## 7. Data Flow

User journey:
1. Landing -> Hero -> CTA
2. Form Step 1 (Company Details)
3. Form Step 2 (Job Role)
4. Form Step 3 (Customize)
5. Generation -> Edge function -> AI -> Result
6. Output -> Copy / Download / Regenerate

State management:
- Index: isLoading, generatedAssignment, lastFormData
- AssignmentForm: currentStep, formData
- AssignmentOutput: copied

---

## 8. Form Validation and State Management

Validation rules:
- companyName required
- industry required
- jobRole required
- roleType required
- experienceLevel required
- others optional

Update helper:
updateFormData(field, value)

Navigation:
canProceed() checks required fields per step

---

## 9. AI Prompt Engineering

System prompt positions the AI as an elite talent acquisition specialist.

User prompt includes:
- company context
- role details
- required output sections

Role-type focus:
- Technical: code, system design, testing, APIs
- Non-technical: strategy, communication, research
- Hybrid: cross-functional, data-driven, technical communication

Experience calibration:
- Entry: 2-3 hours, more guidance
- Mid: 3-4 hours, balanced
- Senior/Lead: 4-6 hours, minimal hand-holding

---

## 10. File Structure

See project tree in repository:
- public/
- src/components/
- src/pages/
- supabase/functions/
- config files

---

## 11. Environment Variables

Frontend:
- VITE_SUPABASE_URL
- VITE_SUPABASE_PUBLISHABLE_KEY
- VITE_SUPABASE_PROJECT_ID

Edge functions:
- LOVABLE_API_KEY
- SUPABASE_URL
- SUPABASE_ANON_KEY
- SUPABASE_SERVICE_ROLE_KEY

---

## 12. Deployment Guide

Lovable Cloud handles frontend, edge functions, SSL, and CDN.

Deploy frontend:
1. Publish in Lovable editor
2. Update to deploy latest changes

Edge functions deploy automatically on save.

---

## 13. Future Enhancements

Planned features:
- Web scraping for company info
- Assignment history
- Templates library
- Team collaboration
- Analytics dashboard

Technical improvements:
- Add unit tests
- Implement caching
- Offline support
- Bundle size optimization
- Rate limiting in frontend

UX enhancements:
- Dark mode toggle
- Keyboard navigation
- Progress saving
- Assignment preview
- Feedback/rating system

---

Appendix A: API Reference
- POST /functions/v1/generate-assignment
- Content-Type: application/json
- Authorization: Bearer SUPABASE_ANON_KEY

Appendix B: Component Props Quick Reference
- HeroSection: onGetStarted
- AssignmentForm: onGenerate, isLoading
- AssignmentOutput: assignment, companyName, jobRole, onRegenerate, isLoading
- Header: none
- Features: none
- Footer: none

Appendix C: Useful Commands
- npm run dev
- npm run build
- npm run test
- npm run lint

Documentation generated for AssignmentAI v1.0
Last updated: January 2026
