import { test, assertEqual } from "./testKit";
import { formatRelativeTime } from "../popup/formatRelativeTime";

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

test("0ms elapsed is 'just now'", () => {
  assertEqual(formatRelativeTime(0), "just now");
});

test("just under a minute is still 'just now'", () => {
  assertEqual(formatRelativeTime(59 * SECOND + 999), "just now");
});

test("exactly one minute is singular: '1 minute ago'", () => {
  assertEqual(formatRelativeTime(MINUTE), "1 minute ago");
});

test("several minutes are plural: '5 minutes ago'", () => {
  assertEqual(formatRelativeTime(5 * MINUTE), "5 minutes ago");
});

test("just under an hour is still in minutes", () => {
  assertEqual(formatRelativeTime(59 * MINUTE), "59 minutes ago");
});

test("exactly one hour is singular: '1 hour ago'", () => {
  assertEqual(formatRelativeTime(HOUR), "1 hour ago");
});

test("several hours are plural: '2 hours ago'", () => {
  assertEqual(formatRelativeTime(2 * HOUR), "2 hours ago");
});

test("just under a day is still in hours", () => {
  assertEqual(formatRelativeTime(23 * HOUR), "23 hours ago");
});

test("exactly one day is singular: '1 day ago'", () => {
  assertEqual(formatRelativeTime(DAY), "1 day ago");
});

test("several days are plural: '3 days ago'", () => {
  assertEqual(formatRelativeTime(3 * DAY), "3 days ago");
});

test("a negative elapsed time (e.g. clock skew) falls back to 'just now' instead of crashing or showing nonsense", () => {
  assertEqual(formatRelativeTime(-500), "just now");
});
