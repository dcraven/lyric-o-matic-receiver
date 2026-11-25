// Runs the receiver tests in Node: node receiver/test/run-node.mjs
import { tests as timingTests } from './timing.test.js';
import { tests as messageTests } from './messages.test.js';

const tests = [...timingTests, ...messageTests];

let failed = 0;
for (const { name, fn } of tests) {
  try {
    await fn();
    console.log(`  ok   ${name}`);
  } catch (e) {
    failed++;
    console.log(`  FAIL ${name}\n       ${e.message}`);
  }
}
console.log(`\n${tests.length - failed}/${tests.length} passed`);
process.exit(failed ? 1 : 0);
