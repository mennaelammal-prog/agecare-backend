console.log("--- .env ---");
require('fs').readFileSync('.env','utf8').split(/\r?\n/).forEach(l => console.log(l));
console.log("--- db/client.js ---");
console.log(require('fs').readFileSync('src/db/client.js','utf8'));
console.log("--- pg Pool effective connection ---");
const { Pool } = require('pg');
const probe = new Pool({ connectionString: process.env.DATABASE_URL || 'NO DATABASE_URL ENV' });
probe.query('SELECT current_user').then(r => { console.log('current_user =', r.rows[0].current_user); process.exit(0); }).catch(e => { console.log('POOL ERR:', e.message); process.exit(1); });