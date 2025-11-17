const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '../database/devcollab.db');

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
        process.exit(1);
    } else {
        console.log('Connected to SQLite database');
        addGithubColumns();
    }
});

function addGithubColumns() {
    console.log('Adding GitHub-related columns to Projects table...');

    const columns = [
        { name: 'githubRepoUrl', definition: 'TEXT' },
        { name: 'githubOwner', definition: 'TEXT' },
        { name: 'githubRepo', definition: 'TEXT' }
    ];

    let completed = 0;
    const total = columns.length;

    columns.forEach(column => {
        db.run(
            `ALTER TABLE Projects ADD COLUMN ${column.name} ${column.definition}`,
            (err) => {
                if (err) {
                    if (err.message.includes('duplicate column')) {
                        console.log(`✓ Column ${column.name} already exists`);
                    } else {
                        console.error(`✗ Error adding ${column.name} column:`, err.message);
                    }
                } else {
                    console.log(`✓ Added column ${column.name}`);
                }

                completed++;
                if (completed === total) {
                    console.log('\nMigration completed!');
                    db.close((closeErr) => {
                        if (closeErr) {
                            console.error('Error closing database:', closeErr.message);
                        } else {
                            console.log('Database connection closed');
                        }
                        process.exit(0);
                    });
                }
            }
        );
    });
}
