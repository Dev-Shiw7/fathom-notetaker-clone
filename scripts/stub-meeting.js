#!/usr/bin/env node
const fs = require('fs');

const file = process.argv[2] || 'scripts/sample-stub.json';
const url = process.env.STUB_URL || 'http://localhost:3000/api/stub/meeting';

async function run() {
  if (!fs.existsSync(file)) {
    console.error('Stub file not found:', file);
    process.exit(2);
  }
  const body = JSON.parse(fs.readFileSync(file, 'utf8'));

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const json = await res.json();
  console.log('Response:', json);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
