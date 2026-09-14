import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Sin esto, el DOM de un test queda montado para el siguiente (React
// Testing Library solo se auto-limpia si detecta los globals de Jest).
afterEach(() => {
  cleanup();
});
