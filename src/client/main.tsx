import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { AppLayout } from "./components/AppLayout";
import { AlbumPage } from "./pages/AlbumPage";
import { ActivityPage } from "./pages/ActivityPage";
import { EventCreatePage } from "./pages/EventCreatePage";
import { EventDetailPage } from "./pages/EventDetailPage";
import { EventEditPage } from "./pages/EventEditPage";
import { EventsPage } from "./pages/EventsPage";
import { FamilyPage } from "./pages/FamilyPage";
import { InvitePage } from "./pages/InvitePage";
import { MediaViewerPage } from "./pages/MediaViewerPage";
import { PostCreatePage } from "./pages/PostCreatePage";
import { PostDetailPage } from "./pages/PostDetailPage";
import { TimelinePage } from "./pages/TimelinePage";
import { SettingsPage } from "./pages/SettingsPage";
import { initializeTheme } from "./theme";
import "./styles.css";

initializeTheme();

const router = createBrowserRouter([{
  element: <AppLayout />,
  children: [
    { path: "/", element: <TimelinePage /> },
    { path: "/activity", element: <ActivityPage /> },
    { path: "/timeline", element: <TimelinePage /> },
    { path: "/album", element: <AlbumPage /> },
    { path: "/events", element: <EventsPage /> },
    { path: "/events/new", element: <EventCreatePage /> },
    { path: "/events/:eventId", element: <EventDetailPage /> },
    { path: "/events/:eventId/edit", element: <EventEditPage /> },
    { path: "/posts/new", element: <PostCreatePage /> },
    { path: "/posts/:postId", element: <PostDetailPage /> },
    { path: "/posts/:postId/media/:mediaId", element: <MediaViewerPage /> },
    { path: "/family", element: <FamilyPage /> },
    { path: "/invite/:token", element: <InvitePage /> },
    { path: "/settings", element: <SettingsPage /> },
  ],
}]);

createRoot(document.getElementById("root")!).render(<StrictMode><RouterProvider router={router} /></StrictMode>);

const localDevelopment = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
if (!localDevelopment && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/service-worker.js");
  });
}
