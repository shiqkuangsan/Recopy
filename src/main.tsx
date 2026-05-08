import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./i18n";
import "./index.css";
import { getDocumentBackgroundColor } from "./lib/panel-style";

const isMacOS = /Mac/.test(navigator.userAgent);
const pageParam = new URLSearchParams(window.location.search).get("page");
const documentBackgroundColor = getDocumentBackgroundColor({ isMac: isMacOS, page: pageParam });
document.documentElement.style.backgroundColor = documentBackgroundColor;
document.body.style.backgroundColor = documentBackgroundColor;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
