import { Navigate, Route, Routes } from "react-router-dom";

import { ApiKeyGate } from "./components/ApiKeyGate";
import { hasApiKey } from "./lib/storage";
import { Editor } from "./pages/Editor";
import { History } from "./pages/History";
import { NewApplication } from "./pages/NewApplication";
import { Profile } from "./pages/Profile";
import { Setup } from "./pages/Setup";

function RootRedirect() {
  return <Navigate to={hasApiKey() ? "/profile" : "/setup"} replace />;
}

export default function App() {
  return (
    <div className="min-h-screen bg-white text-neutral-900">
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/setup" element={<Setup />} />
        <Route element={<ApiKeyGate />}>
          <Route path="/profile" element={<Profile />} />
          <Route path="/new" element={<NewApplication />} />
          <Route path="/editor/:applicationId" element={<Editor />} />
          <Route path="/history" element={<History />} />
        </Route>
      </Routes>
    </div>
  );
}
