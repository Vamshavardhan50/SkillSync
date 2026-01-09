# SkillSync - AI-Powered Career Coach

An intelligent EdTech platform that analyzes resumes against job descriptions using Google Gemini AI to provide personalized skill gap analysis and learning recommendations.

## 🚀 Features

### 1. Student-Facing Features (Personal Skill Coach)

1. **Resume Image Upload & Scan**

   - Upload resume as an image or PDF
   - On-device text extraction using Google ML Kit
   - No manual data entry required

2. **Job Description Analyzer**

   - Paste job descriptions from any company or role
   - Supports multiple domains (Software, Data, Cloud, AI, etc.)

3. **AI-Based Resume–Job Matching**

   - Uses Gemini API to compare resume skills with job requirements
   - Generates an overall **match percentage**

4. **Skill Gap Identification**

   - Clearly lists missing technical and tool-based skills
   - Example: _Docker, Kubernetes, GraphQL_

5. **Skill Explanation Summaries**

   - Short, beginner-friendly descriptions of each missing skill
   - Helps students understand _what_ to learn and _why it matters_

6. **Pre-Interview Preparation Insights**

   - Highlights role-critical skills over optional ones
   - Helps prioritize learning efforts

7. **Instant Feedback Loop**
   - Real-time results within seconds of submission
   - Encourages iterative resume and skill improvement

---

### 2. Institutional Features (Dean / Placement Dashboard)

8. **Real-Time Skill Gap Aggregation**

   - Every missing skill discovered is logged centrally
   - Data stored securely in local SQLite database with dedicated analytics tables

9. **Batch-Level Skill Gap Analytics**

   - View skill shortages across:
     - Departments
     - Academic years
     - Target job roles

10. **Trend Detection & Alerts**

    - Identify emerging skill gaps (e.g., Cloud Security, MLOps)
    - Early warnings before placement drives

11. **Recruiter-Specific Readiness Analysis**

    - Analyze preparedness for specific companies or roles
    - Align training with upcoming recruiters

12. **Curriculum Feedback System**

    - Data-backed evidence for syllabus updates
    - Supports academic planning and approvals

13. **Workshop & Training Planning Support**
    - Identify topics for emergency workshops or bootcamps
    - Measure impact of interventions over time

---

### 3. Analytics & Visualization Features

14. **Live Administrative Dashboard**

    - Built using Chart.js for interactive visualizations
    - Real-time data updates from SQLite database

15. **Skill Gap Heatmaps**

    - Visual representation of missing skills across cohorts

16. **Time-Based Skill Demand Tracking**
    - Monitor how skill requirements evolve over months or semesters

---

### 4. Platform & Technical Features

17. **Structured AI Output (JSON-Based)**

    - Ensures consistency and analytics-ready data
    - Minimizes hallucinations and noise

18. **Scalable Cloud Architecture**

    - SQLite-based local storage with optimized indexing
    - Fast queries and efficient data aggregation
    - Supports thousands of student records

19. **Privacy-Aware Design**

    - Student-level data anonymized for institutional analytics
    - Only aggregate insights shown to administrators

20. **Cross-Platform Web Application**
    - Accessible via browsers and mobile devices
    - Minimal setup and easy onboarding

---

### 5. Future-Ready / Extensible Features

21. **Automated Course Recommendations (Planned)**

    - Link missing skills to curated Coursera / YouTube content

22. **AI Mock Interviews (Planned)**

    - Voice-based interviews using Gemini multimodal APIs

23. **AI-Assisted Resume Optimization (Planned)**
    - Suggests improvements to highlight relevant skills effectively

## 📋 Requirements

- Node.js 18 or higher
- Google Gemini API key (free from [Google AI Studio](https://makersuite.google.com/app/apikey))

## 🛠️ Installation

1. Install dependencies:

```bash
npm install
```

2. Configure environment:

- Copy `.env.example` to `.env`
- Add your Gemini API key to `.env`

3. Start the server:

```bash
npm run dev
```

4. Open in browser:

- Student Interface: http://localhost:3000
- Admin Dashboard: http://localhost:3000/admin.html

## 💡 Usage

### For Students

1. Upload your resume (PDF/Image)
2. Paste job description
3. Click "Analyze Skills"
4. Get instant skill gap analysis

### For Admins

- View analytics dashboard
- Track student progress
- Monitor skill trends
- Export reports

## 🗄️ Database

Data is stored locally in `data/skillsync.db` using SQLite.

## 🎨 Tech Stack

- **Frontend**: HTML5, CSS3, JavaScript
- **Backend**: Node.js, Express
- **AI**: Google Gemini API
- **Database**: SQLite
- **OCR**: Tesseract.js

## 📝 License

MIT License - See LICENSE file for details

## 🤝 Support

For issues or questions, please create an issue in the repository.
