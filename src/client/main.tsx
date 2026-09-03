import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, Navigate, RouterProvider } from "react-router-dom";
import { AppLayout } from "./components/AppLayout";
import { AlbumPage } from "./pages/AlbumPage";
import { ActivityPage } from "./pages/ActivityPage";
import { EventCreatePage } from "./pages/EventCreatePage";
import { EventDetailPage } from "./pages/EventDetailPage";
import { EventEditPage } from "./pages/EventEditPage";
import { EventsPage } from "./pages/EventsPage";
import { FamilySettingsPage } from "./pages/FamilySettingsPage";
import { InvitePage } from "./pages/InvitePage";
import { MediaViewerPage } from "./pages/MediaViewerPage";
import { PostCreatePage } from "./pages/PostCreatePage";
import { PostDetailPage } from "./pages/PostDetailPage";
import { PostEditPage } from "./pages/PostEditPage";
import { TimelinePage } from "./pages/TimelinePage";
import { UnreadPostsPage } from "./pages/UnreadPostsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { initializeTheme } from "./theme";
import "./styles.css";
import "./accessibility.css";

initializeTheme();

const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { path: "/", element: <TimelinePage /> },
      { path: "/activity", element: <ActivityPage /> },
      { path: "/timeline", element: <TimelinePage /> },
      { path: "/unread", element: <UnreadPostsPage /> },
      { path: "/album", element: <AlbumPage /> },
      { path: "/events", element: <EventsPage /> },
      { path: "/events/new", element: <EventCreatePage /> },
      { path: "/events/:eventId", element: <EventDetailPage /> },
      { path: "/events/:eventId/edit", element: <EventEditPage /> },
      { path: "/posts/new", element: <PostCreatePage /> },
      { path: "/posts/:postId", element: <PostDetailPage /> },
      { path: "/posts/:postId/edit", element: <PostEditPage /> },
      { path: "/posts/:postId/media/:mediaId", element: <MediaViewerPage /> },
      { path: "/family", element: <Navigate to="/settings" replace /> },
      { path: "/invite/:token", element: <InvitePage /> },
      { path: "/settings", element: <SettingsPage /> },
      { path: "/settings/family", element: <FamilySettingsPage /> },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
