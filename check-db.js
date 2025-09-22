// Simple script to check the database directly
const path = require('path');
const sqlite3 = require('sqlite3');

const dbPath = path.join(__dirname, 'prisma', 'dev.db');
console.log('Database path:', dbPath);

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err);
    return;
  }
  console.log('Connected to SQLite database');
});

// Check users table
db.all('SELECT id, email, first_name, last_name, credits FROM users LIMIT 5', (err, rows) => {
  if (err) {
    console.error('Error querying users:', err);
    return;
  }
  console.log('\nUsers in database:');
  console.table(rows);

  // Check credit transactions
  if (rows.length > 0) {
    const userId = rows[0].id;
    db.all('SELECT * FROM credit_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 5', [userId], (err, transactions) => {
      if (err) {
        console.error('Error querying transactions:', err);
      } else {
        console.log('\nCredit transactions for first user:');
        console.table(transactions);
      }

      // Check processing jobs
      db.all(`
        SELECT j.id, j.status, j.credits_used, j.created_at
        FROM processing_jobs j
        JOIN projects p ON j.project_id = p.id
        WHERE p.user_id = ?
        ORDER BY j.created_at DESC LIMIT 5
      `, [userId], (err, jobs) => {
        if (err) {
          console.error('Error querying jobs:', err);
        } else {
          console.log('\nProcessing jobs for first user:');
          console.table(jobs);
        }

        db.close();
      });
    });
  } else {
    db.close();
  }
});