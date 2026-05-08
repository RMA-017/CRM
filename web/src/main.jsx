import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import { I18nProvider } from "./i18n/I18nProvider.jsx";
import "./css/style.css";

createRoot(document.getElementById("root")).render(
  <I18nProvider>
    <BrowserRouter
      future={{
        v7_relativeSplatPath: true,
        v7_startTransition: true
      }}
    >
      <App />
    </BrowserRouter>
  </I18nProvider>
);
