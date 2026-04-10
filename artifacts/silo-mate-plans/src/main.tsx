import { createRoot } from "react-dom/client";
import App from "./App";
import { VideoPage } from "./VideoPage";
import "./index.css";

const path = window.location.pathname;
const isVideoPage = path.endsWith("/video") || path.endsWith("/video/");

createRoot(document.getElementById("root")!).render(
  isVideoPage ? <VideoPage /> : <App />
);
