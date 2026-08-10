import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import { agentLogApi } from "./api";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("Manager root element is missing");

createRoot(root).render(
  <StrictMode>
    <App api={agentLogApi} />
  </StrictMode>,
);
