import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("App", () => {
  it("renders a level-1 heading", () => {
    render(<App />);
    expect(screen.getByRole("heading", { level: 1 })).toBeTruthy();
  });
});
