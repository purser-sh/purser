import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { PhoneApp } from "./PhoneApp";
import "./index.css";

const queryClient = new QueryClient();
const root = document.getElementById("root");
if (!(root instanceof HTMLElement)) {
  throw new Error("root element missing");
}

const phone = window.location.pathname === "/phone" || window.location.pathname === "/phone/";

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      {phone ? <PhoneApp /> : <App />}
    </QueryClientProvider>
  </StrictMode>,
);
