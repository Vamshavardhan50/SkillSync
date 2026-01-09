// API Configuration
const API_CONFIG = {
  baseURL:
    window.location.hostname === "localhost" ? "http://localhost:3000" : "",
};
if (CONFIG.GEMINI_API_KEY === "YOUR_GEMINI_API_KEY_HERE") {
  console.warn("⚠️ Please configure your Gemini API key in js/config.js");
}
