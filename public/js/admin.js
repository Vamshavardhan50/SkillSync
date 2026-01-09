// Admin Dashboard Logic

let charts = {};

document.addEventListener("DOMContentLoaded", () => {
  checkAuthentication();
  loadDashboardData();
});

// Check if user is authenticated and is admin
function checkAuthentication() {
  const token = localStorage.getItem("token");
  const user = JSON.parse(localStorage.getItem("user") || "{}");

  if (!token) {
    alert("Please login to access the admin dashboard");
    window.location.href = "admin-login.html";
    return;
  }

  if (user.role !== "admin") {
    alert("Access denied. Admin privileges required.");
    window.location.href = "index.html";
    return;
  }
}

async function loadDashboardData() {
  try {
    const token = localStorage.getItem("token");

    if (!token) {
      window.location.href = "admin-login.html";
      return;
    }

    const response = await fetch(API_CONFIG.baseURL + "/api/analytics", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (response.status === 401 || response.status === 403) {
      alert("Session expired or access denied. Please login again.");
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      window.location.href = "admin-login.html";
      return;
    }

    const data = await response.json();
    updateDashboard(data);
  } catch (error) {
    console.error("Error loading dashboard data:", error);
    alert("Failed to load dashboard data. Please try again.");
  }
}

function updateDashboard(data) {
  // Update stats
  document.getElementById("totalStudents").textContent =
    data.stats.totalStudents || 0;
  document.getElementById("uniqueSkills").textContent =
    data.stats.uniqueSkills || 0;
  document.getElementById("averageMatch").textContent =
    (data.stats.averageMatch || 0) + "%";
  document.getElementById("totalDepartments").textContent =
    data.stats.totalDepartments || 0;

  // Update charts
  updateTopSkillsChart(data.topMissingSkills || []);
  updateMatchDistChart(data.matchDistribution || {});
  updateDepartmentChart(data.departmentStats || []);
  updateYearChart(data.academicYearStats || []);
  updateCompanyChart(data.companyStats || []);
  updateTrendingChart(data.trendingSkills || []);
  updatePriorityChart(data.skillPriorityBreakdown || {});

  // Update activity
  updateActivity(data.recentActivity || []);

  // Update alerts
  if (data.alerts && data.alerts.length > 0) {
    updateAlerts(data.alerts);
  }

  // Load filter options
  loadFilterOptions();
}

function updateTopSkillsChart(skills) {
  const ctx = document.getElementById("topSkillsChart");

  if (charts.topSkills) {
    charts.topSkills.destroy();
  }

  if (skills.length === 0) {
    ctx.parentElement.innerHTML =
      '<div class="empty-state">No skill data available</div>';
    return;
  }

  charts.topSkills = new Chart(ctx, {
    type: "bar",
    data: {
      labels: skills.map((s) => s.skill).slice(0, 10),
      datasets: [
        {
          label: "Students Missing This Skill",
          data: skills.map((s) => s.count).slice(0, 10),
          backgroundColor: "rgba(102, 126, 234, 0.8)",
          borderColor: "rgba(102, 126, 234, 1)",
          borderWidth: 2,
          borderRadius: 8,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          display: false,
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            precision: 0,
          },
        },
      },
    },
  });
}

function updateMatchDistChart(distribution) {
  const ctx = document.getElementById("matchDistChart");

  if (charts.matchDist) {
    charts.matchDist.destroy();
  }

  charts.matchDist = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: [
        "High (80-100%)",
        "Medium (60-79%)",
        "Low (40-59%)",
        "Very Low (<40%)",
      ],
      datasets: [
        {
          data: [
            distribution.high || 0,
            distribution.medium || 0,
            distribution.low || 0,
            distribution.veryLow || 0,
          ],
          backgroundColor: ["#10b981", "#f59e0b", "#ef4444", "#6b7280"],
          borderWidth: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          position: "bottom",
        },
      },
    },
  });
}

function updateDepartmentChart(departments) {
  const ctx = document.getElementById("departmentChart");

  if (charts.department) {
    charts.department.destroy();
  }

  if (departments.length === 0) {
    ctx.parentElement.innerHTML =
      '<div class="empty-state">No department data available</div>';
    return;
  }

  charts.department = new Chart(ctx, {
    type: "bar",
    data: {
      labels: departments.map((d) => d.department),
      datasets: [
        {
          label: "Number of Students",
          data: departments.map((d) => d.count),
          backgroundColor: "rgba(118, 75, 162, 0.8)",
          borderColor: "rgba(118, 75, 162, 1)",
          borderWidth: 2,
          borderRadius: 8,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      indexAxis: "y",
      plugins: {
        legend: {
          display: false,
        },
      },
      scales: {
        x: {
          beginAtZero: true,
          ticks: {
            precision: 0,
          },
        },
      },
    },
  });
}

function updateActivity(activities) {
  const container = document.getElementById("activityList");

  if (activities.length === 0) {
    container.innerHTML = '<div class="empty-state">No recent activity</div>';
    return;
  }

  container.innerHTML = activities
    .map((activity) => {
      const scoreClass =
        activity.matchScore >= 80
          ? "high"
          : activity.matchScore >= 60
          ? "medium"
          : "low";

      const date = new Date(activity.timestamp);
      const timeAgo = getTimeAgo(date);

      return `
            <div class="activity-item">
                <div class="activity-info">
                    <div class="activity-job">${
                      activity.jobRole || "Job Analysis"
                    }</div>
                    <div class="activity-meta">
                        ${activity.department || "Unknown"} • ${timeAgo}
                        ${
                          activity.topSkills.length > 0
                            ? " • Missing: " + activity.topSkills.join(", ")
                            : ""
                        }
                    </div>
                </div>
                <div class="activity-score ${scoreClass}">
                    ${activity.matchScore}%
                </div>
            </div>
        `;
    })
    .join("");
}

function updateAlerts(alerts) {
  const section = document.getElementById("alertsSection");
  const container = document.getElementById("alertsList");

  section.style.display = "block";

  container.innerHTML = alerts
    .map(
      (alert) => `
        <div class="alert-item ${alert.severity}">
            <div class="alert-title">
                ${alert.icon || "⚠️"} ${alert.title}
                ${
                  alert.count
                    ? `<span class="alert-count">${alert.count}</span>`
                    : ""
                }
            </div>
            <div class="alert-desc">${alert.description}</div>
        </div>
    `
    )
    .join("");
}

function getTimeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);

  if (seconds < 60) return "Just now";
  if (seconds < 3600) return Math.floor(seconds / 60) + " minutes ago";
  if (seconds < 86400) return Math.floor(seconds / 3600) + " hours ago";
  if (seconds < 604800) return Math.floor(seconds / 86400) + " days ago";
  return date.toLocaleDateString();
}

// New chart functions
function updateYearChart(yearStats) {
  const ctx = document.getElementById("yearChart");

  if (charts.yearChart) {
    charts.yearChart.destroy();
  }

  if (!yearStats || yearStats.length === 0) {
    ctx.parentElement.innerHTML =
      '<div class="empty-state">No year data available</div>';
    return;
  }

  charts.yearChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: yearStats.map((y) => y.year),
      datasets: [
        {
          label: "Students",
          data: yearStats.map((y) => y.count),
          backgroundColor: "rgba(118, 75, 162, 0.8)",
          borderColor: "rgba(118, 75, 162, 1)",
          borderWidth: 2,
          borderRadius: 8,
        },
        {
          label: "Avg Match %",
          data: yearStats.map((y) => y.avgMatch),
          type: "line",
          borderColor: "rgba(102, 126, 234, 1)",
          backgroundColor: "rgba(102, 126, 234, 0.1)",
          yAxisID: "y1",
        },
      ],
    },
    options: {
      responsive: true,
      scales: {
        y: {
          beginAtZero: true,
          position: "left",
          title: { display: true, text: "Number of Students" },
        },
        y1: {
          beginAtZero: true,
          position: "right",
          max: 100,
          title: { display: true, text: "Avg Match %" },
          grid: { drawOnChartArea: false },
        },
      },
    },
  });
}

function updateCompanyChart(companyStats) {
  const ctx = document.getElementById("companyChart");

  if (charts.companyChart) {
    charts.companyChart.destroy();
  }

  if (!companyStats || companyStats.length === 0) {
    ctx.parentElement.innerHTML =
      '<div class="empty-state">No company data available</div>';
    return;
  }

  const topCompanies = companyStats.slice(0, 8);

  charts.companyChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: topCompanies.map((c) => c.company),
      datasets: [
        {
          label: "Average Readiness %",
          data: topCompanies.map((c) => c.avgReadiness),
          backgroundColor: topCompanies.map((c) =>
            c.avgReadiness >= 80
              ? "rgba(16, 185, 129, 0.8)"
              : c.avgReadiness >= 60
              ? "rgba(245, 158, 11, 0.8)"
              : "rgba(239, 68, 68, 0.8)"
          ),
          borderRadius: 8,
          borderWidth: 2,
        },
      ],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      scales: {
        x: {
          beginAtZero: true,
          max: 100,
          title: { display: true, text: "Readiness %" },
        },
      },
    },
  });
}

function updateTrendingChart(trendingSkills) {
  const ctx = document.getElementById("trendingChart");

  if (charts.trendingChart) {
    charts.trendingChart.destroy();
  }

  if (!trendingSkills || trendingSkills.length === 0) {
    ctx.parentElement.innerHTML =
      '<div class="empty-state">No trending data available</div>';
    return;
  }

  charts.trendingChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: trendingSkills.map((s) => s.skill).slice(0, 6),
      datasets: [
        {
          label: "Occurrences",
          data: trendingSkills.map((s) => s.total).slice(0, 6),
          borderColor: "rgba(239, 68, 68, 1)",
          backgroundColor: "rgba(239, 68, 68, 0.1)",
          tension: 0.4,
          fill: true,
        },
      ],
    },
    options: {
      responsive: true,
      scales: {
        y: { beginAtZero: true },
      },
    },
  });
}

function updatePriorityChart(priorityData) {
  const ctx = document.getElementById("priorityChart");

  if (charts.priorityChart) {
    charts.priorityChart.destroy();
  }

  const critical = priorityData.critical?.length || 0;
  const important = priorityData.important?.length || 0;
  const optional = priorityData.optional?.length || 0;

  if (critical + important + optional === 0) {
    ctx.parentElement.innerHTML =
      '<div class="empty-state">No priority data available</div>';
    return;
  }

  charts.priorityChart = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: ["Critical", "Important", "Optional"],
      datasets: [
        {
          data: [critical, important, optional],
          backgroundColor: [
            "rgba(239, 68, 68, 0.8)",
            "rgba(245, 158, 11, 0.8)",
            "rgba(59, 130, 246, 0.8)",
          ],
          borderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: "bottom" },
      },
    },
  });
}

// Filter functions
async function loadFilterOptions() {
  try {
    const token = localStorage.getItem("token");
    const headers = token ? { Authorization: `Bearer ${token}` } : {};

    const [deptResp, yearResp] = await Promise.all([
      fetch(API_CONFIG.baseURL + "/api/departments", { headers }),
      fetch(API_CONFIG.baseURL + "/api/academic-years", { headers }),
    ]);

    const deptData = await deptResp.json();
    const yearData = await yearResp.json();

    const deptFilter = document.getElementById("departmentFilter");
    const yearFilter = document.getElementById("yearFilter");

    if (deptData.departments) {
      deptData.departments.forEach((d) => {
        const option = document.createElement("option");
        option.value = d.department;
        option.textContent = `${d.department} (${d.count})`;
        deptFilter.appendChild(option);
      });
    }

    if (yearData.years) {
      yearData.years.forEach((y) => {
        const option = document.createElement("option");
        option.value = y.academic_year;
        option.textContent = `${y.academic_year} (${y.count})`;
        yearFilter.appendChild(option);
      });
    }
  } catch (error) {
    console.error("Error loading filters:", error);
  }
}

async function applyFilters() {
  const department = document.getElementById("departmentFilter").value;
  const year = document.getElementById("yearFilter").value;

  const params = new URLSearchParams();
  if (department) params.append("department", department);
  if (year) params.append("academicYear", year);

  try {
    const token = localStorage.getItem("token");
    const response = await fetch(
      API_CONFIG.baseURL + "/api/analytics?" + params.toString(),
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
    const data = await response.json();
    updateDashboard(data);
  } catch (error) {
    console.error("Error applying filters:", error);
  }
}

async function exportData() {
  const department = document.getElementById("departmentFilter").value;
  const year = document.getElementById("yearFilter").value;

  const params = new URLSearchParams({ format: "csv" });
  if (department) params.append("department", department);
  if (year) params.append("academicYear", year);

  window.open(
    API_CONFIG.baseURL + "/api/export?" + params.toString(),
    "_blank"
  );
}
