// Create Admin User Script
// Run this script once to create your first admin user
// Usage: node create-admin.js

require("dotenv").config();
const Database = require("better-sqlite3");
const bcrypt = require("bcrypt");
const path = require("path");
const readline = require("readline");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

async function createAdmin() {
  console.log("\n🔐 SkillSync - Create Admin User\n");
  console.log("=================================\n");

  // Connect to database
  const db = new Database(path.join(__dirname, "data", "skillsync.db"));

  // Get admin details from user
  rl.question("Admin Email: ", (email) => {
    rl.question("Admin Full Name: ", (fullName) => {
      rl.question("Admin Password: ", async (password) => {
        rl.close();

        try {
          // Check if admin already exists
          const existing = db
            .prepare("SELECT id FROM users WHERE email = ?")
            .get(email);

          if (existing) {
            console.log("\n❌ Error: User with this email already exists!\n");
            process.exit(1);
          }

          // Hash password
          console.log("\n⏳ Creating admin user...");
          const hashedPassword = await bcrypt.hash(password, 10);

          // Insert admin user
          const stmt = db.prepare(`
            INSERT INTO users (email, password, full_name, role)
            VALUES (?, ?, ?, 'admin')
          `);

          const result = stmt.run(email, hashedPassword, fullName);

          console.log("\n✅ Admin user created successfully!");
          console.log("\n📋 Admin Details:");
          console.log("   ID:", result.lastInsertRowid);
          console.log("   Email:", email);
          console.log("   Name:", fullName);
          console.log("   Role: admin");
          console.log(
            "\n🔑 You can now login at: http://localhost:3000/admin-login.html\n"
          );

          db.close();
          process.exit(0);
        } catch (error) {
          console.error("\n❌ Error creating admin:", error.message);
          db.close();
          process.exit(1);
        }
      });
    });
  });
}

createAdmin();
