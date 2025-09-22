// Script to create a test user with known credentials
const path = require('path');
const sqlite3 = require('sqlite3');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');

const dbPath = path.join(__dirname, 'prisma', 'dev.db');

async function createTestUser() {
  const db = new sqlite3.Database(dbPath);

  try {
    const password = 'testpass123';
    const hashedPassword = await bcrypt.hash(password, 12);
    const userId = `test-user-${Date.now()}`;

    // Insert test user with 800 credits
    const insertQuery = `
      INSERT INTO users (id, email, password, first_name, last_name, credits, is_active, role, license_type, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const now = new Date().toISOString();

    db.run(insertQuery, [
      userId,
      'testcredits@videomix.pro',
      hashedPassword,
      'Test',
      'Credits',
      800,
      1,
      'USER',
      'FREE',
      now,
      now
    ], function(err) {
      if (err) {
        console.error('Error creating user:', err);
      } else {
        console.log('Test user created successfully:');
        console.log('Email: testcredits@videomix.pro');
        console.log('Password: testpass123');
        console.log('Credits: 800');
        console.log('User ID:', userId);
      }
      db.close();
    });

  } catch (error) {
    console.error('Error:', error);
    db.close();
  }
}

createTestUser();