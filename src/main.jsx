import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import SleepDiary from "./SleepDiary.jsx";
import "./index.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <SleepDiary />
  </StrictMode>
);
