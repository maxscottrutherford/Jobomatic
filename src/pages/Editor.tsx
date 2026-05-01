import { useParams } from "react-router-dom";

export function Editor() {
  const { applicationId } = useParams<{ applicationId: string }>();

  return (
    <main className="p-6">
      <h1 className="text-xl font-semibold">Editor</h1>
      <p className="mt-2 text-neutral-600">
        Application ID: {applicationId ?? "(none)"}
      </p>
      <p className="mt-1 text-neutral-600">Phase 4: LaTeX editor and export.</p>
    </main>
  );
}
