// A deliberately tiny, dependency-free test harness. Real UI phases later
// on may warrant pulling in vitest, but for pure data-layer logic this is
// enough, and it means `npm run test` works immediately after cloning with
// no extra installs beyond `tsx` (already a devDependency).
//
// This file only ever runs under Node (via `tsx`), never bundled into the
// extension itself, so a minimal ambient `process` is enough — no need for
// a full @types/node dependency just for `process.exit`.
declare const process: { exit(code: number): never };

type TestFn = () => void | Promise<void>;
interface TestCase {
  name: string;
  fn: TestFn;
}

const tests: TestCase[] = [];

export function test(name: string, fn: TestFn): void {
  tests.push({ name, fn });
}

export function assertEqual<T>(actual: T, expected: T, msg?: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error(`${msg ?? "Assertion failed"}: expected ${e}, got ${a}`);
  }
}

export function assertTrue(condition: boolean, msg?: string): void {
  if (!condition) throw new Error(msg ?? "Expected condition to be true");
}

export async function run(): Promise<void> {
  let pass = 0;
  let fail = 0;
  for (const t of tests) {
    try {
      await t.fn();
      pass += 1;
      console.log(`  ok  ${t.name}`);
    } catch (err) {
      fail += 1;
      console.error(`FAIL  ${t.name}`);
      console.error(`      ${(err as Error).message}`);
    }
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}
