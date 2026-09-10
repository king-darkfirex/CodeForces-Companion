import { test, assertEqual } from "./testKit";
import { parseTagsInput } from "../popup/tagsInput";

test("an empty input yields no tags", () => {
  assertEqual(parseTagsInput(""), []);
});

test("a blank (whitespace-only) input yields no tags", () => {
  assertEqual(parseTagsInput("   "), []);
});

test("a single tag is parsed as a one-element array", () => {
  assertEqual(parseTagsInput("dp"), ["dp"]);
});

test("multiple comma-separated tags are all parsed", () => {
  assertEqual(parseTagsInput("dp,greedy"), ["dp", "greedy"]);
});

test("whitespace around each tag is trimmed", () => {
  assertEqual(parseTagsInput(" dp , greedy "), ["dp", "greedy"]);
});

test("empty entries (double commas / trailing commas) are ignored", () => {
  assertEqual(parseTagsInput("dp,,greedy"), ["dp", "greedy"]);
  assertEqual(parseTagsInput("dp,"), ["dp"]);
  assertEqual(parseTagsInput(",dp"), ["dp"]);
});
