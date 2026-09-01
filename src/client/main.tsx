import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { AppLayout } from "./components/AppLayout";
import { EventCreatePage } from "./pages/EventCreatePage";
import { EventDetailPage } from "./pages/EventDetailPage";
import { EventEditPage } from "./pages/EventEditPage";
import { EventsPage } from "./pages/EventsPage";
import { FamilyPage } from "./pages/FamilyPage";
import { MediaViewerPage } from "./pages/MediaViewerPage";
import { PostCreatePage } from "./pages/PostCreatePage";
import { PostDetailPage } from "./pages/PostDetailPage";
import { TimelinePage } from "./pages/TimelinePage";
import "./styles.css";

const router = createBrowserRouter([{
  element: <AppLayout />,
  children: [
    { path: "/", element: <TimelinePage /> },
    { path: "/events", element: <EventsPage /> },
    { path: "/events/new", element: <EventCreatePage /> },
    { path: "/events/:eventId", element: <EventDetailPage /> },
    { path: "/events/:eventId/edit", element: <EventEditPage /> },
    { path: "/posts/new", element: <PostCreatePage /> },
    { path: "/posts/:postId", element: <PostDetailPage /> },
    { path: "/posts/:postId/media/:mediaId", element: <MediaViewerPage /> },
    { path: "/family", element: <FamilyPage /> },
  ],
}]);

createRoot(document.getElementById("root")!).render(<StrictMode><RouterProvider router={router} /></StrictMode>);
