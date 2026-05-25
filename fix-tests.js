const fs = require('fs');

// Read the corrupted file - we need its original structure minus the param blocks
let c = fs.readFileSync('tests/unit/wallet.service.test.ts', 'utf8');

// Remove ALL param($m) blocks and surrounding corruption
// These were injected as 3-line blocks: "param($m)\n  $val = ...\n  \"'$val'\""
c = c.replace(/param\(\$m\)[\s\S]*?"'\$val'"/g, '');
// Remove any remaining standalone corruption lines
c = c.replace(/  \$val = .*"'\\$val'"/g, '');
c = c.replace(/  \$val = .*?"'\$val'"/g, '');

// Now we need to fill in proper kobo values where placeholders were
// Let's identify the patterns and fix them.

// The corruption left gaps like "balance:  , created_at" or "amount:  , type"
// These need proper kobo values. Let's find them and fix.

// Read the resulting file
fs.writeFileSync('tests/unit/wallet.service.test.ts', c);
console.log('Cleaned. Length:', c.length);

// Now let's check what we have
const lines = c.split('\n');
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('balance:  ,') || lines[i].includes('amount:  ,') || 
      lines[i].includes('.toBe(') && lines[i].includes(',') === false && lines[i].trim().endsWith(')')) {
    console.log(`Line ${i+1}: ${lines[i].trim().substring(0, 100)}`);
  }
}
