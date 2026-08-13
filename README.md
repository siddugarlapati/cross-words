# AutoCross-Edu 🎓
> **AI-Powered Educational Crossword Assessment Engine for Anurag University**

AutoCross-Edu transforms syllabus topics, lecture notes, and course PDF documents into interactive, curriculum-aligned educational crossword puzzles in seconds. Built for high student engagement, dynamic anti-cheat assessment generation, automated scoring, and comprehensive faculty analytics.

---

## 🌟 Key Features

### 🎓 Faculty Assessment Creator
- **AI Word & Clue Extraction**: Powered by Google Gemini AI (`gemini-flash-latest`) to generate technical terms and academic definitions directly from syllabus text or uploaded PDF/DOCX files.
- **Academic Year & Section Support**: Configure target Academic Year (*1st Year - 4th Year, PG*) and Class Section (*Section A, CSE-1, etc.*).
- **Scheduled Releases & Deadlines**: Set future assessment start times and submission deadlines.
- **Live Grid Preview & Auto-Arrange**: Dynamic crossword layout generator (`layoutGenerator.ts`) with visual grid preview and collision detection.

### 🎲 Per-Student Dynamic Grid & Question Randomization
- **Roll Number Seeded Layout**: Every student attempting an assessment receives a unique question order and custom crossword grid generated deterministically from their roll number seed.
- **Anti-Cheat Safeguards**: Prevents side-by-side answer copying while ensuring every student is tested on curriculum concepts.
- **Integrity Alerts**: Tab-switch and window-blur detection auto-records integrity warnings for faculty review.

### 📊 Faculty & Student Analytics Dashboard
- **Section & Year Filtering**: Filter class submission results by section or academic year.
- **Class Performance Distribution**: High Mastery (80-100%), Average (50-79%), and Needs Revision (<50%) breakdown.
- **Concept Analytics**: Item-by-item question success rates sorted by difficulty.
- **Student Performance Feedback**: Automated instructor feedback with one-click re-attempt permissions and CSV/Print export options.
- **Student Dashboard**: Optional student accounts (`/student-dashboard`) to track test history, scores, and accuracy percentages.

### 🛡️ SuperAdmin Oversight Panel (`/admin`)
- **System Metrics & Infographics**: Total faculty, student accounts, assessments, and submission infographics.
- **Public Registration Control**: Master toggle to hide or reveal the public Sign Up page across navigation and routes (`/#/signup`).
- **Direct Account Creation**: Create faculty or student accounts directly from the SuperAdmin dashboard.

---

## 🎨 Design Theme

Built with the official **Anurag University** light brand palette:
- **Primary Color**: Anurag Crimson Red (`#b01c1e`)
- **Secondary Color**: Deep Navy Blue (`#002147`)
- **Accent Color**: Academic Teal (`#0d9488`)
- **Background**: Clean White (`#ffffff`) and Soft Slate (`#f8f9fc`)

---

## 🚀 Getting Started

### 1. Prerequisites
- Node.js `v20+`
- npm `v10+`
- Docker (optional for containerized deployment)

### 2. Environment Setup
Create a `.env` file in the root directory:
```env
VITE_SUPABASE_URL=https://wdtoqtuphothvfixeguo.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_GEMINI_API_KEY=your_gemini_api_key
VITE_RESEND_API_KEY=your_resend_api_key
```

### 3. Local Development
```bash
# Install dependencies
npm install

# Run Vite dev server
npm run dev
```
Open `http://localhost:3000` in your browser.

---

## 🐳 Docker Production Build

Build and run the containerized production image with Nginx:

```bash
# Build Docker image
docker build -t autocross-edu:latest .

# Run Docker container on port 8080
docker run -d -p 8080:80 --name autocross-app autocross-edu:latest
```

---

## 🗄️ Database Schema

Database table setup for Supabase (`public` schema):
- `profiles`: User account details (`id`, `full_name`, `role`).
- `assessments`: Assessment metadata, deadlines, class sections, faculty info.
- `questions`: Crossword terms, clues, directions, grid row/col coordinates.
- `responses`: Student submissions, scores, total questions, time taken, answers JSON.

---

## 🛡️ License

Copyright © 2026 AutoCross-Edu • Anurag University Educational Platform. All rights reserved.
