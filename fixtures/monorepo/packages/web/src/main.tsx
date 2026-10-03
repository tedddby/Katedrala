import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

const container = document.getElementById("root");
if (container === null) {
  throw new Error("Missing #root element in index.html");
}

createRoot(container).render(
  <StrictMode>
    <App apiUrl={import.meta.env.VITE_API_URL ?? "http://localhost:4000"} />
  </StrictMode>,
);
