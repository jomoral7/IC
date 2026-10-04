import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";
import "./design-system/tokens.css";
import "./design-system/components.css";
import "./design-system/application.css";
import "./design-system/motion.css";
import "./design-system/density.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
