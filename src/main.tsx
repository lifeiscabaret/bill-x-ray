import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./ui/App";
import "./ui/styles.css";

// Reduced motion starts from the operating system's setting; the "Reduce motion" toggle in
// the app can change it afterwards. Everything that animates reads `data-motion` on <html>.
const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
document.documentElement.dataset.motion = reduce ? "reduce" : "full";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
