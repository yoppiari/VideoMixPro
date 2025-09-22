// Script to check user passwords (hashed)
const path = require('path');
const sqlite3 = require('sqlite3');

const dbPath = path.join(__dirname, 'prisma', 'dev.db');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err);
    return;
  }
  console.log('Connected to SQLite database');
});

// Check users and their hashed passwords
db.all('SELECT id, email, password, first_name, last_name, credits FROM users', (err, rows) => {
  if (err) {
    console.error('Error querying users:', err);
    return;
  }
  console.log('\nUsers in database:');
  rows.forEach(user => {
    console.log(`Email: ${user.email}`);
    console.log(`Name: ${user.first_name} ${user.last_name}`);
    console.log(`Credits: ${user.credits}`);
    console.log(`Password hash: ${user.password.substring(0, 20)}...`);
    console.log('---');
  });

  db.close();
});