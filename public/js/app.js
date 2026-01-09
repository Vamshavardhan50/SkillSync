// SkillSync - Main Application Logic

let resumeText = "";
let currentAnalysis = null;

// Initialize
document.addEventListener("DOMContentLoaded", () => {
  setupEventListeners();
  setupDragDrop();
  addScoreGradient();
});

function setupEventListeners() {
  document
    .getElementById("resumeFile")
    .addEventListener("change", handleFileSelect);
  document
    .getElementById("analyzeBtn")
    .addEventListener("click", analyzeSkills);
}

function setupDragDrop() {
  const uploadZone = document.getElementById("uploadZone");

  ["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
    uploadZone.addEventListener(eventName, preventDefaults);
  });

  ["dragenter", "dragover"].forEach((eventName) => {
    uploadZone.addEventListener(eventName, () =>
      uploadZone.classList.add("dragover")
    );
  });

  ["dragleave", "drop"].forEach((eventName) => {
    uploadZone.addEventListener(eventName, () =>
      uploadZone.classList.remove("dragover")
    );
  });

  uploadZone.addEventListener("drop", handleDrop);
}

function preventDefaults(e) {
  e.preventDefault();
  e.stopPropagation();
}

function handleDrop(e) {
  const files = e.dataTransfer.files;
  if (files.length > 0) {
    handleFile(files[0]);
  }
}

function handleFileSelect(e) {
  const file = e.target.files[0];
  if (file) {
    handleFile(file);
  }
}

async function handleFile(file) {
  const uploadZone = document.getElementById("uploadZone");
  const fileTypes = uploadZone.querySelector(".file-types");

  if (!file.type.match("application/pdf|image/png|image/jpeg|image/jpg")) {
    alert("Please upload PDF, PNG, or JPG files only");
    return;
  }

  if (file.size > 5 * 1024 * 1024) {
    alert("File size must be less than 5MB");
    return;
  }

  // Show loading
  uploadZone.querySelector("h3").textContent = "Processing...";
  fileTypes.textContent = "Extracting text from your resume...";

  try {
    if (file.type === "application/pdf") {
      resumeText = await extractTextFromPDF(file);
    } else {
      resumeText = await extractTextFromImage(file);
    }

    uploadZone.querySelector("h3").textContent =
      "✅ Resume Uploaded Successfully";
    uploadZone.querySelector("p").textContent = `${file.name} (${(
      file.size / 1024
    ).toFixed(1)} KB)`;
    fileTypes.textContent = `${resumeText.length} characters extracted`;
    uploadZone.style.borderColor = "var(--success)";
    uploadZone.style.background = "#10b98110";
  } catch (error) {
    console.error("Error processing file:", error);
    alert("Error processing file. Please try again.");
    uploadZone.querySelector("h3").textContent = "Upload Your Resume";
    uploadZone.querySelector("p").textContent =
      "Drop your resume here or click to browse";
    fileTypes.textContent = "PDF, PNG, JPG (Max 5MB)";
  }
}

async function extractTextFromPDF(file) {
  // For PDF, we'll use a simple approach - in production, use PDF.js
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // Basic PDF text extraction (simplified)
      const text = reader.result;
      resolve(text.substring(0, 5000)); // Limit for demo
    };
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

async function extractTextFromImage(file) {
  return new Promise((resolve, reject) => {
    Tesseract.recognize(file, "eng", {
      logger: (info) => {
        if (info.status === "recognizing text") {
          document.querySelector(".file-types").textContent = `Processing: ${(
            info.progress * 100
          ).toFixed(0)}%`;
        }
      },
    })
      .then(({ data: { text } }) => {
        resolve(text);
      })
      .catch(reject);
  });
}

async function analyzeSkills() {
  const studentName = document.getElementById("studentName").value.trim();
  const department = document.getElementById("department").value;
  const academicYear = document.getElementById("academicYear").value;
  const companyName = document.getElementById("companyName").value.trim();
  const jobDescription = document.getElementById("jobDescription").value.trim();

  if (!resumeText) {
    alert("Please upload your resume first");
    return;
  }

  if (!jobDescription) {
    alert("Please enter a job description");
    return;
  }

  // Check authentication
  const token =
    localStorage.getItem("token") || sessionStorage.getItem("token");
  if (!token) {
    alert("Please login to analyze your skills");
    window.location.href = "login.html";
    return;
  }

  // Show loading
  document.getElementById("loadingState").style.display = "block";
  document.getElementById("analyzeBtn").disabled = true;

  try {
    const response = await fetch(API_CONFIG.baseURL + "/api/analyze", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        resumeText,
        jobDescription,
        studentName,
        department,
        academicYear,
        companyName,
      }),
    });

    if (response.status === 401 || response.status === 403) {
      alert("Session expired. Please login again.");
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      sessionStorage.removeItem("token");
      window.location.href = "login.html";
      return;
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error("API Error:", errorData);
      throw new Error(errorData.error || "Analysis failed");
    }

    const result = await response.json();
    currentAnalysis = result;
    displayResults(result);
  } catch (error) {
    console.error("Analysis error:", error);
    alert("Analysis failed: " + error.message);
  } finally {
    document.getElementById("loadingState").style.display = "none";
    document.getElementById("analyzeBtn").disabled = false;
  }
}

function displayResults(result) {
  // Hide input panel, show results
  document.querySelector(".input-panel").style.display = "none";
  document.getElementById("resultsPanel").style.display = "block";

  // Update match score
  const score = result.matchPercentage || 0;
  document.getElementById("matchScore").textContent = score + "%";
  animateScore(score);

  // Update score description
  updateScoreDescription(score);

  // Display matched skills
  const matchedContainer = document.getElementById("matchedSkills");
  matchedContainer.innerHTML =
    result.matchedSkills
      ?.map((skill) => `<span class="skill-tag matched">${skill}</span>`)
      .join("") || "<p>No matched skills found</p>";

  // Display missing skills with priorities
  const missingContainer = document.getElementById("missingSkills");
  if (result.missingSkills && result.missingSkills.length > 0) {
    const skillPriority = result.skillPriority || {
      critical: [],
      important: [],
      optional: [],
    };

    let skillsHTML = "";

    // Critical skills
    if (skillPriority.critical && skillPriority.critical.length > 0) {
      skillsHTML +=
        '<div class="priority-section"><h4 class="priority-label critical">🚨 Critical Skills</h4>';
      skillPriority.critical.forEach((skill) => {
        skillsHTML += `<span class="skill-tag missing critical">${skill}</span>`;
      });
      skillsHTML += "</div>";
    }

    // Important skills
    if (skillPriority.important && skillPriority.important.length > 0) {
      skillsHTML +=
        '<div class="priority-section"><h4 class="priority-label important">⚠️ Important Skills</h4>';
      skillPriority.important.forEach((skill) => {
        skillsHTML += `<span class="skill-tag missing important">${skill}</span>`;
      });
      skillsHTML += "</div>";
    }

    // Optional skills
    if (skillPriority.optional && skillPriority.optional.length > 0) {
      skillsHTML +=
        '<div class="priority-section"><h4 class="priority-label optional">💡 Optional Skills</h4>';
      skillPriority.optional.forEach((skill) => {
        skillsHTML += `<span class="skill-tag missing optional">${skill}</span>`;
      });
      skillsHTML += "</div>";
    }

    // Fallback if no priority data
    if (!skillsHTML) {
      skillsHTML = result.missingSkills
        .map((skill) => `<span class="skill-tag missing">${skill}</span>`)
        .join("");
    }

    missingContainer.innerHTML = skillsHTML;
  } else {
    missingContainer.innerHTML = "<p>Great! You have all required skills!</p>";
  }

  // Display skill explanations
  if (result.skillExplanations && result.skillExplanations.length > 0) {
    const explanationsSection = document.getElementById(
      "skillExplanationsSection"
    );
    const explanationsContainer = document.getElementById("skillExplanations");

    if (explanationsSection && explanationsContainer) {
      explanationsSection.style.display = "block";
      explanationsContainer.innerHTML = result.skillExplanations
        .map(
          (exp) => `
          <div class="skill-explanation">
            <h4>${exp.skill}</h4>
            <p class="explanation">${exp.explanation}</p>
            ${
              exp.importance
                ? `<p class="importance"><strong>Why it matters:</strong> ${exp.importance}</p>`
                : ""
            }
          </div>
        `
        )
        .join("");
    }
  }

  // Display recommendations with priority
  const recsContainer = document.getElementById("recommendationsList");
  if (result.recommendations && result.recommendations.length > 0) {
    recsContainer.innerHTML = result.recommendations
      .map((rec) => {
        const priority = rec.priority || "optional";
        return `
        <div class="recommendation-item ${priority}">
          <div class="rec-header">
            <h4>${rec.skill}</h4>
            <span class="priority-badge ${priority}">${priority}</span>
          </div>
          <p>${rec.description}</p>
        </div>
      `;
      })
      .join("");
  } else {
    recsContainer.innerHTML = "<p>No specific recommendations at this time</p>";
  }

  // Scroll to results
  document
    .getElementById("resultsPanel")
    .scrollIntoView({ behavior: "smooth" });
}

function animateScore(score) {
  const circle = document.getElementById("scoreCircle");
  const circumference = 2 * Math.PI * 85;
  const offset = circumference - (score / 100) * circumference;
  circle.style.strokeDashoffset = offset;
}

function updateScoreDescription(score) {
  const title = document.getElementById("scoreTitle");
  const desc = document.getElementById("scoreDesc");

  if (score >= 80) {
    title.textContent = "Excellent Match! 🎉";
    desc.textContent = "You have most of the required skills for this role";
  } else if (score >= 60) {
    title.textContent = "Good Match! 👍";
    desc.textContent =
      "You meet many requirements, focus on improving key skills";
  } else if (score >= 40) {
    title.textContent = "Partial Match 📚";
    desc.textContent = "You need to develop several skills to be job-ready";
  } else {
    title.textContent = "Skills Gap Detected ⚠️";
    desc.textContent = "Focus on building fundamental skills for this role";
  }
}

function addScoreGradient() {
  const svg = document.querySelector(".score-ring");
  if (svg) {
    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    const gradient = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "linearGradient"
    );
    gradient.setAttribute("id", "scoreGradient");
    gradient.innerHTML = `
            <stop offset="0%" style="stop-color:#667eea;stop-opacity:1" />
            <stop offset="100%" style="stop-color:#764ba2;stop-opacity:1" />
        `;
    defs.appendChild(gradient);
    svg.insertBefore(defs, svg.firstChild);
  }
}

function resetAnalysis() {
  document.querySelector(".input-panel").style.display = "block";
  document.getElementById("resultsPanel").style.display = "none";

  // Reset form
  document.getElementById("resumeFile").value = "";
  document.getElementById("studentName").value = "";
  document.getElementById("department").value = "";
  document.getElementById("jobDescription").value = "";
  resumeText = "";

  // Reset upload zone
  const uploadZone = document.getElementById("uploadZone");
  uploadZone.querySelector("h3").textContent = "Upload Your Resume";
  uploadZone.querySelector("p").textContent =
    "Drop your resume here or click to browse";
  uploadZone.querySelector(".file-types").textContent =
    "PDF, PNG, JPG (Max 5MB)";
  uploadZone.style.borderColor = "";
  uploadZone.style.background = "";

  // Scroll to top
  window.scrollTo({ top: 0, behavior: "smooth" });
}
