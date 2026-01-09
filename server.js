// SkillSync Backend Server
// Handles Gemini API integration and SQLite storage

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const Database = require("better-sqlite3");
const fs = require("fs");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const session = require("express-session");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");
const compression = require("compression");
const rateLimit = require("express-rate-limit");
const morgan = require("morgan");

const app = express();
const PORT = process.env.PORT || 3000;

// JWT Secret (should be in .env in production)
const JWT_SECRET =
  process.env.JWT_SECRET || "your-secret-key-change-in-production";

// Middleware
app.use(cors());
app.use(helmet({
  contentSecurityPolicy: false, // Disabled for flexibility in development; enable and configure for prod
}));
app.use(compression());
app.use(morgan("dev"));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: "Too many requests from this IP, please try again after 15 minutes"
});
app.use("/api/", limiter);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(
  session({
    secret: JWT_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }, // 24 hours
  })
);
app.use(express.static("public"));

// Initialize SQLite Database
// On Vercel, we must use /tmp as it's the only writable directory
const isVercel = process.env.VERCEL === "1";
const dbDir = isVercel ? "/tmp" : path.join(__dirname, "data");

if (!fs.existsSync(dbDir)) {
  try {
    fs.mkdirSync(dbDir, { recursive: true });
  } catch (e) {
    console.error("Failed to create DB directory:", e);
  }
}

const dbPath = path.join(dbDir, "skillsync.db");
console.log(`Using database at: ${dbPath}`);
const db = new Database(dbPath);

// Create enhanced tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT DEFAULT 'student' CHECK(role IN ('student', 'admin')),
    university TEXT,
    department TEXT,
    academic_year TEXT,
    student_id TEXT,
    phone TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login DATETIME
  );

  CREATE TABLE IF NOT EXISTS skill_gaps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    student_id TEXT NOT NULL,
    student_name TEXT,
    department TEXT,
    academic_year TEXT,
    job_role TEXT NOT NULL,
    company_name TEXT,
    match_percentage REAL NOT NULL,
    missing_skills TEXT,
    matched_skills TEXT,
    skill_priority TEXT,
    recommendations TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
  
  CREATE TABLE IF NOT EXISTS skill_analytics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    skill_name TEXT NOT NULL,
    category TEXT,
    total_missing INTEGER DEFAULT 1,
    department TEXT,
    last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(skill_name, department)
  );
  
  CREATE TABLE IF NOT EXISTS trends (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    skill_name TEXT NOT NULL,
    week_number INTEGER,
    year INTEGER,
    count INTEGER DEFAULT 1,
    UNIQUE(skill_name, week_number, year)
  );
`);

// Migrate existing database - add new columns if they don't exist
try {
  const tableInfo = db.prepare("PRAGMA table_info(skill_gaps)").all();
  const columnNames = tableInfo.map((col) => col.name);

  // Add missing columns
  if (!columnNames.includes("student_name")) {
    db.exec("ALTER TABLE skill_gaps ADD COLUMN student_name TEXT");
    console.log("✅ Added student_name column");
  }
  if (!columnNames.includes("academic_year")) {
    db.exec("ALTER TABLE skill_gaps ADD COLUMN academic_year TEXT");
    console.log("✅ Added academic_year column");
  }
  if (!columnNames.includes("company_name")) {
    db.exec("ALTER TABLE skill_gaps ADD COLUMN company_name TEXT");
    console.log("✅ Added company_name column");
  }
  if (!columnNames.includes("skill_priority")) {
    db.exec("ALTER TABLE skill_gaps ADD COLUMN skill_priority TEXT");
    console.log("✅ Added skill_priority column");
  }
  if (!columnNames.includes("user_id")) {
    db.exec("ALTER TABLE skill_gaps ADD COLUMN user_id INTEGER");
    console.log("✅ Added user_id column");
  }
} catch (error) {
  console.log("Migration check:", error.message);
}

console.log("✅ SQLite database initialized");

// ==============================================================================
// AUTHENTICATION MIDDLEWARE
// ==============================================================================

// Middleware to verify JWT token
function authenticateToken(req, res, next) {
  const token =
    req.headers["authorization"]?.split(" ")[1] || req.cookies.token;

  if (!token) {
    return res.status(401).json({ error: "Access denied. No token provided." });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(403).json({ error: "Invalid or expired token" });
  }
}

// Middleware to check if user is admin
function requireAdmin(req, res, next) {
  if (req.user.role !== "admin") {
    return res
      .status(403)
      .json({ error: "Access denied. Admin privileges required." });
  }
  next();
}

// ==============================================================================
// AUTHENTICATION ROUTES
// ==============================================================================

// Register new user
app.post("/api/auth/register", async (req, res) => {
  try {
    const {
      email,
      password,
      fullName,
      university,
      department,
      academicYear,
      studentId,
      phone,
    } = req.body;

    // Validation
    if (!email || !password || !fullName) {
      return res
        .status(400)
        .json({ error: "Email, password, and full name are required" });
    }

    // Check if user already exists
    const existingUser = db
      .prepare("SELECT id FROM users WHERE email = ?")
      .get(email);
    if (existingUser) {
      return res
        .status(400)
        .json({ error: "User with this email already exists" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert user
    const stmt = db.prepare(`
      INSERT INTO users (email, password, full_name, university, department, academic_year, student_id, phone)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      email,
      hashedPassword,
      fullName,
      university,
      department,
      academicYear,
      studentId,
      phone
    );

    // Generate JWT token
    const token = jwt.sign(
      { id: result.lastInsertRowid, email, role: "student", fullName },
      JWT_SECRET,
      { expiresIn: "24h" }
    );

    res.json({
      success: true,
      message: "Registration successful",
      token,
      user: {
        id: result.lastInsertRowid,
        email,
        fullName,
        role: "student",
      },
    });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ error: "Registration failed" });
  }
});

// Login
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    // Find user
    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // Verify password
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // Update last login
    db.prepare(
      "UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?"
    ).run(user.id);

    // Generate JWT token
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
        fullName: user.full_name,
      },
      JWT_SECRET,
      { expiresIn: "24h" }
    );

    res.json({
      success: true,
      message: "Login successful",
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: user.role,
        department: user.department,
        university: user.university,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Login failed" });
  }
});

// Logout
app.post("/api/auth/logout", (req, res) => {
  res.clearCookie("token");
  res.json({ success: true, message: "Logged out successfully" });
});

// Get current user
app.get("/api/auth/me", authenticateToken, (req, res) => {
  const user = db
    .prepare(
      "SELECT id, email, full_name, role, department, university FROM users WHERE id = ?"
    )
    .get(req.user.id);
  res.json({ success: true, user });
});

// ==============================================================================
// EXISTING ROUTES (Now Protected)
// ==============================================================================

// Initialize Gemini AI
let genAI;
// Default to the most stable model as fallback
let availableModel = "gemini-pro";
let modelReady = false;

async function initializeGeminiModel() {
  if (!process.env.GEMINI_API_KEY) {
    console.log("⚠️ GEMINI_API_KEY not configured");
    return;
  }

  genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  
  const preferredModels = [
    "gemini-2.5-flash",
    "models/gemini-2.5-flash",
    "gemini-2.5-pro",
    "models/gemini-2.5-pro",
    "gemini-2.0-flash",
    "models/gemini-2.0-flash",
    "gemini-2.0-flash-exp",
    "models/gemini-2.0-flash-exp",
    "gemini-flash-latest",
    "gemini-pro-latest"
  ];

  console.log("🔍 Testing Gemini models connectivity...");

  for (const modelName of preferredModels) {
    try {
      console.log(`Testing model: ${modelName}...`);
      const model = genAI.getGenerativeModel({ model: modelName });
      // Try to generate a tiny bit of content to verify access
      await model.generateContent("Test");
      
      availableModel = modelName;
      modelReady = true;
      console.log(`✅ Successfully connected to Gemini model: ${availableModel}`);
      return; 
    } catch (error) {
       console.log(`❌ Model ${modelName} failed: ${error.message.split('\n')[0]}`);
       // Continue to next model
    }
  }

  console.warn("⚠️ Could not verify connectivity to any preferred Gemini models.");
  console.warn("⚠️ Falling back to 'gemini-2.5-flash' but it may fail.");
  availableModel = "gemini-2.5-flash";
  modelReady = true;
}

// Initialize model asynchronously
if (process.env.GEMINI_API_KEY) {
  initializeGeminiModel().catch((err) => {
    console.error("Failed to initialize Gemini:", err.message);
  });
}

// Helper function to extract job role from description
function extractJobRole(jobDescription) {
  const lines = jobDescription.split("\n");
  for (const line of lines) {
    if (
      line.toLowerCase().includes("job title:") ||
      line.toLowerCase().includes("position:") ||
      line.toLowerCase().includes("role:")
    ) {
      return line.split(":")[1]?.trim() || "Unknown";
    }
  }
  // Try to find common job titles
  const commonTitles = [
    "developer",
    "engineer",
    "analyst",
    "designer",
    "manager",
    "architect",
  ];
  for (const title of commonTitles) {
    if (jobDescription.toLowerCase().includes(title)) {
      const words = jobDescription.match(new RegExp(`\\w+\\s+${title}`, "i"));
      if (words) return words[0];
    }
  }
  return "Software Engineer";
}

// Helper function to extract company name from description
function extractCompanyName(jobDescription) {
  const lines = jobDescription.split("\n");
  for (const line of lines) {
    if (
      line.toLowerCase().includes("company:") ||
      line.toLowerCase().includes("organization:") ||
      line.toLowerCase().includes("employer:")
    ) {
      return line.split(":")[1]?.trim() || "Unknown";
    }
  }
  return "Unknown";
}

// Main analysis endpoint (Now protected)
app.post("/api/analyze", authenticateToken, async (req, res) => {
  try {
    const {
      resumeText,
      jobDescription,
      studentName,
      department,
      academicYear,
      companyName,
    } = req.body;

    if (!resumeText || !jobDescription) {
      return res
        .status(400)
        .json({ error: "Resume text and job description are required" });
    }

    // Analyze with Gemini
    const analysis = await analyzeWithGemini(resumeText, jobDescription);

    // Store in database
    storeToDatabase({
      student_id: generateStudentId(studentName),
      student_name: studentName || "Anonymous",
      department: department || "Unknown",
      academic_year: academicYear || "Not Specified",
      job_role: extractJobRole(jobDescription),
      company_name: companyName || extractCompanyName(jobDescription),
      match_percentage: analysis.matchPercentage,
      missing_skills: analysis.missingSkills,
      matched_skills: analysis.matchedSkills,
      skill_priority: analysis.skillPriority,
      recommendations: analysis.recommendations,
    });

    res.json(analysis);
  } catch (error) {
    console.error("Error in analysis:", error);
    res.status(500).json({
      error: "Analysis failed",
      message: error.message,
    });
  }
});

// Gemini analysis function
async function analyzeWithGemini(resumeText, jobDescription) {
  if (!genAI || !modelReady || !availableModel) {
    throw new Error(
      "Gemini API not configured. Please set GEMINI_API_KEY in .env"
    );
  }

  // Define the prompt creation logic as a helper to reuse it
  const createPrompt = (
    resume,
    job
  ) => `Analyze the resume against the job description strictly.
RESUME: ${resume.substring(0, 10000)}
JOB: ${job.substring(0, 2000)}

Provide JSON output:
1. matchPercentage (0-100)
2. missingSkills (List strings)
3. matchedSkills (List strings)
4. skillPriority (Object with critical/important/optional arrays)
5. skillExplanations (Array of objects {skill, explanation, importance}. KEEP SHORT. 1 sentence max.)
6. recommendations (Array of objects {skill, description, priority}. KEEP SHORT. 1 sentence max.)

Return ONLY valid JSON.
{
  "matchPercentage": 0,
  "missingSkills": [],
  "matchedSkills": [],
  "skillPriority": { "critical": [], "important": [], "optional": [] },
  "skillExplanations": [{ "skill": "", "explanation": "", "importance": "" }],
  "recommendations": [{ "skill": "", "description": "", "priority": "" }]
}`;

  async function tryGenerate(modelName) {
    console.log(`Using model: ${modelName}`);
    const model = genAI.getGenerativeModel({ model: modelName });
    const prompt = createPrompt(resumeText, jobDescription);
    const result = await model.generateContent(prompt);
    return await result.response;
  }

  try {
    const response = await tryGenerate(availableModel);

    let text = response.text();

    // Enhanced JSON extraction
    try {
      // Find the first '{' and last '}'
      const firstBrace = text.indexOf('{');
      const lastBrace = text.lastIndexOf('}');

      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        text = text.substring(firstBrace, lastBrace + 1);
      } else {
        // Fallback cleanup if braces aren't clear
        text = text
          .replace(/```json\n?/g, "")
          .replace(/```\n?/g, "")
          .trim();
      }

      const analysis = JSON.parse(text);

      // Validate the response
      if (typeof analysis.matchPercentage === 'undefined' || !Array.isArray(analysis.missingSkills)) {
        throw new Error("Invalid response format from Gemini: Missing required fields");
      }

      return analysis;
    } catch (parseError) {
      console.error("Failed to parse Gemini response:", text);
      console.error("Parse Error Details:", parseError.message);
      throw new Error("Failed to parse AI response. Please try again.");
    }
  } catch (error) {
    console.error("Gemini API Error:", error.message);
    if (error.message.includes("fetch failed")) {
      throw new Error(
        "Network error: Unable to reach Gemini API. Please check your internet connection."
      );
    }
    if (error.status === 429) {
      throw new Error("API rate limit exceeded. Please try again in a moment.");
    }
    if (error.status === 401 || error.status === 403) {
      throw new Error(
        "Invalid API key. Please check your GEMINI_API_KEY in .env file."
      );
    }
    throw error;
  }
}

// Store data in SQLite
function storeToDatabase(data) {
  try {
    const stmt = db.prepare(`
      INSERT INTO skill_gaps (
        user_id, student_id, student_name, department, academic_year, job_role, company_name,
        match_percentage, missing_skills, matched_skills, skill_priority, recommendations
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      data.user_id || null,
      data.student_id,
      data.student_name || "Anonymous",
      data.department || "Unknown",
      data.academic_year || "Not Specified",
      data.job_role,
      data.company_name || "Unknown",
      data.match_percentage,
      JSON.stringify(data.missing_skills || []),
      JSON.stringify(data.matched_skills || []),
      JSON.stringify(data.skill_priority || {}),
      JSON.stringify(data.recommendations || [])
    );

    // Update skill analytics
    updateSkillAnalytics(data.missing_skills, data.department);

    // Update trends
    updateTrends(data.missing_skills);

    console.log("✅ Data stored in database");
  } catch (error) {
    console.error("⚠️ Database storage error:", error.message);
  }
}

// Update skill analytics
function updateSkillAnalytics(skills, department) {
  if (!skills || !Array.isArray(skills)) return;

  skills.forEach((skill) => {
    try {
      // Check if record exists
      const existing = db
        .prepare(
          "SELECT id, total_missing FROM skill_analytics WHERE skill_name = ? AND department = ?"
        )
        .get(skill, department || "Unknown");

      if (existing) {
        // Update existing record
        db.prepare(
          "UPDATE skill_analytics SET total_missing = ?, last_seen = CURRENT_TIMESTAMP WHERE id = ?"
        ).run(existing.total_missing + 1, existing.id);
      } else {
        // Insert new record
        db.prepare(
          "INSERT INTO skill_analytics (skill_name, department, total_missing, last_seen) VALUES (?, ?, 1, CURRENT_TIMESTAMP)"
        ).run(skill, department || "Unknown");
      }
    } catch (e) {
      console.error("Error updating skill analytics:", e.message);
    }
  });
}

// Update weekly trends
function updateTrends(skills) {
  if (!skills || !Array.isArray(skills)) return;

  const now = new Date();
  const weekNumber = getWeekNumber(now);
  const year = now.getFullYear();

  skills.forEach((skill) => {
    try {
      // Check if record exists
      const existing = db
        .prepare(
          "SELECT id, count FROM trends WHERE skill_name = ? AND week_number = ? AND year = ?"
        )
        .get(skill, weekNumber, year);

      if (existing) {
        // Update existing record
        db.prepare("UPDATE trends SET count = ? WHERE id = ?").run(
          existing.count + 1,
          existing.id
        );
      } else {
        // Insert new record
        db.prepare(
          "INSERT INTO trends (skill_name, week_number, year, count) VALUES (?, ?, ?, 1)"
        ).run(skill, weekNumber, year);
      }
    } catch (e) {
      console.error("Error updating trends:", e.message);
    }
  });
}

// Get week number
function getWeekNumber(date) {
  const d = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  );
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

// Analytics endpoint for admin dashboard (Protected)
app.get("/api/analytics", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { department, academicYear, dateRange } = req.query;

    // Build WHERE clause for filters
    let whereClause = "1=1";
    const params = [];

    if (department) {
      whereClause += " AND department = ?";
      params.push(department);
    }
    if (academicYear) {
      whereClause += " AND academic_year = ?";
      params.push(academicYear);
    }

    // Get total students
    const totalStudents = db
      .prepare(
        `SELECT COUNT(DISTINCT student_id) as count FROM skill_gaps WHERE ${whereClause}`
      )
      .get(...params);

    // Get average match percentage
    const avgMatch = db
      .prepare(
        `SELECT AVG(match_percentage) as avg FROM skill_gaps WHERE ${whereClause}`
      )
      .get(...params);

    // Get department stats
    const deptStats = db
      .prepare(
        "SELECT department, COUNT(*) as count, AVG(match_percentage) as avgMatch FROM skill_gaps GROUP BY department"
      )
      .all();

    // Get academic year stats
    const yearStats = db
      .prepare(
        "SELECT academic_year, COUNT(*) as count, AVG(match_percentage) as avgMatch FROM skill_gaps GROUP BY academic_year"
      )
      .all();

    // Get company-wise readiness
    const companyStats = db
      .prepare(
        "SELECT company_name, COUNT(*) as count, AVG(match_percentage) as avgMatch FROM skill_gaps GROUP BY company_name ORDER BY count DESC LIMIT 10"
      )
      .all();

    // Get recent activity
    const recentActivity = db
      .prepare(
        `SELECT * FROM skill_gaps WHERE ${whereClause} ORDER BY timestamp DESC LIMIT 20`
      )
      .all(...params);

    // Get skill analytics from dedicated table
    const topSkillsFromAnalytics = db
      .prepare(
        `
        SELECT skill_name, SUM(total_missing) as count, department
        FROM skill_analytics
        GROUP BY skill_name
        ORDER BY count DESC
        LIMIT 15
      `
      )
      .all();

    // Get trending skills (last 4 weeks)
    const now = new Date();
    const currentWeek = getWeekNumber(now);
    const currentYear = now.getFullYear();

    const trendingSkills = db
      .prepare(
        `
        SELECT skill_name, SUM(count) as total, 
               GROUP_CONCAT(week_number || ':' || count) as weekly_data
        FROM trends
        WHERE year = ? AND week_number >= ?
        GROUP BY skill_name
        ORDER BY total DESC
        LIMIT 10
      `
      )
      .all(currentYear, Math.max(1, currentWeek - 3));

    // Calculate match distribution
    const matchDist = db
      .prepare(`SELECT match_percentage FROM skill_gaps WHERE ${whereClause}`)
      .all(...params);
    const distribution = {
      high: matchDist.filter((r) => r.match_percentage >= 80).length,
      medium: matchDist.filter(
        (r) => r.match_percentage >= 60 && r.match_percentage < 80
      ).length,
      low: matchDist.filter(
        (r) => r.match_percentage >= 40 && r.match_percentage < 60
      ).length,
      veryLow: matchDist.filter((r) => r.match_percentage < 40).length,
    };

    // Get critical vs important vs optional skills breakdown
    const allPriorities = db
      .prepare(`SELECT skill_priority FROM skill_gaps WHERE ${whereClause}`)
      .all(...params);

    const skillPriorityBreakdown = {
      critical: new Set(),
      important: new Set(),
      optional: new Set(),
    };

    allPriorities.forEach((record) => {
      try {
        const priority = JSON.parse(record.skill_priority || "{}");
        if (priority.critical)
          priority.critical.forEach((s) =>
            skillPriorityBreakdown.critical.add(s)
          );
        if (priority.important)
          priority.important.forEach((s) =>
            skillPriorityBreakdown.important.add(s)
          );
        if (priority.optional)
          priority.optional.forEach((s) =>
            skillPriorityBreakdown.optional.add(s)
          );
      } catch (e) {}
    });

    res.json({
      stats: {
        totalStudents: totalStudents.count || 0,
        uniqueSkills: topSkillsFromAnalytics.length,
        averageMatch: Math.round(avgMatch.avg || 0),
        totalDepartments: deptStats.length,
        totalAcademicYears: yearStats.filter(
          (y) => y.academic_year !== "Not Specified"
        ).length,
        totalCompanies: companyStats.filter((c) => c.company_name !== "Unknown")
          .length,
      },
      topMissingSkills: topSkillsFromAnalytics.map((s) => ({
        skill: s.skill_name,
        count: s.count,
      })),
      skillPriorityBreakdown: {
        critical: Array.from(skillPriorityBreakdown.critical),
        important: Array.from(skillPriorityBreakdown.important),
        optional: Array.from(skillPriorityBreakdown.optional),
      },
      departmentStats: deptStats.map((r) => ({
        department: r.department,
        count: r.count,
        avgMatch: Math.round(r.avgMatch || 0),
      })),
      academicYearStats: yearStats.map((r) => ({
        year: r.academic_year,
        count: r.count,
        avgMatch: Math.round(r.avgMatch || 0),
      })),
      companyStats: companyStats.map((r) => ({
        company: r.company_name,
        studentCount: r.count,
        avgReadiness: Math.round(r.avgMatch || 0),
      })),
      trendingSkills: trendingSkills.map((t) => ({
        skill: t.skill_name,
        total: t.total,
        trend: "increasing", // Can be enhanced with week-over-week comparison
      })),
      recentActivity: recentActivity.map((r) => {
        let skills = [];
        try {
          skills = JSON.parse(r.missing_skills || "[]");
        } catch (e) {}
        return {
          id: r.id,
          studentName: r.student_name || "Anonymous",
          timestamp: r.timestamp,
          department: r.department,
          academicYear: r.academic_year,
          jobRole: r.job_role,
          companyName: r.company_name,
          matchScore: Math.round(r.match_percentage),
          topSkills: skills.slice(0, 3),
        };
      }),
      alerts: generateEnhancedAlerts(
        topSkillsFromAnalytics,
        trendingSkills,
        distribution
      ),
      matchDistribution: distribution,
    });
  } catch (error) {
    console.error("Analytics error:", error);
    res.json(getMockAnalytics());
  }
});

// Helper functions
function generateStudentId(name) {
  if (name) {
    return `STU_${name.replace(/\s+/g, "_").toUpperCase()}_${Date.now()}`;
  }
  return `STU_ANON_${Date.now()}`;
}

function generateEnhancedAlerts(topSkills, trending, distribution) {
  const alerts = [];

  // Critical skill gap alert
  if (topSkills.length > 0) {
    const top = topSkills[0];
    if (top.count > 5) {
      alerts.push({
        severity: "critical",
        icon: "🚨",
        title: `High Demand: ${top.skill}`,
        description: `${top.count} students missing this critical skill. Consider emergency workshop.`,
        count: top.count,
        action: "Schedule Workshop",
      });
    }
  }

  // Trending skill alert
  if (trending.length > 0) {
    const topTrend = trending[0];
    alerts.push({
      severity: "warning",
      icon: "📈",
      title: `Trending Skill Gap: ${topTrend.skill}`,
      description: `Emerging demand detected. ${topTrend.total} instances in past 4 weeks.`,
      count: topTrend.total,
      action: "Add to Curriculum",
    });
  }

  // Low match percentage alert
  const totalStudents = Object.values(distribution).reduce((a, b) => a + b, 0);
  const lowMatchPercentage =
    ((distribution.low + distribution.veryLow) / totalStudents) * 100;
  if (lowMatchPercentage > 40) {
    alerts.push({
      severity: "warning",
      icon: "⚠️",
      title: "Overall Readiness Concern",
      description: `${Math.round(
        lowMatchPercentage
      )}% of students have match scores below 60%. Review curriculum alignment.`,
      action: "Review Curriculum",
    });
  }

  return alerts;
}

function generateAlerts(topSkills) {
  const alerts = [];
  if (topSkills.length > 0) {
    const top = topSkills[0];
    alerts.push({
      severity: "warning",
      icon: "⚠️",
      title: `${top.skill} Skills Gap Detected`,
      description: `Many students are missing ${top.skill} skills for their target roles`,
      count: top.count,
    });
  }
  return alerts;
}

function getMockAnalytics() {
  // Return mock data when BigQuery is not configured
  return {
    stats: {
      totalStudents: 0,
      uniqueSkills: 0,
      averageMatch: 0,
      totalDepartments: 0,
    },
    alerts: [],
    topMissingSkills: [],
    departmentStats: [],
    matchDistribution: { high: 0, medium: 0, low: 0, veryLow: 0 },
    trends: [],
    recentActivity: [],
  };
}

// Get skill gap heatmap data
app.get("/api/heatmap", async (req, res) => {
  try {
    const heatmapData = db
      .prepare(
        `
      SELECT department, academic_year, skill_name, COUNT(*) as intensity
      FROM skill_gaps sg
      JOIN skill_analytics sa ON sa.department = sg.department
      GROUP BY department, academic_year, skill_name
      ORDER BY intensity DESC
    `
      )
      .all();

    res.json({ heatmapData });
  } catch (error) {
    console.error("Heatmap error:", error);
    res.status(500).json({ error: "Failed to generate heatmap" });
  }
});

// Export data endpoint
app.get("/api/export", async (req, res) => {
  try {
    const { format, department, academicYear } = req.query;

    let whereClause = "1=1";
    const params = [];

    if (department) {
      whereClause += " AND department = ?";
      params.push(department);
    }
    if (academicYear) {
      whereClause += " AND academic_year = ?";
      params.push(academicYear);
    }

    const data = db
      .prepare(
        `
      SELECT student_name, department, academic_year, job_role, company_name,
             match_percentage, missing_skills, matched_skills, timestamp
      FROM skill_gaps
      WHERE ${whereClause}
      ORDER BY timestamp DESC
    `
      )
      .all(...params);

    if (format === "csv") {
      // Convert to CSV
      const csv = convertToCSV(data);
      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        "attachment; filename=skillsync_export.csv"
      );
      res.send(csv);
    } else {
      // JSON format
      res.json({ data, total: data.length });
    }
  } catch (error) {
    console.error("Export error:", error);
    res.status(500).json({ error: "Export failed" });
  }
});

// Helper function to convert data to CSV
function convertToCSV(data) {
  if (data.length === 0) return "";

  const headers = Object.keys(data[0]);
  const rows = data.map((row) =>
    headers
      .map((header) => {
        const value = row[header];
        // Handle JSON fields
        if (typeof value === "object") return JSON.stringify(value);
        // Escape quotes
        if (typeof value === "string") return `"${value.replace(/"/g, '""')}"`;
        return value;
      })
      .join(",")
  );

  return [headers.join(","), ...rows].join("\n");
}

// Get company-specific readiness
app.get("/api/company-readiness/:company", async (req, res) => {
  try {
    const { company } = req.params;

    const students = db
      .prepare(
        `
      SELECT student_name, department, academic_year, match_percentage, 
             missing_skills, timestamp
      FROM skill_gaps
      WHERE company_name = ?
      ORDER BY match_percentage DESC
    `
      )
      .all(company);

    // Aggregate missing skills for this company
    const skillCount = {};
    students.forEach((student) => {
      try {
        const skills = JSON.parse(student.missing_skills || "[]");
        skills.forEach((skill) => {
          skillCount[skill] = (skillCount[skill] || 0) + 1;
        });
      } catch (e) {}
    });

    const topMissingForCompany = Object.entries(skillCount)
      .map(([skill, count]) => ({ skill, count }))
      .sort((a, b) => b.count - a.count);

    const avgReadiness =
      students.reduce((sum, s) => sum + s.match_percentage, 0) /
        students.length || 0;

    res.json({
      company,
      totalStudents: students.length,
      averageReadiness: Math.round(avgReadiness),
      topMissingSkills: topMissingForCompany.slice(0, 10),
      students: students.map((s) => ({
        name: s.student_name,
        department: s.department,
        year: s.academic_year,
        readiness: Math.round(s.match_percentage),
        date: s.timestamp,
      })),
    });
  } catch (error) {
    console.error("Company readiness error:", error);
    res.status(500).json({ error: "Failed to analyze company readiness" });
  }
});

// Get skill explanations endpoint
app.post("/api/explain-skill", async (req, res) => {
  try {
    const { skill } = req.body;

    if (!skill) {
      return res.status(400).json({ error: "Skill name required" });
    }

    if (!genAI) {
      return res.status(500).json({ error: "Gemini API not configured" });
    }

    const model = genAI.getGenerativeModel({ model: availableModel });
    const prompt = `Explain the technical skill "${skill}" in 2-3 beginner-friendly sentences. 
    Include: what it is, why it's important, and a brief example of where it's used. 
    Return only the explanation text, no extra formatting.`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const explanation = response.text();

    res.json({ skill, explanation });
  } catch (error) {
    console.error("Skill explanation error:", error);
    res.status(500).json({ error: "Failed to generate explanation" });
  }
});

// Get departments list
app.get("/api/departments", (req, res) => {
  try {
    const departments = db
      .prepare(
        `
      SELECT DISTINCT department, COUNT(*) as count
      FROM skill_gaps
      WHERE department != 'Unknown'
      GROUP BY department
      ORDER BY count DESC
    `
      )
      .all();

    res.json({ departments });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch departments" });
  }
});

// Get academic years list
app.get("/api/academic-years", (req, res) => {
  try {
    const years = db
      .prepare(
        `
      SELECT DISTINCT academic_year, COUNT(*) as count
      FROM skill_gaps
      WHERE academic_year != 'Not Specified'
      GROUP BY academic_year
      ORDER BY academic_year DESC
    `
      )
      .all();

    res.json({ years });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch academic years" });
  }
});

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    gemini: !!genAI,
    database: "SQLite",
    timestamp: new Date().toISOString(),
  });
});

// Test Gemini API connection
app.get("/api/test-gemini", async (req, res) => {
  try {
    if (!genAI) {
      return res.status(500).json({ error: "Gemini API not configured" });
    }

    const model = genAI.getGenerativeModel({ model: availableModel });
    const result = await model.generateContent(
      'Say hello in JSON format: {"message": "hello"}'
    );
    const response = await result.response;
    const text = response.text();

    res.json({
      status: "success",
      message: "Gemini API is working",
      model: availableModel,
      response: text,
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      error: error.message,
      details: error.toString(),
    });
  }
});

// Serve frontend
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Global Error Handler (Moved before app.listen)
app.use((err, req, res, next) => {
  console.error("Unhandled Error:", err);
  res.status(500).json({
    error: "Internal Server Error",
    message: process.env.NODE_ENV === "production" ? "Something went wrong" : err.message
  });
});

// Start server
app.listen(PORT, () => {
  console.log("🚀 SkillSync Server Started");
  console.log(`📍 Server running at http://localhost:${PORT}`);
  console.log("");
  console.log("Configuration Status:");
  console.log(`  Gemini API: ${genAI ? "✅ Configured" : "❌ Not configured"}`);
  console.log(`  Database: ✅ SQLite (Local)`);
  console.log("");
  console.log("Endpoints:");
  console.log(`  Student Interface: http://localhost:${PORT}`);
  console.log(`  Admin Dashboard: http://localhost:${PORT}/admin.html`);
  console.log(`  API Health: http://localhost:${PORT}/api/health`);
  console.log("");
  if (!genAI) {
    console.log("⚠️ Please configure GEMINI_API_KEY in .env file");
  }
});

module.exports = app;
