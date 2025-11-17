import { buildMonthMatrix } from "../components/calendar/dateUtils";

describe("buildMonthMatrix", () => {
  it("returns 6 rows of 7 days", () => {
    const m = buildMonthMatrix(new Date("2025-08-01"));
    expect(m.length).toBe(6);
    expect(m[0].length).toBe(7);
  });

  it("handles different months correctly", () => {
    const m = buildMonthMatrix(new Date("2025-02-01")); // February
    expect(m.length).toBe(6);
    expect(m[0].length).toBe(7);
  });

  it("starts week on Sunday by default", () => {
    const m = buildMonthMatrix(new Date("2025-08-01"));
    const firstDay = m[0][0];
    expect(firstDay.getDay()).toBe(0); // Sunday
  });

  it("starts week on Monday when specified", () => {
    const m = buildMonthMatrix(new Date("2025-08-01"), 1);
    const firstDay = m[0][0];
    expect(firstDay.getDay()).toBe(1); // Monday
  });
});
